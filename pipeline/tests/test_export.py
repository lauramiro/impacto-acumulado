import csv
import json
from datetime import date

import pytest

from evaluation.run_eval import LABELS_DIR
from impacto.aggregate.export import (
    check_boja_coverage,
    export_all,
    export_developers,
    export_evaluation,
    export_open_consultations,
    export_sensitivity_geojson,
    export_splitting_candidates,
    project_details,
    retired_projects,
    wilson,
)
from impacto.aggregate.run import run_aggregate
from impacto.db.documents import RawDocument, save_extraction, upsert_raw_document
from impacto.reference.load import load_municipalities
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
        "developers.json",
        "documents.csv",
        "evaluation.json",
        "meta.json",
        "monthly_events.csv",
        "municipalities.geojson",
        "municipalities_map.geojson",
        "municipality_protected_areas.json",
        "municipality_stats.csv",
        "municipality_stats.json",
        "open_consultations.json",
        "project_details.json",
        "projects.csv",
        "protected_area_stats.json",
        "protected_areas.geojson",
        "province_monthly.csv",
        "province_stats.json",
        "provinces.geojson",
        "retired_projects.json",
        "sensitivity_eol.geojson",
        "sensitivity_ftv.geojson",
        "splitting_candidates.json",
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


def test_meta_carries_the_newest_document_and_the_boja_coverage(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    run_resolve(db)
    run_aggregate(db)
    report = {"checked": "2026-10-06", "selected": 10, "stored": 9}
    export_all(db, tmp_path, boja_coverage=report)
    meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
    with db.cursor() as cur:
        cur.execute("SELECT source, max(published_at) AS last FROM raw_documents GROUP BY source")
        newest = {r["source"]: r["last"].isoformat() for r in cur.fetchall()}
    assert meta["last_document_by_source"] == newest
    assert meta["last_document"] == max(newest.values())
    assert meta["boja_coverage"] == report
    export_all(db, tmp_path)
    assert json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))["boja_coverage"] is None


def test_check_boja_coverage_counts_stored_documents_and_survives_an_api_failure(db):
    upsert_raw_document(db, RawDocument("boja", "disposition.2026.1.1", date(2026, 1, 2), "t", "u", None, "o", "x"))

    class Down:
        def get(self, url):
            raise RuntimeError("connection refused")

    assert check_boja_coverage(db, Down(), today=date(2026, 1, 31)) is None

    class Empty:
        def get(self, url):
            return json.dumps({"hits": 0, "total_hits": 0, "results": []}).encode()

    report = check_boja_coverage(db, Empty(), today=date(2026, 1, 31))
    assert report["stored"] == 0 and report["selected"] == 0 and report["complete"] is True


def test_wilson_matches_the_published_intervals():
    # The audit's figures: 15 of 20 is about 53 to 89 percent, 13 of 17 about 53 to 91.
    assert tuple(round(x, 2) for x in wilson(15, 20)) == (0.53, 0.89)
    assert tuple(round(x, 2) for x in wilson(13, 17)) == (0.53, 0.90)
    assert wilson(20, 20)[1] == 1.0 and wilson(0, 20)[0] == 0.0


