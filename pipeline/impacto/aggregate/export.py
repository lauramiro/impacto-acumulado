from __future__ import annotations

import argparse
import csv
import json
from datetime import UTC, datetime
from pathlib import Path

import psycopg

from impacto.db.connect import connect
from impacto.settings import load_settings

DEFAULT_OUT = Path(__file__).resolve().parents[3] / "web" / "public" / "data"
SIMPLIFY_TOLERANCE = 0.0005  # degrees, roughly 50 m
MAP_SIMPLIFY_TOLERANCE = 0.002  # roughly 200 m: sub-pixel on the web map even at a province zoom
GEOJSON_DECIMALS = 5  # about one metre; the default nine only inflates the files

EVALUATION_DIR = Path(__file__).resolve().parents[2] / "evaluation"
LAST_RUN = EVALUATION_DIR / "last_run.json"
LABELS_DIR = EVALUATION_DIR / "labels"


def _write_csv(path: Path, rows: list[dict]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        if not rows:
            f.write("")
            return path
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return path


def _query(conn: psycopg.Connection, sql: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql)
        return [dict(r) for r in cur.fetchall()]


def export_projects(conn, out_dir: Path) -> Path:
    rows = _query(
        conn,
        """
        SELECT p.id, p.canonical_name, p.developer, p.technology, p.status, p.mw_peak, p.mw_nominal, p.hectares, p.turbines,
               p.status_document_id, p.first_seen, p.last_seen,
               (SELECT string_agg(m.name, '; ' ORDER BY m.name)
                FROM project_municipalities pm JOIN municipalities m ON m.ine_code = pm.ine_code
                WHERE pm.project_id = p.id) AS municipalities,
               (SELECT string_agg(m.ine_code, ';' ORDER BY m.name)
                FROM project_municipalities pm JOIN municipalities m ON m.ine_code = pm.ine_code
                WHERE pm.project_id = p.id) AS ine_codes,
               (SELECT string_agg(DISTINCT m.province, '; ')
                FROM project_municipalities pm JOIN municipalities m ON m.ine_code = pm.ine_code
                WHERE pm.project_id = p.id) AS provinces,
               string_agg(DISTINCT d.url, ' ') AS document_urls
        FROM projects p
        LEFT JOIN project_documents pd ON pd.project_id = p.id
        LEFT JOIN raw_documents d ON d.id = pd.document_id
        GROUP BY p.id ORDER BY p.id
        """,
    )
    return _write_csv(out_dir / "projects.csv", rows)


def export_documents(conn, out_dir: Path) -> Path:
    rows = _query(
        conn,
        """
        SELECT d.id, d.source, d.source_id, d.published_at, d.title, d.url, pd.project_id, pd.role, pd.match_score, e.confidence,
               e.payload->>'verdict' AS verdict, e.payload->>'doc_type' AS doc_type
        FROM raw_documents d
        LEFT JOIN extractions e ON e.document_id = d.id
        LEFT JOIN project_documents pd ON pd.document_id = d.id
        ORDER BY d.published_at, d.id
        """,
    )
    return _write_csv(out_dir / "documents.csv", rows)


def export_municipality_stats(conn, out_dir: Path) -> Path:
    rows = _query(
        conn,
        "SELECT s.*, m.name, m.province FROM municipality_stats s "
        "JOIN municipalities m ON m.ine_code = s.ine_code ORDER BY s.ine_code, s.status, s.technology",
    )
    return _write_csv(out_dir / "municipality_stats.csv", rows)


def export_province_monthly(conn, out_dir: Path) -> Path:
    rows = _query(conn, "SELECT * FROM province_monthly ORDER BY province, month, verdict")
    return _write_csv(out_dir / "province_monthly.csv", rows)


def _write_json(path: Path, payload: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def _write_feature_collection(path: Path, features: list[dict]) -> Path:
    return _write_json(path, {"type": "FeatureCollection", "features": features})


# The GeoJSON layers carry geometry plus identifying properties only. The
# per-status figures go to a sidecar JSON keyed by the same code, so the
# large geometry files only change when the reference layers do and the
# web app can join the small, weekly-changing stats client-side.


def export_municipalities_geojson(conn, out_dir: Path) -> Path:
    munis = _query(
        conn,
        "SELECT ine_code, name, province, area_ha, sensitivity_high_share, "
        f"ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {SIMPLIFY_TOLERANCE}), {GEOJSON_DECIMALS}) AS geom "
        "FROM municipalities ORDER BY ine_code",
    )
    features = [
        {
            "type": "Feature",
            "properties": {k: m[k] for k in ("ine_code", "name", "province", "area_ha", "sensitivity_high_share")},
            "geometry": json.loads(m["geom"]),
        }
        for m in munis
    ]
    return _write_feature_collection(out_dir / "municipalities.geojson", features)


def export_municipalities_map_geojson(conn, out_dir: Path) -> Path:
    # Lighter copy for the web map only: coarser simplification, no figures.
    munis = _query(
        conn,
        "SELECT ine_code, name, province, "
        f"ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {MAP_SIMPLIFY_TOLERANCE}), {GEOJSON_DECIMALS}) AS geom "
        "FROM municipalities ORDER BY ine_code",
    )
    features = [
        {
            "type": "Feature",
            "properties": {k: m[k] for k in ("ine_code", "name", "province")},
            "geometry": json.loads(m["geom"]),
        }
        for m in munis
    ]
    return _write_feature_collection(out_dir / "municipalities_map.geojson", features)


def export_municipality_stats_json(conn, out_dir: Path) -> Path:
    stats = _query(conn, "SELECT * FROM municipality_stats ORDER BY ine_code, status, technology")
    by_ine: dict[str, dict] = {}
    for s in stats:
        entry = by_ine.setdefault(
            s["ine_code"],
            {"by_status": {}, "by_technology": {}, "mw_total": 0.0, "ha_total": 0.0, "count_total": 0},
        )
        st = entry["by_status"].setdefault(
            s["status"], {"project_count": 0, "mw_nominal": 0.0, "hectares": 0.0, "turbines": 0}
        )
        for key in ("project_count", "mw_nominal", "hectares", "turbines"):
            st[key] += s[key]
        tech = entry["by_technology"].setdefault(
            s["technology"], {"project_count": 0, "mw_nominal": 0.0, "hectares": 0.0}
        )
        for key in ("project_count", "mw_nominal", "hectares"):
            tech[key] += s[key]
        entry["mw_total"] += s["mw_nominal"]
        entry["ha_total"] += s["hectares"]
        entry["count_total"] += s["project_count"]
    return _write_json(out_dir / "municipality_stats.json", by_ine)


def export_protected_areas_geojson(conn, out_dir: Path) -> Path:
    areas = _query(
        conn,
        "SELECT site_code, name, type, "
        f"ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {SIMPLIFY_TOLERANCE}), {GEOJSON_DECIMALS}) AS geom "
        "FROM protected_areas ORDER BY site_code",
    )
    features = [
        {
            "type": "Feature",
            "properties": {"site_code": a["site_code"], "name": a["name"], "type": a["type"]},
            "geometry": json.loads(a["geom"]),
        }
        for a in areas
    ]
    return _write_feature_collection(out_dir / "protected_areas.geojson", features)


def export_protected_area_stats_json(conn, out_dir: Path) -> Path:
    stats = _query(conn, "SELECT * FROM protected_area_stats ORDER BY site_code, status")
    by_site: dict[str, dict] = {}
    for s in stats:
        by_site.setdefault(s["site_code"], {})[s["status"]] = {
            k: s[k] for k in ("project_count", "mw_nominal", "hectares")
        }
    return _write_json(out_dir / "protected_area_stats.json", by_site)


def export_municipality_protected_areas_json(conn, out_dir: Path) -> Path:
    # Reference relation, keyed by every municipality so the web can tell
    # "none" from "missing". Same intersection test as 030_protected_area_stats.sql.
    munis = _query(conn, "SELECT ine_code FROM municipalities ORDER BY ine_code")
    pairs = _query(
        conn,
        "SELECT m.ine_code, pa.site_code, pa.name, pa.type "
        "FROM municipalities m JOIN protected_areas pa ON ST_Intersects(m.geom, pa.geom) "
        "ORDER BY m.ine_code, pa.site_code",
    )
    by_ine: dict[str, list[dict]] = {m["ine_code"]: [] for m in munis}
    for p in pairs:
        by_ine[p["ine_code"]].append({"site_code": p["site_code"], "name": p["name"], "type": p["type"]})
    return _write_json(out_dir / "municipality_protected_areas.json", by_ine)


def export_provinces_geojson(conn, out_dir: Path) -> Path:
    provinces = _query(
        conn,
        "SELECT province, "
        f"ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Union(geom), {MAP_SIMPLIFY_TOLERANCE}), {GEOJSON_DECIMALS}) AS geom "
        "FROM municipalities GROUP BY province ORDER BY province",
    )
    features = [
        {"type": "Feature", "properties": {"province": p["province"]}, "geometry": json.loads(p["geom"])}
        for p in provinces
    ]
    return _write_feature_collection(out_dir / "provinces.geojson", features)


def export_evaluation(out_dir: Path, last_run: Path = LAST_RUN, labels_dir: Path = LABELS_DIR) -> Path:
    # The evaluation is run by hand after labelling, not weekly; the export
    # carries the last checked result to the site. A missing run is an error,
    # not an empty file: the methodology page must never quote nothing.
    if not last_run.is_file():
        raise FileNotFoundError(f"evaluation result not found: {last_run}; run `impacto eval` first")
    result = json.loads(last_run.read_text(encoding="utf-8"))
    result["labels_count"] = len(list(labels_dir.glob("*.json")))
    return _write_json(out_dir / "evaluation.json", result)


def export_meta(conn, out_dir: Path) -> Path:
    counts = {}
    for table in ("raw_documents", "extractions", "projects", "municipalities", "protected_areas"):
        counts[table] = _query(conn, f"SELECT count(*) AS n FROM {table}")[0]["n"]
    path = out_dir / "meta.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"generated_at": datetime.now(UTC).isoformat(), "counts": counts}, indent=2),
        encoding="utf-8",
    )
    return path


def export_all(
    conn: psycopg.Connection, out_dir: Path, last_run: Path = LAST_RUN, labels_dir: Path = LABELS_DIR
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    return [
        export_projects(conn, out_dir),
        export_documents(conn, out_dir),
        export_municipality_stats(conn, out_dir),
        export_province_monthly(conn, out_dir),
        export_municipalities_geojson(conn, out_dir),
        export_municipalities_map_geojson(conn, out_dir),
        export_municipality_stats_json(conn, out_dir),
        export_protected_areas_geojson(conn, out_dir),
        export_protected_area_stats_json(conn, out_dir),
        export_municipality_protected_areas_json(conn, out_dir),
        export_provinces_geojson(conn, out_dir),
        export_evaluation(out_dir, last_run, labels_dir),
        export_meta(conn, out_dir),
    ]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="impacto export")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    settings = load_settings()
    with connect(settings.db_dsn) as conn:
        paths = export_all(conn, args.out)
    print("\n".join(str(p) for p in paths))
    return 0
