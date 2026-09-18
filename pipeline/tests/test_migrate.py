import pytest

from impacto.db.migrate import apply_migrations
from tests.conftest import MIGRATIONS


def test_migrations_create_tables_and_are_idempotent(db):
    with db.cursor() as cur:
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
        names = {r["tablename"] for r in cur.fetchall()}
    for expected in ["raw_documents", "extractions", "projects", "municipalities", "municipality_stats"]:
        assert expected in names
    assert apply_migrations(db, MIGRATIONS) == []


def test_failing_migration_rolls_back_and_names_the_file(db, tmp_path):
    (tmp_path / "001_ok.sql").write_text("CREATE TABLE t_ok (id int);", encoding="utf-8")
    (tmp_path / "002_bad.sql").write_text("CREATE TABLE t_bad (;", encoding="utf-8")

    with pytest.raises(RuntimeError, match="002_bad.sql"):
        apply_migrations(db, tmp_path)

    with db.cursor() as cur:
        cur.execute("SELECT 1")
        assert cur.fetchone() is not None

        cur.execute("SELECT name FROM schema_migrations WHERE name = %s", ("002_bad.sql",))
        assert cur.fetchone() is None

        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 't_ok'")
        assert cur.fetchone() is None
