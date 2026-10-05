from __future__ import annotations

from dataclasses import replace
from datetime import date

from impacto.resolve.model import Record

VERDICT_TYPES = {"dia", "informe_impacto", "aau"}

# A consultation with no decision published this long after it reads as
# "sin_resolucion" rather than "en_consulta": still nothing decided, but no
# longer in the middle of its consultation.
STALE_CONSULTATION_MONTHS = 24


def _months_between(earlier: date, later: date) -> int:
    months = (later.year - earlier.year) * 12 + later.month - earlier.month
    return months if later.day >= earlier.day else months - 1


def _corrected(records: list[Record], corrections: dict[int, int]) -> list[Record]:
    """The records with each correction folded into the document it corrects.

    A correction is no decision of its own: when it states a decision, that
    verdict replaces its target's at the target's date (Jarico 1's refusal,
    published as "se otorga" and corrected to "se deniega"), and the status
    cites the correction; when it states none, the target keeps its own.
    """
    present = {r.document_id for r in records}
    by_target = {}
    for r in sorted(records, key=lambda r: (r.published_at, r.document_id)):
        target = corrections.get(r.document_id)
        if target in present and r.doc_type in VERDICT_TYPES and r.verdict != "no_aplica":
            by_target[target] = r
    out = []
    for r in records:
        if corrections.get(r.document_id) in present:
            continue
        c = by_target.get(r.document_id)
        out.append(r if c is None else replace(r, doc_type=c.doc_type, verdict=c.verdict, document_id=c.document_id))
    return out


def derive_status(
    records: list[Record], today: date | None = None, corrections: dict[int, int] | None = None
) -> tuple[str, int]:
    """`corrections`: correction document id -> the document it corrects (blocking.correction_targets)."""
    ordered = sorted(records, key=lambda r: (r.published_at, r.document_id))
    status, doc_id = "desconocido", ordered[-1].document_id
    consulted_on = None
    for r in sorted(_corrected(records, corrections or {}), key=lambda r: (r.published_at, r.document_id)):
        if r.doc_type == "caducidad":
            status, doc_id = "caducado", r.document_id
        elif r.doc_type in VERDICT_TYPES and r.verdict != "no_aplica":
            status, doc_id = r.verdict, r.document_id
        elif r.doc_type == "modificacion" and r.verdict != "no_aplica" and status in ("desconocido", "en_consulta"):
            # A modification is granted only on an existing AAU: it tells a
            # project with no verdict read that one was given, and no more.
            status, doc_id = r.verdict, r.document_id
        elif r.doc_type == "informacion_publica" and status in ("desconocido", "en_consulta"):
            status, doc_id, consulted_on = "en_consulta", r.document_id, r.published_at
    if status == "en_consulta" and today is not None and _months_between(consulted_on, today) >= STALE_CONSULTATION_MONTHS:
        status = "sin_resolucion"
    return status, doc_id
