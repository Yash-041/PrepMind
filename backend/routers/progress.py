from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.lib.dates import local_today
from backend.lib.db import get_db
from backend.lib.security import get_current_user
from backend.models.user import User
from backend.models.progress import UserTopicProgress
from backend.models.practice import DailyPracticeAttempt
from backend.models.exam import ExamAttempt
from backend.services.streaks import current_streak, solved_days

router = APIRouter(prefix="/api/progress", tags=["Learning Progress & Weak Topics"])


@router.get("/overview")
def get_progress_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic_rows = (
        db.query(UserTopicProgress)
        .filter(UserTopicProgress.user_id == current_user.id)
        .all()
    )
    daily_attempts = (
        db.query(DailyPracticeAttempt)
        .filter(DailyPracticeAttempt.user_id == current_user.id)
        .all()
    )
    exam_attempts = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.user_id == current_user.id,
            ExamAttempt.status == "submitted",
        )
        .all()
    )

    total_attempted = sum(r.attempted_count for r in topic_rows)
    total_correct = sum(r.correct_count for r in topic_rows)
    overall_accuracy = (
        round((total_correct / total_attempted) * 100.0, 2)
        if total_attempted > 0
        else 0.0
    )

    weak_count = sum(
        1 for r in topic_rows if r.weak_severity in ("high", "medium", "low")
    )

    return {
        "total_questions_attempted": total_attempted,
        "total_correct": total_correct,
        "overall_accuracy": overall_accuracy,
        "daily_sets_completed": len(daily_attempts),
        "exams_completed": len(exam_attempts),
        "weak_topics_count": weak_count,
    }


@router.get("/weak-topics")
def get_weak_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(UserTopicProgress)
        .filter(
            UserTopicProgress.user_id == current_user.id,
            UserTopicProgress.weak_severity.in_(["high", "medium", "low"]),
        )
        .order_by(UserTopicProgress.accuracy.asc())
        .all()
    )
    return [
        {
            "subject": r.subject,
            "topic": r.topic,
            "attempted_count": r.attempted_count,
            "correct_count": r.correct_count,
            "incorrect_count": r.incorrect_count,
            "accuracy": r.accuracy,
            "recent_accuracy": r.recent_accuracy,
            "weak_severity": r.weak_severity,
            "last_attempted_at": r.last_attempted_at,
            "recommendation": (
                f"Revise {r.topic} ({r.subject}) in AI Tutor and practice targeted Daily 20 questions."
            ),
        }
        for r in rows
    ]


@router.get("/subjects")
def get_subject_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(UserTopicProgress)
        .filter(UserTopicProgress.user_id == current_user.id)
        .all()
    )
    summary = {
        subj: {"subject": subj, "attempted": 0, "correct": 0, "accuracy": 0.0, "topics": []}
        for subj in ("Physics", "Chemistry", "Mathematics")
    }
    for r in rows:
        bucket = summary.setdefault(
            r.subject,
            {"subject": r.subject, "attempted": 0, "correct": 0, "accuracy": 0.0, "topics": []},
        )
        bucket["attempted"] += r.attempted_count
        bucket["correct"] += r.correct_count
        bucket["topics"].append(
            {
                "topic": r.topic,
                "attempted": r.attempted_count,
                "correct": r.correct_count,
                "accuracy": r.accuracy,
                "weak_severity": r.weak_severity,
            }
        )

    for subj, data in summary.items():
        if data["attempted"] > 0:
            data["accuracy"] = round(
                (data["correct"] / data["attempted"]) * 100.0, 2
            )
    return list(summary.values())

SUBJECTS = ("Physics", "Chemistry", "Mathematics")
SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


