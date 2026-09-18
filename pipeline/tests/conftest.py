import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

from impacto.db.connect import connect
from impacto.db.migrate import apply_migrations

load_dotenv(Path(__file__).resolve().parents[1] / "env.local", override=False)

MIGRATIONS = Path(__file__).resolve().parents[2] / "db" / "migrations"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def db():
    dsn = os.environ.get("IMPACTO_TEST_DB_DSN")
    if not dsn:
        pytest.skip("IMPACTO_TEST_DB_DSN not set")
    conn = connect(dsn)
    with conn.cursor() as cur:
        cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    conn.commit()
    apply_migrations(conn, MIGRATIONS)
    yield conn
    conn.rollback()
    conn.close()


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES
