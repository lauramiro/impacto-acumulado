import httpx
import pytest

from impacto.http import CachedClient


def make_client(tmp_path, handler):
    return CachedClient(cache_dir=tmp_path, rate_per_second=1000, transport=httpx.MockTransport(handler))


def test_get_caches_by_url(tmp_path):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, content=b"hello")

    client = make_client(tmp_path, handler)
    assert client.get("https://example.org/a") == b"hello"
    assert client.get("https://example.org/a") == b"hello"
    assert calls == ["https://example.org/a"]
    assert any(tmp_path.iterdir())


def test_get_retries_server_errors_then_succeeds(tmp_path):
    attempts = {"n": 0}

    def handler(request):
        attempts["n"] += 1
        if attempts["n"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, content=b"ok")

    client = make_client(tmp_path, handler)
    client.backoff_seconds = 0
    assert client.get("https://example.org/b") == b"ok"
    assert attempts["n"] == 3


def test_get_raises_after_three_failures(tmp_path):
    def handler(request):
        return httpx.Response(500)

    client = make_client(tmp_path, handler)
    client.backoff_seconds = 0
    with pytest.raises(httpx.HTTPStatusError):
        client.get("https://example.org/c")


def test_get_does_not_retry_404(tmp_path):
    attempts = {"n": 0}

    def handler(request):
        attempts["n"] += 1
        return httpx.Response(404)

    client = make_client(tmp_path, handler)
    with pytest.raises(httpx.HTTPStatusError):
        client.get("https://example.org/d")
    assert attempts["n"] == 1
