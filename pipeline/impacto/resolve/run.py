from __future__ import annotations

import argparse
import logging
from datetime import UTC, date, datetime

import psycopg

from impacto.db.connect import connect
from impacto.extract.capacity import with_capacity
from impacto.extract.operative import find_operative, operative_override, title_override
from impacto.extract.validate import check_generation, with_generation
from impacto.resolve.blocking import (
    Notice,
    candidate_pairs,
    correction_targets,
    developer_keys,
    plant_key,
    same_name,
)
from impacto.resolve.model import Record
from impacto.resolve.scoring import THRESHOLD, conflict, same_plant_evidence, score_pair
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


def resolve(
    records: list[Record], overrides: dict[int, str], corrections: dict[int, int] | None = None
) -> list[list[Record]]:
    """`corrections`: correction document id -> the document it corrects (blocking.correction_targets)."""
    index = {r.document_id: i for i, r in enumerate(records)}
    isolated = {index[d] for d, key in overrides.items() if key == "new" and d in index}
    keyed = {index[d]: key for d, key in overrides.items() if key != "new" and d in index}
    uf = UnionFind(len(records))
    members = {i: [i] for i in range(len(records))}

    def join(i: int, j: int) -> None:
        ri, rj = uf.find(i), uf.find(j)
        if ri != rj:
            uf.union(ri, rj)
            members[uf.find(ri)] = members.pop(ri) + members.pop(rj)

    def apart(a: int, b: int) -> bool:
        # Different keys mean different projects, however alike the documents
        # score (sister plants share size, municipality and most of the name).
        if a in keyed and b in keyed:
            return keyed[a] != keyed[b]
        if conflict(records[a], records[b]) is None:
            return False
        # A key may join documents that conflict (Ronda I and Ronda II as one
        # project); a document that conflicts with one keyed member still
        # belongs to the group if it shares an expediente with another.
        if a in keyed or b in keyed:
            k, other = (a, b) if a in keyed else (b, a)
            exp = records[other].expediente
            return not (exp and any(records[m].expediente == exp for m in by_key[keyed[k]]))
        return True

    # An override key is authoritative: its documents form one project first,
    # even across a conflict (a plant re-authorised under a new number).
    by_key: dict[str, list[int]] = {}
    for i, key in keyed.items():
        by_key.setdefault(key, []).append(i)
    for idxs in by_key.values():
        for other in idxs[1:]:
            join(idxs[0], other)

    # A correction belongs to the document it corrects, whatever its own
    # extraction says (a ministry correction often names no municipality or
    # developer). Override keys still decide: a correction keyed apart from
    # its target, or isolated by hand, stays where it was put.
    for c, t in (corrections or {}).items():
        if c not in index or t not in index:
            continue
        i, j = index[c], index[t]
        if i in isolated or j in isolated or (i in keyed and j in keyed and keyed[i] != keyed[j]):
            continue
        join(i, j)

    # Then the strongest matches first; two groups merge only if no document
    # of one conflicts with a document of the other, so a document matching
    # two plants (a common substation) joins one and cannot chain them.
    scored = []
    for i, j in candidate_pairs(records):
        if i in isolated or j in isolated:
            continue
        score, _ = score_pair(records[i], records[j])
        if score >= THRESHOLD:
            scored.append((-score, i, j))
    for _, i, j in sorted(scored):
        ri, rj = uf.find(i), uf.find(j)
        if ri == rj or any(apart(a, b) for a in members[ri] for b in members[rj]):
            continue
        # A plant someone grouped by hand only takes in a new document on
        # positive evidence (the same procedure, a near-identical name): a
        # match on place name, size and municipality alone pulled other
        # plants into hand-made groups (Tabernas 100 into Tabernas Solar 2).
        keyed_i = any(m in keyed for m in members[ri])
        keyed_j = any(m in keyed for m in members[rj])
        if keyed_i != keyed_j and not same_plant_evidence(records[i], records[j]):
            continue
        join(i, j)

    # Last, namesakes scoring cannot see: a consultation notice whose
    # municipality the model did not read (Saucito in "Tharsis", a village of
    # Alosno), a plant one notice names inside another's list of plants (Rey I
    # in "Rey I, II, III y IV"), a later notice with no municipality (Lirios).
    # Blocking pairs names only within a shared municipality, and a name alone
    # scores under the threshold. Two groups join when one developer and one
    # plant name are common to both, and nothing marks them as two: a
    # conflict, different municipalities, a line against a plant, wind against
    # solar. Each must be the other's only namesake; a group with several
    # stays apart and the review queue lists it (review.namesake_groups).
    roots = [r for r in sorted({uf.find(i) for i in range(len(records))}) if not any(m in isolated for m in members[r])]
    for a, b in namesake_pairs([[records[m] for m in members[r]] for r in roots]):
        ra, rb = roots[a], roots[b]
        if any(apart(x, y) for x in members[ra] for y in members[rb]):
            continue
        keyed_a = any(m in keyed for m in members[ra])
        keyed_b = any(m in keyed for m in members[rb])
        # A hand-made group takes in a namesake only on the same whole name.
        if keyed_a != keyed_b and not _same_whole_name([records[m] for m in members[ra]], [records[m] for m in members[rb]]):
            continue
        join(ra, rb)
    return [[records[i] for i in g] for g in uf.groups()]


