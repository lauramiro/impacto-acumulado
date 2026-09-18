import json
from datetime import date

from impacto.fetch.boe import (
    SummaryItem,
    mentions_andalusia,
    parse_document_xml,
    select_items,
    summary_url,
    walk_items,
)
from impacto.text import normalize


def test_summary_url():
    assert summary_url(date(2023, 9, 18)) == "https://www.boe.es/datosabiertos/api/boe/sumario/20230918"


def test_walk_items_finds_ronda_resolution(fixtures_dir):
    summary = json.loads((fixtures_dir / "boe_sumario_20230918.json").read_text(encoding="utf-8"))
    items = walk_items(summary)
    ronda = [i for i in items if i.identifier == "BOE-A-2023-19635"]
    assert len(ronda) == 1
    assert ronda[0].section == "III"
    assert "transicion ecologica" in normalize(ronda[0].department)
    assert ronda[0].xml_url.endswith("id=BOE-A-2023-19635")


def test_select_items_keeps_only_renewable_environmental_resolutions():
    keep = SummaryItem(
        identifier="A",
        title="Resolución por la que se formula declaración de impacto ambiental del proyecto Parque fotovoltaico X",
        section="III",
        department="Ministerio para la Transición Ecológica y el Reto Demográfico",
        xml_url="u",
    )
    wrong_section = SummaryItem("B", keep.title, "V", keep.department, "u")
    wrong_department = SummaryItem("C", keep.title, "III", "Ministerio de Hacienda", "u")
    not_renewable = SummaryItem(
        "D", "Resolución declaración de impacto ambiental del proyecto Autovía A-7", "III", keep.department, "u"
    )
    assert select_items([keep, wrong_section, wrong_department, not_renewable]) == [keep]


def test_parse_document_xml(fixtures_dir):
    raw = (fixtures_dir / "boe_doc_BOE-A-2023-19635.xml").read_bytes()
    doc = parse_document_xml(raw)
    assert doc.identifier == "BOE-A-2023-19635"
    assert doc.published_at == date(2023, 9, 18)
    assert "Ronda" in doc.title
    assert "CEPSA" in doc.text
    assert len(doc.text) > 50_000


def test_parse_document_xml_all_fixtures(fixtures_dir):
    expected = {
        "boe_doc_BOE-A-2023-19635.xml": "BOE-A-2023-19635",
        "boe_doc_BOE-A-2023-2907.xml": "BOE-A-2023-2907",
        "boe_doc_BOE-A-2023-2580.xml": "BOE-A-2023-2580",
    }
    for filename, identifier in expected.items():
        raw = (fixtures_dir / filename).read_bytes()
        doc = parse_document_xml(raw)
        assert doc.identifier == identifier
        assert doc.title
        assert len(doc.text) > 20_000


def test_mentions_andalusia():
    assert mentions_andalusia("en los términos municipales de Ronda (Málaga)")
    assert not mentions_andalusia("en la provincia de Zaragoza")
