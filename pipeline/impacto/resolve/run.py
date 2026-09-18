from __future__ import annotations

import argparse
import logging

import psycopg

from impacto.db.connect import connect
from impacto.resolve.blocking import candidate_pairs
from impacto.resolve.model import Record
from impacto.resolve.scoring import THRESHOLD, score_pair
from impacto.resolve.status import derive_status
from impacto.resolve.unionfind import UnionFind
from impacto.settings import load_settings
from impacto.text import normalize

log = logging.getLogger(__name__)

ROLE_BY_TYPE = {
    "informacion_publica": "consulta",
    "informe_impacto": "informe",
    "dia": "dia",
    "aau": "aau",
    "modificacion": "modificacion",
    "caducidad": "caducidad",
}


def resolve(records: list[Record], overrides: dict[int, str]) -> list[list[Record]]:
    index = {r.document_id: i for i, r in enumerate(records)}
    isolated = {index[d] for d, key in overrides.items() if key == "new" and d in index}
    uf = UnionFind(len(records))
    for i, j in candidate_pairs(records):
        if i in isolated or j in isolated:
            continue
        score, _ = score_pair(records[i], records[j])
        if score >= THRESHOLD:
            uf.union(i, j)
    by_key: dict[str, list[int]] = {}
    for d, key in overrides.items():
        if key != "new" and d in index:
            by_key.setdefault(key, []).append(index[d])
    for idxs in by_key.values():
        for other in idxs[1:]:
            uf.union(idxs[0], other)
    return [[records[i] for i in g] for g in uf.groups()]


def load_records(conn: psycopg.Connection) -> list[Record]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT d.id, d.published_at, e.payload FROM extractions e JOIN raw_documents d ON d.id = e.document_id WHERE e.status = 'ok' ORDER BY d.published_at, d.id"
        )
        rows = cur.fetchall()
    return [Record.from_extraction(r["id"], r["published_at"], r["payload"]) for r in rows]


def load_overrides(conn: psycopg.Connection) -> dict[int, str]:
    with conn.cursor() as cur:
        cur.execute("SELECT document_id, group_key FROM resolution_overrides")
        return {r["document_id"]: r["group_key"] for r in cur.fetchall()}


def _latest_with(group: list[Record], attr: str):
    for r in sorted(group, key=lambda r: (r.published_at, r.document_id), reverse=True):
        value = getattr(r, attr)
        if value not in (None, "", frozenset()):
            return value
    return None


def _match_reason(group: list[Record], r: Record) -> tuple[float, str]:
    best = (0.0, "single")
    for other in group:
        if other is r:
            continue
        score, reason = score_pair(r, other)
        if score > best[0]:
            best = (score, reason)
    return best if len(group) > 1 else (1.0, "single")


def write_projects(conn: psycopg.Connection, groups: list[list[Record]]) -> int:
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT ine_code, name FROM municipalities")
            ine_by_name = {normalize(r["name"]): r["ine_code"] for r in cur.fetchall()}
            cur.execute("DELETE FROM project_municipalities")
            cur.execute("DELETE FROM project_documents")
            cur.execute("DELETE FROM projects")
            for group in groups:
                status, status_doc = derive_status(group)
                name = _latest_with(group, "name") or f"Proyecto sin nombre ({group[0].document_id})"
                cur.execute(
                    """
                    INSERT INTO projects (canonical_name, developer, technology, mw_peak, mw_nominal, hectares, turbines,
                                          status, status_document_id, first_seen, last_seen)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                    """,
                    (
                        name,
                        _latest_with(group, "developer"),
                        _latest_with(group, "technology"),
                        _latest_with(group, "mw_peak"),
                        _latest_with(group, "mw_nominal"),
                        _latest_with(group, "hectares"),
                        _latest_with(group, "turbines"),
                        status,
                        status_doc,
                        min(r.published_at for r in group),
                        max(r.published_at for r in group),
                    ),
                )
                project_id = cur.fetchone()["id"]
                for r in group:
                    score, reason = _match_reason(group, r)
                    cur.execute(
                        "INSERT INTO project_documents (project_id, document_id, role, match_score, match_reason) VALUES (%s, %s, %s, %s, %s)",
                        (project_id, r.document_id, ROLE_BY_TYPE.get(r.doc_type, "otro"), score, reason),
                    )
                munis = set()
                for r in group:
                    munis |= r.municipalities
                for m in munis:
                    ine = ine_by_name.get(m)
                    if ine:
                        cur.execute(
                            "INSERT INTO project_municipalities (project_id, ine_code) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                            (project_id, ine),
                        )
    except Exception:
        conn.rollback()
        raise
    conn.commit()
    return len(groups)


def run_resolve(conn: psycopg.Connection) -> int:
    records = load_records(conn)
    groups = resolve(records, load_overrides(conn))
    n = write_projects(conn, groups)
    log.info("resolved %d document(s) into %d project(s)", len(records), n)
    return n


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    argparse.ArgumentParser(prog="impacto resolve").parse_args(argv)
    settings = load_settings()
    with connect(settings.db_dsn) as conn:
        n = run_resolve(conn)
    print(f"resolved into {n} project(s)")
    return 0
