from __future__ import annotations

from pathlib import Path

import psycopg

from impacto.db.connect import connect
from impacto.settings import load_settings

DEFAULT_DIR = Path(__file__).resolve().parents[3] / "db" / "migrations"


def apply_migrations(conn: psycopg.Connection, migrations_dir: Path = DEFAULT_DIR) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        cur.execute("SELECT name FROM schema_migrations")
        done = {r["name"] for r in cur.fetchall()}
        applied: list[str] = []
        for path in sorted(migrations_dir.glob("*.sql")):
            if path.name in done:
                continue
            cur.execute(path.read_text(encoding="utf-8"))
            cur.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
            applied.append(path.name)
    conn.commit()
    return applied


def main(argv: list[str]) -> int:
    settings = load_settings()
    with connect(settings.db_dsn) as conn:
        applied = apply_migrations(conn)
    print(f"applied {len(applied)} migration(s): {applied}")
    return 0
