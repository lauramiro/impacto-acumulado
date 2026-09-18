from __future__ import annotations

from impacto.resolve.model import Record

VERDICT_TYPES = {"dia", "informe_impacto", "aau"}


def derive_status(records: list[Record]) -> tuple[str, int]:
    ordered = sorted(records, key=lambda r: (r.published_at, r.document_id))
    status, doc_id = "desconocido", ordered[-1].document_id
    for r in ordered:
        if r.doc_type == "caducidad":
            status, doc_id = "caducado", r.document_id
        elif r.doc_type in VERDICT_TYPES and r.verdict != "no_aplica":
            status, doc_id = r.verdict, r.document_id
        elif r.doc_type == "informacion_publica" and status in ("desconocido", "en_consulta"):
            status, doc_id = "en_consulta", r.document_id
    return status, doc_id