def test_export_evaluation_gives_each_share_its_interval(tmp_path):
    last_run = tmp_path / "last_run.json"
    last_run.write_text(
        json.dumps({"provider": "stub", "accuracy": {"verdict": 0.75, "turbines": 1.0}, "correct": {"turbines": 1}, "n_labels": 4, "n_scored": 4, "skipped": []}),
        encoding="utf-8",
    )
    labels = tmp_path / "labels"
    labels.mkdir()
    for i, expected in enumerate([{"verdict": "a", "turbines": 2}, {"verdict": "a"}, {"verdict": "a"}, {"verdict": "a"}]):
        (labels / f"{i}.json").write_text(json.dumps({"expected": expected}), encoding="utf-8")
    written = json.loads(export_evaluation(tmp_path / "out", last_run=last_run, labels_dir=labels).read_text(encoding="utf-8"))
    # An older run has only the share: 0.75 of 4 gives 3 back.
    assert written["intervals"]["verdict"]["correct"] == 3 and written["intervals"]["verdict"]["n"] == 4
    low, high = wilson(3, 4)
    assert written["intervals"]["verdict"]["low"] == round(low, 3) and written["intervals"]["verdict"]["high"] == round(high, 3)
    assert written["intervals"]["turbines"]["correct"] == 1 and written["intervals"]["turbines"]["n"] == 1


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
        {"status": "favorable_condicionada", "technology": "linea_evacuacion", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0, "hectares": 0.0, "ha_count": 0, "mw_best": 0.0, "mw_peak_fallback_count": 0, "turbines": 0},
        {"status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1, "hectares": 200.0, "ha_count": 1, "mw_best": 100.0, "mw_peak_fallback_count": 0, "turbines": 0},
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
        assert set(cell) == {"status", "technology", "project_count", "mw_nominal", "mw_count", "hectares", "ha_count", "mw_best", "mw_peak_fallback_count"}


def test_province_stats_json_has_every_province_and_andalucia(db, fixtures_dir, tmp_path):
    _export_slice3(db, fixtures_dir, tmp_path)
    scopes = _json(tmp_path, "province_stats.json")
    assert set(scopes) == {"Málaga", "Sevilla", "Andalucía"}
    solar = [c for c in scopes["Andalucía"]["cells"] if c["technology"] == "solar_fv" and c["status"] == "favorable_condicionada"]
    assert solar == [{"status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1, "hectares": 200.0, "ha_count": 1, "mw_best": 100.0, "mw_peak_fallback_count": 0}]


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
    assert header == ["ine_code", "status", "technology", "project_count", "mw_nominal", "hectares", "turbines", "mw_count", "ha_count", "mw_best", "mw_peak_fallback_count", "name", "province"]


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


def test_open_consultations_lists_notices_until_their_deadline(db, fixtures_dir, tmp_path):
    # seed_slice3: d1 is p1's consulta (2023-01-10, Ronda and Sevilla), d7 is
    # p4's (2023-02-14, no municipality). d1 states 30 business days, which
    # end on 2023-02-21; d7 states no period.
    d = seed_slice3(db, fixtures_dir)
    with db.cursor() as cur:
        cur.execute("UPDATE raw_documents SET text = %s WHERE id = %s",
                    ("Se abre información pública durante el plazo de treinta (30) días hábiles, a contar desde el día siguiente.", d["d1"]))
        cur.execute("UPDATE raw_documents SET text = %s WHERE id = %s", ("Se hace público el informe vinculante.", d["d7"]))
    db.commit()
    periods = tmp_path / "periods.json"
    periods.write_text(json.dumps({"labels": [
        {"source": "boe", "source_id": "d1", "expected": {"amount": 30, "unit": "habiles"}},
        {"source": "boe", "source_id": "d7", "expected": None},
        {"source": "boja", "source_id": "not-stored", "expected": None},
    ]}), encoding="utf-8")

    export_open_consultations(db, tmp_path, today=date(2023, 2, 20), periods_file=periods)
    out = _json(tmp_path, "open_consultations.json")
    assert out["generated"] == "2023-02-20"
    assert out["evaluation"] == {"labelled": 2, "correct": 2, "with_period": 1, "missing": 1}
    first, second = out["consultations"]
    assert (first["document_id"], first["project_id"], first["deadline"], first["ine_codes"]) == (d["d1"], 1, "2023-02-21", ["29084", "41091"])
    assert first["period"] == {"amount": 30, "unit": "habiles", "evidence": "plazo de treinta (30) días hábiles"}
    assert (second["document_id"], second["period"], second["deadline"], second["ine_codes"]) == (d["d7"], None, None, [])

    # The day after the deadline d1 drops off; d7 stays for 30 days after publication.
    export_open_consultations(db, tmp_path, today=date(2023, 2, 22), periods_file=periods)
    assert [c["document_id"] for c in _json(tmp_path, "open_consultations.json")["consultations"]] == [d["d7"]]
    export_open_consultations(db, tmp_path, today=date(2023, 3, 20), periods_file=periods)
    assert _json(tmp_path, "open_consultations.json")["consultations"] == []


def test_evaluation_carries_the_aau_publication_verdicts(db, fixtures_dir, tmp_path):
    d = seed_slice3(db, fixtures_dir)
    with db.cursor() as cur:
        # d3 is p3's aau with verdict no_aplica (p3 is desconocido); make it a publication of a granted AAU.
        cur.execute(
            "UPDATE raw_documents SET text = %s WHERE id = %s",
            ("Se procede a dar publicidad al informe vinculante sobre la autorización ambiental unificada otorgada por la Delegación.", d["d3"]),
        )
        cur.execute("UPDATE extractions SET payload = payload || '{\"doc_type\": \"aau\"}' WHERE document_id = %s", (d["d3"],))
    db.commit()
    labels = tmp_path / "aau.json"
    labels.write_text(json.dumps({
        "held_out_result": {"measured": "2026-10-04", "labelled": 15, "correct": 14},
        "tuning": [{"source": "boe", "source_id": "d3", "expected_verdict": "favorable_condicionada"}],
        "held_out": [{"source": "boe", "source_id": "not-stored", "expected_verdict": "no_aplica"}],
    }), encoding="utf-8")
    path = export_evaluation(tmp_path / "out", conn=db, aau_file=labels)
    block = json.loads(path.read_text(encoding="utf-8"))["aau_publication"]
    assert block == {"held_out": {"measured": "2026-10-04", "labelled": 15, "correct": 14},
                     "live": {"labelled": 1, "correct": 1}, "unknown_projects": 1, "projects": 4}


def test_export_evaluation_carries_the_previous_run_as_history(tmp_path):
    last_run = tmp_path / "last_run.json"
    last_run.write_text(json.dumps({"provider": "stub", "measured": "2026-10-05", "accuracy": {"verdict": 1.0}, "n_labels": 1, "n_scored": 1, "skipped": []}), encoding="utf-8")
    previous = tmp_path / "previous.json"
    previous.write_text(json.dumps({"provider": "old", "measured": "2026-09-22", "accuracy": {"verdict": 0.5}, "n_labels": 2, "n_scored": 2, "skipped": []}), encoding="utf-8")
    labels, old_labels = tmp_path / "labels", tmp_path / "old"
    labels.mkdir()
    old_labels.mkdir()
    (labels / "a.json").write_text(json.dumps({"expected": {"verdict": "favorable"}}), encoding="utf-8")
    for name in ("a.json", "b.json"):
        (old_labels / name).write_text(json.dumps({"expected": {"verdict": "favorable"}}), encoding="utf-8")
    path = export_evaluation(tmp_path / "out", last_run=last_run, labels_dir=labels, previous_run=previous, previous_labels_dir=old_labels)
    written = json.loads(path.read_text(encoding="utf-8"))
    assert written["previous"] == {"provider": "old", "measured": "2026-09-22", "accuracy": {"verdict": 0.5}, "n_scored": 2, "field_samples": {"verdict": 2}}
    assert written["field_samples"] == {"verdict": 1}


def test_export_developers_groups_projects_by_normalised_key(db, tmp_path):
    with db.cursor() as cur:
        for i, (developer, status, tech, mw) in enumerate(
            [
                ("Enel Green Power España, S.L.", "favorable", "solar_fv", 50),
                ("Enel Green Power España, SL; Otra Solar, S.L.U.", "desfavorable", "solar_fv", 20),
                ("Enel Green Power España, SL", "favorable", "linea_evacuacion", 70),
                (None, "en_consulta", "eolica", 10),
            ],
            start=1,
        ):
            cur.execute(
                "INSERT INTO projects (id, canonical_name, developer, technology, status, mw_nominal, first_seen, last_seen) "
                "VALUES (%s, %s, %s, %s, %s, %s, '2024-01-01', '2024-01-01')",
                (i, f"P{i}", developer, tech, status, mw),
            )
    path = export_developers(db, tmp_path, groups_file=tmp_path / "none.csv")
    devs = {d["key"]: d for d in json.loads(path.read_text(encoding="utf-8"))}
    assert sorted(devs) == ["enel-green-power-espana", "otra-solar"]
    enel = devs["enel-green-power-espana"]
    assert enel["names"] == ["Enel Green Power España, S.L.", "Enel Green Power España, SL"]
    assert enel["project_ids"] == [1, 2, 3]
    assert enel["projects_by_status"] == {"desfavorable": 1, "favorable": 2}
    # The evacuation line counts as a project and adds no MW.
    assert enel["mw_by_status"] == {"desfavorable": 20.0, "favorable": 50.0}
    assert enel["mw_count"] == 2
    assert devs["otra-solar"]["project_ids"] == [2]


def test_export_splitting_reads_names_and_technology_for_shared_evacuation(db, fixtures_dir, tmp_path):
    load_municipalities(db, fixtures_dir / "municipalities_sample.geojson", "CODIGO_INE", "NOMBRE", "PROVINCIA")
    rows = [
        (1, "Infraestructura común para la Evacuación de las PSFV Alfa Solar y Beta Solar", "Alfa, S.L.", "linea_evacuacion", None),
        (2, "PSF Alfa Solar", "Alfa, S.L.", "solar_fv", 30),
        (3, "PSF Beta Solar", "Beta, S.L.", "solar_fv", 30),
    ]
    with db.cursor() as cur:
        for pid, name, developer, tech, mw in rows:
            cur.execute(
                "INSERT INTO projects (id, canonical_name, developer, technology, status, mw_nominal, first_seen, last_seen) "
                "VALUES (%s, %s, %s, %s, 'favorable', %s, '2023-01-01', '2023-01-01')",
                (pid, name, developer, tech, mw),
            )
            cur.execute("INSERT INTO project_municipalities (project_id, ine_code) VALUES (%s, '29084')", (pid,))
    db.commit()
    [group] = json.loads(export_splitting_candidates(db, tmp_path).read_text(encoding="utf-8"))
    assert group["kind"] == "infraestructura"
    assert group["family"] is None
    assert group["project_ids"] == [2, 3]
    assert group["infrastructure"] == {"project_ids": [1], "substations": []}


def test_project_details_keep_substance_and_drop_identity_numbers():
    rows = [
        {
            "project_id": 7,
            "document_id": 2,
            "published_at": date(2023, 1, 1),
            "payload": {
                "expediente": "AAU/SE/1/22",
                "conditions": [
                    {"category": "fauna", "text": " Parada biológica de marzo a julio. "},
                    {"category": None, "text": "Vallado permeable."},
                    {"category": "general", "text": "Titular 12345678Z notificado."},
                    {"category": "agua", "text": ""},
                ],
                "species_mentioned": ["Sisón", "sisón ", "Aguilucho cenizo", "Sisón"],
                "protected_areas_mentioned": ["ZEPA Campiñas de Sevilla"],
                "evidence": {"mw_nominal": "49,9 MW", "related_projects": "x", "developer": "D. 12345678Z"},
                "utm_coordinates": [{"x": 1.0, "y": 2.0, "zone": 30}],
            },
        },
        {"project_id": 7, "document_id": 1, "published_at": date(2022, 6, 1), "payload": {"expediente": "AAU/SE/1/22"}},
        {"project_id": 8, "document_id": 3, "published_at": date(2022, 6, 1), "payload": {"conditions": []}},
        {"project_id": 9, "document_id": 4, "published_at": date(2022, 6, 1), "payload": None},
    ]
    details = project_details(rows)
    assert list(details) == ["7"]
    first, second = details["7"]
    assert first == {
        "document_id": 1,
        "expediente": "AAU/SE/1/22",
        "conditions": [],
        "species_mentioned": [],
        "protected_areas_mentioned": [],
        "evidence": {},
        "utm_coordinates": [],
    }
    assert second["conditions"] == [
        {"category": "fauna", "text": "Parada biológica de marzo a julio."},
        {"category": "general", "text": "Vallado permeable."},
    ]
    assert second["species_mentioned"] == ["Aguilucho cenizo", "Sisón"]
    assert second["evidence"] == {"mw_nominal": "49,9 MW"}
    assert second["utm_coordinates"] == [{"x": 1.0, "y": 2.0, "zone": 30}]


def _add_document(db, source_id, title, payload, text):
    upsert_raw_document(db, RawDocument("boja", source_id, date(2023, 10, 4), title, "u", "III", "o", text))
    with db.cursor() as cur:
        cur.execute("SELECT id FROM raw_documents WHERE source_id = %s", (source_id,))
        doc_id = cur.fetchone()["id"]
    save_extraction(db, doc_id, "stub", "v1", payload, 0.9, None)
    return doc_id


def test_documents_csv_carries_the_verdict_resolve_reads(db, fixtures_dir, tmp_path):
    # disposition.2023.183.75 (project 43): the model read "no_aplica"; the
    # notice publishes an AAU "otorgada", which the operative rule reads as granted.
    seed(db, fixtures_dir)
    _add_document(
        db, "disposition.2023.183.75",
        "Anuncio de 4 de septiembre de 2023, por el que se da publicidad a la nueva autorización ambiental unificada otorgada.",
        {"doc_type": "aau", "verdict": "no_aplica", "project_name": "Planta X"},
        "De conformidad con el art. 31.7 de la Ley 7/2007, esta Delegación HA RESUELTO Primero. Dar publicidad al Informe "
        "Vinculante sobre la Autorización Ambiental Unificada otorgada a la planta X.",
    )
    _add_document(
        db, "disposition.2023.183.76",
        "Anuncio de 5 de septiembre de 2023, de la Delegación Territorial en Huelva, por el que se da publicidad a la nueva "
        "autorización ambiental unificada otorgada en esta provincia.",
        {"doc_type": "aau", "verdict": "no_aplica", "project_name": "Planta Y"},
        "Expediente AAU/HU/012/22. Promotor: Y.",
    )
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    with open(tmp_path / "documents.csv", encoding="utf-8", newline="") as f:
        docs = {r["source_id"]: r for r in csv.DictReader(f)}
    assert (docs["disposition.2023.183.75"]["doc_type"], docs["disposition.2023.183.75"]["verdict"]) == ("aau", "favorable_condicionada")
    # The same notice with the decision in its title alone (the Huelva form).
    assert (docs["disposition.2023.183.76"]["doc_type"], docs["disposition.2023.183.76"]["verdict"]) == ("aau", "favorable_condicionada")
    # A document the rule does not touch keeps the model's reading.
    assert (docs["C"]["doc_type"], docs["C"]["verdict"]) == ("dia", "desfavorable")
    assert list(docs["C"])[-3:] == ["verdict", "doc_type", "corrects_document_id"]
    assert docs["C"]["corrects_document_id"] == ""


def test_export_fails_when_a_project_consists_only_of_corrections(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    _add_document(
        db, "disposition.2023.144.67",
        "Corrección de errores de la Resolución de 19 de julio de 2023, de la Delegación Territorial en Cádiz, por la que se "
        "da publicidad al informe vinculante (BOJA núm. 140, de 24 de julio de 2023).",
        {"doc_type": "aau", "verdict": "desfavorable"}, "text",
    )
    run_resolve(db)
    run_aggregate(db)
    with pytest.raises(ValueError, match="only of correction notices"):
        export_all(db, tmp_path)
    assert not (tmp_path / "projects.csv").exists()


def test_documents_csv_links_a_correction_to_the_document_it_corrects(db, fixtures_dir, tmp_path):
    seed(db, fixtures_dir)
    title = (
        "Resolución de 19 de julio de 2023, de la Delegación Territorial en Cádiz, por la que se da publicidad al informe "
        "vinculante con el que se deniega autorización ambiental unificada en el término municipal de Tarifa (Cádiz)."
    )
    original = _add_document(
        db, "disposition.2023.140.66", title,
        {"doc_type": "aau", "verdict": "favorable_condicionada", "project_name": "Jarico 1", "municipalities": [{"name": "Tarifa"}]}, "text",
    )
    _add_document(
        db, "disposition.2023.144.67",
        f"Corrección de errores de la {title} (BOJA núm. 140, de 24 de julio de 2023).",
        {"doc_type": "aau", "verdict": "desfavorable"}, "text",
    )
    run_resolve(db)
    run_aggregate(db)
    export_all(db, tmp_path)
    with open(tmp_path / "documents.csv", encoding="utf-8", newline="") as f:
        docs = {r["source_id"]: r for r in csv.DictReader(f)}
    assert docs["disposition.2023.144.67"]["corrects_document_id"] == str(original)
    assert docs["disposition.2023.140.66"]["corrects_document_id"] == ""
    assert docs["disposition.2023.144.67"]["project_id"] == docs["disposition.2023.140.66"]["project_id"]
    assert {docs["disposition.2023.144.67"]["match_score"], docs["disposition.2023.140.66"]["match_score"]} == {"1.0"}


def test_retired_projects_map_a_merged_id_to_the_project_holding_its_lowest_document():
    previous_docs = {194: 194, 195: 194, 122: 122}
    current = {194: 122, 195: 122, 122: 122, 300: 300}
    assert retired_projects({194, 122}, previous_docs, current, {}) == {194: 122}


def test_retired_projects_keep_old_entries_and_follow_a_later_merge():
    # 38 went to 18 in an earlier week; 18 now merges into 5.
    existing = {38: 18}
    assert retired_projects({18, 5}, {18: 18, 5: 5}, {18: 5, 5: 5, 38: 5}, existing) == {18: 5, 38: 5}


def test_retired_projects_drop_an_id_that_is_live_again_or_has_no_target():
    assert retired_projects(set(), {}, {7: 7}, {7: 3}) == {}
    assert retired_projects({9}, {9: 9}, {}, {}) == {}
