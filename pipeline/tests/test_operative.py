from impacto.extract.operative import find_operative
from impacto.fetch.boe import parse_document_xml


def _text(fixtures_dir, source_id: str) -> str:
    return parse_document_xml((fixtures_dir / f"boe_doc_{source_id}.xml").read_bytes()).text


def test_favourable_dia_without_adjective(fixtures_dir):
    hit = find_operative(_text(fixtures_dir, "BOE-A-2023-2907"))
    assert hit is not None
    assert hit.doc_type == "dia"
    assert hit.verdict == "favorable_condicionada"
    assert "formula declaracion de impacto ambiental" in hit.sentence


def test_unfavourable_dia(fixtures_dir):
    hit = find_operative(_text(fixtures_dir, "BOE-A-2023-2580"))
    assert hit is not None
    assert hit.doc_type == "dia"
    assert hit.verdict == "desfavorable"


def test_refused_evacuation_line_with_conditions_is_favourable_for_the_plants(fixtures_dir):
    hit = find_operative(_text(fixtures_dir, "BOE-A-2023-19635"))
    assert hit is not None
    assert hit.doc_type == "dia"
    assert hit.verdict == "favorable_condicionada"


def test_aau_granted_and_denied():
    granted = "Vistos los antecedentes, esta Delegación RESUELVE: Otorgar la autorización ambiental unificada al proyecto PSFV Sol."
    denied = "Esta Delegación resuelve denegar la autorización ambiental unificada solicitada para el proyecto PSFV Pinar del Rey II."
    assert find_operative(granted).verdict == "favorable_condicionada"
    assert find_operative(granted).doc_type == "aau"
    assert find_operative(denied).verdict == "desfavorable"
    assert find_operative(denied).doc_type == "aau"


def test_no_operative_sentence_returns_none():
    assert find_operative("Anuncio por el que se somete a información pública el proyecto X.") is None
