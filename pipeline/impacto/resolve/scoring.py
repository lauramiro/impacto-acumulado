from __future__ import annotations

import re

from rapidfuzz import fuzz

from impacto.resolve.blocking import name_key
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


def score_pair(a: Record, b: Record) -> tuple[float, str]:
    if a.expediente and b.expediente and a.expediente == b.expediente:
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
