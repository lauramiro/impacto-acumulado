from datetime import date

from impacto.aggregate.run import run_aggregate
from impacto.db.documents import RawDocument, save_extraction, upsert_raw_document
from impacto.reference.load import load_municipalities
from impacto.resolve.run import run_resolve
from tests.test_resolve_run import seed

SEVILLA_SQUARE = "POLYGON((-6.0 37.3,-5.9 37.3,-5.9 37.4,-6.0 37.4,-6.0 37.3))"


def test_aggregate_builds_stats(db, fixtures_dir):
    seed(db, fixtures_dir)
    run_resolve(db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO sensitivity_zones (klass, technology, geom) VALUES "
            "('alta', 'ftv', ST_Multi(ST_GeomFromText("
            "'POLYGON((-5.2 36.7,-5.15 36.7,-5.15 36.8,-5.2 36.8,-5.2 36.7))', 4326)))"
        )
        # Two zones (one per technology) that each cover all of municipality
        # 29067 and spill past its edges: the union must saturate the share at
        # exactly 1.0, never above it through geography rounding.
        cur.execute(
            "INSERT INTO sensitivity_zones (klass, technology, geom) VALUES "
            "('maxima', 'eol', ST_Multi(ST_GeomFromText("
            "'POLYGON((-4.6 36.6,-4.3 36.6,-4.3 36.9,-4.6 36.9,-4.6 36.6))', 4326))), "
            "('alta', 'ftv', ST_Multi(ST_GeomFromText("
            "'POLYGON((-4.55 36.65,-4.35 36.65,-4.35 36.85,-4.55 36.85,-4.55 36.65))', 4326)))"
        )
        cur.execute(
            "INSERT INTO protected_areas (site_code, name, type, geom) VALUES "
            "('ES0000001', 'Sierra', 'ZEPA', ST_Multi(ST_GeomFromText("
            "'POLYGON((-5.25 36.75,-5.15 36.75,-5.15 36.85,-5.25 36.85,-5.25 36.75))', 4326)))"
        )
    db.commit()
    run_aggregate(db)
    with db.cursor() as cur:
        cur.execute("SELECT ine_code, status, mw_nominal FROM municipality_stats ORDER BY ine_code")
        stats = cur.fetchall()
        cur.execute("SELECT sensitivity_high_share FROM municipalities WHERE ine_code = '29084'")
        share = cur.fetchone()["sensitivity_high_share"]
        cur.execute("SELECT ine_code, sensitivity_high_share FROM municipalities ORDER BY ine_code")
        shares = {r["ine_code"]: r["sensitivity_high_share"] for r in cur.fetchall()}
        cur.execute("SELECT site_code, status, project_count FROM protected_area_stats")
        pa = cur.fetchall()
        cur.execute("SELECT province, verdict, mw_nominal FROM province_monthly ORDER BY month")
        pm = cur.fetchall()
    assert [(s["ine_code"], s["status"], s["mw_nominal"]) for s in stats] == [
        ("29067", "desfavorable", 50.0),
        ("29084", "favorable_condicionada", 93.0),
    ]
    assert 0.4 < share < 0.6
    assert shares["29067"] == 1.0
    assert all(0.0 <= s <= 1.0 for s in shares.values())
    assert pa == [{"site_code": "ES0000001", "status": "favorable_condicionada", "project_count": 1}]
    assert [(r["province"], r["verdict"]) for r in pm] == [
        ("Málaga", "desfavorable"),
        ("Málaga", "favorable_condicionada"),
    ]


