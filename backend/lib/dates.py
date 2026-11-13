from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo
from backend.lib.config import settings


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def local_today() -> date:
    """Returns current calendar date in configured student timezone (default Asia/Kolkata)."""
    tz = ZoneInfo(settings.TIMEZONE)
    return datetime.now(tz).date()