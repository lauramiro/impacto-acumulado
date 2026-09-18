from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, date, datetime, timedelta

import httpx
import psycopg

from impacto.db.connect import connect
from impacto.db.documents import RawDocument, upsert_raw_document
from impacto.fetch import boe, boja
from impacto.http import CachedClient
from impacto.settings import load_settings

log = logging.getLogger(__name__)


def _days(day_from: date, day_to: date):
    d = day_from
    while d <= day_to:
        yield d
        d += timedelta(days=1)


def fetch_boe(client: CachedClient, conn: psycopg.Connection, day_from: date, day_to: date) -> int:
    new = 0
    for day in _days(day_from, day_to):
        try:
            raw = client.get(boe.summary_url(day), headers=boe.SUMMARY_HEADERS)
        except httpx.HTTPStatusError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                continue
            raise
        items = boe.select_items(boe.walk_items(json.loads(raw)))
        for item in items:
            doc = boe.parse_document_xml(client.get(item.xml_url))
            # Only the title, not the full body text: a resolution's title
            # reliably states the province(s) the project sits in (see
            # docs/sources.md), while scanning the whole body catches
            # unrelated substring hits - e.g. a submitter's surname
            # "Cordoba" or an out-of-region municipality "La Granada"
            # (Barcelona) - for documents about projects in other regions
            # (observed live for BOE-A-2023-19523 and BOE-A-2023-19526,
            # both in Huesca/Barcelona).
            if not boe.mentions_andalusia(doc.title):
                continue
            stored = upsert_raw_document(
                conn,
                RawDocument(
                    source="boe",
                    source_id=doc.identifier,
                    published_at=doc.published_at,
                    title=doc.title,
                    url=item.xml_url,
                    section=item.section,
                    organisation=doc.department or item.department,
                    text=doc.text,
                ),
            )
            new += int(stored)
        log.info("boe %s: %d selected items", day, len(items))
    return new


def fetch_boja(client: CachedClient, conn: psycopg.Connection, day_from: date, day_to: date) -> int:
    new = 0
    seen: set[str] = set()
    for query in boja.BOJA_QUERIES:
        page = 1
        while True:
            try:
                raw = client.get(boja.search_url(day_from, day_to, query, page))
            except httpx.HTTPStatusError as exc:
                # The live API returns 400 (not an empty results list) once a
                # page number exceeds what it actually has for a narrow date
                # window, even when total_hits suggested more were coming.
                if exc.response is not None and exc.response.status_code == 400:
                    break
                raise
            payload = json.loads(raw)
            records = boja.parse_records(payload)
            if not records:
                break
            for r in boja.select_records(records):
                if r.bid in seen:
                    continue
                seen.add(r.bid)
                stored = upsert_raw_document(
                    conn,
                    RawDocument(
                        source="boja",
                        source_id=r.bid,
                        published_at=r.published_at,
                        title=r.title,
                        url=r.url,
                        section=None,
                        organisation=r.organisation,
                        text=r.text,
                    ),
                )
                new += int(stored)
            page += 1
    log.info("boja: %d new document(s)", new)
    return new


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="impacto fetch")
    today = datetime.now(tz=UTC).date()
    parser.add_argument("--from", dest="day_from", type=date.fromisoformat, default=today - timedelta(days=14))
    parser.add_argument("--to", dest="day_to", type=date.fromisoformat, default=today)
    parser.add_argument("--source", choices=["boe", "boja"], default=None)
    args = parser.parse_args(argv)
    settings = load_settings()
    client = CachedClient(settings.http_cache)
    with connect(settings.db_dsn) as conn:
        total = 0
        if args.source in (None, "boe"):
            total += fetch_boe(client, conn, args.day_from, args.day_to)
        if args.source in (None, "boja"):
            total += fetch_boja(client, conn, args.day_from, args.day_to)
    print(f"stored {total} new document(s)")
    return 0
