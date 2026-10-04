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


# Publication notices (Ley 7/2007, art. 31.7): the BOJA publishes that an AAU was
# granted and points to the department's website for the full text. Wording
# from disposition.2022.247.66, .2026.98.72, .2025.205.52 and .2023.99.77.
SEVILLA_NOTICE = (
    "De conformidad con lo establecido en el Art.31.7, de la Ley 7/2007, esta Delegación Territorial HA RESUELTO Primero. "
    "Dar publicidad en BOJA al Informe Vinculante sobre la Autorización Ambiental Unificada otorgada por la Delegación "
    "Territorial en Sevilla que se relaciona en el anexo. Segundo. El contenido íntegro se encuentra disponible en la página web."
)
MALAGA_SIMPLIFIED = (
    "De conformidad con lo establecido en el artículo 32.6 de la Ley 7/2007, se procede a dar publicidad a la Resolución de la "
    "Delegación Territorial en Málaga, por la que se otorga autorización ambiental unificada simplificada promovida por LDV Sierra "
    "de Arcas, S.L., para el proyecto de planta solar fotovoltaica (AAUS/MA/36/24)."
)
MALAGA_MODIFICATION = (
    "De conformidad con lo establecido en el artículo 31.7 de la Ley 7/2007, se procede a dar publicidad al Informe Vinculante de "
    "la Delegación Territorial en Málaga por el que se otorga modificación de autorización ambiental unificada del Proyecto de "
    "Planta Solar Fotovoltaica «PSF Ronda 2» (Expediente AAU/MA/11/21/M1)."
)
MALAGA_SILENT = (
    "De conformidad con lo establecido en el artículo 31.7 de la Ley 7/2007, se procede a dar publicidad al informe vinculante de "
    "la Delegación Territorial en Málaga, relativo a la solicitud de autorización ambiental unificada promovida por Mitralex "
    "Energía, S.L. El contenido íntegro de la resolución se encuentra disponible en la página web."
)


def test_publication_notice_of_a_granted_aau():
    for text in (SEVILLA_NOTICE, MALAGA_SIMPLIFIED):
        hit = find_operative(text)
        assert (hit.doc_type, hit.verdict) == ("aau", "favorable_condicionada"), text[:80]


def test_publication_notice_of_a_granted_modification():
    hit = find_operative(MALAGA_MODIFICATION)
    assert (hit.doc_type, hit.verdict) == ("modificacion", "favorable_condicionada")


def test_publication_notice_that_does_not_state_the_verdict_has_none():
    assert find_operative(MALAGA_SILENT) is None


def test_a_consultation_on_modifying_a_granted_aau_is_not_a_grant():
    consultation = (
        "Se abre un periodo de información pública sobre la modificación de la autorización ambiental unificada otorgada por "
        "resolución de 12 de mayo de 2021 a la planta solar, durante el plazo de 30 días hábiles."
    )
    assert find_operative(consultation) is None


def test_a_correction_counts_what_the_text_must_say_not_what_it_said():
    # disposition.2023.144.67: the original notice said "se otorga" by mistake.
    correction = (
        "Detectado error en el anuncio del BOJA número 140, donde aparece la Resolución de 20 de enero de 2023, de la Delegación "
        "Territorial en Cádiz, por la que se da publicidad del informe vinculante con el que se deniega autorización ambiental "
        "unificada a Jarico Energía 1, S.L., se procede a la siguiente rectificación: En el anexo, donde dice: «Resolución por la que "
        "se otorga autorización ambiental unificada a Jarico Energía 1, S.L.» Debe decir: «Resolución por la que se deniega la "
        "autorización ambiental unificada a Jarico Energía 1, S.L.»"
    )
    hit = find_operative(correction)
    assert (hit.doc_type, hit.verdict) == ("aau", "desfavorable")


def test_publication_notice_of_a_refused_aau():
    notice = (
        "Se procede a dar publicidad al informe vinculante de la Delegación Territorial en Cádiz con el que se deniega "
        "autorización ambiental unificada a la planta solar."
    )
    hit = find_operative(notice)
    assert (hit.doc_type, hit.verdict) == ("aau", "desfavorable")


def test_publication_of_a_resolution_that_modifies_an_aau_is_a_granted_modification():
    # disposition.2024.108.42, the held-out miss of 2026-10-04.
    notice = (
        "Se procede a dar publicidad a la resolución de la Delegación Territorial en Málaga, por la que se modifica la "
        "autorización ambiental unificada de la planta solar fotovoltaica «Archo II» (Expediente AAU/MA/54/20/m1)."
    )
    hit = find_operative(notice)
    assert (hit.doc_type, hit.verdict) == ("modificacion", "favorable_condicionada")


def test_publication_of_an_archived_aau_closes_the_procedure():
    # disposition.2024.196.57 (SET Danae): the AAU procedure was archived, not decided.
    notice = (
        "Esta Delegación Territorial HA RESUELTO Primero. Dar publicidad en el BOJA a la resolución con la que se archiva la "
        "autorización ambiental unificada a Danae Solar, S.L., para el proyecto «SET Danae 220/30 kV» (Expediente: AAU/CA/052/23)."
    )
    hit = find_operative(notice)
    assert (hit.doc_type, hit.verdict) == ("caducidad", "no_aplica")