@router.get("/report")
def get_progress_report(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Everything the Progress page shows, in one call."""
    topic_rows = (
        db.query(UserTopicProgress)
        .filter(UserTopicProgress.user_id == current_user.id)
        .all()
    )
    daily_attempts = (
        db.query(DailyPracticeAttempt)
        .filter(DailyPracticeAttempt.user_id == current_user.id)
        .all()
    )
    exam_attempts = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.user_id == current_user.id,
            ExamAttempt.status == "submitted",
        )
        .all()
    )

    total_attempted = sum(r.attempted_count for r in topic_rows)
    total_correct = sum(r.correct_count for r in topic_rows)

    # Time is only measured for exams; Daily 20 doesn't record how long a set took.
    exam_seconds = 0.0
    for a in exam_attempts:
        if a.submitted_at and a.started_at:
            elapsed = (a.submitted_at - a.started_at).total_seconds()
            exam_seconds += max(0.0, min(elapsed, a.duration_minutes * 60))

    subjects = {
        s: {"subject": s, "attempted": 0, "correct": 0, "accuracy": 0.0, "topics_count": 0, "weak_count": 0}
        for s in SUBJECTS
    }
    for r in topic_rows:
        bucket = subjects.setdefault(
            r.subject,
            {"subject": r.subject, "attempted": 0, "correct": 0, "accuracy": 0.0, "topics_count": 0, "weak_count": 0},
        )
        bucket["attempted"] += r.attempted_count
        bucket["correct"] += r.correct_count
        bucket["topics_count"] += 1
        if r.weak_severity in SEVERITY_RANK:
            bucket["weak_count"] += 1
    for data in subjects.values():
        if data["attempted"]:
            data["accuracy"] = round(data["correct"] / data["attempted"] * 100.0, 1)

    def topic_view(r: UserTopicProgress) -> dict:
        return {
            "subject": r.subject,
            "topic": r.topic,
            "attempted": r.attempted_count,
            "correct": r.correct_count,
            "accuracy": r.accuracy,
            "weak_severity": r.weak_severity,
            "last_attempted_at": r.last_attempted_at,
        }

    weak = sorted(
        (r for r in topic_rows if r.weak_severity in SEVERITY_RANK),
        key=lambda r: (SEVERITY_RANK[r.weak_severity], r.accuracy, -r.attempted_count),
    )
    strong = sorted(
        (r for r in topic_rows if r.attempted_count >= 2 and r.accuracy >= 75.0),
        key=lambda r: (-r.accuracy, -r.attempted_count),
    )

    activity = [
        {
            "kind": "daily",
            "id": a.set_id,
            "title": "Daily 20",
            "submitted_at": a.submitted_at,
            "score": a.score,
            "max_score": a.max_score,
            "accuracy": a.accuracy,
            "correct": a.correct_count,
            "total": a.correct_count + a.incorrect_count + a.unanswered_count,
        }
        for a in daily_attempts
    ] + [
        {
            "kind": "exam",
            "id": a.id,
            "title": a.title,
            "submitted_at": a.submitted_at,
            "score": a.total_score or 0.0,
            "max_score": a.max_score,
            "accuracy": a.accuracy,
            "correct": a.correct_count,
            "total": a.correct_count + a.incorrect_count + a.unanswered_count,
        }
        for a in exam_attempts
        if a.submitted_at
    ]
    activity.sort(key=lambda item: item["submitted_at"], reverse=True)

    return {
        "stats": {
            "questions_attempted": total_attempted,
            "questions_correct": total_correct,
            "accuracy": round(total_correct / total_attempted * 100.0, 1) if total_attempted else 0.0,
            "daily_sets_completed": len(daily_attempts),
            "exams_completed": len(exam_attempts),
            "exam_minutes": round(exam_seconds / 60),
            "current_streak": current_streak(set(solved_days(db, current_user.id)), local_today()),
        },
        "subjects": list(subjects.values()),
        "weak_topics": [topic_view(r) for r in weak[:6]],
        "strong_topics": [topic_view(r) for r in strong[:4]],
        "recent_activity": activity[:8],
    }
