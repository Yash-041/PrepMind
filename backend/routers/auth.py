import time
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.lib.config import settings
from backend.lib.dates import utc_now
from backend.lib.db import get_db
from backend.lib.rate_limit import (
    client_ip,
    login_failures_by_email,
    login_failures_by_ip,
    raise_if_blocked,
    signups_by_ip,
    signups_total,
)
from backend.lib.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_email_verification_token,
    user_from_password_reset_token,
    get_current_user,
)
from backend.models.user import User
from backend.schemas.api_schemas import (
    SignupRequest,
    LoginRequest,
    GoogleAuthRequest,
    AuthTokenResponse,
    UserProfileResponse,
    SignupResponse,
    VerifyEmailRequest,
    ResendVerificationRequest,
    ProfileUpdateRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetTokenRequest,
    ResetPasswordRequest,
)
from backend.services.email_service import send_password_reset_email, send_verification_email

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _to_profile(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        target_exam=user.target_exam,
        student_class=user.student_class,
        auth_provider=user.auth_provider,
        is_verified=user.is_verified,
        has_password=bool(user.password_hash),
    )


RESEND_COOLDOWN_SECONDS = 60
_last_verification_sent: dict = {}


def _queue_verification_email(background: BackgroundTasks, user: User) -> None:
    token = create_email_verification_token(user.id, user.email)
    verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={quote(token)}"
    _last_verification_sent[user.email] = time.monotonic()
    background.add_task(send_verification_email, user.email, user.full_name, verify_url)


@router.post(
    "/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED
)
def signup(
    payload: SignupRequest,
    background: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
):
    # Each signup emails a verification link from the project's Gmail account.
    ip = client_ip(request)
    raise_if_blocked(
        (signups_by_ip, ip), (signups_total, "all"),
        message="Too many accounts have been created recently.",
    )
    if payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match.",
        )

    normalized_email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user = User(
        full_name=payload.full_name.strip(),
        email=normalized_email,
        password_hash=hash_password(payload.password),
        target_exam=payload.target_exam,
        student_class=payload.student_class,
        auth_provider="email",
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    signups_by_ip.hit(ip)
    signups_total.hit("all")
    _queue_verification_email(background, user)
    return SignupResponse(
        message="Account created. Check your email for a verification link.",
        email=user.email,
    )


@router.post("/verify-email", response_model=UserProfileResponse)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    claims = decode_email_verification_token(payload.token)
    user = db.query(User).filter(User.id == claims.get("sub")).first()
    # The token is bound to the address it was sent to.
    if not user or user.email != claims.get("email"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid.",
        )
    if not user.is_verified:
        user.is_verified = True
        user.verified_at = utc_now()
        db.commit()
        db.refresh(user)
    return _to_profile(user)


@router.post("/resend-verification")
def resend_verification(
    payload: ResendVerificationRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    last_sent = _last_verification_sent.get(email)
    if last_sent and time.monotonic() - last_sent < RESEND_COOLDOWN_SECONDS:
        wait = int(RESEND_COOLDOWN_SECONDS - (time.monotonic() - last_sent))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {wait} seconds before requesting another email.",
        )
    user = db.query(User).filter(User.email == email).first()
    if user and not user.is_verified:
        _queue_verification_email(background, user)
    # Same response either way so this endpoint can't be used to discover accounts.
    return {"message": "If that account needs verification, a new link has been sent."}


_last_reset_sent: dict = {}


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    last_sent = _last_reset_sent.get(email)
    if last_sent and time.monotonic() - last_sent < RESEND_COOLDOWN_SECONDS:
        wait = int(RESEND_COOLDOWN_SECONDS - (time.monotonic() - last_sent))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {wait} seconds before requesting another email.",
        )
    user = db.query(User).filter(User.email == email).first()
    if user:
        token = create_password_reset_token(user)
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={quote(token)}"
        _last_reset_sent[email] = time.monotonic()
        background.add_task(send_password_reset_email, user.email, user.full_name, reset_url)
    # Same response either way so this endpoint can't be used to discover accounts.
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password/validate")
def validate_reset_token(payload: ResetTokenRequest, db: Session = Depends(get_db)):
    """Lets the reset page show its form only for a live link."""
    user = user_from_password_reset_token(payload.token, db)
    return {"email": user.email}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = user_from_password_reset_token(payload.token, db)
    user.password_hash = hash_password(payload.new_password)
    # Opening the emailed link proves they own the address.
    if not user.is_verified:
        user.is_verified = True
        user.verified_at = utc_now()
    db.commit()
    return {"message": "Password updated. You can now log in.", "email": user.email}


@router.post("/login", response_model=AuthTokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    normalized_email = payload.email.strip().lower()
    ip = client_ip(request)
    # Slow down password guessing: 5 wrong tries per account, 20 per address, per 15 min.
    raise_if_blocked(
        (login_failures_by_email, normalized_email), (login_failures_by_ip, ip),
        message="Too many failed login attempts.",
    )
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        login_failures_by_email.hit(normalized_email)
        login_failures_by_ip.hit(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    login_failures_by_email.clear(normalized_email)

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_not_verified",
                "message": "Please verify your email before logging in.",
            },
        )

    token = create_access_token(user.id, user.email)
    return AuthTokenResponse(access_token=token, user=_to_profile(user))


@router.post("/google", response_model=AuthTokenResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID).",
        )

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        id_info = id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google ID token verification failed: {exc}",
        )

    if id_info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer.",
        )
    if not id_info.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email address is not verified.",
        )

    email = id_info["email"].strip().lower()
    google_sub = id_info["sub"]
    full_name = id_info.get("name") or email.split("@")[0]

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            full_name=full_name,
            email=email,
            password_hash=None,
            target_exam=payload.target_exam or "JEE Main",
            student_class=payload.student_class or "Class 12",
            auth_provider="google",
            google_sub=google_sub,
            is_verified=True,
            verified_at=utc_now(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.google_sub:
            user.google_sub = google_sub
        if not user.is_verified:
            # Nobody proved they own this address when the password was set (it was never
            # verified), so it may be someone else's: drop it before Google verifies the
            # account. The owner can set a new one from Profile, as Google-only users do.
            user.password_hash = None
            user.is_verified = True
            user.verified_at = utc_now()
        db.commit()

    token = create_access_token(user.id, user.email)
    return AuthTokenResponse(access_token=token, user=_to_profile(user))


@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return _to_profile(current_user)


@router.patch("/me", response_model=UserProfileResponse)
def update_me(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.full_name is not None:
        if not payload.full_name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter your name."
            )
        current_user.full_name = payload.full_name.strip()
    if payload.target_exam is not None:
        current_user.target_exam = payload.target_exam
    if payload.student_class is not None:
        current_user.student_class = payload.student_class
    db.commit()
    db.refresh(current_user)
    return _to_profile(current_user)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Google-only accounts have no password yet; they may set one without a current password.
    if current_user.password_hash:
        if not payload.current_password or not verify_password(
            payload.current_password, current_user.password_hash
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your current password is incorrect.",
            )
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated."}