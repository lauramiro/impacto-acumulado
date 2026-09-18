import json
from datetime import date

from impacto.fetch.boja import BojaRecord, parse_records, search_url, select_records, total_results
from impacto.text import normalize


def test_search_url_contains_window_and_query():
    url = search_url(date(2024, 1, 1), date(2024, 12, 31), "autorizacion ambiental unificada", page=2)
    assert url.startswith("https://datos.juntadeandalucia.es/api/v0/boja/get/search_pagination?")
    assert "date_from=2024-01-01" in url
    assert "date_to=2024-12-31" in url
    assert "page=2" in url
    assert "general=autorizacion%20ambiental%20unificada" in url
    assert "mode=DESC" in url


def test_search_url_includes_campos_for_body_and_pdf_fields():
    url = search_url(date(2024, 1, 1), date(2024, 12, 31), "eolico", page=1)
    for campo in ("id", "organisation", "summary", "number", "date", "titleSec", "body", "bodyNoHtml", "publicUrl"):
        assert f"campos={campo}" in url


def test_parse_records_from_fixture(fixtures_dir):
    payload = json.loads((fixtures_dir / "boja_search_sample.json").read_text(encoding="utf-8"))
    records = parse_records(payload)
    assert len(records) >= 5
    first = records[0]
    assert first.bid
    assert first.title
    assert first.published_at.year >= 2019
    assert first.url.startswith("http")
    assert len(first.text) > 200


def test_parse_records_urls_from_fixture_with_pdf(fixtures_dir):
    payload = json.loads((fixtures_dir / "boja_search_sample.json").read_text(encoding="utf-8"))
    raw_records = payload["results"]
    records = parse_records(payload)
    for raw, record in zip(raw_records, records):
        if raw.get("pdf"):
            assert record.url.startswith("http")


def test_total_results_from_fixture(fixtures_dir):
    payload = json.loads((fixtures_dir / "boja_search_sample.json").read_text(encoding="utf-8"))
    assert total_results(payload) == 792


def test_normalize_collapses_non_breaking_space_in_organisation(fixtures_dir):
    payload = json.loads((fixtures_dir / "boja_search_sample.json").read_text(encoding="utf-8"))
    org = payload["results"][0]["organisation"]
    assert "\xa0" in org
    assert normalize(org) == "consejeria de sostenibilidad, medio ambiente y economia azul"


def test_select_records_filters_by_department_and_title():
    keep = BojaRecord(
        bid="1",
        title="Resolución por la que se otorga autorización ambiental unificada para el parque fotovoltaico Los Olivos",
        organisation="Consejería de Sostenibilidad, Medio Ambiente y Economía Azul",
        published_at=date(2024, 3, 1),
        url="u",
        text="t",
    )
    wrong_org = BojaRecord("2", keep.title, "Consejería de Hacienda", keep.published_at, "u", "t")
    not_renewable = BojaRecord(
        "3", "autorización ambiental unificada para una cantera", keep.organisation, keep.published_at, "u", "t"
    )
    assert select_records([keep, wrong_org, not_renewable]) == [keep]


def test_select_records_keeps_renewable_authorisations_from_fixture(fixtures_dir):
    payload = json.loads((fixtures_dir / "boja_search_sample.json").read_text(encoding="utf-8"))
    records = parse_records(payload)
    selected = select_records(records)
    assert len(selected) == 11
    for record in selected:
        assert "sostenibilidad" in normalize(record.organisation) or "medio ambiente" in normalize(
            record.organisation
        )
