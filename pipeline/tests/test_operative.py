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


def test_aau_negated_grant_and_dismissal_are_refusals():
    negated = "Esta Delegación resuelve: no otorgar la autorización ambiental unificada al proyecto PSFV Sol."
    dismissed = "RESUELVE desestimar la solicitud de autorización ambiental unificada del proyecto PSFV Sol."
    assert find_operative(negated).verdict == "desfavorable"
    assert find_operative(dismissed).verdict == "desfavorable"


def test_aau_verbs_outside_the_resolving_part_are_ignored():
    boilerplate = (
        "Anuncio por el que se somete a información pública la solicitud. "
        "El órgano competente para otorgar la autorización ambiental unificada es la Delegación Territorial."
    )
    assert find_operative(boilerplate) is None


def test_abbreviation_inside_the_object_does_not_truncate_the_conditions_check():
    text = (
        "formula declaración de impacto ambiental desfavorable a la realización de la línea de evacuación "
        "de Ronda I, S.L.U. y establece las condiciones ambientales para las plantas."
    )
    assert find_operative(text).verdict == "favorable_condicionada"


def test_refused_project_infrastructure_is_not_a_line_refusal():
    text = (
        "formula declaración de impacto ambiental desfavorable a la realización de las infraestructuras "
        "del proyecto PSFV Sol y establece las condiciones para su desmantelamiento."
    )
    assert find_operative(text).verdict == "desfavorable"


def test_para_la_realizacion_is_a_project_object():
    text = "formula declaración de impacto ambiental para la realización del proyecto PE Norte, en la que se establecen las condiciones."
    assert find_operative(text).verdict == "favorable_condicionada"


# BOE-A-2025-24233 (OPDE Miramundo), abridged from the stored text: the legal
# grounds quote both halves of article 47 before the operative sentence.
MIRAMUNDO = (
    "El artículo 47 dispone que el órgano ambiental determinará, mediante la emisión del informe de impacto "
    "ambiental, si el proyecto debe someterse a una evaluación de impacto ambiental ordinaria, por tener efectos "
    "significativos sobre el medio ambiente, o si por el contrario no es necesario dicho procedimiento.\n"
    "Esta Dirección General resuelve:\nDe acuerdo con los antecedentes de hecho y fundamentos de derecho alegados "
    "y como resultado de la evaluación de impacto ambiental practicada, que no es necesario el sometimiento al "
    "procedimiento de evaluación ambiental ordinaria del proyecto «Módulo de almacenamiento OPDE Miramundo», ya que "
    "no se prevén efectos adversos significativos sobre el medio ambiente, siempre que se cumplan las medidas y "
    "prescripciones establecidas en el documento ambiental y en la presente resolución."
)


def test_simplified_evaluation_without_ordinary_procedure_is_favourable_with_conditions():
    # The grounds' "debe someterse ... ordinaria" sits before "resuelve" and must not count.
    hit = find_operative(MIRAMUNDO)
    assert hit is not None
    assert hit.doc_type == "informe_impacto"
    assert hit.verdict == "favorable_condicionada"
    assert "no es necesario el sometimiento" in hit.sentence


def test_simplified_evaluation_requiring_ordinary_procedure_has_no_verdict():
    # The other half of the form routes the procedure; it says nothing about effects.
    routed = MIRAMUNDO.replace(
        "que no es necesario el sometimiento al procedimiento de evaluación ambiental ordinaria",
        "que el proyecto debe someterse a una evaluación ambiental ordinaria",
    )
    hit = find_operative(routed)
    assert (hit.doc_type, hit.verdict) == ("informe_impacto", "no_aplica")
    needed = ("Esta Dirección General resuelve que es necesario el sometimiento al procedimiento de evaluación de "
              "impacto ambiental ordinaria del proyecto PSFV Sol.")
    assert (find_operative(needed).doc_type, find_operative(needed).verdict) == ("informe_impacto", "no_aplica")
