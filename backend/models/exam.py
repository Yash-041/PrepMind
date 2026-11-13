import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import (
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.lib.db import Base
from backend.lib.dates import utc_now


class ExamTemplate(Base):
    __tablename__ = "exam_templates"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    exam_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    subject_distribution: Mapped[dict] = mapped_column(JSON, nullable=False)
    default_marks: Mapped[float] = mapped_column(Float, nullable=False, default=4.0)
    default_negative_marks: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0
    )
    is_demo_pattern: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    template_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    exam_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="in_progress"
    )  # preparing | in_progress | submitted | failed
    # While "preparing": how many of the paper's questions are ready, and why it failed.
    prep_ready: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prep_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prep_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Adaptive difficulty level the paper was set at (services/difficulty.py).
    difficulty_level: Mapped[str] = mapped_column(String(20), nullable=False, default="foundation")
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    total_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unanswered_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accuracy: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    subject_breakdown: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    topic_breakdown: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    questions: Mapped[List["ExamAttemptQuestion"]] = relationship(
        "ExamAttemptQuestion",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="ExamAttemptQuestion.order_index.asc()",
    )
    answers: Mapped[List["ExamAnswer"]] = relationship(
        "ExamAnswer",
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


class ExamAttemptQuestion(Base):
    """Immutable snapshot of a question inside an exam attempt."""

    __tablename__ = "exam_attempt_questions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_question_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    subject: Mapped[str] = mapped_column(String(50), nullable=False)
    topic: Mapped[str] = mapped_column(String(120), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(30), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSON, nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(255), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    marks: Mapped[float] = mapped_column(Float, nullable=False)
    negative_marks: Mapped[float] = mapped_column(Float, nullable=False)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False, default="mcq")
    source_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    attempt: Mapped["ExamAttempt"] = relationship(
        "ExamAttempt", back_populates="questions"
    )


class ExamAnswer(Base):
    __tablename__ = "exam_answers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    attempt_question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempt_questions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    selected_option: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    marked_for_review: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    marks_awarded: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    attempt: Mapped["ExamAttempt"] = relationship(
        "ExamAttempt", back_populates="answers"
    )