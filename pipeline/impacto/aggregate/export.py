from __future__ import annotations

import argparse
import csv
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import psycopg

from impacto.consultations import deadline, parse_period
from impacto.db.connect import connect
from impacto.developers import GROUPS_FILE, build_developers, load_groups
from impacto.privacy import has_identity_number
from impacto.resolve.run import with_operative
from impacto.settings import load_settings

DEFAULT_OUT = Path(__file__).resolve().parents[3] / "web" / "public" / "data"
SIMPLIFY_TOLERANCE = 0.0005  # degrees, roughly 50 m
MAP_SIMPLIFY_TOLERANCE = 0.002  # roughly 200 m: sub-pixel on the web map even at a province zoom
GEOJSON_DECIMALS = 5  # about one metre; the default nine only inflates the files

EVALUATION_DIR = Path(__file__).resolve().parents[2] / "evaluation"
# The published figure: a run of the held-out labels written on 2026-10-05.
# The September figure, on labels later used to tune the extractor, is
# carried beside it as history.
LAST_RUN = EVALUATION_DIR / "last_run.json"
LABELS_DIR = EVALUATION_DIR / "labels_2026-10"
PREVIOUS_RUN = EVALUATION_DIR / "2026-09-22_run.json"
PREVIOUS_LABELS_DIR = EVALUATION_DIR / "labels"
PERIODS_FILE = EVALUATION_DIR / "periods.json"
AAU_VERDICTS_FILE = EVALUATION_DIR / "aau_verdicts.json"

# A notice that states no objection period stays listed this long after
# publication, marked as such; one with a period stays until its deadline.
UNSTATED_PERIOD_DAYS = 30

# Sensitivity layers: dissolved high-to-maximum zones per technology. The
# tolerance and area floor are tuned against production so each file stays
# under SENSITIVITY_MAX_BYTES (see docs/sources.md for the measured sizes).
SENSITIVITY_FILES = {"ftv": "sensitivity_ftv.geojson", "eol": "sensitivity_eol.geojson"}
SENSITIVITY_TOLERANCE = 0.004  # degrees, roughly 400 m; tuned against production (docs/sources.md)
SENSITIVITY_MIN_AREA = 0.0  # square degrees; parts smaller than this are dropped
SENSITIVITY_DECIMALS = 4  # about 10 m, below the zoning's 250 m cell
SENSITIVITY_MAX_BYTES = 1_500_000


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


def _query(conn: psycopg.Connection, sql: str, params: tuple = ()) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
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


def export_developers(conn, out_dir: Path, groups_file: Path = GROUPS_FILE) -> Path:
    """developers.json: one entry per normalised developer (impacto.developers), with its projects and MW by status."""
    rows = _query(
        conn,
        "SELECT p.id, p.developer, p.status, a.mw_best FROM projects p "
        "JOIN projects_for_aggregates a ON a.id = p.id ORDER BY p.id",
    )
    return _write_json(out_dir / "developers.json", build_developers(rows, load_groups(groups_file)))


# Evidence quotes published next to the fact-sheet figures. Other keys the
# model may cite (related projects, coordinates) are not shown on the site.
DETAIL_EVIDENCE_KEYS = (
    "doc_type", "verdict", "project_name", "developer", "expediente", "technology",
    "mw_nominal", "mw_peak", "hectares", "turbines", "municipalities",
)


def _distinct(names) -> list[str]:
    """Names once each, ignoring case and spacing, in the spelling first seen, sorted."""
    seen: dict[str, str] = {}
    for n in names or []:
        if isinstance(n, str) and n.strip():
            seen.setdefault(" ".join(n.split()).casefold(), " ".join(n.split()))
    return sorted(seen.values(), key=str.casefold)


def project_details(rows: list[dict]) -> dict[str, list[dict]]:
    """Per project, the substance each document's extraction holds, oldest document first.

    A document with nothing to show is left out. A quote or condition that
    holds an identity number is dropped: the site publishes no personal data.
    """
    out: dict[str, list[dict]] = {}
    for r in sorted(rows, key=lambda r: (r["published_at"], r["document_id"])):
        p = r["payload"] or {}
        conditions = [
            {"category": c.get("category") or "general", "text": c["text"].strip()}
            for c in p.get("conditions") or []
            if isinstance(c, dict) and (c.get("text") or "").strip() and not has_identity_number(c["text"])
        ]
        evidence = {
            k: v.strip()
            for k, v in (p.get("evidence") or {}).items()
            if k in DETAIL_EVIDENCE_KEYS and isinstance(v, str) and v.strip() and not has_identity_number(v)
        }
        doc = {
            "document_id": r["document_id"],
            "expediente": p.get("expediente") or None,
            "conditions": conditions,
            "species_mentioned": _distinct(p.get("species_mentioned")),
            "protected_areas_mentioned": _distinct(p.get("protected_areas_mentioned")),
            "evidence": evidence,
            "utm_coordinates": [c for c in p.get("utm_coordinates") or [] if isinstance(c, dict)],
        }
        if any(doc[k] for k in ("expediente", "conditions", "species_mentioned", "protected_areas_mentioned", "evidence")):
            out.setdefault(str(r["project_id"]), []).append(doc)
    return out


