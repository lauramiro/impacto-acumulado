"""Compare this run's project groups with the last published export.

Run after `resolve` and before `export` overwrites web/public/data. It lists
what a person should look at: published projects that split, groups that
now combine published projects, and new documents that joined an existing
project on a weak match. It never fails the run; the weekly workflow puts the
report in the job summary and, when there is anything to review, opens an
issue from the report file.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from impacto.db.connect import connect
from impacto.settings import load_settings

DEFAULT_PREVIOUS = Path(__file__).resolve().parents[3] / "web" / "public" / "data" / "documents.csv"
# A new document whose match score is below this joined its project on name,
# place and size alone: worth a look.
WEAK_MATCH = 0.8


@dataclass(frozen=True)
class Doc:
    document_id: int
    project_id: int
    match_score: float | None
    title: str


@dataclass
class Findings:
    split: dict[int, list[list[int]]] = field(default_factory=dict)  # old project -> document ids per new project
    merged: dict[int, list[int]] = field(default_factory=dict)  # new project -> old projects it combines
    weak_new: list[Doc] = field(default_factory=list)

    def count(self) -> int:
        return len(self.split) + len(self.merged) + len(self.weak_new)


def compare(previous: dict[int, int | None], current: list[Doc]) -> Findings:
    """`previous`: document id -> its project in the last export (None: no project)."""
    out = Findings()
    old_parts: dict[int, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
    new_sources: dict[int, set[int]] = defaultdict(set)
    size: dict[int, int] = defaultdict(int)
    for d in current:
        size[d.project_id] += 1
    for d in current:
        old = previous.get(d.document_id)
        if old is not None:
            old_parts[old][d.project_id].append(d.document_id)
            new_sources[d.project_id].add(old)
        elif d.document_id not in previous and size[d.project_id] > 1 and (d.match_score or 0) < WEAK_MATCH:
            out.weak_new.append(d)
    out.split = {old: sorted(sorted(ids) for ids in parts.values()) for old, parts in sorted(old_parts.items()) if len(parts) > 1}
    out.merged = {new: sorted(olds) for new, olds in sorted(new_sources.items()) if len(olds) > 1}
    return out


def render(f: Findings, titles: dict[int, str]) -> str:
    if f.count() == 0:
        return "Resolve check: nothing to review. No published project split or merged, and no new document joined a project on a weak match.\n"
    lines = [f"Resolve check: {f.count()} item(s) to review against the last export.", ""]
    if f.split:
        lines += ["## Published projects that split", ""]
        for old, parts in f.split.items():
            lines.append(f"- Project {old} is now {len(parts)} projects: " + "; ".join(", ".join(str(i) for i in p) for p in parts))
        lines.append("")
    if f.merged:
        lines += ["## Groups that combine published projects", ""]
        for new, olds in f.merged.items():
            lines.append(f"- Project {new} now holds the documents of projects {', '.join(str(o) for o in olds)}")
        lines.append("")
    if f.weak_new:
        lines += [f"## New documents that joined a project on a weak match (score below {WEAK_MATCH})", ""]
        for d in f.weak_new:
            score = "none" if d.match_score is None else f"{d.match_score:.2f}"
            lines.append(f"- Document {d.document_id} into project {d.project_id} (score {score}): {titles.get(d.document_id, d.title)[:160]}")
        lines.append("")
    lines.append("Split a wrong group, or join two, with rows in resolution_overrides; see docs/audit/2026-10-04-over-merged-clusters.md.")
    return "\n".join(lines) + "\n"


def load_previous(path: Path) -> dict[int, int | None]:
    with open(path, encoding="utf-8", newline="") as f:
        return {int(r["id"]): (int(r["project_id"]) if r["project_id"] else None) for r in csv.DictReader(f)}


def load_current(conn) -> list[Doc]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT pd.document_id, pd.project_id, pd.match_score, d.title FROM project_documents pd "
            "JOIN raw_documents d ON d.id = pd.document_id ORDER BY pd.document_id"
        )
        return [Doc(r["document_id"], r["project_id"], r["match_score"], r["title"]) for r in cur.fetchall()]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="impacto resolve-check")
    parser.add_argument("--previous", type=Path, default=DEFAULT_PREVIOUS, help="documents.csv of the last export")
    parser.add_argument("--out", type=Path, required=True, help="Markdown report to write")
    parser.add_argument("--count-out", type=Path, help="file to write the number of items to review into")
    args = parser.parse_args(argv)
    previous = load_previous(args.previous) if args.previous.is_file() else {}
    with connect(load_settings().db_dsn) as conn:
        current = load_current(conn)
    findings = compare(previous, current)
    report = render(findings, {d.document_id: d.title for d in current})
    args.out.write_text(report, encoding="utf-8")
    if args.count_out:
        args.count_out.write_text(str(findings.count()), encoding="utf-8")
    print(report)
    return 0
