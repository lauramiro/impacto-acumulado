import json

import httpx
import pytest

from impacto.providers import QuotaExhausted
from impacto.providers.mistral import MistralProvider


def _completion(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})


def _provider(handler) -> tuple[MistralProvider, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    provider = MistralProvider("secret-key", "test-model", transport=httpx.MockTransport(record))
    provider.backoff_seconds = 0
    return provider, seen


def test_success_posts_json_mode_request_and_returns_dict():
    provider, seen = _provider(lambda request: _completion('{"ok": true}'))
    assert provider.name == "mistral:test-model"
    assert provider.complete_json("sys", "usr") == {"ok": True}
    assert len(seen) == 1
    request = seen[0]
    assert request.method == "POST"
    assert str(request.url) == "https://api.mistral.ai/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer secret-key"
    body = json.loads(request.content)
    assert body["model"] == "test-model"
    assert body["messages"] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "usr"},
    ]
    assert body["response_format"] == {"type": "json_object"}
    assert body["temperature"] == 0


def test_content_wrapped_in_prose_falls_back_to_first_json_object():
    provider, _ = _provider(lambda request: _completion('Claro:\n```json\n{"a": {"b": 1}}\n```\n'))
    assert provider.complete_json("s", "u") == {"a": {"b": 1}}


def test_per_minute_429_then_success_returns_json():
    responses = [
        httpx.Response(429, json={"message": "Rate limit exceeded: tokens per minute"}),
        _completion('{"ok": 1}'),
    ]
    provider, seen = _provider(lambda request: responses.pop(0))
    assert provider.complete_json("s", "u") == {"ok": 1}
    assert len(seen) == 2


@pytest.mark.parametrize(
    "message",
    ["Limit reached: tokens PER DAY", "TPD exceeded", "monthly token cap reached", "requests per month"],
)
def test_daily_or_monthly_429_raises_quota_exhausted_immediately(message):
    provider, seen = _provider(lambda request: httpx.Response(429, json={"message": message}))
    with pytest.raises(QuotaExhausted):
        provider.complete_json("s", "u")
    assert len(seen) == 1


def test_per_minute_429_surviving_all_attempts_raises_quota_exhausted():
    provider, seen = _provider(lambda request: httpx.Response(429, text="tokens per minute"))
    with pytest.raises(QuotaExhausted):
        provider.complete_json("s", "u")
    assert len(seen) == provider.max_attempts


def test_400_mentioning_response_format_retries_once_without_it():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "response_format" in body:
            return httpx.Response(400, json={"message": "response_format is not supported by this model"})
        return _completion('Aqui va: {"ok": true}')

    provider, seen = _provider(handler)
    assert provider.complete_json("s", "u") == {"ok": True}
    assert len(seen) == 2
    assert "response_format" not in json.loads(seen[1].content)
    assert provider.json_mode is False


def test_other_400_raises_http_status_error_without_retry():
    provider, seen = _provider(lambda request: httpx.Response(400, json={"message": "invalid model"}))
    with pytest.raises(httpx.HTTPStatusError):
        provider.complete_json("s", "u")
    assert len(seen) == 1


def test_persistent_500_raises_http_status_error_after_all_attempts():
    provider, seen = _provider(lambda request: httpx.Response(500, text="upstream down"))
    with pytest.raises(httpx.HTTPStatusError):
        provider.complete_json("s", "u")
    assert len(seen) == provider.max_attempts


def test_transport_error_is_retried_like_a_5xx():
    attempts = {"n": 0}

    def handler(request):
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise httpx.ReadTimeout("slow upstream", request=request)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    provider, _ = _provider(handler)
    assert provider.complete_json("s", "u") == {"ok": True}
    assert attempts["n"] == 3


def test_persistent_transport_error_raises_after_all_attempts():
    attempts = {"n": 0}

    def handler(request):
        attempts["n"] += 1
        raise httpx.ConnectError("no route", request=request)

    provider, _ = _provider(handler)
    with pytest.raises(httpx.ConnectError):
        provider.complete_json("s", "u")
    assert attempts["n"] == provider.max_attempts