def _same_whole_name(a: list[Record], b: list[Record]) -> bool:
    return bool({plant_key(r.name) for r in a} & {plant_key(r.name) for r in b} - {""})


def _kind(group: list[Record]) -> str:
    return "linea" if any(r.technology == "linea_evacuacion" for r in group) else "planta"


def _generation(group: list[Record]) -> str | None:
    """The group's one technology when its documents read only "eolica" or only "solar_fv", else None."""
    kinds = {r.technology for r in group} & {"eolica", "solar_fv", "hibrida"}
    return kinds.pop() if len(kinds) == 1 and kinds != {"hibrida"} else None


def namesakes(a: list[Record], b: list[Record]) -> bool:
    """Whether two groups name one plant of one developer, with nothing to tell them apart."""
    if not {k for r in a for k in developer_keys(r.developer)} & {k for r in b for k in developer_keys(r.developer)}:
        return False
    if not any(same_name(x.name, y.name) for x in a if x.name for y in b if y.name):
        return False
    if _kind(a) != _kind(b):
        return False
    ga, gb = _generation(a), _generation(b)
    if ga and gb and ga != gb:
        return False
    munis_a = frozenset().union(*(r.municipalities for r in a))
    munis_b = frozenset().union(*(r.municipalities for r in b))
    return not (munis_a and munis_b) or bool(munis_a & munis_b)


def namesake_pairs(groups: list[list[Record]]) -> list[tuple[int, int]]:
    """Index pairs of groups that are each other's only namesake (see namesakes)."""
    by_developer: dict[str, list[int]] = {}
    for i, g in enumerate(groups):
        for k in {k for r in g for k in developer_keys(r.developer)}:
            by_developer.setdefault(k, []).append(i)
    found: dict[int, set[int]] = {}
    for idxs in by_developer.values():
        for x in idxs:
            for y in idxs:
                if x < y and y not in found.get(x, ()) and namesakes(groups[x], groups[y]):
                    found.setdefault(x, set()).add(y)
                    found.setdefault(y, set()).add(x)
    return sorted((x, y) for x, ys in found.items() for y in ys if x < y and len(ys) == 1 and len(found[y]) == 1)


def load_records(conn: psycopg.Connection) -> list[Record]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT d.id, d.published_at, d.title, d.text, e.payload FROM extractions e JOIN raw_documents d ON d.id = e.document_id "
            "WHERE e.status = 'ok' ORDER BY d.published_at, d.id"
        )
        rows = cur.fetchall()
    return [
        Record.from_extraction(
            r["id"],
            r["published_at"],
            # Re-applied here like the operative rule, so stored extractions
            # get the generation check without a new model call.
            with_generation(with_capacity(with_operative(r["payload"], r["text"], r["title"]), r["title"], r["text"])),
        )
        for r in rows
    ]


