"""Remove the descriptive tail the gazettes attach to project names.

The model copies a name as the resolution prints it: "Planta fotovoltaica
Carbo de 90 MWp y su infraestructura de evacuacion". The tail is not part of
the name, and resolve reads a phase marker from the last token of the name,
so a tail both breaks name matching and hides the phase.

Contract:
- suffix removal only: the head of a name is never rewritten, so a wrong
  rule can truncate but cannot corrupt;
- never returns an empty name: if a cut would empty it, no cut is made;
- cuts capacity clauses ("de 90 MWp", "(38 MW)"), "de potencia instalada"
  appositives and evacuation-infrastructure conjunctions ("y su
  infraestructura de evacuacion"), from the first one found to the end;
- keeps a trailing phase marker and a trailing number with no unit after it
  ("Parque fotovoltaico Tabernas 100"); a unit directly after a trailing
  number is dropped alone ("Tabernas 100 MW" -> "Tabernas 100").
"""

from __future__ import annotations

import re

_NUMBER = r"\d+(?:[.,]\d+)?"
_UNIT = r"(?:mwp|mwn|mwh|mw|kwp|kwn|kw|kv)\b"
_TAILS = (
    re.compile(rf"\s*,?\s*(?:\bde\s+{_NUMBER}\s*{_UNIT}|\(\s*{_NUMBER}\s*{_UNIT}[^)]*\))", re.IGNORECASE),
    re.compile(r"\s*,?\s*\bde\s+potencial?\s+instalada\b", re.IGNORECASE),
    re.compile(
        r"\s*,?\s+(?:y|e|con)\s+(?:su\s+|sus\s+|la\s+|las\s+)?(?:infraestructuras?|l[ií]neas?)\s+de\s+evacuaci[oó]n\b",
        re.IGNORECASE,
    ),
)
_TRAILING_UNIT = re.compile(rf"(?<=\d)\s*{_UNIT}\s*$", re.IGNORECASE)


def trim_project_name(name: str) -> str:
    cut = min((m.start() for pattern in _TAILS if (m := pattern.search(name))), default=len(name))
    trimmed = _TRAILING_UNIT.sub("", name[:cut]).rstrip(" ,;:-")
    return trimmed or name
