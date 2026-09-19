from __future__ import annotations

import json
import logging
import time

from groq import BadRequestError, Groq, RateLimitError

from impacto.providers import QuotaExhausted

log = logging.getLogger(__name__)

# Groq's daily cap reports "on tokens per day (TPD)" with a multi-minute wait
# (see docs/sources.md, "Extraction observations"); the per-request backoff
# cannot out-wait it, so such a 429 is terminal for the run.
_DAILY_LIMIT_MARKERS = ("per day", "tpd", "tokens per day")


def _is_daily_limit(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _DAILY_LIMIT_MARKERS)


def _extract_first_json_object(content: str) -> dict:
    """Parse the first balanced top-level {...} object found in content.

    Used as a fallback when the model is not asked (or refuses) to use
    strict JSON mode and wraps its answer in prose or markdown fences.
    """
    start = content.find("{")
    if start == -1:
        raise ValueError(f"no JSON object found in response: {content[:200]!r}")
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(content)):
        ch = content[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(content[start : i + 1])
    raise ValueError(f"no complete JSON object found in response: {content[:200]!r}")


def _parse_json(content: str) -> dict:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return _extract_first_json_object(content)


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
                return _parse_json(content)
            except RateLimitError as exc:
                if _is_daily_limit(exc):
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
            fallback_system = (
                system
                + "\n\nResponde UNICAMENTE con un objeto JSON valido, sin texto adicional"
                " antes ni despues, y sin bloques de codigo markdown."
            )
            messages = [
                {"role": "system", "content": fallback_system},
                {"role": "user", "content": user},
            ]
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0,
                reasoning_effort="low",
            )
        return response.choices[0].message.content or "{}"
