from __future__ import annotations

import re
from collections import defaultdict

from impacto.resolve.model import Record
from impacto.text import normalize, tokens

GENERIC = {
    "parque", "planta", "plantas", "proyecto", "instalacion", "fotovoltaico", "fotovoltaica", "fotovoltaicos",
    "solar", "eolico", "eolica", "psfv", "pfv", "pe", "de", "la", "el", "los", "las", "del", "y", "e",
    "s", "l", "u", "a", "sl", "slu", "sa", "sau", "mw", "mwp", "mwn",
}
# A capacity figure ("50 MW", "90,5 MWp") describes a project, it does not
# name it. Left in, its number becomes the last token and phase_token reads
# it as a phase, which blocks two documents of one project from grouping.
_CAPACITY = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:mwp|mwn|mwh|mw|kwp|kwn|kw|kv)\b")


def name_key(name: str) -> str:
    return " ".join(t for t in tokens(_CAPACITY.sub(" ", normalize(name))) if t not in GENERIC)


def candidate_pairs(records: list[Record]) -> set[tuple[int, int]]:
    pairs: set[tuple[int, int]] = set()
    by_exp: dict[str, list[int]] = defaultdict(list)
    by_token: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(records):
        if r.expediente:
            by_exp[r.expediente].append(i)
        if r.name:
            for t in set(name_key(r.name).split()):
                if len(t) >= 4:
                    by_token[t].append(i)
    for idxs in by_exp.values():
        for a in idxs:
            for b in idxs:
                if a < b:
                    pairs.add((a, b))
    for idxs in by_token.values():
        for a in idxs:
            for b in idxs:
                if a < b and records[a].municipalities & records[b].municipalities:
                    pairs.add((a, b))
    return pairs
