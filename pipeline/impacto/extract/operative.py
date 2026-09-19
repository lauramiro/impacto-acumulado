"""Deterministic reading of the operative sentence of a resolution.

The ministry and the Andalusian environment department write their
decisions in fixed forms. A small model reads those forms unreliably (the
favourable DIA form does not contain the word "favorable" at all), so the
operative sentence is matched by rule and takes precedence over the LLM's
guess for doc_type and verdict. The LLM still extracts everything else.

Forms handled (matched on normalised text: lowercase, no accents):

- "formula declaracion de impacto ambiental desfavorable ... proyecto"
  -> dia, desfavorable
- "formula declaracion de impacto ambiental desfavorable a la realizacion
  de la linea/infraestructura ... y establece las condiciones"
  -> dia, favorable_condicionada (only the evacuation line is refused; the
  plants get conditions)
- "formula declaracion de impacto ambiental ... proyecto" with no adjective
  -> dia, favorable_condicionada (the ministry's favourable form)
- "otorgar/se otorga la autorizacion ambiental unificada"
  -> aau, favorable_condicionada
- "denegar/se deniega la autorizacion ambiental unificada"
  -> aau, desfavorable

When several operative sentences appear (a resolution that quotes an earlier
one), the last match wins: the document's own decision closes the text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from impacto.text import normalize

_DIA = re.compile(
    r"formulaa?r? (?:la )?declaracion de impacto ambiental(?P<adj> desfavorable| favorable)?"
    r"(?P<rest>[^.]{0,400})"
)
_PROJECT_OBJECT = re.compile(r"^\s*(?:a la realizacion )?(?:del|para el|al|sobre el|de el) proyecto")
_LINE_OBJECT = re.compile(r"^\s*(?:a la realizacion )?de (?:la|las) (?:linea|lineas|infraestructura)")
_CONDITIONS = re.compile(r"establece(?:n)? las condiciones")
_AAU_GRANT = re.compile(r"(?:otorgar|se otorga|conceder|se concede) (?:la )?autorizacion ambiental unificada")
_AAU_DENY = re.compile(r"(?:denegar|se deniega) (?:la )?autorizacion ambiental unificada")


@dataclass(frozen=True)
class OperativeHit:
    doc_type: str
    verdict: str
    sentence: str


def _dia_hit(match: re.Match) -> OperativeHit | None:
    adjective = (match.group("adj") or "").strip()
    rest = match.group("rest")
    sentence = match.group(0)[:300]
    if adjective == "desfavorable":
        if _PROJECT_OBJECT.match(rest):
            return OperativeHit("dia", "desfavorable", sentence)
        if _LINE_OBJECT.match(rest):
            verdict = "favorable_condicionada" if _CONDITIONS.search(rest) else "desfavorable"
            return OperativeHit("dia", verdict, sentence)
        return OperativeHit("dia", "desfavorable", sentence)
    if _PROJECT_OBJECT.match(rest) or adjective == "favorable":
        return OperativeHit("dia", "favorable_condicionada", sentence)
    return None


def find_operative(text: str) -> OperativeHit | None:
    """Return the decision stated by the last operative sentence, if any."""
    n = normalize(text)
    hits: list[tuple[int, OperativeHit]] = []
    for match in _DIA.finditer(n):
        hit = _dia_hit(match)
        if hit is not None:
            hits.append((match.start(), hit))
    for match in _AAU_GRANT.finditer(n):
        hits.append((match.start(), OperativeHit("aau", "favorable_condicionada", match.group(0))))
    for match in _AAU_DENY.finditer(n):
        hits.append((match.start(), OperativeHit("aau", "desfavorable", match.group(0))))
    if not hits:
        return None
    hits.sort(key=lambda pair: pair[0])
    return hits[-1][1]
