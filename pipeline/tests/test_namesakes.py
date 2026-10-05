"""One plant under one developer, named in notices that scoring cannot pair (audit 2026-10-06, finding 1)."""

from datetime import date

from impacto.resolve.blocking import developer_keys, plant_key, plant_keys, same_name
from impacto.resolve.model import Record
from impacto.resolve.run import namesake_pairs, resolve

IBERDROLA = "Iberdrola Renovables Andalucía, S.A.U."
REY_LIST = (
    "Plantas Solares Fotovoltaicas Rey I Solar PV de 120 MWp, Rey II Solar PV de 120 MWp, "
    "Rey III Solar PV de 120 MWp, Rey IV Solar PV de 120 MWp y su infraestructura de evacuación"
)


def rec(doc_id, name, developer, munis=(), mw=None, exp=None, doc_type="dia", technology="solar_fv", day=None):
    return Record(
        document_id=doc_id,
        published_at=day or date(2023, 1, 1),
        doc_type=doc_type,
        verdict="favorable_condicionada" if doc_type in ("dia", "aau") else "no_aplica",
        name=name,
        expediente=exp,
        developer=developer,
        municipalities=frozenset(munis),
        mw_nominal=mw,
        mw_peak=None,
        hectares=None,
        turbines=None,
        technology=technology,
    )


def grouped(records, overrides=None):
    return sorted(sorted(r.document_id for r in g) for g in resolve(records, overrides or {}))


def test_plant_key_names_the_plant_and_nothing_else():
    assert plant_key("Planta solar fotovoltaica hibridación «El Saucito»") == "saucito"
    assert plant_key("planta solar fotovoltaica Hibridación Saucito de 30 MWn/ 36,01 MWp") == "saucito"
    assert plant_key("Planta solar fotovoltaica de 50 MW") == ""
    assert plant_key(None) == ""


def test_plant_keys_reads_each_plant_of_a_list():
    assert {"rey i pv", "rey ii pv", "rey iii pv", "rey iv pv"} <= plant_keys(REY_LIST)
    assert {"filabres", "peregiles", "rambla"} <= plant_keys(
        "Parque eólico Filabres, 153 MW, parque eólico Peregiles, 93 MW, y del parque solar fotovoltaico La Rambla"
    )
    # No comma, no list: one plant whose name holds "y".
    assert plant_keys("Planta solar Campos y Olivares") == {"campos olivares"}


def test_same_name_is_one_plant_or_a_plant_of_a_list_never_a_sister():
    assert same_name("Rey I Solar PV", REY_LIST)
    assert same_name(REY_LIST, 'PSF "Rey I Solar PV", "Rey II Solar PV", "Rey III Solar PV", "Rey IV Solar PV"')
    assert not same_name("Rey I Solar PV", "Rey II Solar PV")
    assert not same_name("Ronda I", "Ronda")
    assert not same_name("Planta solar fotovoltaica", "Planta solar fotovoltaica")


def test_developer_keys_ignore_legal_form_and_case():
    assert developer_keys("VILLABLANCA SOLAR 1, S.L.") == developer_keys("Villablanca Solar 1, SL") == {"villablanca-solar-1"}
    assert developer_keys("A, S.L.; B, SA") == {"a", "b"}
    assert developer_keys(None) == set()


def test_a_consultation_without_municipality_joins_its_resolved_namesake():
    # 699 (Tharsis, read as no municipality) and 75 (Alosno), two procedure families.
    granted = rec(75, "Planta solar fotovoltaica hibridación «El Saucito»", IBERDROLA, ("alosno",), 30.25,
                  "AAU/HU/053/21", doc_type="aau")
    consulted = rec(699, "planta solar fotovoltaica Hibridación Saucito de 30 MWn/ 36,01 MWp",
                    "IBERDROLA RENOVABLES ANDALUCÍA, S.A.U.", (), 30.0, "peol-fv 029",
                    doc_type="informacion_publica", technology="hibrida")
    assert grouped([granted, consulted]) == [[75, 699]]


def test_a_plant_named_inside_a_multi_plant_title_joins_it():
    declaration = rec(35, REY_LIST, "Villablanca Solar 1, SL", ("carmona",), 480.0)
    consulted = rec(675, "Rey I Solar PV", "VILLABLANCA SOLAR 1, S.L.", ("carmona",), 356.4, "pfot-137 ac",
                    doc_type="informacion_publica")
    assert grouped([declaration, consulted]) == [[35, 675]]


