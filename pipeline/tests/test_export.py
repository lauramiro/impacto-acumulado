import csv
import json

from impacto.aggregate.export import export_all
from impacto.aggregate.run import run_aggregate
from impacto.resolve.run import run_resolve
from tests.test_resolve_run import seed


def test_export_writes_all_files(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    paths = export_all(db, tmp_path)
    names = sorted(p.name for p in paths)
    assert names == [
        "documents.csv",
        "meta.json",
        "municipalities.geojson",
        "municipality_stats.csv",
        "projects.csv",
        "protected_areas.geojson",
        "province_monthly.csv",
    ]
    with open(tmp_path / "projects.csv", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 2
    assert set(rows[0]) >= {"id", "canonical_name", "status", "mw_nominal", "municipalities", "document_urls"}
    geo = json.loads((tmp_path / "municipalities.geojson").read_text(encoding="utf-8"))
    ronda = next(f for f in geo["features"] if f["properties"]["ine_code"] == "29084")
    assert ronda["properties"]["mw_total"] == 93.0
    assert ronda["properties"]["by_status"]["favorable_condicionada"]["mw_nominal"] == 93.0
    meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
    assert meta["counts"]["projects"] == 2
    assert "generated_at" in meta
