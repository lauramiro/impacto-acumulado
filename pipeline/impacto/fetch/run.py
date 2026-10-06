from __future__ import annotations

import argparse
import json
import logging
import xml.etree.ElementTree as ET
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import psycopg

from impacto.consultations import parse_period
from impacto.db.connect import connect
from impacto.db.documents import RawDocument, upsert_raw_document
from impacto.fetch import boe, boja
from impacto.http import CachedClient
from impacto.privacy import strip_personal_annex
from impacto.settings import load_settings

log = logging.getLogger(__name__)


def _days(day_from: date, day_to: date):
    d = day_from
    while d <= day_to:
        yield d
        d += timedelta(days=1)


def _boe_summary(client: CachedClient, day: date) -> list[boe.SummaryItem] | None:
    try:
        raw = client.get(boe.summary_url(day), headers=boe.SUMMARY_HEADERS)
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            return None
        raise
    return boe.walk_items(json.loads(raw))


def scan_consultations(client: CachedClient, day_from: date, day_to: date):
    """Yield (item, document with its text stripped or None, report row) for each section V consultation.

    The announcement is fetched without the HTTP cache and its owner list is cut
    in memory (impacto.privacy), so nothing personal is written anywhere. A
    document is returned only when it concerns Andalucía, covers the
    environmental assessment and was not held back.
    """
    for day in _days(day_from, day_to):
        summary = _boe_summary(client, day)
        if summary is None:
            continue
        for item in boe.select_consultation_items(summary):
            row = {"id": item.identifier, "date": day.isoformat(), "title": item.title, "department": item.department}
            try:
                doc = boe.parse_document_xml(client.get(item.xml_url, cache=False))
            except (httpx.HTTPError, ValueError, ET.ParseError) as exc:
                log.warning("boe consultation %s: skipping, %s", item.identifier, exc)
                yield item, None, {**row, "error": str(exc)[:200]}
                continue
            stripped = strip_personal_annex(doc.text)
            period = parse_period(stripped.text)
            row |= {
                "andalusia": boe.concerns_andalusia(doc.title, doc.text),
                "environment_in_title": boe.assesses_environment(doc.title, ""),
                "environment": boe.assesses_environment(doc.title, doc.text),
                "annex_removed_chars": stripped.removed_chars,
                "held_back": stripped.held_back,
                "held_back_reason": stripped.reason,
                "period": f"{period.amount} {period.unit}" if period else None,
            }
            keep = row["andalusia"] and row["environment"] and not stripped.held_back
            row["kept"] = keep
            if stripped.held_back:
                log.warning("boe consultation %s: held back, %s", item.identifier, stripped.reason)
            yield item, (boe.ParsedDocument(doc.identifier, doc.title, doc.published_at, doc.department, stripped.text) if keep else None), row


