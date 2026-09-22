import json
from datetime import date
from pathlib import Path
from typing import get_args

import pytest

from evaluation.run_eval import EXACT, LABELS_DIR, NUMERIC, run_eval, score
from impacto.db.documents import RawDocument, upsert_raw_document
from impacto.extract.schema import DocType, Technology, Verdict
from impacto.providers.stub import StubProvider

SCORABLE = EXACT | NUMERIC | {"municipalities", "developer", "project_name", "expediente"}
LITERALS = {"doc_type": set(get_args(DocType)), "verdict": set(get_args(Verdict)), "technology": set(get_args(Technology))}


def test_score_compares_fields_leniently():
    expected = {"verdict": "favorable", "developer": "CEPSA Gas y Electricidad, SAU", "mw_nominal": 93,
                "municipalities": [{"name": "Ronda"}, {"name": "Cortes de la Frontera"}]}
    actual = {"verdict": "favorable", "developer": "Cepsa Gas y Electricidad SAU", "mw_nominal": 93.5,
              "municipalities": [{"name": "Cortes de la Frontera", "province": "Málaga"}, {"name": "RONDA"}], "extra": 1}
    assert score(expected, actual) == {"verdict": True, "developer": True, "mw_nominal": True, "municipalities": True}


def test_score_flags_mismatches():
    assert score({"verdict": "favorable", "mw_nominal": 93}, {"verdict": "desfavorable", "mw_nominal": 80}) == {"verdict": False, "mw_nominal": False}


def _label(path, source_id, expected):
    path.write_text(json.dumps({"source": "boe", "source_id": source_id, "expected": expected}), encoding="utf-8")


def test_run_eval_skips_failed_extractions_with_warning(db, tmp_path, caplog):
    # A document whose extraction raises (a rate-limited provider, a malformed
    # response) must be skipped with a logged warning, not abort the run, so a
    # partial run still records what completed.
    upsert_raw_document(db, RawDocument("boe", "OK", date(2023, 1, 1), "t", "u", "III", "o", "Promotor X"))
    upsert_raw_document(db, RawDocument("boe", "BAD", date(2023, 1, 2), "t", "u", "III", "o", "Promotor Y"))
    labels = tmp_path / "labels"
    labels.mkdir()
    _label(labels / "a-BAD.json", "BAD", {"verdict": "favorable"})
    _label(labels / "b-OK.json", "OK", {"verdict": "favorable", "mw_nominal": 50})
    _label(labels / "c-MISSING.json", "MISSING", {"verdict": "favorable"})
    # First call (BAD) raises inside the provider; second (OK) answers.
    provider = StubProvider([{"doc_type": "dia", "verdict": "favorable", "mw_nominal": 51}])

    class Flaky:
        name = "flaky"

        def complete_json(self, system, user):
            if not provider.calls:
                provider.calls.append((system, user))
                raise RuntimeError("HTTP 429 rate_limit_exceeded")
            return provider.complete_json(system, user)

    accuracy = run_eval(db, Flaky(), labels, last_run=tmp_path / "last_run.json")
    assert accuracy == {"verdict": 1.0, "mw_nominal": 1.0}
    assert "BAD" in caplog.text and "rate_limit_exceeded" in caplog.text
    written = json.loads((tmp_path / "last_run.json").read_text(encoding="utf-8"))
    assert written["accuracy"] == accuracy
    assert written["n_labels"] == 3
    assert written["n_scored"] == 1
    assert written["skipped"] == ["a-BAD.json", "c-MISSING.json"]


@pytest.mark.parametrize("label_path", sorted(LABELS_DIR.glob("*.json")), ids=lambda p: p.name)
def test_label_is_well_formed(label_path: Path):
    # A typo in a hand-written label would silently score as a miss; catch it here.
    label = json.loads(label_path.read_text(encoding="utf-8"))
    assert label["source"] in ("boe", "boja")
    assert label["source_id"]
    assert label["note"], "every label explains its decisions in a note"
    expected = label["expected"]
    assert set(expected) <= SCORABLE, set(expected) - SCORABLE
    for field, allowed in LITERALS.items():
        if field in expected:
            assert expected[field] in allowed, (field, expected[field])
    assert "verdict" in expected and "doc_type" in expected
    for m in expected.get("municipalities", []):
        assert m["name"], "municipality without name"
