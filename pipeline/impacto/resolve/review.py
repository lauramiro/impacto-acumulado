"""Review queue: published projects whose documents may belong to several plants.

`impacto review-clusters` reads the current project groups and lists every
group that matches one of the rules below, with its documents, so a person
can split it with `resolution_overrides` (see docs/sources.md). The file is
for review, not publication: it goes to tmp/review/ locally and to a
workflow artifact in CI, and the weekly job summary carries the count.

Groups whose documents are all keyed in `resolution_overrides` were already
reviewed by hand; they are listed, marked as such, and left out of the count.
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from impacto.db.connect import connect
from impacto.resolve.blocking import procedure_key
from impacto.settings import load_settings
from impacto.text import normalize, tokens

DEFAULT_OUT = Path(__file__).resolve().parents[3] / "tmp" / "review" / "clusters.csv"

MANY_DOCUMENTS = 4
MW_SPREAD = 0.10
_PP = re.compile(r"\(?\bPP\.?\s*(\d+)\s*/\s*(\d{4})\)?", re.IGNORECASE)
DECISIONS = {"dia", "aau", "informe_impacto"}
VERDICTS = {"favorable", "favorable_condicionada", "desfavorable"}
# Words that name a kind of project rather than a project. A name made only
# of these, numbers and particles ("Planta solar fotovoltaica de 50 MW") names nothing.
_GENERIC = {
    "planta",
    "plantas",
    "parque",
    "parques",
    "proyecto",
    "proyectos",
    "instalacion",
    "instalaciones",
    "central",
    "centrales",
    "solar",
    "solares",
    "fotovoltaica",
    "fotovoltaicas",
    "fotovoltaico",
    "fotovoltaicos",
    "eolico",
    "eolica",
    "eolicos",
    "hibrida",
    "hibrido",
    "termosolar",
    "almacenamiento",
    "baterias",
    "sistema",
    "energia",
    "energias",
    "renovable",
    "renovables",
    "generacion",
    "electrica",
    "electrico",
    "infraestructura",
    "infraestructuras",
    "evacuacion",
    "linea",
    "lineas",
    "subestacion",
    "set",
    "mw",
    "mwp",
    "mwn",
    "kv",
    "psfv",
    "pfv",
    "fv",
    "pe",
    "hsf",
    "y",
    "e",
    "de",
    "del",
    "la",
    "las",
    "los",
    "el",
    "en",
    "con",
    "su",
    "sus",
    "para",
    "a",
    "al",
    "nueva",
    "nuevo",
    "ampliacion",
    "modificacion",
    "denominada",
    "denominado",
}


@dataclass(frozen=True)
class ReviewDoc:
    document_id: int
    published_at: date
    title: str
    doc_type: str
    verdict: str
    expediente: str | None
    mw: float | None
    municipalities: tuple[str, ...]
    override_key: str | None


@dataclass(frozen=True)
class Group:
    project_id: int
    name: str
    docs: tuple[ReviewDoc, ...]


def pp_numbers(titles) -> set[str]:
    return {f"{int(n)}/{y}" for t in titles for n, y in _PP.findall(t or "")}


def is_generic(name: str) -> bool:
    return all(t in _GENERIC or t.isdigit() for t in tokens(name))


def _procedure(expediente: str | None) -> str | None:
    """The expediente without modification suffixes, so "AAU/SE/12/21/M1" and "AAU/SE/12/21" are one file."""
    if not expediente:
        return None
    key = procedure_key(normalize(expediente))
    return "/".join(key) if key else normalize(expediente)


def rules(g: Group) -> list[str]:
    hit = []
    if len(g.docs) > MANY_DOCUMENTS:
        hit.append("many_documents")
    if len(pp_numbers(d.title for d in g.docs)) > 1:
        hit.append("several_pp_numbers")
    mws = sorted({round(d.mw, 2) for d in g.docs if d.mw})
    if len(mws) > 1 and mws[-1] > mws[0] * (1 + MW_SPREAD):
        hit.append("mw_differs")
    if len({p for d in g.docs if (p := _procedure(d.expediente))}) > 1:
        hit.append("several_expedientes")
    decided = [d.published_at for d in g.docs if d.doc_type in DECISIONS and d.verdict in VERDICTS]
    if decided and any(
        d.doc_type == "informacion_publica" and d.published_at > min(decided) for d in g.docs
    ):
        hit.append("consultation_after_decision")
    if is_generic(g.name):
        hit.append("generic_name")
    return hit


def reviewed(g: Group) -> bool:
    return all(d.override_key for d in g.docs)


def load_groups(conn) -> list[Group]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.id AS project_id, p.canonical_name, d.id AS document_id, d.published_at, d.title,
                   e.payload, o.group_key,
                   (SELECT array_agg(m.name ORDER BY m.name) FROM project_municipalities pm
                    JOIN municipalities m ON m.ine_code = pm.ine_code WHERE pm.project_id = p.id) AS municipalities
            FROM projects p
            JOIN project_documents pd ON pd.project_id = p.id
            JOIN raw_documents d ON d.id = pd.document_id
            LEFT JOIN extractions e ON e.document_id = d.id
            LEFT JOIN resolution_overrides o ON o.document_id = d.id
            ORDER BY p.id, d.published_at, d.id
            """
        )
        rows = cur.fetchall()
    by_project: dict[int, list[dict]] = {}
    for r in rows:
        by_project.setdefault(r["project_id"], []).append(r)
    groups = []
    for pid, rs in by_project.items():
        docs = []
        for r in rs:
            p = r["payload"] or {}
            docs.append(
                ReviewDoc(
                    document_id=r["document_id"],
                    published_at=r["published_at"],
                    title=r["title"] or "",
                    doc_type=p.get("doc_type") or "otro",
                    verdict=p.get("verdict") or "no_aplica",
                    expediente=p.get("expediente"),
                    mw=p.get("mw_nominal") or p.get("mw_peak"),
                    municipalities=tuple(r["municipalities"] or ()),
                    override_key=r["group_key"],
                )
            )
        groups.append(Group(pid, rs[0]["canonical_name"], tuple(docs)))
    return groups


