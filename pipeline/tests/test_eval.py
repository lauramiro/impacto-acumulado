import json
from datetime import date

from eval.run_eval import run_eval, score
from impacto.db.documents import RawDocument, upsert_raw_document
from impacto.providers.stub import StubProvider


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
