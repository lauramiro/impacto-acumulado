from __future__ import annotations

import hashlib
import time
from pathlib import Path

import httpx

RETRY_STATUSES = {429, 500, 502, 503, 504}


class CachedClient:
    def __init__(
        self,
        cache_dir: Path,
        rate_per_second: float = 2.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.min_interval = 1.0 / rate_per_second
        self.backoff_seconds = 2.0
        self.max_attempts = 3
        self._last_request = 0.0
        self._client = httpx.Client(transport=transport, timeout=60.0, follow_redirects=True)

    def _cache_path(self, url: str) -> Path:
        return self.cache_dir / (hashlib.sha256(url.encode("utf-8")).hexdigest() + ".bin")

    def _throttle(self) -> None:
        wait = self.min_interval - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        self._last_request = time.monotonic()

    def get(self, url: str, headers: dict[str, str] | None = None) -> bytes:
        path = self._cache_path(url)
        if path.exists():
            return path.read_bytes()
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            self._throttle()
            try:
                response = self._client.get(url, headers=headers)
            except httpx.TransportError as exc:
                last_error = exc
            else:
                if response.status_code < 400:
                    path.write_bytes(response.content)
                    return response.content
                if response.status_code not in RETRY_STATUSES:
                    response.raise_for_status()
                last_error = httpx.HTTPStatusError(
                    f"{response.status_code} for {url}", request=response.request, response=response
                )
            if attempt < self.max_attempts:
                time.sleep(self.backoff_seconds * attempt)
        assert last_error is not None
        raise last_error
