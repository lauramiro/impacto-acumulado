from __future__ import annotations

import logging
import time

from groq import BadRequestError, Groq, RateLimitError

from impacto.providers import PROMPTED_JSON_SUFFIX, QuotaExhausted, is_quota_message, parse_json

log = logging.getLogger(__name__)


class GroqProvider:
    """Provider backed by the Groq chat completions API.

    Prefers `response_format={"type": "json_object"}` (JSON mode). If the
    model/account rejects that parameter with a 400, falls back to asking
    for JSON in the system prompt and parsing the first top-level {...}
    object out of the reply, so a provider or account without JSON mode
    support never crashes the stage.
    """

    def __init__(self, api_key: str, model: str) -> None:
        self.name = f"groq:{model}"
        self.model = model
        self._client = Groq(api_key=api_key)
        self.max_attempts = 6
        self.initial_backoff = 10.0
        self.json_mode = True

    def complete_json(self, system: str, user: str) -> dict:
        backoff = self.initial_backoff
        for attempt in range(1, self.max_attempts + 1):
            try:
                content = self._request(system, user)
                return parse_json(content)
            except RateLimitError as exc:
                if is_quota_message(str(exc)):
                    raise QuotaExhausted(f"daily quota exhausted: {exc}") from exc
                if attempt == self.max_attempts:
                    raise QuotaExhausted(f"rate limited after {attempt} attempts: {exc}") from exc
                log.warning("rate limited, sleeping %.0fs (attempt %d)", backoff, attempt)
                time.sleep(backoff)
                backoff *= 2
            except BadRequestError as exc:
                if self.json_mode and "response_format" in str(exc).lower():
                    log.warning("response_format json_object rejected by %s, falling back to prompted JSON", self.model)
                    self.json_mode = False
                    continue
                raise
        raise RuntimeError("unreachable")

    def _request(self, system: str, user: str) -> str:
        if self.json_mode:
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0,
                reasoning_effort="low",
            )
        else:
            messages = [
                {"role": "system", "content": system + PROMPTED_JSON_SUFFIX},
                {"role": "user", "content": user},
            ]
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0,
                reasoning_effort="low",
            )
        return response.choices[0].message.content or "{}"
