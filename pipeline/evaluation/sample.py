"""The stratified sample that grows the held-out label set to 100 documents.

The published accuracy was measured on 20 documents, so each share carries a
Wilson interval about 35 points wide. This draws the documents to label next,
from the published documents.csv (no database needed), so that together with
the 20 already in labels_2026-10/ the held-out set reaches TARGET documents
stratified by source and technology:

- source: BOE section III (ministry decisions, BOE-A), BOE section V
  (consultations, BOE-B) and BOJA;
- technology: read from the title by keyword (eólico, fotovoltaico/solar,
  both for hybrid), and only when the title names none (most BOJA notices
  say "el proyecto que se cita"), from the project the document belongs to;
  the column technology_from says which.

Every non-empty stratum gets at least MIN_PER_STRATUM documents (or all it
has); the rest of TARGET is shared in proportion to what each stratum has
left, by largest remainder. Documents in labels/ are left out: the extractor was tuned on
them. The draw is seeded, so the list is reproducible.

    uv run python -m evaluation.sample                 # write sample_2026-10.csv
    uv run python -m evaluation.sample --stubs         # label stubs into to_label/
    uv run python -m evaluation.sample --status        # how many are still to label

Labelling: open each stub's url, read the document (never the extraction),
fill `expected` and `note` as the README says, and move the file into
labels_2026-10/. tests/test_eval.py checks every label there.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

from evaluation.run_eval import HELD_OUT_DIR, LABELS_DIR
from impacto.text import normalize

EVALUATION_DIR = Path(__file__).resolve().parent
DATA_DIR = EVALUATION_DIR.parents[1] / "web" / "public" / "data"
SAMPLE_FILE = EVALUATION_DIR / "sample_2026-10.csv"
STUBS_DIR = EVALUATION_DIR / "to_label"
TARGET = 100
MIN_PER_STRATUM = 3
SEED = 20261006

SOURCES = ("boe_iii", "boe_v", "boja")
TECHNOLOGIES = ("solar_fv", "eolica", "hibrida", "otra")
FIELDS = ["order", "status", "stratum", "source", "source_id", "published_at", "technology", "technology_from", "doc_type", "title", "url"]


def source_group(source: str, source_id: str) -> str:
    if source == "boja":
        return "boja"
    return "boe_v" if source_id.startswith("BOE-B") else "boe_iii"


def title_technology(title: str) -> str | None:
    t = normalize(title)
    wind = "eolic" in t or "aerogenerador" in t
    solar = "fotovolt" in t or "solar" in t
    if wind and solar:
        return "hibrida"
    if wind:
        return "eolica"
    if solar:
        return "solar_fv"
    return None


def technology_group(technology: str | None) -> str:
    return technology if technology in ("solar_fv", "eolica", "hibrida") else "otra"


def label_key(path: Path) -> tuple[str, str]:
    label = json.loads(path.read_text(encoding="utf-8"))
    return label["source"], label["source_id"]


def load_population(documents: Path, projects: Path) -> list[dict]:
    with open(projects, encoding="utf-8", newline="") as f:
        technology = {r["id"]: r["technology"] for r in csv.DictReader(f)}
    out = []
    with open(documents, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            from_title = title_technology(r["title"])
            tech = technology_group(from_title or technology.get(r["project_id"]))
            group = source_group(r["source"], r["source_id"])
            out.append(
                {
                    "stratum": f"{group}/{tech}",
                    "source": r["source"],
                    "source_id": r["source_id"],
                    "published_at": r["published_at"],
                    "technology": tech,
                    "technology_from": "titulo" if from_title else "proyecto",
                    "doc_type": r["doc_type"],
                    "title": r["title"],
                    "url": r["url"],
                }
            )
    return out


def allocate(sizes: dict[str, int], target: int, floor: int = MIN_PER_STRATUM) -> dict[str, int]:
    """Documents per stratum: a floor each, the rest in proportion to what each has left, by largest remainder."""
    alloc = {s: min(n, floor) for s, n in sizes.items() if n}
    while (left := target - sum(alloc.values())) > 0:
        room = {s: sizes[s] - alloc[s] for s in alloc if sizes[s] > alloc[s]}
        if not room:
            break
        pool = sum(room.values())
        quota = {s: left * r / pool for s, r in room.items()}
        give = {s: min(room[s], int(q)) for s, q in quota.items()}
        rest = left - sum(give.values())
        for s in sorted(room, key=lambda s: (int(quota[s]) - quota[s], s))[:rest]:
            give[s] = min(room[s], give[s] + 1)
        for s, g in give.items():
            alloc[s] += g
    return alloc


def draw(population: list[dict], held_out: set[tuple[str, str]], tuning: set[tuple[str, str]], target: int = TARGET, seed: int = SEED) -> list[dict]:
    """The held-out labels already written plus the documents to label next, by stratum."""
    pool = [d for d in population if (d["source"], d["source_id"]) not in tuning]
    by_stratum: dict[str, list[dict]] = defaultdict(list)
    for d in pool:
        by_stratum[d["stratum"]].append(d)
    alloc = allocate({s: len(docs) for s, docs in by_stratum.items()}, target)
    rng = random.Random(seed)
    rows = []
    for stratum in sorted(by_stratum):
        docs = sorted(by_stratum[stratum], key=lambda d: d["source_id"])
        labelled = [d for d in docs if (d["source"], d["source_id"]) in held_out]
        fresh = [d for d in docs if (d["source"], d["source_id"]) not in held_out]
        rng.shuffle(fresh)
        want = max(0, alloc.get(stratum, 0) - len(labelled))
        rows += [{**d, "status": "etiquetado"} for d in labelled]
        rows += [{**d, "status": "por_etiquetar"} for d in fresh[:want]]
    for i, row in enumerate(rows, 1):
        row["order"] = i
    return rows


def write_sample(rows: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows({k: r[k] for k in FIELDS} for r in rows)


def read_sample(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def stub_name(source: str, source_id: str) -> str:
    # The naming the existing labels use: BOE ids as is, BOJA ids prefixed.
    return f"boja-{source_id}.json" if source == "boja" else f"{source_id}.json"


def write_stubs(rows: list[dict], stubs_dir: Path, held_out_dir: Path) -> int:
    """One label stub per document still to label; existing stubs and labels are left alone."""
    stubs_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for r in rows:
        if r["status"] != "por_etiquetar":
            continue
        name = stub_name(r["source"], r["source_id"])
        if (stubs_dir / name).exists() or (held_out_dir / name).exists():
            continue
        stub = {
            "source": r["source"],
            "source_id": r["source_id"],
            "title": r["title"],
            "url": r["url"],
            "stratum": r["stratum"],
            # Null fails tests/test_eval.py until filled: doc_type and verdict are required.
            "expected": {"doc_type": None, "verdict": None},
            "note": "",
        }
        (stubs_dir / name).write_text(json.dumps(stub, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written += 1
    return written


def status(rows: list[dict], held_out_dir: Path) -> dict[str, int]:
    done = {label_key(p) for p in held_out_dir.glob("*.json")}
    sampled = {(r["source"], r["source_id"]) for r in rows}
    return {
        "sampled": len(sampled),
        "labelled": len(sampled & done),
        "to_label": len(sampled - done),
        # Labels in the folder that are not on the list (should be none).
        "off_list": len(done - sampled),
    }


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m evaluation.sample")
    parser.add_argument("--documents", type=Path, default=DATA_DIR / "documents.csv")
    parser.add_argument("--projects", type=Path, default=DATA_DIR / "projects.csv")
    parser.add_argument("--out", type=Path, default=SAMPLE_FILE)
    parser.add_argument("--target", type=int, default=TARGET)
    parser.add_argument("--stubs", action="store_true", help=f"write a label stub per document to label into {STUBS_DIR.name}/")
    parser.add_argument("--status", action="store_true", help="count the sampled documents labelled so far")
    args = parser.parse_args(argv)
    if args.stubs or args.status:
        rows = read_sample(args.out)
        if args.stubs:
            print(f"{write_stubs(rows, STUBS_DIR, HELD_OUT_DIR)} stub(s) written to {STUBS_DIR}")
        if args.status:
            print(json.dumps(status(rows, HELD_OUT_DIR)))
        return 0
    held_out = {label_key(p) for p in HELD_OUT_DIR.glob("*.json")}
    tuning = {label_key(p) for p in LABELS_DIR.glob("*.json")}
    rows = draw(load_population(args.documents, args.projects), held_out, tuning, args.target)
    write_sample(rows, args.out)
    per = defaultdict(lambda: [0, 0])
    for r in rows:
        per[r["stratum"]][r["status"] == "por_etiquetar"] += 1
    print(f"{len(rows)} documents in {args.out.name}: {sum(v[0] for v in per.values())} labelled, {sum(v[1] for v in per.values())} to label")
    for stratum, (done, todo) in sorted(per.items()):
        print(f"  {stratum:<22} labelled {done:>3}  to label {todo:>3}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
