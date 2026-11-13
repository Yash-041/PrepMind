"""
Small in-memory rate limiter for the auth endpoints (one backend process, as PrepMind runs).

    login_failures.hit(key)     record one event for key
    login_failures.blocked(key) seconds to wait, or 0 when allowed
    login_failures.clear(key)   forget key (e.g. after a successful login)

Counts reset when the server restarts, which is fine for slowing down guessing and
email spam; it is not meant to survive restarts.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._events = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque:
        events = self._events[key]
        while events and now - events[0] >= self.window:
            events.popleft()
        if not events:
            self._events.pop(key, None)
        return events

    def blocked(self, key: str) -> int:
        now = time.monotonic()
        with self._lock:
            events = self._prune(key, now)
            if len(events) < self.limit:
                return 0
            return max(1, int(self.window - (now - events[0])))

    def hit(self, key: str) -> None:
        with self._lock:
            self._events[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)


def client_ip(request: Request) -> str:
    """The browser's address; behind the Docker nginx it arrives in X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def raise_if_blocked(*checks: tuple, message: str) -> None:
    """checks: (limiter, key) pairs; raises 429 with the longest wait if any is over its limit."""
    wait = max((limiter.blocked(key) for limiter, key in checks), default=0)
    if wait:
        minutes = -(-wait // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"{message} Please try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )


# Wrong passwords: per account (stops guessing one student's password) and per address.
login_failures_by_email = SlidingWindowLimiter(limit=5, window_seconds=15 * 60)
login_failures_by_ip = SlidingWindowLimiter(limit=20, window_seconds=15 * 60)
# Signups send an email from the project's Gmail: per address, and an overall cap so
# Gmail's sending limits (and the account) stay safe.
signups_by_ip = SlidingWindowLimiter(limit=5, window_seconds=60 * 60)
signups_total = SlidingWindowLimiter(limit=50, window_seconds=60 * 60)
