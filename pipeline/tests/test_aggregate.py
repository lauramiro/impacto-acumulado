from datetime import date

from impacto.aggregate.run import run_aggregate
from impacto.db.documents import RawDocument, save_extraction, upsert_raw_document
from impacto.resolve.run import run_resolve
from tests.test_resolve_run import seed


def test_aggregate_builds_stats(db, fixtures_dir):
    seed(db, fixtures_dir)
    run_resolve(db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO sensitivity_zones (klass, technology, geom) VALUES "
            "('alta', 'ftv', ST_Multi(ST_GeomFromText("
            "'POLYGON((-5.2 36.7,-5.15 36.7,-5.15 36.8,-5.2 36.8,-5.2 36.7))', 4326)))"
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
        cur.execute("SELECT site_code, status, project_count FROM protected_area_stats")
        pa = cur.fetchall()
        cur.execute("SELECT province, verdict, mw_nominal FROM province_monthly ORDER BY month")
        pm = cur.fetchall()
    assert [(s["ine_code"], s["status"], s["mw_nominal"]) for s in stats] == [
        ("29067", "desfavorable", 50.0),
        ("29084", "favorable_condicionada", 93.0),
    ]
    assert 0.4 < share < 0.6
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