def export_project_details(conn, out_dir: Path) -> Path:
    """project_details.json: what each project's documents say beyond the fact sheet (T7)."""
    rows = _query(
        conn,
        """
        SELECT pd.project_id, d.id AS document_id, d.published_at, e.payload
        FROM project_documents pd
        JOIN raw_documents d ON d.id = pd.document_id
        JOIN extractions e ON e.document_id = d.id
        """,
    )
    return _write_json(out_dir / "project_details.json", project_details(rows))


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


# mw_best is mw_nominal, or the peak where only the peak is declared (migration 005);
# mw_peak_fallback_count says in how many projects of the cell that happens.
CELL_KEYS = ("status", "technology", "project_count", "mw_nominal", "mw_count", "hectares", "ha_count", "mw_best", "mw_peak_fallback_count")


def export_municipality_stats_json(conn, out_dir: Path) -> Path:
    # One cell per (status, technology): the web sums whichever cells match
    # its active filters, so no split is precomputed here.
    stats = _query(conn, "SELECT * FROM municipality_stats ORDER BY ine_code, status, technology")
    by_ine: dict[str, dict] = {}
    for s in stats:
        cell = {k: s[k] for k in CELL_KEYS} | {"turbines": s["turbines"]}
        by_ine.setdefault(s["ine_code"], {"cells": []})["cells"].append(cell)
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
    # Every site, with name and type, so the web lists all of them without
    # loading the geometry file. municipality_count uses the same
    # ST_Intersects test as 030 and does not depend on any filter.
    sites = _query(
        conn,
        "SELECT pa.site_code, pa.name, pa.type, "
        "(SELECT count(*) FROM municipalities m WHERE ST_Intersects(m.geom, pa.geom)) AS municipality_count "
        "FROM protected_areas pa ORDER BY pa.site_code",
    )
    by_site = {
        s["site_code"]: {"name": s["name"], "type": s["type"], "municipality_count": s["municipality_count"], "cells": []}
        for s in sites
    }
    for s in _query(conn, "SELECT * FROM protected_area_stats ORDER BY site_code, status, technology"):
        by_site[s["site_code"]]["cells"].append({k: s[k] for k in CELL_KEYS})
    return _write_json(out_dir / "protected_area_stats.json", by_site)


def export_province_stats_json(conn, out_dir: Path) -> Path:
    # Keyed by every province in the reference layer plus 'Andalucía', so a
    # province with no projects is present with no cells.
    provinces = _query(conn, "SELECT DISTINCT province FROM municipalities ORDER BY province")
    by_scope: dict[str, dict] = {p["province"]: {"cells": []} for p in provinces}
    by_scope["Andalucía"] = {"cells": []}
    for s in _query(conn, "SELECT * FROM province_stats ORDER BY scope, status, technology"):
        by_scope[s["scope"]]["cells"].append({k: s[k] for k in CELL_KEYS})
    return _write_json(out_dir / "province_stats.json", by_scope)


def export_monthly_events(conn, out_dir: Path) -> Path:
    rows = _query(
        conn,
        "SELECT month, scope, technology, event, document_count FROM monthly_events "
        "ORDER BY month, scope, technology, event",
    )
    return _write_csv(out_dir / "monthly_events.csv", rows)


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


def export_sensitivity_geojson(conn, out_dir: Path, technology: str, refresh: bool = False) -> Path:
    path = out_dir / SENSITIVITY_FILES[technology]
    if path.exists() and not refresh:
        return path
    row = _query(
        conn,
        """
        WITH region AS (SELECT ST_Union(geom) AS geom FROM municipalities),
        zones AS (
          SELECT ST_Union(z.geom) AS geom
          FROM sensitivity_zones z, region r
          WHERE z.technology = %s AND ST_Intersects(z.geom, r.geom)
        ),
        clipped AS (
          SELECT ST_SimplifyPreserveTopology(ST_Intersection(zones.geom, region.geom), %s) AS geom
          FROM zones, region
        ),
        parts AS (SELECT (ST_Dump(geom)).geom AS geom FROM clipped)
        SELECT ST_AsGeoJSON(ST_Multi(ST_Union(geom)), %s) AS geom
        FROM parts
        WHERE ST_Dimension(geom) = 2 AND ST_Area(geom) >= %s
        """,
        (technology, SENSITIVITY_TOLERANCE, SENSITIVITY_DECIMALS, SENSITIVITY_MIN_AREA),
    )[0]
    geometry = json.loads(row["geom"]) if row["geom"] else {"type": "MultiPolygon", "coordinates": []}
    feature = {"type": "Feature", "properties": {"technology": technology}, "geometry": geometry}
    return _write_feature_collection(path, [feature])


