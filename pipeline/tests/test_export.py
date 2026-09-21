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
        "municipality_stats.json",
        "projects.csv",
        "protected_area_stats.json",
        "protected_areas.geojson",
        "province_monthly.csv",
    ]
    with open(tmp_path / "projects.csv", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 2
    assert set(rows[0]) >= {"id", "canonical_name", "status", "mw_nominal", "municipalities", "document_urls"}
    # The GeoJSON layers carry geometry plus identifying properties only;
    # the per-status figures live in the sidecar JSON keyed by code, so the
    # geometry file stays stable and cacheable while stats change weekly.
    geo = json.loads((tmp_path / "municipalities.geojson").read_text(encoding="utf-8"))
    ronda = next(f for f in geo["features"] if f["properties"]["ine_code"] == "29084")
    assert set(ronda["properties"]) == {"ine_code", "name", "province", "area_ha", "sensitivity_high_share"}
    assert ronda["geometry"]["type"] in ("Polygon", "MultiPolygon")
    muni_stats = json.loads((tmp_path / "municipality_stats.json").read_text(encoding="utf-8"))
    assert muni_stats["29084"]["mw_total"] == 93.0
    assert muni_stats["29084"]["count_total"] == 1
    assert muni_stats["29084"]["by_status"]["favorable_condicionada"]["mw_nominal"] == 93.0
    areas = json.loads((tmp_path / "protected_areas.geojson").read_text(encoding="utf-8"))
    for feature in areas["features"]:
        assert set(feature["properties"]) == {"site_code", "name", "type"}
    area_stats = json.loads((tmp_path / "protected_area_stats.json").read_text(encoding="utf-8"))
    assert isinstance(area_stats, dict)
    for site in area_stats.values():
        for status_stats in site.values():
            assert set(status_stats) == {"project_count", "mw_nominal", "hectares"}
    meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
    assert meta["counts"]["projects"] == 2
    assert "generated_at" in meta


def test_projects_csv_carries_ine_codes(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    with open(tmp_path / "projects.csv", encoding="utf-8", newline="") as f:
        rows = {r["canonical_name"]: r for r in csv.DictReader(f)}
    assert rows["Parque fotovoltaico Ronda I"]["ine_codes"] == "29084"
    assert rows["Parque fotovoltaico Ronda I"]["municipalities"] == "Ronda"
    assert rows["Parque eólico Sierra Alta"]["ine_codes"] == "29067"


def test_municipality_stats_json_has_technology_split(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    stats = json.loads((tmp_path / "municipality_stats.json").read_text(encoding="utf-8"))
    ronda = stats["29084"]
    assert ronda["by_technology"] == {"solar_fv": {"project_count": 1, "mw_nominal": 93.0, "hectares": 140.1}}
    assert sum(t["mw_nominal"] for t in ronda["by_technology"].values()) == ronda["mw_total"]
