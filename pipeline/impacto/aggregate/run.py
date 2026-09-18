from __future__ import annotations

import argparse
import logging
from pathlib import Path

import psycopg

from impacto.db.connect import connect
from impacto.settings import load_settings

log = logging.getLogger(__name__)
DEFAULT_SQL_DIR = Path(__file__).resolve().parents[3] / "db" / "aggregate"


def run_aggregate(conn: psycopg.Connection, sql_dir: Path = DEFAULT_SQL_DIR) -> None:
    try:
        with conn.cursor() as cur:
            for path in sorted(sql_dir.glob("*.sql")):
                log.info("running %s", path.name)
                cur.execute(path.read_text(encoding="utf-8"))
    except Exception:
        conn.rollback()
        raise
    conn.commit()


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    argparse.ArgumentParser(prog="impacto aggregate").parse_args(argv)
    settings = load_settings()
    with connect(settings.db_dsn) as conn:
        run_aggregate(conn)
    print("aggregates rebuilt")
    return 0