def _field_samples(labels_dir: Path, skipped: set[str]) -> dict[str, int]:
    # run_eval scores each field only over the labels that carry it (a label
    # with no `expediente` key, say, never enters that field's denominator),
    # prints that per-field n to stdout and drops it. It is fully recoverable
    # from the label files themselves: replay the same per-label loop run_eval
    # used, skipping exactly the labels run_eval skipped (a document that
    # failed to fetch or extract contributes to no field's count either).
    counts: dict[str, int] = {}
    for label_path in sorted(labels_dir.glob("*.json")):
        if label_path.name in skipped:
            continue
        label = json.loads(label_path.read_text(encoding="utf-8"))
        for field in label.get("expected", {}):
            counts[field] = counts.get(field, 0) + 1
    return counts


def _aau_publication(conn, aau_file: Path) -> dict:
    # T4: the verdict of AAU publication notices, read by the operative rule.
    # held_out is frozen as measured; live re-scores every label (tuning and
    # held out) with today's rule; unknown is the share it still leaves.
    labels = json.loads(aau_file.read_text(encoding="utf-8"))
    scored = correct = 0
    for label in labels["tuning"] + labels["held_out"]:
        rows = _query(
            conn,
            "SELECT d.text, e.payload FROM raw_documents d JOIN extractions e ON e.document_id = d.id "
            "WHERE d.source = %s AND d.source_id = %s",
            (label["source"], label["source_id"]),
        )
        if not rows:
            continue
        scored += 1
        correct += with_operative(rows[0]["payload"], rows[0]["text"])["verdict"] == label["expected_verdict"]
    counts = _query(conn, "SELECT count(*) FILTER (WHERE status = 'desconocido') AS unknown, count(*) AS total FROM projects")[0]
    return {"held_out": labels["held_out_result"], "live": {"labelled": scored, "correct": correct}, "unknown_projects": counts["unknown"], "projects": counts["total"]}


def export_evaluation(
    out_dir: Path,
    last_run: Path = LAST_RUN,
    labels_dir: Path = LABELS_DIR,
    conn=None,
    aau_file: Path = AAU_VERDICTS_FILE,
    previous_run: Path | None = PREVIOUS_RUN,
    previous_labels_dir: Path = PREVIOUS_LABELS_DIR,
) -> Path:
    # The evaluation is run by hand after labelling, not weekly; the export
    # carries the last checked result to the site. A missing run is an error,
    # not an empty file: the methodology page must never quote nothing.
    if not last_run.is_file():
        raise FileNotFoundError(f"evaluation result not found: {last_run}; run `impacto eval` first")
    result = json.loads(last_run.read_text(encoding="utf-8"))
    result["labels_count"] = len(list(labels_dir.glob("*.json")))
    result["field_samples"] = _field_samples(labels_dir, set(result.get("skipped", [])))
    if previous_run is not None and previous_run.is_file():
        previous = json.loads(previous_run.read_text(encoding="utf-8"))
        result["previous"] = {
            "provider": previous["provider"],
            "measured": previous["measured"],
            "accuracy": previous["accuracy"],
            "n_scored": previous["n_scored"],
            "field_samples": _field_samples(previous_labels_dir, set(previous.get("skipped", []))),
        }
    if conn is not None:
        result["aau_publication"] = _aau_publication(conn, aau_file)
    return _write_json(out_dir / "evaluation.json", result)


def _period_evaluation(conn, periods_file: Path) -> dict:
    # Hand labels (evaluation/periods.json) scored against the parser on the
    # stored notice text: a label counts as correct when amount and unit
    # match, or when both say the notice states no period.
    # A label whose notice is not stored (a fresh or test database) is
    # counted as missing, not scored.
    labels = json.loads(periods_file.read_text(encoding="utf-8"))["labels"]
    scored = correct = with_period = missing = 0
    for label in labels:
        rows = _query(conn, "SELECT text FROM raw_documents WHERE source = %s AND source_id = %s", (label["source"], label["source_id"]))
        if not rows:
            missing += 1
            continue
        found = parse_period(rows[0]["text"])
        got = {"amount": found.amount, "unit": found.unit} if found else None
        scored += 1
        correct += got == label["expected"]
        with_period += label["expected"] is not None
    return {"labelled": scored, "correct": correct, "with_period": with_period, "missing": missing}


