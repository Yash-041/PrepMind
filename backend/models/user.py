import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.lib.db import Base
from backend.lib.dates import utc_now


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    target_exam: Mapped[str] = mapped_column(
        String(50), nullable=False, default="JEE Main"
    )
    student_class: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Class 12"
    )
    auth_provider: Mapped[str] = mapped_column(
        String(30), nullable=False, default="email"
    )
    google_sub: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )