from __future__ import annotations

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


def derive_status(records: list[Record], today: date | None = None) -> tuple[str, int]:
    ordered = sorted(records, key=lambda r: (r.published_at, r.document_id))
    status, doc_id = "desconocido", ordered[-1].document_id
    consulted_on = None
    for r in ordered:
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