def test_a_later_notice_without_municipality_joins_its_namesake():
    dia = rec(10, "Parque solar fotovoltaico Lirios Solar PV, de 100 MWp", "Solar Castuera SL", ("chucena",))
    change = rec(61, "Parque solar fotovoltaico Lirios Solar PV, de 100 MWp, y de su infraestructura de evacuación",
                 "Solar Castuera, SL", (), doc_type="modificacion")
    assert grouped([dia, change]) == [[10, 61]]


def test_namesakes_stay_apart_when_something_tells_them_apart():
    a = rec(1, "Planta solar Saucito", IBERDROLA, ("alosno",))
    # Another developer.
    assert grouped([a, rec(2, "Planta solar Saucito", "Otra Energía, S.L.")]) == [[1], [2]]
    # Other municipalities.
    assert grouped([a, rec(2, "Planta solar Saucito", IBERDROLA, ("ronda",))]) == [[1], [2]]
    # A plant and its own evacuation line.
    line = rec(2, "Línea de evacuación de la planta solar Saucito", IBERDROLA, (), technology="linea_evacuacion")
    assert grouped([a, line]) == [[1], [2]]
    # The wind park a solar plant is hybridised with.
    wind = rec(2, "Parque eólico Saucito", IBERDROLA, (), technology="eolica")
    assert grouped([a, wind]) == [[1], [2]]
    # Two procedures of one family.
    b = rec(3, "Planta solar Saucito", IBERDROLA, (), exp="aau/hu/054/21")
    c = rec(4, "Planta solar Saucito", IBERDROLA, ("alosno",), exp="aau/hu/053/21")
    assert grouped([b, c]) == [[3], [4]]


def test_a_namesake_of_two_groups_joins_neither():
    # Rey I is named in two lists that are not one project: the match is not
    # unique, so the review queue reads it (review.namesake_groups).
    one = rec(1, REY_LIST, "Villablanca Solar 1, SL", ("carmona",), exp="aau/se/1/21")
    two = rec(2, REY_LIST, "Villablanca Solar 1, SL", ("carmona",), exp="aau/se/2/21")
    loose = rec(3, "Rey I Solar PV", "Villablanca Solar 1, SL", ())
    assert grouped([one, two, loose]) == [[1], [2], [3]]


def test_an_isolated_document_takes_in_no_namesake():
    dia = rec(10, "Lirios Solar PV", "Solar Castuera SL", ("chucena",))
    change = rec(61, "Lirios Solar PV", "Solar Castuera SL", ())
    assert grouped([dia, change], {61: "new"}) == [[10], [61]]


def test_a_keyed_group_takes_in_a_namesake_only_on_the_same_whole_name():
    dia = rec(35, REY_LIST, "Villablanca Solar 1, SL", ("carmona",))
    consulted = rec(675, "Rey I Solar PV", "Villablanca Solar 1, SL", ("carmona",))
    assert grouped([dia, consulted], {35: "rey"}) == [[35], [675]]
    same = rec(681, REY_LIST, "Villablanca Solar 1, SL", ())
    assert grouped([dia, same], {35: "rey"}) == [[35, 681]]


def test_namesake_pairs_are_mutual_and_unique():
    groups = [
        [rec(1, "Saucito", IBERDROLA, ("alosno",))],
        [rec(2, "Saucito", IBERDROLA, ())],
        [rec(3, "Tallisca", IBERDROLA, ())],
    ]
    assert namesake_pairs(groups) == [(0, 1)]
    groups.append([rec(4, "Saucito", IBERDROLA, ("alosno",))])
    assert namesake_pairs(groups) == []


def test_a_namesake_join_is_recorded_as_such_with_its_own_score():
    from impacto.resolve.run import _match_reason

    dia = rec(10, "Parque solar fotovoltaico Lirios Solar PV", "Solar Castuera SL", ("chucena",))
    change = rec(61, "Parque solar fotovoltaico Lirios Solar PV", "Solar Castuera, SL", ())
    score, reason = _match_reason([dia, change], change)
    assert reason == "namesake"
    assert score < 0.6
