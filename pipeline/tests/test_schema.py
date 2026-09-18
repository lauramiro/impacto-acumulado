import pytest
from pydantic import ValidationError

from impacto.extract.schema import Extraction, Municipality


def test_extraction_defaults():
    e = Extraction(doc_type="dia", verdict="favorable")
    assert e.municipalities == []
    assert e.mw_nominal is None
    assert e.confidence == 0.0


def test_merge_fills_empty_fields_only():
    a = Extraction(doc_type="dia", verdict="favorable", project_name="Ronda I", mw_nominal=None)
    b = Extraction(doc_type="otro", verdict="no_aplica", project_name="Other", mw_nominal=93.0,
                   municipalities=[Municipality(name="Ronda", province="Malaga")])
    merged = a.merge(b)
    assert merged.project_name == "Ronda I"
    assert merged.mw_nominal == 93.0
    assert merged.municipalities[0].name == "Ronda"
    assert merged.doc_type == "dia"


def test_invalid_enum_rejected():
    with pytest.raises(ValidationError):
        Extraction(doc_type="banana", verdict="favorable")