def export_open_consultations(conn, out_dir: Path, today: date | None = None, periods_file: Path = PERIODS_FILE) -> Path:
    """Información pública notices still open on `today`, with their deadline.

    The web drops items whose deadline has passed at its own build date, so a
    notice listed here can still disappear before the next export.
    """
    today = today or datetime.now(UTC).date()
    notices = _query(
        conn,
        """
        SELECT d.id AS document_id, d.source, d.source_id, d.published_at, d.title, d.url, d.text,
               p.id AS project_id, p.canonical_name AS project_name,
               (SELECT array_agg(pm.ine_code ORDER BY pm.ine_code) FROM project_municipalities pm WHERE pm.project_id = p.id) AS ine_codes
        FROM project_documents pd
        JOIN raw_documents d ON d.id = pd.document_id
        JOIN projects p ON p.id = pd.project_id
        WHERE pd.role = 'consulta' AND d.published_at >= %s
        ORDER BY d.published_at, d.id
        """,
        (today - timedelta(days=365),),
    )
    items = []
    for n in notices:
        period = parse_period(n["text"])
        due = deadline(n["published_at"], period) if period else None
        if (due is not None and due < today) or (due is None and n["published_at"] < today - timedelta(days=UNSTATED_PERIOD_DAYS)):
            continue
        items.append(
            {
                "document_id": n["document_id"],
                "project_id": n["project_id"],
                "project_name": n["project_name"],
                "title": n["title"],
                "url": n["url"],
                "source": n["source"],
                "source_id": n["source_id"],
                "published_at": n["published_at"].isoformat(),
                "period": {"amount": period.amount, "unit": period.unit, "evidence": period.evidence} if period else None,
                "deadline": due.isoformat() if due else None,
                "ine_codes": n["ine_codes"] or [],
            }
        )
    items.sort(key=lambda i: (i["deadline"] or "9999-12-31", i["published_at"]))
    payload = {"generated": today.isoformat(), "evaluation": _period_evaluation(conn, periods_file), "consultations": items}
    return _write_json(out_dir / "open_consultations.json", payload)


def _row_count(path: Path) -> int:
    # CSV: data rows. FeatureCollection: features. JSON list: items. Other
    # JSON object: keys. Anything else (a single result object) counts as one row.
    if path.suffix == ".csv":
        with open(path, encoding="utf-8", newline="") as f:
            return sum(1 for _ in csv.DictReader(f))
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict) and payload.get("type") == "FeatureCollection":
        return len(payload["features"])
    if isinstance(payload, dict) and "consultations" in payload:
        return len(payload["consultations"])
    if isinstance(payload, dict) and "accuracy" not in payload:
        return len(payload)
    return 1


def export_meta(conn, out_dir: Path, files: list[Path]) -> Path:
    counts = {}
    for table in ("raw_documents", "extractions", "projects", "municipalities", "protected_areas"):
        counts[table] = _query(conn, f"SELECT count(*) AS n FROM {table}")[0]["n"]
    file_info = {p.name: {"rows": _row_count(p), "bytes": p.stat().st_size} for p in files}
    path = out_dir / "meta.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"generated_at": datetime.now(UTC).isoformat(), "counts": counts, "files": file_info}, indent=2),
        encoding="utf-8",
    )
    return path


def export_all(
    conn: psycopg.Connection,
    out_dir: Path,
    last_run: Path = LAST_RUN,
    labels_dir: Path = LABELS_DIR,
    refresh_sensitivity: bool = False,
    periods_file: Path = PERIODS_FILE,
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = [
        export_projects(conn, out_dir),
        export_documents(conn, out_dir),
        export_developers(conn, out_dir),
        export_project_details(conn, out_dir),
        export_municipality_stats(conn, out_dir),
        export_province_monthly(conn, out_dir),
        export_monthly_events(conn, out_dir),
        export_municipalities_geojson(conn, out_dir),
        export_municipalities_map_geojson(conn, out_dir),
        export_municipality_stats_json(conn, out_dir),
        export_protected_areas_geojson(conn, out_dir),
        export_protected_area_stats_json(conn, out_dir),
        export_province_stats_json(conn, out_dir),
        export_municipality_protected_areas_json(conn, out_dir),
        export_provinces_geojson(conn, out_dir),
        export_sensitivity_geojson(conn, out_dir, "ftv", refresh_sensitivity),
        export_sensitivity_geojson(conn, out_dir, "eol", refresh_sensitivity),
        export_evaluation(out_dir, last_run, labels_dir, conn),
        export_open_consultations(conn, out_dir, periods_file=periods_file),
    ]
    paths.append(export_meta(conn, out_dir, paths))
    return paths


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="impacto export")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--refresh-sensitivity", action="store_true", help="rebuild the sensitivity layers even if present")
    args = parser.parse_args(argv)
    settings = load_settings()
    with connect(settings.db_dsn) as conn:
        paths = export_all(conn, args.out, refresh_sensitivity=args.refresh_sensitivity)
    print("\n".join(str(p) for p in paths))
    return 0
