from datetime import date

from impacto.db.documents import RawDocument, save_extraction, upsert_raw_document
from impacto.reference.load import load_municipalities
from impacto.resolve.run import run_resolve


def seed(db, fixtures_dir):
    load_municipalities(db, fixtures_dir / "municipalities_sample.geojson", "CODIGO_INE", "NOMBRE", "PROVINCIA")
    docs = [
        ("A", date(2022, 1, 1), {"doc_type": "informacion_publica", "verdict": "no_aplica", "project_name": "PSFV Ronda I",
                                  "expediente": "E1", "municipalities": [{"name": "Ronda", "province": "Málaga"}], "confidence": 0.8}),
        ("B", date(2023, 9, 18), {"doc_type": "dia", "verdict": "favorable_condicionada", "project_name": "Parque fotovoltaico Ronda I",
                                   "expediente": "E1", "technology": "solar_fv", "mw_nominal": 93, "hectares": 140.1,
                                   "municipalities": [{"name": "Ronda", "province": "Málaga"}], "confidence": 0.9}),
        ("C", date(2023, 5, 5), {"doc_type": "dia", "verdict": "desfavorable", "project_name": "Parque eólico Sierra Alta",
                                  "technology": "eolica", "mw_nominal": 50, "turbines": 10,
                                  "municipalities": [{"name": "Málaga", "province": "Málaga"}], "confidence": 0.9}),
    ]
    for source_id, day, payload in docs:
        upsert_raw_document(db, RawDocument("boe", source_id, day, "t", "u", "III", "o", "text " + source_id))
        with db.cursor() as cur:
            cur.execute("SELECT id FROM raw_documents WHERE source_id = %s", (source_id,))
            doc_id = cur.fetchone()["id"]
        save_extraction(db, doc_id, "stub", "v1", payload, payload["confidence"], None)


def test_run_resolve_builds_projects(db, fixtures_dir):
    seed(db, fixtures_dir)
    assert run_resolve(db) == 2
    with db.cursor() as cur:
        cur.execute("SELECT canonical_name, status, mw_nominal, technology, first_seen, last_seen FROM projects ORDER BY canonical_name")
        rows = cur.fetchall()
        cur.execute("SELECT count(*) AS n FROM project_documents")
        n_docs = cur.fetchone()["n"]
        cur.execute("SELECT p.canonical_name, m.ine_code FROM project_municipalities pm JOIN projects p ON p.id = pm.project_id JOIN municipalities m ON m.ine_code = pm.ine_code ORDER BY 1")
        links = cur.fetchall()
    assert [r["canonical_name"] for r in rows] == ["Parque eólico Sierra Alta", "Parque fotovoltaico Ronda I"]
    ronda = rows[1]
    assert ronda["status"] == "favorable_condicionada"
    assert ronda["mw_nominal"] == 93
    assert ronda["first_seen"] == date(2022, 1, 1)
    assert ronda["last_seen"] == date(2023, 9, 18)
    assert n_docs == 3
    assert [(l["canonical_name"], l["ine_code"]) for l in links] == [("Parque eólico Sierra Alta", "29067"), ("Parque fotovoltaico Ronda I", "29084")]


def test_run_resolve_is_idempotent(db, fixtures_dir):
    seed(db, fixtures_dir)
    run_resolve(db)
    assert run_resolve(db) == 2
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM projects")
        assert cur.fetchone()["n"] == 2


def _project_ids(db) -> dict[str, int]:
    with db.cursor() as cur:
        cur.execute("SELECT id, canonical_name FROM projects")
        return {r["canonical_name"]: r["id"] for r in cur.fetchall()}


def test_run_resolve_project_ids_are_deterministic(db, fixtures_dir):
    # A project's id is its group's minimum document id, so re-resolving
    # (which rebuilds the table) keeps ids stable and links to a project
    # in an exported file stay valid across weekly runs.
    seed(db, fixtures_dir)
    run_resolve(db)
    first = _project_ids(db)
    run_resolve(db)
    assert _project_ids(db) == first
    with db.cursor() as cur:
        cur.execute(
            "SELECT p.id, min(pd.document_id) AS earliest FROM projects p "
            "JOIN project_documents pd ON pd.project_id = p.id GROUP BY p.id"
        )
        rows = cur.fetchall()
    assert rows
    for row in rows:
        assert row["id"] == row["earliest"]


def test_run_resolve_falls_back_to_otra_when_no_document_names_a_technology(db, fixtures_dir):
    load_municipalities(db, fixtures_dir / "municipalities_sample.geojson", "CODIGO_INE", "NOMBRE", "PROVINCIA")
    payload = {"doc_type": "dia", "verdict": "favorable", "project_name": "Instalación sin tecnología",
               "municipalities": [{"name": "Ronda", "province": "Málaga"}], "confidence": 0.7}
    upsert_raw_document(db, RawDocument("boja", "D", date(2024, 2, 2), "t", "u", "III", "o", "text D"))
    with db.cursor() as cur:
        cur.execute("SELECT id FROM raw_documents WHERE source_id = 'D'")
        doc_id = cur.fetchone()["id"]
    save_extraction(db, doc_id, "stub", "v1", payload, payload["confidence"], None)
    assert run_resolve(db) == 1
    with db.cursor() as cur:
        cur.execute("SELECT technology FROM projects")
        assert cur.fetchone()["technology"] == "otra"
