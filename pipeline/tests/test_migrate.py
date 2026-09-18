from impacto.db.migrate import apply_migrations
from tests.conftest import MIGRATIONS


def test_migrations_create_tables_and_are_idempotent(db):
    with db.cursor() as cur:
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
        names = {r["tablename"] for r in cur.fetchall()}
    for expected in ["raw_documents", "extractions", "projects", "municipalities", "municipality_stats"]:
        assert expected in names
    assert apply_migrations(db, MIGRATIONS) == []
