import csv
import json

import pytest

from evaluation.run_eval import LABELS_DIR
from impacto.aggregate.export import export_all, export_evaluation, export_sensitivity_geojson
from impacto.aggregate.run import run_aggregate
from impacto.resolve.run import run_resolve
from tests.test_aggregate import seed_slice3
from tests.test_resolve_run import seed


def test_export_writes_all_files(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    paths = export_all(db, tmp_path)
    names = sorted(p.name for p in paths)
    assert names == [
        "documents.csv",
        "evaluation.json",
        "meta.json",
        "monthly_events.csv",
        "municipalities.geojson",
        "municipalities_map.geojson",
        "municipality_protected_areas.json",
        "municipality_stats.csv",
        "municipality_stats.json",
        "projects.csv",
        "protected_area_stats.json",
        "protected_areas.geojson",
        "province_monthly.csv",
        "province_stats.json",
        "provinces.geojson",
        "sensitivity_eol.geojson",
        "sensitivity_ftv.geojson",
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
    cells = muni_stats["29084"]["cells"]
    assert sum(c["mw_nominal"] for c in cells) == 93.0
    assert sum(c["project_count"] for c in cells) == 1
    areas = json.loads((tmp_path / "protected_areas.geojson").read_text(encoding="utf-8"))
    for feature in areas["features"]:
        assert set(feature["properties"]) == {"site_code", "name", "type"}
    area_stats = json.loads((tmp_path / "protected_area_stats.json").read_text(encoding="utf-8"))
    assert isinstance(area_stats, dict)
    for site in area_stats.values():
        assert set(site) == {"name", "type", "municipality_count", "cells"}
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


def test_projects_csv_orders_ine_codes_like_municipalities(db, fixtures_dir, tmp_path):
    # A project linked to more than one municipality must list ine_codes in
    # the same order as municipalities (both by municipality name), not by
    # ine_code, so the two columns stay aligned position by position.
    # Alfarnate sorts first by name but last by ine_code (29998), so a bug
    # that orders ine_codes by m.ine_code instead of m.name would misalign
    # the two columns and this test would catch it.
    seed(db, fixtures_dir)
    run_resolve(db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO municipalities (ine_code, name, province, geom, area_ha) VALUES "
            "('29998', 'Alfarnate', 'Málaga', ST_Multi(ST_GeomFromText("
            "'POLYGON((-4.2 37.0,-4.1 37.0,-4.1 37.1,-4.2 37.1,-4.2 37.0))', 4326)), 100)"
        )
        cur.execute("SELECT id FROM projects WHERE canonical_name = %s", ("Parque fotovoltaico Ronda I",))
        ronda_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO project_municipalities (project_id, ine_code) VALUES (%s, %s)",
            (ronda_id, "29067"),
        )
        cur.execute(
            "INSERT INTO project_municipalities (project_id, ine_code) VALUES (%s, %s)",
            (ronda_id, "29998"),
        )
    db.commit()
    run_aggregate(db)
    export_all(db, tmp_path)
    with open(tmp_path / "projects.csv", encoding="utf-8", newline="") as f:
        rows = {r["canonical_name"]: r for r in csv.DictReader(f)}
    assert rows["Parque fotovoltaico Ronda I"]["municipalities"] == "Alfarnate; Málaga; Ronda"
    assert rows["Parque fotovoltaico Ronda I"]["ine_codes"] == "29998;29067;29084"


def _seed_protected_area(db):
    # Overlaps the Ronda fixture polygon (-5.2..-5.1, 36.7..36.8) and not Málaga.
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO protected_areas (site_code, name, type, geom) VALUES "
            "('ES0000001', 'SIERRA', 'ZEPA', ST_Multi(ST_GeomFromText("
            "'POLYGON((-5.25 36.75,-5.15 36.75,-5.15 36.85,-5.25 36.85,-5.25 36.75))', 4326)))"
        )
    db.commit()


