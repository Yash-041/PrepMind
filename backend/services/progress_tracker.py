"""
Rule-based Weak Topic & Learning Profile Updater.
Severity Rules:
- Attempted >= 2 and Accuracy < 50%  -> "high"
- Attempted >= 2 and Accuracy < 70%  -> "medium"
- Attempted >= 1 and Accuracy < 75%  -> "low"
- Otherwise                          -> "none"
"""
from sqlalchemy.orm import Session
from backend.lib.dates import utc_now
from backend.models.progress import UserTopicProgress


def compute_weak_severity(attempted: int, accuracy: float) -> str:
    if attempted >= 2 and accuracy < 50.0:
        return "high"
    if attempted >= 2 and accuracy < 70.0:
        return "medium"
    if attempted >= 1 and accuracy < 75.0:
        return "low"
    return "none"


def record_topic_outcome(
    db: Session, user_id: str, subject: str, topic: str, is_correct: bool
) -> UserTopicProgress:
    record = (
        db.query(UserTopicProgress)
        .filter(
            UserTopicProgress.user_id == user_id,
            UserTopicProgress.subject == subject,
            UserTopicProgress.topic == topic,
        )
        .first()
    )
    if not record:
        record = UserTopicProgress(
            user_id=user_id,
            subject=subject,
            topic=topic,
            attempted_count=0,
            correct_count=0,
            incorrect_count=0,
            accuracy=0.0,
            recent_accuracy=0.0,
            weak_severity="none",
        )
        db.add(record)
        # Sessions don't autoflush; without this, a second question from the same chapter
        # in one submission wouldn't find this row and would insert a duplicate.
        db.flush()

    record.attempted_count += 1
    if is_correct:
        record.correct_count += 1
    else:
        record.incorrect_count += 1

    record.accuracy = round(
        (record.correct_count / record.attempted_count) * 100.0, 2
    )
    outcome_val = 100.0 if is_correct else 0.0
    if record.attempted_count == 1:
        record.recent_accuracy = outcome_val
    else:
        record.recent_accuracy = round(
            0.6 * record.recent_accuracy + 0.4 * outcome_val, 2
        )

    record.weak_severity = compute_weak_severity(
        record.attempted_count, record.accuracy
    )
    record.last_attempted_at = utc_now()
    return record