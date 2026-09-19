from unittest.mock import MagicMock

import httpx
import pytest
from groq import RateLimitError

from impacto.providers import QuotaExhausted
from impacto.providers.groq import GroqProvider


def _rate_limit(message: str) -> RateLimitError:
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    return RateLimitError(message, response=httpx.Response(429, request=request), body=None)


def _provider(monkeypatch, error: RateLimitError) -> tuple[GroqProvider, MagicMock]:
    # Replace the Groq client so complete_json exercises its real request
    # path (messages, response_format) but every call hits the given 429.
    provider = GroqProvider("key", "model")
    client = MagicMock()
    client.chat.completions.create.side_effect = error
    monkeypatch.setattr(provider, "_client", client)
    monkeypatch.setattr("impacto.providers.groq.time.sleep", lambda seconds: None)
    return provider, client.chat.completions.create


def test_daily_limit_429_raises_quota_exhausted_immediately(monkeypatch):
    # Observed live (docs/sources.md, "Extraction observations"): the daily
    # cap reports "on tokens per day (TPD)" with a multi-minute wait that the
    # 10s..160s backoff cannot out-wait, so retrying only burns time.
    error = _rate_limit(
        "Rate limit reached for model `x` on tokens per day (TPD): Limit 200000, Used 199300"
    )
    provider, create = _provider(monkeypatch, error)
    with pytest.raises(QuotaExhausted):
        provider.complete_json("s", "u")
    assert create.call_count == 1


@pytest.mark.parametrize("message", ["Limit reached: PER DAY", "on tokens per day: wait 9m"])
def test_daily_limit_markers_are_case_insensitive(monkeypatch, message):
    provider, create = _provider(monkeypatch, _rate_limit(message))
    with pytest.raises(QuotaExhausted):
        provider.complete_json("s", "u")
    assert create.call_count == 1


def test_per_minute_429_surviving_all_attempts_raises_quota_exhausted(monkeypatch):
    error = _rate_limit("Rate limit reached on tokens per minute (TPM): Limit 8000")
    provider, create = _provider(monkeypatch, error)
    with pytest.raises(QuotaExhausted):
        provider.complete_json("s", "u")
    assert create.call_count == provider.max_attempts


def test_per_minute_429_then_success_returns_json(monkeypatch):
    provider = GroqProvider("key", "model")
    client = MagicMock()
    response = MagicMock()
    response.choices[0].message.content = '{"ok": true}'
    client.chat.completions.create.side_effect = [
        _rate_limit("Rate limit reached on tokens per minute (TPM)"),
        response,
    ]
    monkeypatch.setattr(provider, "_client", client)
    monkeypatch.setattr("impacto.providers.groq.time.sleep", lambda seconds: None)
    assert provider.complete_json("s", "u") == {"ok": True}
    assert client.chat.completions.create.call_count == 2
