import json
from datetime import date
from urllib.parse import parse_qs, urlparse

import httpx

from impacto.fetch import boja
from impacto.fetch.coverage import boja_coverage

ENV = "Consejería de Sostenibilidad y Medio Ambiente"


def _record(bid, title, org=ENV, text="planta fotovoltaica"):
    return {"id": bid, "summary": title, "organisation": org, "date": "01/03/2026", "bodyNoHtml": text}


def _api(pages_by_query, fail=()):
    """A fake BOJA search: pages_by_query[query] is a list of pages for 2026, other years are empty."""

    def get(url: str) -> bytes:
        q = parse_qs(urlparse(url).query)
        query, page, year = q["general"][0], int(q["page"][0]), q["date_from"][0][:4]
        if query in fail:
            raise httpx.HTTPStatusError("500", request=httpx.Request("GET", url), response=httpx.Response(500))
        pages = pages_by_query.get(query, []) if year == "2026" else []
        if page >= len(pages):
            raise httpx.HTTPStatusError("400", request=httpx.Request("GET", url), response=httpx.Response(400))
        total = sum(len(p) for p in pages)
        return json.dumps({"hits": len(pages[page]), "total_hits": total, "results": pages[page]}).encode()

    return get


def test_coverage_compares_stored_documents_with_the_same_selection():
    aau = "autorizacion ambiental unificada"
    pages = {
        aau: [
            [
                _record("a", "se otorga la autorización ambiental unificada"),
                _record("b", "se otorga la autorización ambiental unificada"),
                # Same instrument, other department: out of the selection.
                _record("c", "autorización ambiental unificada", org="Consejería de Industria, Energía y Minas"),
            ],
            [_record("d", "autorización ambiental unificada de una cantera", text="extracción de áridos")],
        ],
        "informacion publica fotovoltaica": [[_record("a", "información pública de la autorización ambiental unificada")]],
    }
    report = boja_coverage(_api(pages), stored_ids=["a"], today=date(2026, 10, 6), first_year=2025)
    assert report["complete"] is True
    assert report["total_hits"] == 5 and report["received"] == 5
    # "a" matched two queries and counts once; "c" and "d" fail the selection.
    assert report["selected"] == 2 and report["stored"] == 1
    assert report["missing"] == ["b"] and report["missing_count"] == 1
    assert report["years"]["2025"] == {"total_hits": 0, "received": 0, "selected": 0, "stored": 0}
    assert report["years"]["2026"]["selected"] == 2


def test_coverage_reads_the_first_page_the_api_numbers_zero():
    asked: list[int] = []
    inner = _api({"informe de impacto ambiental": [[_record("x", "informe de impacto ambiental de la planta")]]})

    def get(url):
        asked.append(int(parse_qs(urlparse(url).query)["page"][0]))
        return inner(url)

    report = boja_coverage(get, [], today=date(2026, 1, 31), first_year=2026)
    assert boja.FIRST_PAGE == 0 and min(asked) == 0
    assert report["selected"] == 1


def test_coverage_marks_a_failed_query_incomplete():
    report = boja_coverage(_api({}, fail={"informacion publica eolico"}), [], today=date(2026, 1, 31), first_year=2026)
    assert report["complete"] is False


class _Clock:
    """A clock that moves one second per request the fake API answers."""

    def __init__(self, get):
        self.now = 0.0
        self.requests = 0
        self._get = get

    def get(self, url):
        self.now += 1.0
        self.requests += 1
        return self._get(url)

    def __call__(self):
        return self.now


def _one_record_api():
    return _api({"autorizacion ambiental unificada": [[_record("a", "se otorga la autorización ambiental unificada")]]})


def test_coverage_without_a_time_limit_covers_every_year():
    report = boja_coverage(_one_record_api(), [], today=date(2026, 10, 6), first_year=2025)
    assert report["timed_out"] is False
    assert report["scanned_from"] == "2025-01-01"
    assert list(report["years"]) == ["2025", "2026"]


def test_coverage_stops_at_the_time_limit_newest_year_first_and_drops_the_year_cut_off():
    clock = _Clock(_one_record_api())
    # 4 queries read the current year (4 s); the first request of 2025 runs past 4.5 s.
    report = boja_coverage(clock.get, ["a"], today=date(2026, 10, 6), first_year=2019, max_seconds=4.5, clock=clock)
    assert report["timed_out"] is True
    assert report["scanned_from"] == "2026-01-01"
    assert list(report["years"]) == ["2026"]
    assert report["selected"] == 1 and report["stored"] == 1 and report["missing_count"] == 0
    # It stopped: nothing was requested for the years before 2025's first query.
    assert clock.requests == 5


def test_coverage_keeps_a_year_that_finished_exactly_as_the_time_ran_out():
    clock = _Clock(_one_record_api())
    report = boja_coverage(clock.get, [], today=date(2026, 10, 6), first_year=2025, max_seconds=4.0, clock=clock)
    assert report["timed_out"] is True
    assert list(report["years"]) == ["2026"] and report["years"]["2026"]["selected"] == 1
