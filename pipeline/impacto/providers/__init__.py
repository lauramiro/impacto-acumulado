from __future__ import annotations

from typing import Protocol


class QuotaExhausted(Exception):
    """The provider's quota is used up for longer than a per-request backoff can wait.

    Raised for a daily cap (the message names the day limit) or when a
    per-minute rate limit survives every retry. Callers stop the run rather
    than record a failed attempt against the document being processed.
    """


class Provider(Protocol):
    name: str

    def complete_json(self, system: str, user: str) -> dict: ...
