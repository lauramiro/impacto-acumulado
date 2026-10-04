from __future__ import annotations

import re

from rapidfuzz import fuzz

from impacto.resolve.blocking import name_key, procedure_key
from impacto.resolve.model import Record

THRESHOLD = 0.6
W_NAME, W_MUNI, W_MW = 0.5, 0.3, 0.2
PHASE = re.compile(r"^(i|ii|iii|iv|v|vi|vii|viii|ix|x|\d{1,2})$")


def phase_token(name: str | None) -> str | None:
    """Trailing phase marker of a project name ('ronda i' -> 'i', 'ronda 2' -> '2'), else None."""
    if not name:
        return None
    parts = name_key(name).split()
    return parts[-1] if parts and PHASE.match(parts[-1]) else None


_ROMAN = {"i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"}


def phase_markers(name: str | None) -> frozenset[str]:
    """Every phase marker in a name ('Guadame II, Set Guadame II y línea' -> {'ii'}), capacity figures left out."""
    if not name:
        return frozenset()
    out = set()
    for t in name_key(name).split():
        if t in _ROMAN:
            out.add(t)
        elif t.isdigit() and len(t.lstrip("0")) in (1, 2):
            out.add(t.lstrip("0"))
    return frozenset(out)


def conflict(a: Record, b: Record) -> str | None:
    """Why two documents cannot be one project, or None.

    Two procedures of one type in one province with different numbers are two
    projects; so are names with disjoint phase markers (Guadame II and IV).
    Resolve applies this to every pair in a group, so a document that matches
    two plants (a common substation) cannot chain them into one project.
    """
    pa, pb = procedure_key(a.expediente), procedure_key(b.expediente)
    if pa and pb and pa[0] == pb[0] and pa[1:] != pb[1:]:
        return "expediente"
    ma, mb = phase_markers(a.name), phase_markers(b.name)
    if ma and mb and not ma & mb:
        return "phase"
    return None


SAME_NAME = 0.9


def same_plant_evidence(a: Record, b: Record) -> bool:
    """Positive evidence that two documents are one plant: the same procedure, or near-identical names."""
    if a.expediente and b.expediente:
        qa, qb = procedure_key(a.expediente), procedure_key(b.expediente)
        if a.expediente == b.expediente or (qa is not None and qa == qb):
            return True
    if a.name and b.name:
        ka, kb = name_key(a.name), name_key(b.name)
        return bool(ka and kb) and fuzz.ratio(ka, kb) / 100.0 >= SAME_NAME
    return False


def score_pair(a: Record, b: Record) -> tuple[float, str]:
    # One procedure, also across its modifications ("aau/ca/051/21" and "aau/ca/051/21/m1").
    qa, qb = procedure_key(a.expediente), procedure_key(b.expediente)
    if a.expediente and b.expediente and (a.expediente == b.expediente or (qa and qa == qb)):
        return 1.0, "expediente"
    pa, pb = phase_token(a.name), phase_token(b.name)
    if pa and pb and pa != pb:
        return 0.0, "phase_mismatch"
    reasons = []
    score = 0.0
    if a.name and b.name:
        sim = fuzz.token_set_ratio(name_key(a.name), name_key(b.name)) / 100.0
        score += W_NAME * sim
        reasons.append(f"name={sim:.2f}")
    if a.municipalities & b.municipalities:
        score += W_MUNI
        reasons.append("municipality")
    if a.mw_nominal and b.mw_nominal:
        hi, lo = max(a.mw_nominal, b.mw_nominal), min(a.mw_nominal, b.mw_nominal)
        if (hi - lo) / hi <= 0.15:
            score += W_MW
            reasons.append("mw")
    return round(score, 4), ",".join(reasons) or "none"
