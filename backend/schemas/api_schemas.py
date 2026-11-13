from typing import List, Optional, Dict
from pydantic import BaseModel, EmailStr, Field, field_validator

VALID_EXAMS = {"JEE Main", "JEE Advanced"}
VALID_CLASSES = {"Class 11", "Class 12", "Class 12 pass out"}


class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    target_exam: str = Field(default="JEE Main")
    student_class: str = Field(default="Class 12")
    password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., min_length=6, max_length=128)

    @field_validator("target_exam")
    @classmethod
    def check_exam(cls, v: str) -> str:
        if v not in VALID_EXAMS:
            raise ValueError(f"target_exam must be one of {VALID_EXAMS}")
        return v

    @field_validator("student_class")
    @classmethod
    def check_class(cls, v: str) -> str:
        if v not in VALID_CLASSES:
            raise ValueError(f"student_class must be one of {VALID_CLASSES}")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(..., min_length=10)
    target_exam: Optional[str] = "JEE Main"
    student_class: Optional[str] = "Class 12"


class UserProfileResponse(BaseModel):
    id: str
    full_name: str
    email: str
    target_exam: str
    student_class: str
    auth_provider: str
    is_verified: bool
    has_password: bool


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    target_exam: Optional[str] = None
    student_class: Optional[str] = None

    @field_validator("target_exam")
    @classmethod
    def check_exam(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_EXAMS:
            raise ValueError(f"target_exam must be one of {VALID_EXAMS}")
        return v

    @field_validator("student_class")
    @classmethod
    def check_class(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_CLASSES:
            raise ValueError(f"student_class must be one of {VALID_CLASSES}")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(..., min_length=8, max_length=128)


class SignupResponse(BaseModel):
    message: str
    email: str


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=10)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetTokenRequest(BaseModel):
    token: str = Field(..., min_length=10)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileResponse


class ChatCreateRequest(BaseModel):
    title: Optional[str] = "New JEE Doubt Session"
    subject: Optional[str] = None


class ChatUpdateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class MessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    # Optional override for testing, e.g. "groq:openai/gpt-oss-20b"; see GET /api/chats/models.
    model: Optional[str] = Field(default=None, max_length=100)


class DailySubmitAnswerItem(BaseModel):
    question_id: str
    selected_option: Optional[str] = None


class DailySubmitRequest(BaseModel):
    answers: List[DailySubmitAnswerItem]


class ExamStartRequest(BaseModel):
    template_code: Optional[str] = None
    exam_type: Optional[str] = "JEE Main"


class ExamAnswerUpdateItem(BaseModel):
    attempt_question_id: str
    selected_option: Optional[str] = None
    marked_for_review: bool = False
    time_spent_seconds: int = 0


class ExamAnswersBulkUpdateRequest(BaseModel):
    answers: List[ExamAnswerUpdateItem]