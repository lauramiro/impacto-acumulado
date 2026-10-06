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


def test_boe_html_url_migration_moves_stored_xml_links(db):
    rows = [
        ("boe", "BOE-A-2023-2922", "https://www.boe.es/diario_boe/xml.php?id=BOE-A-2023-2922"),
        ("boe", "BOE-B-2021-2374", "https://www.boe.es/diario_boe/xml.php?id=BOE-B-2021-2374"),
        ("boe", "BOE-A-2024-1", "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-1"),
        ("boja", "2024/10/1", "https://www.juntadeandalucia.es/eboja/2024/10/1.pdf"),
    ]
    with db.cursor() as cur:
        for source, source_id, url in rows:
            cur.execute(
                "INSERT INTO raw_documents (source, source_id, published_at, title, url, text, content_hash)"
                " VALUES (%s, %s, '2024-01-01', 't', %s, 'x', 'h')",
                (source, source_id, url),
            )
        cur.execute((MIGRATIONS / "008_boe_html_urls.sql").read_text(encoding="utf-8"))
        cur.execute("SELECT source_id, url FROM raw_documents ORDER BY source_id")
        got = {r["source_id"]: r["url"] for r in cur.fetchall()}
    assert got == {
        "BOE-A-2023-2922": "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-2922",
        "BOE-B-2021-2374": "https://www.boe.es/diario_boe/txt.php?id=BOE-B-2021-2374",
        "BOE-A-2024-1": "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-1",
        "2024/10/1": "https://www.juntadeandalucia.es/eboja/2024/10/1.pdf",
    }
