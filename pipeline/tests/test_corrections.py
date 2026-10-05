from datetime import date

from impacto.resolve.blocking import Notice, corrected_reference, correction_targets, is_correction
from impacto.resolve.run import resolve
from impacto.resolve.status import derive_status
from tests.test_resolve_pure import rec

# Titles as BOE and BOJA published them (documents 18, 47, 48, 38, 49, 122,
# 193 to 196 and 365 of the production export).
CADIZ = "de la Delegación Territorial de Sostenibilidad, Medio Ambiente y Economía Azul en Cádiz"
DGCEA = "de la Dirección General de Calidad y Evaluación Ambiental"
MAJAL = Notice(18, "boe", "BOE-A-2022-24404", date(2022, 12, 30),
               f'Resolución de 22 de diciembre de 2022, {DGCEA}, por la que se formula la declaración de impacto ambiental '
               'del proyecto "Planta fotovoltaica híbrida Majal Alto de 43,5 MWn en la provincia de Huelva".')
LOS_BARRIOS = Notice(425, "boja", "disposition.2023.7.74", date(2023, 1, 12),
                     f"Resolución de 22 de diciembre de 2022, {CADIZ}, por la que se da publicidad al informe vinculante "
                     "con el que se otorga autorización ambiental unificada para el proyecto que se cita, en el término "
                     "municipal de Los Barrios (Cádiz). (PP. 4139/2022).")
MAJAL_FIX = Notice(38, "boe", "BOE-A-2023-9091", date(2023, 4, 12),
                   f"Resolución de 3 de abril de 2023, {DGCEA}, por la que se corrigen errores en la de 22 de diciembre de "
                   '2022, por la que se formula declaración de impacto ambiental del proyecto "Planta fotovoltaica híbrida '
                   'Majal Alto de 43,5 MWn en la provincia de Huelva".')
RONDA = Notice(47, "boe", "BOE-A-2023-19635", date(2023, 9, 18),
               f'Resolución de 28 de agosto de 2023, {DGCEA}, por la que se formula declaración de impacto ambiental del '
               'proyecto "Plantas fotovoltaicas Ronda I, Ronda II y Ronda III, de 103 MWp y 93 MWn cada una y su '
               'infraestructura de evacuación, en las provincias de Cádiz y Málaga".')
HINOJOSA = Notice(48, "boe", "BOE-A-2023-19636", date(2023, 9, 18),
                  f'Resolución de 28 de agosto de 2023, {DGCEA}, por la que se formula declaración de impacto ambiental del '
                  'proyecto "Parque eólico Hinojosa Ampliación, de 25,12 MW, y de la infraestructura de evacuación, en los '
                  'términos municipales de Alcalá del Valle, Torre Alháquime y Setenil de Las Bodegas, en la provincia de Cádiz".')
RONDA_FIX = Notice(49, "boe", "BOE-A-2023-21519", date(2023, 10, 18),
                   f"Resolución de 11 de octubre de 2023, {DGCEA}, por la que se corrigen errores en la de 28 de agosto de "
                   '2023, por la que se formula declaración de impacto ambiental del proyecto "Plantas fotovoltaicas Ronda '
                   'I, Ronda II y Ronda III, de 103 MWp y 93 MWn cada una y su infraestructura de evacuación, en las '
                   'provincias de Cádiz y Málaga".')


def _tarifa(doc_id, n, wording, place):
    return Notice(doc_id, "boja", f"disposition.2023.140.{n}", date(2023, 7, 24),
                  f"Resolución de 19 de julio de 2023, {CADIZ}, por la que se da publicidad {wording} se deniega "
                  f"autorización ambiental unificada en el término municipal de {place}.")


JIMENA = _tarifa(193, 65, "al informe vinculante con la que", "Jimena de la Frontera-Gaucín (Cádiz)")
JARICO = _tarifa(194, 66, "al informe vinculante con el que", "Tarifa (Cádiz)")
TARIFA_OTHER = _tarifa(195, 68, "a la resolución con la que", "Tarifa. (Cádiz)")
EL_PUERTO = _tarifa(196, 69, "al informe vinculante con el que", "El Puerto de Santa María (Cádiz)")
JARICO_FIX = Notice(122, "boja", "disposition.2023.144.67", date(2023, 7, 28),
                    f"Corrección de errores de la Resolución de 19 de julio de 2023, {CADIZ}, por la que se da publicidad al "
                    "informe vinculante con el que se deniega autorización ambiental unificada en el término municipal de "
                    "Tarifa (Cádiz) (BOJA núm. 140, de 24 de julio de 2023).")
# The same notice in another issue: the issue the correction names rules it out.
JARICO_ELSEWHERE = Notice(900, "boja", "disposition.2023.141.1", date(2023, 7, 25), JARICO.title)


def test_is_correction_reads_both_gazettes_forms():
    assert is_correction(JARICO_FIX.title)
    assert is_correction(MAJAL_FIX.title)
    assert is_correction("Corrección de erratas de la Resolución de 6 de mayo de 2022, de la Dirección General ...")
    assert not is_correction(JARICO.title)
    assert not is_correction(MAJAL.title)


def test_corrected_reference_restates_the_corrected_title():
    restated, issue = corrected_reference(JARICO_FIX.title)
    assert restated.startswith("resolucion de 19 de julio de 2023, de la delegacion territorial")
    assert "(boja" not in restated
    assert issue == ("2023", "140")
    restated, issue = corrected_reference(MAJAL_FIX.title)
    assert restated.startswith("resolucion de 22 de diciembre de 2022, de la direccion general de calidad y evaluacion ambiental, por la que se formula")
    assert issue is None
    assert corrected_reference(MAJAL.title) is None