def test_aggregate_counts_multi_municipality_project_once(db, fixtures_dir):
    """A project spanning several qualifying municipalities must contribute its
    mw_nominal/hectares only once to province_monthly and protected_area_stats
    (project_count already used DISTINCT p.id, but mw_nominal/hectares summed once
    per matching municipality row before the fix)."""
    seed(db, fixtures_dir)
    payload = {
        "doc_type": "dia",
        "verdict": "favorable",  # a status no other seeded project uses, to isolate the group
        "project_name": "Parque Multi Municipio",
        "expediente": "E9",
        "technology": "solar_fv",
        "mw_nominal": 10,
        "hectares": 20,
        "municipalities": [
            {"name": "Ronda", "province": "Málaga"},
            {"name": "Málaga", "province": "Málaga"},
        ],
        "confidence": 0.9,
    }
    upsert_raw_document(db, RawDocument("boe", "D", date(2024, 1, 1), "t", "u", "III", "o", "text D"))
    with db.cursor() as cur:
        cur.execute("SELECT id FROM raw_documents WHERE source_id = %s", ("D",))
        doc_id = cur.fetchone()["id"]
    save_extraction(db, doc_id, "stub", "v1", payload, payload["confidence"], None)
    run_resolve(db)
    with db.cursor() as cur:
        # Spans both Ronda (29084) and Málaga (29067) squares, so a project linked
        # to both municipalities matches this site through two separate rows.
        cur.execute(
            "INSERT INTO protected_areas (site_code, name, type, geom) VALUES "
            "('ES0000002', 'Multi', 'ZEC', ST_Multi(ST_GeomFromText("
            "'POLYGON((-5.25 36.65,-4.35 36.65,-4.35 36.85,-5.25 36.85,-5.25 36.65))', 4326)))"
        )
    db.commit()
    run_aggregate(db)
    with db.cursor() as cur:
        cur.execute(
            "SELECT project_count, mw_nominal FROM province_monthly "
            "WHERE province = 'Málaga' AND verdict = 'favorable'"
        )
        pm = cur.fetchone()
        cur.execute(
            "SELECT project_count, mw_nominal, hectares FROM protected_area_stats "
            "WHERE site_code = 'ES0000002' AND status = 'favorable'"
        )
        pa = cur.fetchone()
    assert pm == {"project_count": 1, "mw_nominal": 10.0}
    assert pa == {"project_count": 1, "mw_nominal": 10.0, "hectares": 20.0}


def _doc(db, source_id: str, day: date, verdict: str | None) -> int:
    upsert_raw_document(db, RawDocument("boe", source_id, day, "t " + source_id, "u", "III", "o", "text " + source_id))
    with db.cursor() as cur:
        cur.execute("SELECT id FROM raw_documents WHERE source_id = %s", (source_id,))
        doc_id = cur.fetchone()["id"]
    if verdict is not None:
        payload = {"verdict": verdict, "confidence": 0.9}
        save_extraction(db, doc_id, "stub", "v1", payload, 0.9, None)
    return doc_id


def seed_slice3(db, fixtures_dir) -> dict[str, int]:
    """Projects written directly (no resolve), so every case is explicit:

    p1 solar_fv, favorable_condicionada, 100 MW, 200 ha, Ronda (Málaga) + Sevilla (Sevilla)
    p2 linea_evacuacion, favorable_condicionada, 40 MW, Ronda
    p3 solar_fv, desconocido, no MW, Málaga
    p4 eolica, en_consulta, 30 MW, no municipality

    Documents: d1 consulta p1 (2023-01), d2 aau p1 favorable_condicionada (2023-06),
    d3 aau p3 no_aplica (2023-06), d4 modificacion p1 (2023-07), d5 dia p2
    favorable_condicionada (2023-06), d6 aau p1 with no extraction row (2023-08),
    d7 consulta p4 (2023-02).
    """
    load_municipalities(db, fixtures_dir / "municipalities_sample.geojson", "CODIGO_INE", "NOMBRE", "PROVINCIA")
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO municipalities (ine_code, name, province, geom, area_ha) "
            f"VALUES ('41091', 'Sevilla', 'Sevilla', ST_Multi(ST_GeomFromText('{SEVILLA_SQUARE}', 4326)), 14000)"
        )
    db.commit()
    d = {
        "d1": _doc(db, "d1", date(2023, 1, 10), "no_aplica"),
        "d2": _doc(db, "d2", date(2023, 6, 5), "favorable_condicionada"),
        "d3": _doc(db, "d3", date(2023, 6, 20), "no_aplica"),
        "d4": _doc(db, "d4", date(2023, 7, 1), "no_aplica"),
        "d5": _doc(db, "d5", date(2023, 6, 25), "favorable_condicionada"),
        "d6": _doc(db, "d6", date(2023, 8, 3), None),
        "d7": _doc(db, "d7", date(2023, 2, 14), "no_aplica"),
    }
    projects = [
        (1, "P1", "solar_fv", 100, 200, "favorable_condicionada", d["d2"], ["29084", "41091"]),
        (2, "P2", "linea_evacuacion", 40, None, "favorable_condicionada", d["d5"], ["29084"]),
        (3, "P3", "solar_fv", None, None, "desconocido", d["d3"], ["29067"]),
        (4, "P4", "eolica", 30, None, "en_consulta", d["d7"], []),
    ]
    links = [
        (1, d["d1"], "consulta"), (1, d["d2"], "aau"), (3, d["d3"], "aau"), (1, d["d4"], "modificacion"),
        (2, d["d5"], "dia"), (1, d["d6"], "aau"), (4, d["d7"], "consulta"),
    ]
    with db.cursor() as cur:
        for pid, name, tech, mw, ha, status, status_doc, ines in projects:
            cur.execute(
                "INSERT INTO projects (id, canonical_name, technology, mw_nominal, hectares, status, status_document_id, "
                "first_seen, last_seen) VALUES (%s, %s, %s, %s, %s, %s, %s, '2023-01-01', '2023-08-31')",
                (pid, name, tech, mw, ha, status, status_doc),
            )
            for ine in ines:
                cur.execute("INSERT INTO project_municipalities (project_id, ine_code) VALUES (%s, %s)", (pid, ine))
        for pid, doc_id, role in links:
            cur.execute(
                "INSERT INTO project_documents (project_id, document_id, role, match_score, match_reason) "
                "VALUES (%s, %s, %s, 1.0, 'test')",
                (pid, doc_id, role),
            )
        # Covers the Ronda fixture square only.
        cur.execute(
            "INSERT INTO protected_areas (site_code, name, type, geom) VALUES "
            "('ES0000001', 'SIERRA', 'ZEPA', ST_Multi(ST_GeomFromText("
            "'POLYGON((-5.25 36.75,-5.15 36.75,-5.15 36.85,-5.25 36.85,-5.25 36.75))', 4326))), "
            "('ES0000009', 'LAGUNA', 'ZEC', ST_Multi(ST_GeomFromText("
            "'POLYGON((-3.0 38.0,-2.9 38.0,-2.9 38.1,-3.0 38.1,-3.0 38.0))', 4326)))"
        )
    db.commit()
    return d


def _rows(db, sql: str) -> list[dict]:
    with db.cursor() as cur:
        cur.execute(sql)
        return [dict(r) for r in cur.fetchall()]


