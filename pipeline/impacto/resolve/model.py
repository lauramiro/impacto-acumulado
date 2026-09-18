from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from impacto.text import normalize


@dataclass(frozen=True)
class Record:
    document_id: int
    published_at: date
    doc_type: str
    verdict: str
    name: str | None
    expediente: str | None
    developer: str | None
    municipalities: frozenset[str]
    mw_nominal: float | None
    mw_peak: float | None
    hectares: float | None
    turbines: int | None
    technology: str | None

    @classmethod
    def from_extraction(cls, document_id: int, published_at: date, payload: dict) -> Record:
        munis = frozenset(normalize(m["name"]) for m in payload.get("municipalities") or [] if m.get("name"))
        exp = payload.get("expediente")
        return cls(
            document_id=document_id,
            published_at=published_at,
            doc_type=payload.get("doc_type", "otro"),
            verdict=payload.get("verdict", "no_aplica"),
            name=payload.get("project_name"),
            expediente=normalize(exp) if exp else None,
            developer=payload.get("developer"),
            municipalities=munis,
            mw_nominal=payload.get("mw_nominal"),
            mw_peak=payload.get("mw_peak"),
            hectares=payload.get("hectares"),
            turbines=payload.get("turbines"),
            technology=payload.get("technology"),
        )