def fetch_boe(client: CachedClient, conn: psycopg.Connection, day_from: date, day_to: date, consultations: bool = False) -> int:
    """Section III decisions, and with `consultations` the section V consultations (scan_consultations)."""
    new = 0
    for item, doc, _row in scan_consultations(client, day_from, day_to) if consultations else ():
        if doc is None:
            continue
        stored = upsert_raw_document(
            conn,
            RawDocument(
                source="boe",
                source_id=doc.identifier,
                published_at=doc.published_at,
                title=doc.title,
                url=item.html_url,
                section=item.section,
                organisation=doc.department or item.department,
                text=doc.text,
            ),
        )
        new += int(stored)
    for day in _days(day_from, day_to):
        summary = _boe_summary(client, day)
        if summary is None:
            continue
        items = boe.select_items(summary)
        for item in items:
            try:
                doc = boe.parse_document_xml(client.get(item.xml_url))
            except (httpx.HTTPError, ValueError, ET.ParseError) as exc:
                # One document's XML failing (server error after retries,
                # transport error, malformed or incomplete XML) must not
                # abort the whole run. The next weekly run re-reads the last
                # 14 days, so the miss heals itself once the endpoint
                # recovers.
                log.warning("boe item %s: skipping, %s", item.identifier, exc)
                continue
            # The title first, not the full body text: a resolution's title
            # almost always states the province(s) the project sits in (see
            # docs/sources.md), while scanning the whole body for a province
            # name catches unrelated substring hits - e.g. a submitter's
            # surname "Cordoba" or an out-of-region municipality "La Granada"
            # (Barcelona) - for documents about projects in other regions
            # (observed live for BOE-A-2023-19523 and BOE-A-2023-19526, both
            # in Huesca/Barcelona). The body is then consulted for one
            # specific phrase only, see consulted_andalusian_authority.
            if not boe.concerns_andalusia(doc.title, doc.text):
                continue
            stored = upsert_raw_document(
                conn,
                RawDocument(
                    source="boe",
                    source_id=doc.identifier,
                    published_at=doc.published_at,
                    title=doc.title,
                    url=item.html_url,
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
        page = boja.FIRST_PAGE
        query_new = 0
        received = 0
        while True:
            try:
                raw = client.get(boja.search_url(day_from, day_to, query, page))
            except httpx.HTTPStatusError as exc:
                # The live API returns 400 (not an empty results list) once a
                # page number exceeds what it actually has for a narrow date
                # window, even when total_hits suggested more were coming.
                if exc.response is not None and exc.response.status_code == 400:
                    if page == boja.FIRST_PAGE:
                        # A 400 here is indistinguishable from a real "zero
                        # matches" unless logged: a broken query or an API
                        # change would otherwise silently read as zero
                        # matches forever (observed live: 3 of 4
                        # BOJA_QUERIES 400'd on the first page for the
                        # September 2023 window).
                        log.warning(
                            "boja query %r returned 400 on the first page: zero matches or bad query",
                            query,
                        )
                    else:
                        log.info("boja query %r: %d page(s)", query, page - boja.FIRST_PAGE)
                    break
                # Any other HTTP failure (5xx after retries, transport error)
                # abandons this query for the run instead of aborting fetch;
                # the next run's 14-day overlap re-reads the window.
                log.warning("boja query %r page %d: skipping the query, %s", query, page, exc)
                break
            except httpx.HTTPError as exc:
                log.warning("boja query %r page %d: skipping the query, %s", query, page, exc)
                break
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
                query_new += int(stored)
            received += len(records)
            total = boja.total_results(payload)
            if total is not None and received >= total:
                break
            page += 1
        log.info("boja query %r: %d new document(s)", query, query_new)
    log.info("boja: %d new document(s)", new)
    return new


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="impacto fetch")
    today = datetime.now(tz=UTC).date()
    parser.add_argument("--from", dest="day_from", type=date.fromisoformat, default=today - timedelta(days=14))
    parser.add_argument("--to", dest="day_to", type=date.fromisoformat, default=today)
    parser.add_argument("--source", choices=["boe", "boja"], default=None)
    parser.add_argument(
        "--boe-consultations",
        action="store_true",
        help="also store BOE section V consultations (owner lists stripped; see impacto.privacy)",
    )
    parser.add_argument(
        "--consultations-report",
        type=Path,
        help="dry run: write a JSON report of the BOE section V consultations in the range and store nothing",
    )
    args = parser.parse_args(argv)
    settings = load_settings()
    client = CachedClient(settings.http_cache)
    if args.consultations_report:
        rows = [row for _item, _doc, row in scan_consultations(client, args.day_from, args.day_to)]
        args.consultations_report.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(rows)} consultation(s), {sum(1 for r in rows if r.get('kept'))} would be stored; report in {args.consultations_report}")
        return 0
    with connect(settings.db_dsn) as conn:
        total = 0
        if args.source in (None, "boe"):
            total += fetch_boe(client, conn, args.day_from, args.day_to, consultations=args.boe_consultations)
        if args.source in (None, "boja"):
            total += fetch_boja(client, conn, args.day_from, args.day_to)
    print(f"stored {total} new document(s)")
    return 0
