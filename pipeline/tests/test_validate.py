from impacto.extract.schema import Extraction, Municipality
from impacto.extract.validate import validate_and_score

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
