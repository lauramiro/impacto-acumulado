from __future__ import annotations

import logging
import time

import httpx

from impacto.providers import PROMPTED_JSON_SUFFIX, QuotaExhausted, is_quota_message, parse_json

log = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.mistral.ai/v1"


class MistralProvider:
    """Provider backed by Mistral's chat completions API over plain httpx.

    Mirrors GroqProvider's contract: JSON mode first, prompted-JSON fallback
    if the API rejects `response_format`, 10 s doubling backoff on a
    per-minute 429 or a 5xx for up to 6 attempts, and an immediate
    QuotaExhausted when a 429 names a daily or monthly cap. Only status codes
    and attempt numbers are logged; the key and request body never are.
    """

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = DEFAULT_BASE_URL,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.name = f"mistral:{model}"
        self.model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._client = httpx.Client(
            timeout=120.0,
            transport=transport,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        self.max_attempts = 6
        self.backoff_seconds = 10.0
        self.json_mode = True

    def complete_json(self, system: str, user: str) -> dict:
        backoff = self.backoff_seconds
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self._client.post(self._url, json=self._body(system, user))
            except httpx.TransportError as exc:
                # A dropped connection or read timeout over a multi-hour run is
                # transient; treat it like a 5xx rather than failing the document.
                if attempt == self.max_attempts:
                    raise
                log.warning("transport error %s, sleeping %.0fs (attempt %d)", type(exc).__name__, backoff, attempt)
                time.sleep(backoff)
                backoff *= 2
                continue
            status = response.status_code
            if status == 429:
                if is_quota_message(response.text):
                    raise QuotaExhausted(f"quota exhausted (HTTP 429): {response.text[:200]}")
                if attempt == self.max_attempts:
                    raise QuotaExhausted(f"rate limited after {attempt} attempts: {response.text[:200]}")
                log.warning("HTTP 429, sleeping %.0fs (attempt %d)", backoff, attempt)
                time.sleep(backoff)
                backoff *= 2
                continue
            if status >= 500:
                if attempt == self.max_attempts:
                    response.raise_for_status()
                log.warning("HTTP %d, sleeping %.0fs (attempt %d)", status, backoff, attempt)
                time.sleep(backoff)
                backoff *= 2
                continue
            if status == 400 and self.json_mode and "response_format" in response.text.lower():
                log.warning("response_format json_object rejected by %s, falling back to prompted JSON", self.model)
                self.json_mode = False
                continue
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"] or "{}"
            return parse_json(content)
        raise RuntimeError("unreachable")

    def _body(self, system: str, user: str) -> dict:
        if self.json_mode:
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
            return {
                "model": self.model,
                "messages": messages,
                "response_format": {"type": "json_object"},
                "temperature": 0,
            }
        messages = [
            {"role": "system", "content": system + PROMPTED_JSON_SUFFIX},
            {"role": "user", "content": user},
        ]
        return {"model": self.model, "messages": messages, "temperature": 0}