def test_evacuation_line_counts_as_project_but_not_as_mw(db, fixtures_dir):
    seed_slice3(db, fixtures_dir)
    run_aggregate(db)
    ms = _rows(db, "SELECT ine_code, status, technology, project_count, mw_nominal, mw_count "
                   "FROM municipality_stats ORDER BY ine_code, status, technology")
    assert ms == [
        {"ine_code": "29067", "status": "desconocido", "technology": "solar_fv", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0},
        {"ine_code": "29084", "status": "favorable_condicionada", "technology": "linea_evacuacion", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0},
        {"ine_code": "29084", "status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1},
        {"ine_code": "41091", "status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1},
    ]
    pa = _rows(db, "SELECT site_code, status, technology, project_count, mw_nominal, mw_count "
                   "FROM protected_area_stats ORDER BY site_code, technology")
    assert pa == [
        {"site_code": "ES0000001", "status": "favorable_condicionada", "technology": "linea_evacuacion", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0},
        {"site_code": "ES0000001", "status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1},
    ]
    pm = _rows(db, "SELECT province, month, verdict, project_count, mw_nominal FROM province_monthly "
                   "WHERE province = 'Málaga' AND verdict = 'favorable_condicionada'")
    assert pm == [{"province": "Málaga", "month": date(2023, 6, 1), "verdict": "favorable_condicionada", "project_count": 2, "mw_nominal": 100.0}]


def test_projects_for_aggregates_nulls_only_line_mw(db, fixtures_dir):
    seed_slice3(db, fixtures_dir)
    view = _rows(db, "SELECT id, technology, mw_nominal FROM projects_for_aggregates ORDER BY id")
    assert view == [
        {"id": 1, "technology": "solar_fv", "mw_nominal": 100.0},
        {"id": 2, "technology": "linea_evacuacion", "mw_nominal": None},
        {"id": 3, "technology": "solar_fv", "mw_nominal": None},
        {"id": 4, "technology": "eolica", "mw_nominal": 30.0},
    ]


def test_province_stats_counts_multi_province_projects_once_in_andalucia(db, fixtures_dir):
    seed_slice3(db, fixtures_dir)
    run_aggregate(db)
    rows = _rows(db, "SELECT scope, status, technology, project_count, mw_nominal, mw_count "
                     "FROM province_stats ORDER BY scope, status, technology")
    assert rows == [
        {"scope": "Andalucía", "status": "desconocido", "technology": "solar_fv", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0},
        {"scope": "Andalucía", "status": "en_consulta", "technology": "eolica", "project_count": 1, "mw_nominal": 30.0, "mw_count": 1},
        {"scope": "Andalucía", "status": "favorable_condicionada", "technology": "linea_evacuacion", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0},
        {"scope": "Andalucía", "status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1},
        {"scope": "Málaga", "status": "desconocido", "technology": "solar_fv", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0},
        {"scope": "Málaga", "status": "favorable_condicionada", "technology": "linea_evacuacion", "project_count": 1, "mw_nominal": 0.0, "mw_count": 0},
        {"scope": "Málaga", "status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1},
        {"scope": "Sevilla", "status": "favorable_condicionada", "technology": "solar_fv", "project_count": 1, "mw_nominal": 100.0, "mw_count": 1},
    ]


def test_ha_count_counts_projects_with_declared_hectares(db, fixtures_dir):
    # Only P1 declares hectares; P4 declares MW but no surface, so its cell has
    # mw_count 1 and ha_count 0: a missing figure, not a measured zero.
    seed_slice3(db, fixtures_dir)
    run_aggregate(db)
    ms = _rows(db, "SELECT ine_code, technology, hectares, ha_count FROM municipality_stats ORDER BY ine_code, status, technology")
    assert ms == [
        {"ine_code": "29067", "technology": "solar_fv", "hectares": 0.0, "ha_count": 0},
        {"ine_code": "29084", "technology": "linea_evacuacion", "hectares": 0.0, "ha_count": 0},
        {"ine_code": "29084", "technology": "solar_fv", "hectares": 200.0, "ha_count": 1},
        {"ine_code": "41091", "technology": "solar_fv", "hectares": 200.0, "ha_count": 1},
    ]
    pa = _rows(db, "SELECT technology, hectares, ha_count FROM protected_area_stats ORDER BY site_code, technology")
    assert pa == [
        {"technology": "linea_evacuacion", "hectares": 0.0, "ha_count": 0},
        {"technology": "solar_fv", "hectares": 200.0, "ha_count": 1},
    ]
    ps = _rows(db, "SELECT status, technology, hectares, mw_count, ha_count FROM province_stats "
                   "WHERE scope = 'Andalucía' ORDER BY status, technology")
    assert ps == [
        {"status": "desconocido", "technology": "solar_fv", "hectares": 0.0, "mw_count": 0, "ha_count": 0},
        {"status": "en_consulta", "technology": "eolica", "hectares": 0.0, "mw_count": 1, "ha_count": 0},
        {"status": "favorable_condicionada", "technology": "linea_evacuacion", "hectares": 0.0, "mw_count": 0, "ha_count": 0},
        {"status": "favorable_condicionada", "technology": "solar_fv", "hectares": 200.0, "mw_count": 1, "ha_count": 1},
    ]


def test_monthly_events_maps_roles_to_events(db, fixtures_dir):
    seed_slice3(db, fixtures_dir)
    run_aggregate(db)
    rows = _rows(db, "SELECT month, scope, technology, event, document_count FROM monthly_events "
                     "WHERE scope = 'Andalucía' ORDER BY month, technology, event")
    assert rows == [
        {"month": date(2023, 1, 1), "scope": "Andalucía", "technology": "solar_fv", "event": "consulta", "document_count": 1},
        {"month": date(2023, 2, 1), "scope": "Andalucía", "technology": "eolica", "event": "consulta", "document_count": 1},
        {"month": date(2023, 6, 1), "scope": "Andalucía", "technology": "linea_evacuacion", "event": "favorable_condicionada", "document_count": 1},
        {"month": date(2023, 6, 1), "scope": "Andalucía", "technology": "solar_fv", "event": "favorable_condicionada", "document_count": 1},
        {"month": date(2023, 6, 1), "scope": "Andalucía", "technology": "solar_fv", "event": "sin_veredicto", "document_count": 1},
        # d6 has no extraction row at all: still a decision document, verdict unread.
        {"month": date(2023, 8, 1), "scope": "Andalucía", "technology": "solar_fv", "event": "sin_veredicto", "document_count": 1},
    ]
    # d4 (modificacion, 2023-07) is excluded everywhere.
    assert _rows(db, "SELECT * FROM monthly_events WHERE month = '2023-07-01'") == []


def test_monthly_events_counts_a_two_province_document_in_each_province_once_in_andalucia(db, fixtures_dir):
    seed_slice3(db, fixtures_dir)
    run_aggregate(db)
    rows = _rows(db, "SELECT scope, document_count FROM monthly_events "
                     "WHERE month = '2023-01-01' AND event = 'consulta' ORDER BY scope")
    assert rows == [
        {"scope": "Andalucía", "document_count": 1},
        {"scope": "Málaga", "document_count": 1},
        {"scope": "Sevilla", "document_count": 1},
    ]
    # p4 has no municipality: its consulta counts regionally only.
    feb = _rows(db, "SELECT scope FROM monthly_events WHERE month = '2023-02-01'")
    assert feb == [{"scope": "Andalucía"}]


def test_monthly_events_counts_a_document_shared_by_two_projects_once(db, fixtures_dir):
    seed_slice3(db, fixtures_dir)
    with db.cursor() as cur:
        cur.execute("SELECT id FROM raw_documents WHERE source_id = 'd3'")
        d3_id = cur.fetchone()["id"]
        # d3 already links to p3 (aau, solar_fv). Link it to p1 too (also
        # solar_fv): one document, two projects, same technology, same event.
        cur.execute(
            "INSERT INTO project_documents (project_id, document_id, role, match_score, match_reason) "
            "VALUES (1, %s, 'aau', 1.0, 'test')",
            (d3_id,),
        )
    db.commit()
    run_aggregate(db)
    rows = _rows(db, "SELECT document_count FROM monthly_events "
                     "WHERE month = '2023-06-01' AND scope = 'Andalucía' "
                     "AND technology = 'solar_fv' AND event = 'sin_veredicto'")
    assert rows == [{"document_count": 1}]