def test_municipality_protected_areas_json_lists_every_municipality(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    _seed_protected_area(db)
    run_resolve(db)
    run_aggregate(db)
    paths = export_all(db, tmp_path)
    assert "municipality_protected_areas.json" in {p.name for p in paths}
    rel = json.loads((tmp_path / "municipality_protected_areas.json").read_text(encoding="utf-8"))
    assert set(rel) == {"29084", "29067"}
    assert rel["29084"] == [{"site_code": "ES0000001", "name": "SIERRA", "type": "ZEPA"}]
    assert rel["29067"] == []


def test_provinces_geojson_has_one_feature_per_province(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    geo = json.loads((tmp_path / "provinces.geojson").read_text(encoding="utf-8"))
    assert [f["properties"] for f in geo["features"]] == [{"province": "Málaga"}]
    assert geo["features"][0]["geometry"]["type"] in ("Polygon", "MultiPolygon")


def _max_decimals(coords) -> int:
    if isinstance(coords, (int, float)):
        text = repr(float(coords))
        return len(text.split(".")[1]) if "." in text else 0
    return max((_max_decimals(c) for c in coords), default=0)


def test_geojson_coordinates_have_five_decimals_at_most(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    _seed_protected_area(db)
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    for name in ("municipalities.geojson", "protected_areas.geojson", "provinces.geojson"):
        geo = json.loads((tmp_path / name).read_text(encoding="utf-8"))
        for feature in geo["features"]:
            assert _max_decimals(feature["geometry"]["coordinates"]) <= 5, name


def _vertex_count(geometry) -> int:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return sum(len(ring) for polygon in polygons for ring in polygon)


def _seed_jagged_municipality(db):
    # A square with a 100 m sawtooth along its north edge: survives the 50 m
    # export tolerance and collapses under the map tolerance.
    north = ", ".join(
        f"{-5.0 + i * 0.001:.4f} {36.8 + (0.001 if i % 2 else 0.0):.4f}" for i in range(100, -1, -1)
    )
    wkt = f"POLYGON((-5.0 36.7, -4.9 36.7, {north}, -5.0 36.7))"
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO municipalities (ine_code, name, province, geom, area_ha) "
            "VALUES ('29999', 'Sierra Dentada', 'Málaga', ST_Multi(ST_GeomFromText(%s, 4326)), 1000)",
            (wkt,),
        )
    db.commit()


def test_municipalities_map_geojson_is_coarser_and_carries_only_map_properties(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    _seed_jagged_municipality(db)
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    full = json.loads((tmp_path / "municipalities.geojson").read_text(encoding="utf-8"))
    coarse = json.loads((tmp_path / "municipalities_map.geojson").read_text(encoding="utf-8"))
    assert [f["properties"]["ine_code"] for f in coarse["features"]] == ["29067", "29084", "29999"]
    assert all(set(f["properties"]) == {"ine_code", "name", "province"} for f in coarse["features"])
    full_jagged = next(f for f in full["features"] if f["properties"]["ine_code"] == "29999")
    coarse_jagged = next(f for f in coarse["features"] if f["properties"]["ine_code"] == "29999")
    assert _vertex_count(full_jagged["geometry"]) > 50
    assert _vertex_count(coarse_jagged["geometry"]) < 20
    assert _max_decimals(coarse_jagged["geometry"]["coordinates"]) <= 5


def test_projects_csv_carries_the_status_document(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    with open(tmp_path / "documents.csv", encoding="utf-8", newline="") as f:
        docs = {r["source_id"]: r["id"] for r in csv.DictReader(f)}
    with open(tmp_path / "projects.csv", encoding="utf-8", newline="") as f:
        projects = {r["canonical_name"]: r for r in csv.DictReader(f)}
    # The DIA (B) fixes Ronda I's status, not the earlier consultation notice (A).
    assert projects["Parque fotovoltaico Ronda I"]["status_document_id"] == docs["B"]
    assert projects["Parque eólico Sierra Alta"]["status_document_id"] == docs["C"]


def test_export_evaluation_copies_last_run_and_counts_labels(tmp_path):
    last_run = tmp_path / "last_run.json"
    last_run.write_text(json.dumps({"provider": "stub", "accuracy": {"verdict": 1.0}, "n_labels": 2, "n_scored": 2, "skipped": []}), encoding="utf-8")
    labels = tmp_path / "labels"
    labels.mkdir()
    (labels / "a.json").write_text("{}", encoding="utf-8")
    (labels / "b.json").write_text("{}", encoding="utf-8")
    out = tmp_path / "out"
    path = export_evaluation(out, last_run=last_run, labels_dir=labels)
    written = json.loads(path.read_text(encoding="utf-8"))
    assert path.name == "evaluation.json"
    assert written["accuracy"] == {"verdict": 1.0}
    assert written["labels_count"] == 2


def test_export_evaluation_fails_loudly_without_a_run(tmp_path):
    with pytest.raises(FileNotFoundError):
        export_evaluation(tmp_path / "out", last_run=tmp_path / "missing.json", labels_dir=tmp_path)


def test_export_evaluation_computes_field_samples_from_labels(tmp_path):
    # run_eval prints a per-field n to stdout and drops it; export_evaluation
    # must recompute the same denominators from the label files themselves -
    # how many labels carry each field under `expected` - rather than quoting
    # n_scored as a single shared sample size for every field.
    last_run = tmp_path / "last_run.json"
    last_run.write_text(
        json.dumps({"provider": "stub", "accuracy": {"verdict": 1.0, "turbines": 1.0}, "n_labels": 3, "n_scored": 3, "skipped": []}),
        encoding="utf-8",
    )
    labels = tmp_path / "labels"
    labels.mkdir()
    (labels / "a.json").write_text(json.dumps({"expected": {"verdict": "favorable", "turbines": 2}}), encoding="utf-8")
    (labels / "b.json").write_text(json.dumps({"expected": {"verdict": "desfavorable"}}), encoding="utf-8")
    (labels / "c.json").write_text(json.dumps({"expected": {"verdict": "favorable"}}), encoding="utf-8")
    out = tmp_path / "out"
    path = export_evaluation(out, last_run=last_run, labels_dir=labels)
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["field_samples"] == {"verdict": 3, "turbines": 1}


def test_export_evaluation_excludes_skipped_labels_from_field_samples(tmp_path):
    # A label run_eval skipped (its document failed to fetch or extract)
    # contributed to no field's count; the export must not count it either.
    last_run = tmp_path / "last_run.json"
    last_run.write_text(
        json.dumps({"provider": "stub", "accuracy": {"verdict": 1.0}, "n_labels": 2, "n_scored": 1, "skipped": ["b.json"]}),
        encoding="utf-8",
    )
    labels = tmp_path / "labels"
    labels.mkdir()
    (labels / "a.json").write_text(json.dumps({"expected": {"verdict": "favorable"}}), encoding="utf-8")
    (labels / "b.json").write_text(json.dumps({"expected": {"verdict": "favorable"}}), encoding="utf-8")
    out = tmp_path / "out"
    path = export_evaluation(out, last_run=last_run, labels_dir=labels)
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["field_samples"] == {"verdict": 1}


def test_export_evaluation_field_samples_match_the_real_labels(tmp_path):
    # The real labels directory (pipeline/evaluation/labels), against the
    # denominators the controller verified by hand: doc_type, verdict,
    # technology, mw_nominal and municipalities 20; developer 18; project_name
    # 15; expediente 8; mw_peak 4; hectares 4; turbines 2.
    last_run = tmp_path / "last_run.json"
    last_run.write_text(
        json.dumps({"provider": "stub", "accuracy": {}, "n_labels": 20, "n_scored": 20, "skipped": []}),
        encoding="utf-8",
    )
    out = tmp_path / "out"
    path = export_evaluation(out, last_run=last_run, labels_dir=LABELS_DIR)
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["field_samples"] == {
        "doc_type": 20,
        "verdict": 20,
        "technology": 20,
        "mw_nominal": 20,
        "municipalities": 20,
        "developer": 18,
        "project_name": 15,
        "expediente": 8,
        "mw_peak": 4,
        "hectares": 4,
        "turbines": 2,
    }


def test_meta_lists_every_export_with_rows_and_bytes(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    paths = export_all(db, tmp_path)
    meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
    assert set(meta["files"]) == {p.name for p in paths} - {"meta.json"}
    assert meta["files"]["projects.csv"]["rows"] == 2  # data rows, header excluded
    assert meta["files"]["documents.csv"]["rows"] == 3
    assert meta["files"]["municipalities.geojson"]["rows"] == 2  # features
    assert meta["files"]["municipality_stats.json"]["rows"] == 2  # keys
    assert meta["files"]["evaluation.json"]["rows"] == 1  # a single object
    for entry in meta["files"].values():
        assert entry["bytes"] > 0


def _export_slice3(db, fixtures_dir, tmp_path):
    seed_slice3(db, fixtures_dir)
    run_aggregate(db)
    export_all(db, tmp_path)


def _json(tmp_path, name):
    return json.loads((tmp_path / name).read_text(encoding="utf-8"))


def test_municipality_stats_json_is_a_list_of_cells(db, fixtures_dir, tmp_path):
    _export_slice3(db, fixtures_dir, tmp_path)
    ronda = _json(tmp_path, "municipality_stats.json")["29084"]
    assert set(ronda) == {"cells"}
    assert sorted(ronda["cells"], key=lambda c: c["technology"]) == [
        {"status": "favorable_condicionada", "technology": "linea_evacuacion", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0, "hectares": 0.0, "ha_count": 0, "turbines": 0},
        {"status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1, "hectares": 200.0, "ha_count": 1, "turbines": 0},
    ]


def test_protected_area_stats_json_lists_every_site_with_name_type_and_municipality_count(db, fixtures_dir, tmp_path):
    _export_slice3(db, fixtures_dir, tmp_path)
    sites = _json(tmp_path, "protected_area_stats.json")
    assert set(sites) == {"ES0000001", "ES0000009"}
    assert sites["ES0000009"] == {"name": "LAGUNA", "type": "ZEC", "municipality_count": 0, "cells": []}
    sierra = sites["ES0000001"]
    assert (sierra["name"], sierra["type"], sierra["municipality_count"]) == ("SIERRA", "ZEPA", 1)
    assert {c["technology"] for c in sierra["cells"]} == {"solar_fv", "linea_evacuacion"}
    for cell in sierra["cells"]:
        assert set(cell) == {"status", "technology", "project_count", "mw_nominal", "mw_count", "hectares", "ha_count"}


def test_province_stats_json_has_every_province_and_andalucia(db, fixtures_dir, tmp_path):
    _export_slice3(db, fixtures_dir, tmp_path)
    scopes = _json(tmp_path, "province_stats.json")
    assert set(scopes) == {"Málaga", "Sevilla", "Andalucía"}
    solar = [c for c in scopes["Andalucía"]["cells"] if c["technology"] == "solar_fv" and c["status"] == "favorable_condicionada"]
    assert solar == [{"status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1, "hectares": 200.0, "ha_count": 1}]


def test_monthly_events_csv(db, fixtures_dir, tmp_path):
    _export_slice3(db, fixtures_dir, tmp_path)
    with open(tmp_path / "monthly_events.csv", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert list(rows[0]) == ["month", "scope", "technology", "event", "document_count"]
    assert {"month": "2023-06-01", "scope": "Andalucía", "technology": "solar_fv", "event": "sin_veredicto", "document_count": "1"} in rows
    assert rows == sorted(rows, key=lambda r: (r["month"], r["scope"], r["technology"], r["event"]))


def test_municipality_stats_csv_carries_mw_and_ha_count(db, fixtures_dir, tmp_path):
    _export_slice3(db, fixtures_dir, tmp_path)
    with open(tmp_path / "municipality_stats.csv", encoding="utf-8", newline="") as f:
        header = next(csv.reader(f))
    assert header == ["ine_code", "status", "technology", "project_count", "mw_nominal", "hectares", "turbines", "mw_count", "ha_count", "name", "province"]


def _seed_zones(db):
    # One ftv zone half inside Ronda's square, one eol zone far outside every municipality.
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO sensitivity_zones (klass, technology, geom) VALUES "
            "('alta', 'ftv', ST_Multi(ST_GeomFromText('POLYGON((-5.25 36.7,-5.15 36.7,-5.15 36.8,-5.25 36.8,-5.25 36.7))', 4326))), "
            "('maxima', 'eol', ST_Multi(ST_GeomFromText('POLYGON((-1.0 40.0,-0.9 40.0,-0.9 40.1,-1.0 40.1,-1.0 40.0))', 4326)))"
        )
    db.commit()


def test_sensitivity_layer_is_one_clipped_feature(db, fixtures_dir, tmp_path):
    seed_slice3(db, fixtures_dir)
    _seed_zones(db)
    path = export_sensitivity_geojson(db, tmp_path, "ftv", refresh=True)
    assert path.name == "sensitivity_ftv.geojson"
    geo = json.loads(path.read_text(encoding="utf-8"))
    assert len(geo["features"]) == 1
    feature = geo["features"][0]
    assert feature["properties"] == {"technology": "ftv"}
    assert feature["geometry"]["type"] == "MultiPolygon"
    lons = [pt[0] for poly in feature["geometry"]["coordinates"] for ring in poly for pt in ring]
    # Clipped to the municipalities: nothing west of Ronda's edge at -5.2.
    assert min(lons) >= -5.2
    assert _max_decimals(feature["geometry"]["coordinates"]) <= 4


def test_sensitivity_layer_outside_the_region_is_empty(db, fixtures_dir, tmp_path):
    seed_slice3(db, fixtures_dir)
    _seed_zones(db)
    geo = json.loads(export_sensitivity_geojson(db, tmp_path, "eol", refresh=True).read_text(encoding="utf-8"))
    assert geo["features"][0]["geometry"] == {"type": "MultiPolygon", "coordinates": []}


def test_sensitivity_layer_is_kept_unless_refreshed(db, fixtures_dir, tmp_path):
    seed_slice3(db, fixtures_dir)
    existing = tmp_path / "sensitivity_ftv.geojson"
    existing.write_text('{"type": "FeatureCollection", "features": []}', encoding="utf-8")
    assert export_sensitivity_geojson(db, tmp_path, "ftv") == existing
    assert existing.read_text(encoding="utf-8") == '{"type": "FeatureCollection", "features": []}'


def test_export_all_lists_the_sensitivity_layers(db, fixtures_dir, tmp_path):
    seed_slice3(db, fixtures_dir)
    run_aggregate(db)
    names = {p.name for p in export_all(db, tmp_path)}
    assert {"sensitivity_ftv.geojson", "sensitivity_eol.geojson"} <= names
