import uuid
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import (
    String,
    Text,
    Integer,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.lib.db import Base
from backend.lib.dates import utc_now


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    subject: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    topic: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    exam_type: Mapped[str] = mapped_column(
        String(50), index=True, nullable=False, default="JEE Main"
    )
    difficulty: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Medium"
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSON, nullable=False)  # List of 4 strings
    correct_answer: Mapped[str] = mapped_column(String(255), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    marks: Mapped[float] = mapped_column(Float, nullable=False, default=4.0)
    negative_marks: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    is_pyq: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pyq_year: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    math_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # "mcq": options holds 4 choices and correct_answer is one of them.
    # "numerical": options is empty and correct_answer is a number.
    question_type: Mapped[str] = mapped_column(String(20), nullable=False, default="mcq")
    # "seed" (demo bank) or "kb" (generated from a knowledge-base chapter).
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="seed", index=True)
    source_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    concept: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    generated_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Normalised-text hash, so the generator never stores the same question twice.
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class DailyPracticeSet(Base):
    __tablename__ = "daily_practice_sets"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "set_date", "target_exam", name="uq_daily_set_user_date_exam"
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    set_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    target_exam: Mapped[str] = mapped_column(String(50), nullable=False)
    is_submitted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    items: Mapped[List["DailyPracticeQuestion"]] = relationship(
        "DailyPracticeQuestion",
        back_populates="practice_set",
        cascade="all, delete-orphan",
        order_by="DailyPracticeQuestion.order_index.asc()",
    )
    attempt: Mapped[Optional["DailyPracticeAttempt"]] = relationship(
        "DailyPracticeAttempt",
        back_populates="practice_set",
        uselist=False,
        cascade="all, delete-orphan",
    )


class DailyPracticeQuestion(Base):
    __tablename__ = "daily_practice_questions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    set_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("daily_practice_sets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("questions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)

    practice_set: Mapped["DailyPracticeSet"] = relationship(
        "DailyPracticeSet", back_populates="items"
    )
    question: Mapped["Question"] = relationship("Question")


class DailyPracticeAttempt(Base):
    __tablename__ = "daily_practice_attempts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    set_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("daily_practice_sets.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    incorrect_count: Mapped[int] = mapped_column(Integer, nullable=False)
    unanswered_count: Mapped[int] = mapped_column(Integer, nullable=False)
    accuracy: Mapped[float] = mapped_column(Float, nullable=False)
    topic_breakdown: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    practice_set: Mapped["DailyPracticeSet"] = relationship(
        "DailyPracticeSet", back_populates="attempt"
    )
    answers: Mapped[List["DailyPracticeAnswer"]] = relationship(
        "DailyPracticeAnswer",
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


class DailyPracticeAnswer(Base):
    __tablename__ = "daily_practice_answers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("daily_practice_attempts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False
    )
    selected_option: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    marks_awarded: Mapped[float] = mapped_column(Float, nullable=False)

    attempt: Mapped["DailyPracticeAttempt"] = relationship(
        "DailyPracticeAttempt", back_populates="answers"
    )