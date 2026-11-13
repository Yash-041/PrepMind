"""
Transactional email over SMTP (Gmail with an App Password by default).
Without SMTP credentials, emails are printed to the server console so the
verification flow can still be tested locally.
"""
import html
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from backend.lib.config import settings

logger = logging.getLogger("uvicorn.error")


def email_configured() -> bool:
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD)


def send_email(to: str, subject: str, text_body: str, html_body: str) -> None:
    if not email_configured():
        logger.warning("SMTP not configured; email to %s not sent.\n%s\n%s", to, subject, text_body)
        return

    msg = EmailMessage()
    msg["From"] = formataddr((settings.EMAIL_FROM_NAME, settings.SMTP_USER))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
    except Exception:
        # Runs as a background task, so the request has already returned; log for debugging.
        logger.exception("Failed to send email to %s", to)


def _first_name(full_name: str) -> str:
    return full_name.split()[0] if full_name.strip() else "there"


def _action_email_html(heading: str, intro: str, button: str, url: str, expiry: str, footer: str) -> str:
    """Branded single-button email; all arguments are plain text and get escaped here."""
    safe_url = html.escape(url, quote=True)
    heading, intro, button, expiry, footer = (html.escape(t) for t in (heading, intro, button, expiry, footer))
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;padding:32px;border:1px solid #e2e8f0;">
          <tr><td>
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#4f46e5;">PrepMind AI</p>
            <h1 style="margin:0 0 16px;font-size:24px;">{heading}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#475569;">{intro}</p>
            <a href="{safe_url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:12px;">{button}</a>
            <p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#64748b;">
              {expiry} If the button doesn't work, paste this link into your browser:<br>
              <a href="{safe_url}" style="color:#4f46e5;word-break:break-all;">{safe_url}</a>
            </p>
            <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">{footer}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


def send_password_reset_email(to: str, full_name: str, reset_url: str) -> None:
    minutes = settings.PASSWORD_RESET_EXPIRE_MINUTES
    name = _first_name(full_name)
    expiry = f"This link expires in {minutes} minutes and can be used once."
    footer = "Didn't ask to reset your password? Ignore this email; your password won't change."
    text_body = (
        f"Hi {name},\n\n"
        "We received a request to reset your PrepMind AI password. Open this link to choose a new one:\n\n"
        f"{reset_url}\n\n{expiry}\n{footer}\n\n— PrepMind AI"
    )
    html_body = _action_email_html(
        heading="Reset your password",
        intro=f"Hi {name}, we received a request to reset the password for your PrepMind AI account. "
        "Click the button below to choose a new one.",
        button="Reset password",
        url=reset_url,
        expiry=expiry,
        footer=footer,
    )
    send_email(to, "Reset your PrepMind AI password", text_body, html_body)


def send_verification_email(to: str, full_name: str, verify_url: str) -> None:
    hours = settings.EMAIL_VERIFICATION_EXPIRE_HOURS
    first_name = _first_name(full_name)
    text_body = (
        f"Hi {first_name},\n\n"
        "Welcome to PrepMind AI! Please verify your email address to activate your account:\n\n"
        f"{verify_url}\n\n"
        f"This link expires in {hours} hours. If you didn't sign up, you can ignore this email.\n\n"
        "— PrepMind AI"
    )
    html_body = _action_email_html(
        heading="Verify your email",
        intro=f"Hi {first_name}, welcome aboard! Confirm your email address to activate your account "
        "and start preparing for JEE with your AI tutor.",
        button="Verify email address",
        url=verify_url,
        expiry=f"This link expires in {hours} hours.",
        footer="Didn't sign up? You can safely ignore this email.",
    )
    send_email(to, "Verify your PrepMind AI account", text_body, html_body)

