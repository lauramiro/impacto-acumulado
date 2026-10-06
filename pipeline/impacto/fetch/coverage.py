"""How much of what the BOJA search returns for our selection the database holds.

The weekly fetch reads a 14-day window, so a gap left by an earlier run (an
API outage, a query that 400'd, a backfill that stopped short) never shows up
in its own counts. This check re-reads every BOJA query year by year, applies
the same selection the fetch applies (impacto.fetch.boja.select_records) and
compares the documents selected with those stored:

- total_hits: what the API says it has for the four queries (all departments,
  a record matching two queries counted twice);
- received: the records actually read by paging, against total_hits, so a
  paging failure is visible;
- selected: distinct records that pass the selection;
- stored: of those, the ones in raw_documents.

stored / selected is the share of the BOJA selection the site holds. Past
years are complete windows whose URLs never change, so the HTTP cache serves
them after the first run; only the current year is read again each week.

The scan is bounded by `max_seconds`: pages are 1 to 2 MB and the API can take
10 to 25 s a page from a CI runner, so a cold cache costs about an hour. The
current year is read first, then earlier years, newest to oldest. When the time
runs out the report says so (`timed_out`, `scanned_from`); a year cut off half
way is left out, so its counts cover only whole years from `scanned_from` on.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable, Iterable
from datetime import date

import httpx

from impacto.fetch import boja

log = logging.getLogger(__name__)

FIRST_YEAR = 2019
# Selected records the database lacks, listed by id so a gap can be chased.
MISSING_LISTED = 50


def _scan_query(
    get: Callable[[str], bytes],
    day_from: date,
    day_to: date,
    query: str,
    expired: Callable[[], bool] = lambda: False,
) -> tuple[int | None, int, list[boja.BojaRecord], bool]:
    """total_hits, records read, records selected and whether paging finished cleanly."""
    total: int | None = None
    received = 0
    selected: list[boja.BojaRecord] = []
    page = boja.FIRST_PAGE
    while True:
        if expired():
            return total, received, selected, False
        try:
            payload = json.loads(get(boja.search_url(day_from, day_to, query, page)))
        except httpx.HTTPStatusError as exc:
            # The API answers 400 for a page past the end and for a window
            # with no match at all (see fetch_boja); anything else is a failure.
            if exc.response is not None and exc.response.status_code == 400:
                return (total if total is not None else (0 if page == boja.FIRST_PAGE else None)), received, selected, True
            log.warning("boja coverage %r %s: %s", query, day_from.year, exc)
            return total, received, selected, False
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("boja coverage %r %s: %s", query, day_from.year, exc)
            return total, received, selected, False
        if total is None:
            total = boja.total_results(payload)
        records = boja.parse_records(payload)
        if not records:
            return total, received, selected, True
        received += len(records)
        selected += boja.select_records(records)
        if total is not None and received >= total:
            return total, received, selected, True
        page += 1


def boja_coverage(
    get: Callable[[str], bytes],
    stored_ids: Iterable[str],
    today: date,
    first_year: int = FIRST_YEAR,
    max_seconds: float | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> dict:
    """The coverage report for every year from `first_year` to today's, see the module docstring."""
    stored = set(stored_ids)
    years: dict[str, dict] = {}
    complete = True
    timed_out = False
    missing: list[str] = []
    deadline = None if max_seconds is None else clock() + max_seconds

    def expired() -> bool:
        return deadline is not None and clock() >= deadline

    # Newest year first: it is the one that changes from week to week.
    for year in range(today.year, first_year - 1, -1):
        day_from, day_to = date(year, 1, 1), min(date(year, 12, 31), today)
        total_hits = received = 0
        selected: dict[str, boja.BojaRecord] = {}
        year_complete = True
        for n, query in enumerate(boja.BOJA_QUERIES, 1):
            hits, got, records, clean = _scan_query(get, day_from, day_to, query, expired)
            year_complete = year_complete and clean and hits is not None
            total_hits += hits or 0
            received += got
            for r in records:
                selected.setdefault(r.bid, r)
            if expired():
                year_complete = year_complete and n == len(boja.BOJA_QUERIES)
                break
        if expired() and not year_complete:
            # Cut off half way: a partial year would understate the selection.
            timed_out = True
            break
        complete = complete and year_complete
        held = [bid for bid in selected if bid in stored]
        missing += sorted(bid for bid in selected if bid not in stored)
        years[str(year)] = {"total_hits": total_hits, "received": received, "selected": len(selected), "stored": len(held)}
    years = dict(sorted(years.items()))
    totals = {key: sum(y[key] for y in years.values()) for key in ("total_hits", "received", "selected", "stored")}
    scanned_from = min(years, default=str(today.year + 1))
    return {
        "checked": today.isoformat(),
        "from": date(first_year, 1, 1).isoformat(),
        # The first year the counts cover: later than `from` only when the time ran out.
        "scanned_from": date(int(scanned_from), 1, 1).isoformat(),
        "timed_out": timed_out,
        "queries": list(boja.BOJA_QUERIES),
        # False when a query failed part-way: the counts are then a floor.
        "complete": complete,
        **totals,
        "years": years,
        "missing": missing[-MISSING_LISTED:],
        "missing_count": len(missing),
    }