def queue(groups: list[Group]) -> list[tuple[Group, list[str], bool]]:
    return [(g, hit, reviewed(g)) for g in groups if (hit := rules(g))]


def write_csv(rows: list[tuple[Group, list[str], bool]], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "project_id",
                "name",
                "rules",
                "reviewed",
                "document_ids",
                "titles",
                "mw_values",
                "expedientes",
                "municipalities",
            ]
        )
        for g, hit, done in rows:
            w.writerow(
                [
                    g.project_id,
                    g.name,
                    ";".join(hit),
                    "yes" if done else "",
                    " ".join(str(d.document_id) for d in g.docs),
                    " | ".join(d.title for d in g.docs),
                    " ".join(sorted({f"{d.mw:g}" for d in g.docs if d.mw})),
                    " ".join(sorted({d.expediente for d in g.docs if d.expediente})),
                    "; ".join(g.docs[0].municipalities),
                ]
            )
    return path


def summary(rows: list[tuple[Group, list[str], bool]]) -> str:
    pending = [(g, hit) for g, hit, done in rows if not done]
    by_rule = Counter(r for _, hit in pending for r in hit)
    line = ", ".join(f"{rule} {n}" for rule, n in sorted(by_rule.items()))
    done = len(rows) - len(pending)
    return (
        f"Review queue: {len(pending)} project(s) to review ({line or 'none'}); "
        f"{done} more already keyed in resolution_overrides. The list is in the review-clusters artifact.\n"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="impacto review-clusters")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--summary-out", type=Path, help="write the one-line summary here too")
    args = parser.parse_args(argv)
    with connect(load_settings().db_dsn) as conn:
        rows = queue(load_groups(conn))
    write_csv(rows, args.out)
    text = summary(rows)
    if args.summary_out:
        args.summary_out.write_text(text, encoding="utf-8")
    print(text, end="")
    print(args.out)
    return 0
