import json
import logging
from datetime import date

import httpx

from impacto.fetch.run import fetch_boe, fetch_boja
from impacto.http import CachedClient


def test_fetch_boe_stores_selected_documents(db, fixtures_dir, tmp_path):
    summary = (fixtures_dir / "boe_sumario_20230918.json").read_bytes()
    ronda = (fixtures_dir / "boe_doc_BOE-A-2023-19635.xml").read_bytes()

    def handler(request):
        url = str(request.url)
        if url.endswith("/sumario/20230918"):
            return httpx.Response(200, content=summary)
        if "id=BOE-A-2023-19635" in url:
            return httpx.Response(200, content=ronda)
        if "/sumario/" in url:
            return httpx.Response(404)
        return httpx.Response(
            200,
            content=b"<documento><metadatos><identificador>X</identificador>"
            b"<titulo>t</titulo><fecha_publicacion>20230918</fecha_publicacion>"
            b"<departamento>d</departamento></metadatos>"
            b"<texto><p>Zaragoza</p></texto></documento>",
        )

    client = CachedClient(tmp_path, rate_per_second=1000, transport=httpx.MockTransport(handler))
    n = fetch_boe(client, db, date(2023, 9, 17), date(2023, 9, 18))
    assert n >= 1
    with db.cursor() as cur:
        cur.execute("SELECT source_id, section, url FROM raw_documents WHERE source = 'boe'")
        rows = cur.fetchall()
    assert any(r["source_id"] == "BOE-A-2023-19635" for r in rows)
    assert all(r["section"] == "III" for r in rows)
    ronda_row = next(r for r in rows if r["source_id"] == "BOE-A-2023-19635")
    assert "id=BOE-A-2023-19635" in ronda_row["url"]


def test_fetch_boe_excludes_other_region_document_despite_body_substring_hit(db, tmp_path):
    # Observed live against BOE-A-2023-19523 and BOE-A-2023-19526: both are
    # renewable-impact resolutions for projects in Huesca/Barcelona (not
    # Andalusia), yet their long body text contains an unrelated substring
    # match for an Andalusian place name - a submitter's surname "Cordoba"
    # in one, and the Catalan municipality "La Granada" (Barcelona) in the
    # other. The title, unlike the body, reliably states the true province.
    summary = {
        "data": {
            "sumario": {
                "diario": [
                    {
                        "seccion": [
                            {
                                "nombre": "III. Otras disposiciones",
                                "departamento": [
                                    {
                                        "nombre": "MINISTERIO PARA LA TRANSICIÓN ECOLÓGICA Y EL RETO DEMOGRÁFICO",
                                        "epigrafe": [
                                            {
                                                "nombre": "Impacto ambiental",
                                                "item": [
                                                    {
                                                        "identificador": "BOE-A-2023-99999",
                                                        "titulo": (
                                                            "Resolución por la que se formula declaración de "
                                                            "impacto ambiental del proyecto Parque fotovoltaico "
                                                            "Manto en Huesca"
                                                        ),
                                                        "url_xml": (
                                                            "https://www.boe.es/diario_boe/xml.php?"
                                                            "id=BOE-A-2023-99999"
                                                        ),
                                                    }
                                                ],
                                            }
                                        ],
                                    }
                                ],
                            }
                        ]
                    }
                ]
            }
        }
    }
    doc_xml = (
        "<documento><metadatos><identificador>BOE-A-2023-99999</identificador>"
        "<titulo>Resolución por la que se formula declaración de impacto ambiental "
        "del proyecto Parque fotovoltaico Manto en Huesca</titulo>"
        "<fecha_publicacion>20230916</fecha_publicacion>"
        "<departamento>Ministerio para la Transición Ecológica y el Reto Demográfico</departamento>"
        "</metadatos><texto><p>Alegaciones de Doña María Carmen Córdoba y otros.</p></texto></documento>"
    ).encode()

    def handler(request):
        url = str(request.url)
        if url.endswith("/sumario/20230916"):
            return httpx.Response(200, content=json.dumps(summary).encode("utf-8"))
        if "id=BOE-A-2023-99999" in url:
            return httpx.Response(200, content=doc_xml)
        return httpx.Response(404)

    client = CachedClient(tmp_path, rate_per_second=1000, transport=httpx.MockTransport(handler))
    n = fetch_boe(client, db, date(2023, 9, 16), date(2023, 9, 16))
    assert n == 0
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM raw_documents WHERE source_id = 'BOE-A-2023-99999'")
        assert cur.fetchone()["n"] == 0


def test_fetch_boja_stores_selected_records(db, fixtures_dir, tmp_path):
    sample = (fixtures_dir / "boja_search_sample.json").read_bytes()
    empty = json.dumps({"hits": 0, "total_hits": 0, "results": []}).encode()

    def handler(request):
        if "page=1" in str(request.url):
            return httpx.Response(200, content=sample)
        return httpx.Response(200, content=empty)

    client = CachedClient(tmp_path, rate_per_second=1000, transport=httpx.MockTransport(handler))
    n = fetch_boja(client, db, date(2024, 1, 1), date(2024, 12, 31))
    assert n == 11
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM raw_documents WHERE source = 'boja'")
        assert cur.fetchone()["n"] == n


def test_fetch_boja_warns_when_first_page_returns_400(db, tmp_path, caplog):
    # A 400 on page 1 is indistinguishable from "zero matches" unless it is
    # logged: a broken query or an API change would otherwise silently
    # read as zero matches forever (observed live: 3 of 4 BOJA_QUERIES got
    # a 400 on page 1 for the September 2023 window).
    def handler(request):
        return httpx.Response(400)

    client = CachedClient(tmp_path, rate_per_second=1000, transport=httpx.MockTransport(handler))
    with caplog.at_level(logging.WARNING, logger="impacto.fetch.run"):
        n = fetch_boja(client, db, date(2024, 1, 1), date(2024, 12, 31))
    assert n == 0
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert warnings
    for query in ["autorizacion ambiental unificada", "informe de impacto ambiental"]:
        assert any(query in r.getMessage() and "first page" in r.getMessage() for r in warnings)


def test_fetch_boja_stops_paging_on_400_out_of_range(db, fixtures_dir, tmp_path):
    # Observed against the live API: a page number beyond what a narrow date
    # window actually has returns HTTP 400, not an empty results envelope.
    sample = (fixtures_dir / "boja_search_sample.json").read_bytes()

    def handler(request):
        if "page=1" in str(request.url):
            return httpx.Response(200, content=sample)
        return httpx.Response(400)

    client = CachedClient(tmp_path, rate_per_second=1000, transport=httpx.MockTransport(handler))
    n = fetch_boja(client, db, date(2024, 1, 1), date(2024, 12, 31))
    assert n == 11
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM raw_documents WHERE source = 'boja'")
        assert cur.fetchone()["n"] == n
