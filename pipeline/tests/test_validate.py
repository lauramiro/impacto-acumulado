from impacto.extract.schema import Extraction, Municipality
from impacto.extract.validate import check_generation, validate_and_score, with_generation

NAMES = {"ronda": "Ronda", "cortes de la frontera": "Cortes de la Frontera", "malaga": "Málaga"}


def test_canonicalises_fuzzy_municipality_names():
    e = Extraction(doc_type="dia", verdict="favorable", confidence=0.9,
                   municipalities=[Municipality(name="RONDA"), Municipality(name="Cortes de la Fontera")])
    out = validate_and_score(e, NAMES)
    assert [m.name for m in out.municipalities] == ["Ronda", "Cortes de la Frontera"]
    assert out.confidence == 0.9


def test_unknown_municipality_lowers_confidence_and_is_kept():
    e = Extraction(doc_type="dia", verdict="favorable", confidence=0.9,
                   municipalities=[Municipality(name="Atlantis")])
    out = validate_and_score(e, NAMES)
    assert out.municipalities[0].name == "Atlantis"
    assert abs(out.confidence - 0.8) < 1e-6


def test_out_of_range_numbers_are_dropped():
    e = Extraction(doc_type="dia", verdict="favorable", confidence=0.5, mw_nominal=50000, hectares=-3)
    out = validate_and_score(e, NAMES)
    assert out.mw_nominal is None
    assert out.hectares is None
    assert abs(out.confidence - 0.3) < 1e-6


def test_evacuation_only_municipalities_move_out_of_the_generation_site():
    e = Extraction(doc_type="dia", verdict="favorable", confidence=0.9, municipalities=[
        Municipality(name="Ronda", role="generacion"),
        Municipality(name="Cortes de la Frontera", role="evacuacion"),
        Municipality(name="MALAGA"),
    ])
    out = validate_and_score(e, NAMES)
    # An untagged municipality stays where it was: the split can only remove
    # false positives, never introduce false negatives.
    assert [(m.name, m.role) for m in out.municipalities] == [("Ronda", "generacion"), ("Málaga", None)]
    assert [(m.name, m.role) for m in out.evacuation_municipalities] == [("Cortes de la Frontera", "evacuacion")]
    assert out.confidence == 0.9


def test_turbines_on_a_photovoltaic_project_are_held_back():
    # The hybridisation notice describes the existing wind park; its turbines are not the plant's.
    e = Extraction(doc_type="dia", verdict="favorable", confidence=0.9, technology="solar_fv", turbines=38,
                   project_name="Parque Fotovoltaico Retuerta de 38 MW de potencia instalada para su hibridación "
                                "con el parque eólico existente Retuerta de 38 MW")
    out = validate_and_score(e, NAMES)
    assert out.turbines is None
    assert out.technology == "solar_fv"
    assert abs(out.confidence - 0.8) < 1e-6


def test_check_generation_reads_the_project_not_the_park_it_joins():
    assert check_generation("Parque fotovoltaico Valdefuentes", "solar_fv", 28) == ("solar_fv", None, 1)
    assert check_generation('Planta Fotovoltaica Híbrida "Tallisca"', "hibrida", 20) == ("hibrida", None, 1)
    assert check_generation('Módulo fotovoltaico "PV Centenar" (hibridado con parque eólico "PE Centenar")',
                            "hibrida", 40) == ("hibrida", None, 1)
    assert check_generation("Montegordo (hibridación: módulo fotovoltaico + parque eólico existente)",
                            "hibrida", 48) == ("hibrida", None, 1)
    # Wind of its own: the turbines stay.
    assert check_generation("Hermod (parque eólico y planta solar fotovoltaica híbrida)", "hibrida", 4) == (
        "hibrida", 4, 0)
    assert check_generation("Proyecto de Hibridación de la Planta Fotovoltaica 'Las Quinientas', mediante la "
                            "incorporación de un grupo de generación, Parque Eólico Las Quinientas",
                            "hibrida", 11) == ("hibrida", 11, 0)
    # Nothing in the name says what it is.
    assert check_generation("Instalación híbrida Cartuja", "hibrida", 5) == ("hibrida", 5, 0)
    assert check_generation(None, "solar_fv", 5) == ("solar_fv", 5, 0)


def test_an_eolico_name_checks_the_technology():
    filabres = "Parque eólico Filabres, parque eólico Peregiles y parque solar fotovoltaico La Rambla"
    assert check_generation(filabres, "solar_fv", 52) == ("eolica", 52, 1)
    assert check_generation("Parque Eólico Parapanda", "otra", None) == ("eolica", None, 1)
    assert check_generation("Parque Eólico Parapanda", None, None) == ("eolica", None, 1)
    assert check_generation("Hibridación del parque eólico El Saucito con una planta fotovoltaica", "solar_fv", None) == (
        "hibrida", None, 1)
    # A line from a wind park is a line; a hybrid or a wind park stays as read.
    assert check_generation("Línea aérea 30 kV desde Parque Eólico «San Cristóbal»", "otra", None) == ("otra", None, 0)
    assert check_generation("Parque Eólico Las Cabezas (hibridación con planta solar fotovoltaica)", "hibrida", None) == (
        "hibrida", None, 0)
    assert check_generation("Parque eólico Hinojosa", "eolica", 12) == ("eolica", 12, 0)


def test_with_generation_applies_the_check_to_a_stored_payload():
    payload = {"project_name": "Parque fotovoltaico Valdefuentes", "technology": "solar_fv", "turbines": 28}
    assert with_generation(payload) == {**payload, "turbines": None}
    clean = {"project_name": "Parque eólico Hinojosa", "technology": "eolica", "turbines": 12}
    assert with_generation(clean) is clean
