import json
from datetime import date

from impacto.fetch.boe import (
    SummaryItem,
    concerns_andalusia,
    consulted_andalusian_authority,
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


# The three quotations below are the live wording of the documents named in
# consulted_andalusian_authority's docstring, kept verbatim so a change to the
# phrase test is measured against the real text it was derived from.
PUERTO_REAL_BODY = (
    "Responde el Servicio de Protección Ambiental y el Servicio de Gestión del Medio Natural de la "
    "Delegación Territorial en Cádiz de la Consejería de Sostenibilidad y Medio Ambiente de la Junta "
    "de Andalucía."
)
HUESCA_BODY = (
    "Sugiere seguir la instrucción de la administración de la Junta de Andalucía que fija una "
    "velocidad de viento menor de 3 m/s."
)
TOLEDO_BODY = (
    "De acuerdo con la clasificación propuesta en el programa de seguimiento de especies cinegéticas "
    "de la Junta de Andalucía."
)


def test_consulted_andalusian_authority_needs_a_province_next_to_the_junta():
    assert consulted_andalusian_authority(PUERTO_REAL_BODY)
    # A bare "Junta de Andalucía" is guidance cited by an out-of-region
    # resolution, not the authority consulted for the project.
    assert not consulted_andalusian_authority(HUESCA_BODY)
    assert not consulted_andalusian_authority(TOLEDO_BODY)


def test_concerns_andalusia_falls_back_to_the_body_when_the_title_names_no_province():
    # BOE-A-2025-11509: a modification of conditions, whose title carries the
    # project name only.
    title = (
        "Resolución de 27 de mayo de 2025, de la Dirección General de Calidad y Evaluación Ambiental, "
        "de modificación de condiciones de la de 13 de julio de 2018 ... del proyecto «Instalación "
        "fotovoltaica Puerto Real 110 MW»."
    )
    assert not mentions_andalusia(title)
    assert concerns_andalusia(title, PUERTO_REAL_BODY)


def test_concerns_andalusia_rejects_out_of_region_projects():
    huesca = 'Parques solares fotovoltaicos Manto y Lamos ... en Villanueva de Sigena (Huesca)".'
    assert not concerns_andalusia(huesca, HUESCA_BODY)
    toledo = "Parque solar fotovoltaico FV Aceca ... en la provincia de Toledo."
    assert not concerns_andalusia(toledo, TOLEDO_BODY)


def test_concerns_andalusia_keeps_matching_on_the_title_alone():
    assert concerns_andalusia("Plantas fotovoltaicas Ronda I, Ronda II y Ronda III (Cádiz y Málaga)", "")


def test_consultation_items_are_section_v_renewable_andalusian_notices():
    from impacto.fetch.boe import SummaryItem, assesses_environment, select_consultation_items

    def item(section, title):
        return SummaryItem("BOE-B-1", title, section, "MINISTERIO DE POLÍTICA TERRITORIAL", "u")

    kept = item("V", "Anuncio de la Subdelegación del Gobierno en Cádiz por el que se somete a información pública el parque eólico Chiquera")
    assert select_consultation_items([
        kept,
        item("III", kept.title),
        item("V", "Anuncio ... información pública del parque eólico Cuenca (Castilla-La Mancha)"),
        item("V", "Anuncio de la Subdelegación en Sevilla sobre información pública de una carretera"),
    ]) == [kept]
    assert assesses_environment("... información pública del estudio de impacto ambiental ...", "")
    assert assesses_environment("Anuncio de información pública del parque", "Se somete a información pública el estudio de impacto ambiental.")
    assert not assesses_environment("Anuncio de información pública del parque", "Solicitud de declaración de utilidad pública.")


def test_a_consultation_after_the_impact_declaration_is_not_an_environmental_one():
    from impacto.fetch.boe import assesses_environment

    title = "Anuncio por el que se somete a información pública la solicitud de declaración de utilidad pública del parque"
    assert not assesses_environment(title, "Esta instalación ha obtenido Declaración de Impacto Ambiental Favorable, publicada en el BOE.")
    assert not assesses_environment(title, "El módulo de almacenamiento queda exento del trámite de evaluación de impacto ambiental simplificada.")
    assert assesses_environment(title, "La instalación se encuentra sometida al procedimiento de evaluación de impacto ambiental ordinaria.")
    assert assesses_environment(title, "Se somete a información pública el Proyecto y el Estudio de Impacto Ambiental de la planta.")
    assert assesses_environment(title, "Solicitud de autorización y evaluación de impacto ambiental simplificada para la instalación de almacenamiento.")
