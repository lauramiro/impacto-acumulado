from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date

import psycopg

from impacto.text import normalize


@dataclass(frozen=True)
class RawDocument:
    source: str
    source_id: str
    published_at: date
    title: str
    url: str
    section: str | None
    organisation: str | None
    text: str


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def upsert_raw_document(conn: psycopg.Connection, doc: RawDocument) -> bool:
    digest = content_hash(doc.text)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT content_hash FROM raw_documents WHERE source = %s AND source_id = %s",
            (doc.source, doc.source_id),
        )
        row = cur.fetchone()
        if row and row["content_hash"] == digest:
            return False
        cur.execute(
            """
            INSERT INTO raw_documents
              (source, source_id, published_at, title, url, section, organisation, text, content_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source, source_id) DO UPDATE SET
              published_at = EXCLUDED.published_at,
              title = EXCLUDED.title,
              url = EXCLUDED.url,
              section = EXCLUDED.section,
              organisation = EXCLUDED.organisation,
              text = EXCLUDED.text,
              content_hash = EXCLUDED.content_hash,
              fetched_at = now()
            """,
            (
                doc.source,
                doc.source_id,
                doc.published_at,
                doc.title,
                doc.url,
                doc.section,
                doc.organisation,
                doc.text,
                digest,
            ),
        )
        if row:
            cur.execute(
                """
                DELETE FROM extractions
                WHERE document_id = (
                  SELECT id FROM raw_documents WHERE source = %s AND source_id = %s
                )
                """,
                (doc.source, doc.source_id),
            )
    conn.commit()
    return True


def pending_for_extraction(
    conn: psycopg.Connection, limit: int, redo_prompt_version: str | None = None
) -> list[dict]:
    """Documents with no extraction yet, or a failed one that has not used up its attempts.

    With `redo_prompt_version`, ok rows extracted under that prompt version are
    selected too, so a prompt change can be re-applied to already-extracted
    documents without deleting their rows.
    """
    redo = "OR (e.status = 'ok' AND e.prompt_version = %s)" if redo_prompt_version else ""
    params: tuple = (redo_prompt_version, limit) if redo_prompt_version else (limit,)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT d.id, d.title, d.text
            FROM raw_documents d
            LEFT JOIN extractions e ON e.document_id = d.id
            WHERE e.document_id IS NULL OR (e.status = 'failed' AND e.attempts < 3) {redo}
            ORDER BY d.published_at, d.id
            LIMIT %s
            """,
            params,
        )
        return list(cur.fetchall())


def save_extraction(
    conn: psycopg.Connection,
    document_id: int,
    model: str,
    prompt_version: str,
    payload: dict | None,
    confidence: float | None,
    error: str | None,
) -> None:
    """Record an extraction attempt. A conflict (retry) increments attempts."""
    status = "ok" if payload is not None else "failed"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO extractions (document_id, model, prompt_version, status, attempts, error, confidence, payload)
            VALUES (%s, %s, %s, %s, 1, %s, %s, %s)
            ON CONFLICT (document_id) DO UPDATE SET
              model = EXCLUDED.model,
              prompt_version = EXCLUDED.prompt_version,
              status = EXCLUDED.status,
              attempts = extractions.attempts + 1,
              error = EXCLUDED.error,
              confidence = EXCLUDED.confidence,
              payload = EXCLUDED.payload,
              extracted_at = now()
            """,
            (
                document_id,
                model,
                prompt_version,
                status,
                error,
                confidence,
                json.dumps(payload) if payload is not None else None,
            ),
        )
    conn.commit()


def municipality_name_map(conn: psycopg.Connection) -> dict[str, str]:
    """Normalised name -> canonical name, for fuzzy-matching extracted municipality names."""
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM municipalities")
        return {normalize(r["name"]): r["name"] for r in cur.fetchall()}
