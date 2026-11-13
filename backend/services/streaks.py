"""
Daily 20 streaks, LeetCode style.

A day counts when that day's set is submitted on that same local calendar day
(settings.TIMEZONE). Submitting an old set later never backfills a missed day.
The current streak stays alive until the end of today: if today's set isn't done
yet, it counts back from yesterday.
"""
from datetime import date, datetime, time, timedelta, timezone
from typing import List, Set
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from backend.lib.config import settings
from backend.lib.dates import local_today
from backend.models.practice import DailyPracticeAttempt, DailyPracticeSet

CALENDAR_DAYS = 28


def solved_days(db: Session, user_id: str) -> dict:
    """{set_date: accuracy} for every set submitted on its own day."""
    tz = ZoneInfo(settings.TIMEZONE)
    rows = (
        db.query(DailyPracticeSet.set_date, DailyPracticeAttempt.submitted_at, DailyPracticeAttempt.accuracy)
        .join(DailyPracticeAttempt, DailyPracticeAttempt.set_id == DailyPracticeSet.id)
        .filter(DailyPracticeSet.user_id == user_id)
        .all()
    )
    days: dict = {}
    for set_date, submitted_at, accuracy in rows:
        if submitted_at.tzinfo is None:  # SQLite drops the zone; stored values are UTC.
            submitted_at = submitted_at.replace(tzinfo=timezone.utc)
        if submitted_at.astimezone(tz).date() == set_date:
            days[set_date] = max(accuracy, days.get(set_date, 0.0))
    return days


def current_streak(days: Set[date], today: date) -> int:
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def longest_streak(days: Set[date]) -> int:
    best = run = 0
    previous = None
    for day in sorted(days):
        run = run + 1 if previous and day - previous == timedelta(days=1) else 1
        best = max(best, run)
        previous = day
    return best


def streak_summary(db: Session, user_id: str) -> dict:
    tz = ZoneInfo(settings.TIMEZONE)
    today = local_today()
    days = solved_days(db, user_id)
    calendar: List[dict] = []
    for offset in range(CALENDAR_DAYS - 1, -1, -1):
        day = today - timedelta(days=offset)
        calendar.append({"date": str(day), "solved": day in days, "accuracy": days.get(day)})
    return {
        "current_streak": current_streak(set(days), today),
        "longest_streak": longest_streak(set(days)),
        "total_days_solved": len(days),
        "solved_today": today in days,
        "today": str(today),
        "next_reset_at": datetime.combine(today + timedelta(days=1), time.min, tzinfo=tz),
        "calendar": calendar,
    }
