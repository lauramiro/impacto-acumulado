from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^a-z0-9]+")


def strip_accents(s: str) -> str:
    decomposed = unicodedata.normalize("NFKD", s)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def normalize(s: str) -> str:
    return _WS.sub(" ", strip_accents(s).lower()).strip()


def tokens(s: str) -> list[str]:
    return [t for t in _NON_WORD.split(normalize(s)) if t]
