from __future__ import annotations

import json
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


# A 429 whose message names a daily or monthly cap comes with a multi-minute
# (or longer) wait that the per-request backoff cannot out-wait, so such a
# 429 is terminal for the run. Groq reports "on tokens per day (TPD)" (see
# docs/sources.md, "Extraction observations"); Mistral's plan caps are monthly.
QUOTA_MARKERS = ("per day", "tpd", "tokens per day", "per month", "monthly")


def is_quota_message(message: str) -> bool:
    lowered = message.lower()
    return any(marker in lowered for marker in QUOTA_MARKERS)


def extract_first_json_object(content: str) -> dict:
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


def parse_json(content: str) -> dict:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return extract_first_json_object(content)


# Appended to the system prompt when a provider cannot use strict JSON mode.
PROMPTED_JSON_SUFFIX = (
    "\n\nResponde UNICAMENTE con un objeto JSON valido, sin texto adicional"
    " antes ni despues, y sin bloques de codigo markdown."
)
