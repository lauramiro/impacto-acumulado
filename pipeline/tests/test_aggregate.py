from impacto.aggregate.run import run_aggregate
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