def test_corrected_reference_reads_a_dotted_boja_date():
    title = (f"Corrección de errores de la Resolución de 22 de noviembre de 2022, {CADIZ}, por la que se da publicidad a "
             "la resolución con la que se otorga autorización ambiental unificada (BOJA núm. 230, de 30.11.2022).")
    assert corrected_reference(title)[1] == ("2022", "230")


def test_a_correction_finds_the_document_it_corrects():
    notices = [MAJAL, LOS_BARRIOS, MAJAL_FIX, RONDA, HINOJOSA, RONDA_FIX,
               JIMENA, JARICO, TARIFA_OTHER, EL_PUERTO, JARICO_ELSEWHERE, JARICO_FIX]
    assert correction_targets(notices) == {38: 18, 49: 47, 122: 194}


def test_a_correction_takes_no_target_it_cannot_tell_apart():
    twin = Notice(197, "boja", "disposition.2023.140.70", date(2023, 7, 24), JARICO.title)
    assert correction_targets([JARICO, twin, JARICO_FIX]) == {}


def test_a_correction_never_takes_a_later_document_or_another_gazette():
    later = Notice(18, "boe", MAJAL.source_id, date(2023, 5, 1), MAJAL.title)
    assert correction_targets([later, MAJAL_FIX]) == {}
    other_gazette = Notice(18, "boja", "disposition.2022.250.1", MAJAL.published_at, MAJAL.title)
    assert correction_targets([other_gazette, MAJAL_FIX]) == {}


def test_a_correction_without_a_dated_reference_falls_back_to_a_boe_id_in_its_text():
    fix = Notice(50, "boe", "BOE-B-2023-1", date(2023, 10, 1),
                 "Corrección de errores del Anuncio de la Subdelegación del Gobierno en Sevilla ...",
                 "Advertido error en el anuncio BOE-A-2023-19635, publicado ...")
    assert correction_targets([RONDA, HINOJOSA, fix]) == {50: 47}
    assert correction_targets([RONDA, HINOJOSA, Notice(50, "boe", "BOE-B-2023-1", date(2023, 10, 1), fix.title)]) == {}


def test_resolve_joins_a_correction_with_nothing_in_common_to_its_target():
    original = rec(18, "Majal Alto", munis=("huelva",), mw=43.5, day=date(2022, 12, 30))
    correction = rec(38, None, munis=(), mw=None, day=date(2023, 4, 12))
    other = rec(53, "Elvira Solar", munis=("sevilla",), mw=168, day=date(2024, 7, 9))
    groups = resolve([original, correction, other], overrides={}, corrections={38: 18})
    assert sorted(sorted(r.document_id for r in g) for g in groups) == [[18, 38], [53]]
    assert len(resolve([original, correction, other], overrides={})) == 3


def test_resolve_lets_override_keys_overrule_a_correction():
    original = rec(18, "Majal Alto", day=date(2022, 12, 30))
    correction = rec(38, None, munis=(), mw=None, day=date(2023, 4, 12))
    assert len(resolve([original, correction], overrides={38: "new"}, corrections={38: 18})) == 2
    assert len(resolve([original, correction], overrides={18: "a", 38: "b"}, corrections={38: 18})) == 2


def test_a_corrections_verdict_supersedes_the_original():
    # Jarico 1: the notice read "se otorga" (the gazette's error); the
    # correction four days later reads "se deniega".
    granted = rec(194, "Jarico 1", doc_type="aau", verdict="favorable_condicionada", day=date(2023, 7, 24))
    refused = rec(122, "Jarico 1", doc_type="aau", verdict="desfavorable", day=date(2023, 7, 28))
    assert derive_status([granted, refused], corrections={122: 194}) == ("desfavorable", 122)


def test_a_correction_takes_the_place_of_its_target_in_the_timeline():
    # A later decision still wins over a corrected earlier one.
    dia = rec(1, "R", doc_type="dia", verdict="favorable_condicionada", day=date(2022, 1, 1))
    lapsed = rec(2, "R", doc_type="caducidad", verdict="no_aplica", day=date(2023, 1, 1))
    fix = rec(3, "R", doc_type="dia", verdict="desfavorable", day=date(2023, 6, 1))
    assert derive_status([dia, lapsed, fix], corrections={3: 1}) == ("caducado", 2)


def test_a_correction_with_no_decision_leaves_the_original_verdict():
    dia = rec(47, "Ronda", doc_type="dia", verdict="favorable_condicionada", day=date(2023, 9, 18))
    fix = rec(49, "Ronda", doc_type="modificacion", verdict="no_aplica", day=date(2023, 10, 18))
    assert derive_status([dia, fix], corrections={49: 47}) == ("favorable_condicionada", 47)
    # Nor does a correction of a consultation reopen a decided project's consultation.
    notice = rec(10, "Ronda", doc_type="informacion_publica", verdict="no_aplica", day=date(2022, 1, 1))
    notice_fix = rec(11, "Ronda", doc_type="informacion_publica", verdict="no_aplica", day=date(2022, 2, 1))
    assert derive_status([notice, notice_fix], corrections={11: 10}) == ("en_consulta", 10)