def load_corrections(conn: psycopg.Connection) -> dict[int, int]:
    """Correction document id -> the document it corrects, among documents with an extraction."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT d.id, d.source, d.source_id, d.published_at, d.title, d.text FROM raw_documents d "
            "JOIN extractions e ON e.document_id = d.id WHERE e.status = 'ok'"
        )
        rows = cur.fetchall()
    return correction_targets(
        [Notice(r["id"], r["source"], r["source_id"], r["published_at"], r["title"], r["text"] or "") for r in rows]
    )


def with_operative(payload: dict, text: str, title: str = "") -> dict:
    """The payload with the operative-sentence rule applied as extraction applies it.

    Re-applied on every resolve, so a rule added after a document was
    extracted reaches it without a new (paid) model call. The title is read
    only when the body states no operative sentence: many BOJA publication
    notices say "se da publicidad a la nueva autorización ambiental unificada
    otorgada" in the title alone, and some grants are titled "por el que se
    otorga autorización ambiental unificada" (operative.title_override).
    """
    hit = operative_override(payload.get("doc_type", "otro"), text)
    if hit is None and find_operative(text) is None:
        hit = title_override(payload.get("doc_type", "otro"), title)
    return payload if hit is None else {**payload, "doc_type": hit.doc_type, "verdict": hit.verdict}


def load_overrides(conn: psycopg.Connection) -> dict[int, str]:
    with conn.cursor() as cur:
        cur.execute("SELECT document_id, group_key FROM resolution_overrides")
        return {r["document_id"]: r["group_key"] for r in cur.fetchall()}


def load_name_overrides(conn: psycopg.Connection) -> dict[int, str]:
    with conn.cursor() as cur:
        cur.execute("SELECT document_id, name FROM project_name_overrides")
        return {r["document_id"]: r["name"] for r in cur.fetchall()}


def _latest_labelled(group: list[Record], attr: str):
    """The newest figure the gazette labels as nominal or peak, else the newest of any kind.

    A later notice that prints "109,5039 MW" with no label does not override
    a declaration's "109,52 MWp (90,75 MWn)".
    """
    labelled = [r for r in group if getattr(r, f"{attr}_labelled")]
    return _latest_with(labelled, attr) or _latest_with(group, attr)


def _latest_with(group: list[Record], attr: str):
    for r in sorted(group, key=lambda r: (r.published_at, r.document_id), reverse=True):
        value = getattr(r, attr)
        if value not in (None, "", frozenset()):
            return value
    return None


def project_generation(group: list[Record], name: str) -> tuple[str, int | None]:
    """The project's technology and turbines: the newest each document reads, checked against the project's name.

    Each document was checked against its own name (with_generation); the
    newest turbines may still come from a notice that names no plant (a BOJA
    AAU notice for Retuerta), so the project's name is read again.
    """
    technology, turbines, _ = check_generation(name, _latest_with(group, "technology"), _latest_with(group, "turbines"))
    # "otra" rather than NULL: the exports and the web enum have no empty technology.
    return technology or "otra", turbines


def _match_reason(group: list[Record], r: Record, corrections: dict[int, int] | None = None) -> tuple[float, str]:
    if len(group) == 1:
        return (1.0, "single")
    # A correction was joined to its target by the notice it names, not by a
    # score_pair match: the link is as certain as the reference that made it.
    links = corrections or {}
    ids = {m.document_id for m in group}
    if links.get(r.document_id) in ids or any(links.get(m.document_id) == r.document_id for m in group):
        return (1.0, "correction")
    best = (0.0, "single")
    for other in group:
        if other is r:
            continue
        score, reason = score_pair(r, other)
        if score > best[0]:
            best = (score, reason)
    # Joined as a namesake (resolve): the score stays as low as it is, so the
    # weekly check lists the document as a weak match, and the reason says why.
    if best[0] < THRESHOLD and any(other is not r and namesakes([r], [other]) for other in group):
        return (best[0], "namesake")
    return best


def write_projects(
    conn: psycopg.Connection,
    groups: list[list[Record]],
    today: date | None = None,
    names: dict[int, str] | None = None,
    corrections: dict[int, int] | None = None,
) -> int:
    names = names or {}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT ine_code, name FROM municipalities")
            ine_by_name = {normalize(r["name"]): r["ine_code"] for r in cur.fetchall()}
            cur.execute("DELETE FROM project_municipalities")
            cur.execute("DELETE FROM project_documents")
            cur.execute("DELETE FROM projects")
            for group in groups:
                status, status_doc = derive_status(group, today, corrections)
                # An impact declaration names the project it assesses; later
                # notices ("el proyecto que se cita") often carry a looser name.
                declarations = [r for r in group if r.doc_type == "dia"]
                named = sorted(
                    (r for r in group if r.document_id in names),
                    key=lambda r: (r.published_at, r.document_id),
                )
                name = (
                    (names[named[-1].document_id] if named else None)
                    or _latest_with(declarations, "name")
                    or _latest_with(group, "name")
                    or f"Proyecto sin nombre ({group[0].document_id})"
                )
                # The id is the group's minimum document id: document ids
                # never change, so a project keeps its id across the weekly
                # rebuild of this table and links to it stay valid. The
                # bigserial default is bypassed on purpose.
                project_id = min(r.document_id for r in group)
                technology, turbines = project_generation(group, name)
                cur.execute(
                    """
                    INSERT INTO projects (id, canonical_name, developer, technology, mw_peak, mw_nominal, hectares,
                                          turbines, status, status_document_id, first_seen, last_seen)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        project_id,
                        name,
                        _latest_with(group, "developer"),
                        technology,
                        _latest_labelled(group, "mw_peak"),
                        _latest_labelled(group, "mw_nominal"),
                        _latest_with(group, "hectares"),
                        turbines,
                        status,
                        status_doc,
                        min(r.published_at for r in group),
                        max(r.published_at for r in group),
                    ),
                )
                for r in group:
                    score, reason = _match_reason(group, r, corrections)
                    cur.execute(
                        "INSERT INTO project_documents (project_id, document_id, role, match_score, match_reason) VALUES (%s, %s, %s, %s, %s)",
                        (
                            project_id,
                            r.document_id,
                            ROLE_BY_TYPE.get(r.doc_type, "otro"),
                            score,
                            reason,
                        ),
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


def run_resolve(conn: psycopg.Connection, today: date | None = None) -> int:
    """`today` dates stale consultations (status.py); the run's date unless given."""
    records = load_records(conn)
    corrections = load_corrections(conn)
    groups = resolve(records, load_overrides(conn), corrections)
    n = write_projects(conn, groups, today or datetime.now(UTC).date(), load_name_overrides(conn), corrections)
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
