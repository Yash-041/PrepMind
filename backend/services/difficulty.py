"""
Adaptive difficulty.

Exam Simulator: every student starts at Foundation. After each submitted mock the level
moves up when accuracy clears the level's bar (and at least half the paper was attempted,
so answering three questions correctly doesn't count), and moves back down when accuracy
falls below the level's floor. The gap between bar and floor stops a student bouncing
between two levels on every paper.

    level       Easy  Medium  Hard   up at   down below
    foundation   50%    30%    20%    50%        -
    jee_main     30%    50%    20%    70%       35%
    advanced     20%    40%    40%     -        55%

Daily 20: weak-topic questions prefer Easy/Medium to rebuild the basics; the mixed
revision questions prefer Medium/Hard.
"""
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models.exam import ExamAttempt

EASY, MEDIUM, HARD = "Easy", "Medium", "Hard"
DIFFICULTIES = (EASY, MEDIUM, HARD)

LEVELS = ("foundation", "jee_main", "advanced")
LEVEL_LABELS = {"foundation": "Foundation", "jee_main": "JEE Main", "advanced": "Advanced"}
LEVEL_MIX: Dict[str, Dict[str, float]] = {
    "foundation": {EASY: 0.5, MEDIUM: 0.3, HARD: 0.2},
    "jee_main": {EASY: 0.3, MEDIUM: 0.5, HARD: 0.2},
    "advanced": {EASY: 0.2, MEDIUM: 0.4, HARD: 0.4},
}
PROMOTE_AT = {"foundation": 50.0, "jee_main": 70.0}
DEMOTE_BELOW = {"jee_main": 35.0, "advanced": 55.0}
MIN_ATTEMPTED_SHARE = 0.5

# Daily 20 preference order (first = most wanted).
WEAK_TOPIC_PREFERENCE = (EASY, MEDIUM, HARD)
REVISION_PREFERENCE = (MEDIUM, HARD, EASY)


def next_level(level: str, accuracy: float, attempted_share: float) -> str:
    i = LEVELS.index(level)
    if level in PROMOTE_AT and accuracy >= PROMOTE_AT[level] and attempted_share >= MIN_ATTEMPTED_SHARE:
        return LEVELS[i + 1]
    if level in DEMOTE_BELOW and accuracy < DEMOTE_BELOW[level]:
        return LEVELS[i - 1]
    return level


def exam_level(db: Session, user_id: str) -> str:
    """The level the student's next mock is set at, replayed from their submitted mocks."""
    attempts = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.user_id == user_id, ExamAttempt.status == "submitted")
        .order_by(ExamAttempt.submitted_at.asc())
        .all()
    )
    level = LEVELS[0]
    for a in attempts:
        total = a.correct_count + a.incorrect_count + a.unanswered_count
        attempted = (a.correct_count + a.incorrect_count) / total if total else 0.0
        level = next_level(level, a.accuracy, attempted)
    return level


def split_by_mix(count: int, mix: Dict[str, float]) -> Dict[str, int]:
    """Whole question counts per difficulty that add up to `count` (largest remainder)."""
    exact = {d: count * mix[d] for d in DIFFICULTIES}
    counts = {d: int(exact[d]) for d in DIFFICULTIES}
    leftover = count - sum(counts.values())
    for d in sorted(DIFFICULTIES, key=lambda d: (exact[d] - counts[d], mix[d]), reverse=True)[:leftover]:
        counts[d] += 1
    return counts


def order_by_preference(questions: List, preference: tuple) -> List:
    """Stable sort: questions keep their (shuffled) order within each difficulty."""
    rank = {d: i for i, d in enumerate(preference)}
    return sorted(questions, key=lambda q: rank.get(q.difficulty, len(preference)))


def level_summary(level: Optional[str]) -> dict:
    level = level if level in LEVELS else LEVELS[0]
    return {
        "level": level,
        "label": LEVEL_LABELS[level],
        "mix": {d: round(LEVEL_MIX[level][d] * 100) for d in DIFFICULTIES},
        "promote_at": PROMOTE_AT.get(level),
        "demote_below": DEMOTE_BELOW.get(level),
    }
