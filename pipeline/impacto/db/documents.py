from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date

import psycopg


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
