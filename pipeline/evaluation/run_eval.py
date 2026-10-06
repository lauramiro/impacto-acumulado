from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, date, datetime
from pathlib import Path

import psycopg

from impacto.db.connect import connect
from impacto.db.documents import municipality_name_map
from impacto.extract.run import extract_document
from impacto.providers import Provider
from impacto.providers.factory import PROVIDER_NAMES, build_provider
from impacto.settings import load_settings
from impacto.text import normalize

log = logging.getLogger(__name__)

# labels/ (2026-09-22) became a tuning set when the extractor was fixed
# against it; labels_2026-10/ was written afterwards and is held out.
LABELS_DIR = Path(__file__).resolve().parent / "labels"
HELD_OUT_DIR = Path(__file__).resolve().parent / "labels_2026-10"
# last_run.json is the published figure (export copies it to the site): the
# run of the held-out labels, written with `--labels evaluation/labels_2026-10
# --out evaluation/last_run.json` (the extraction-eval workflow). Runs go to
# tuned_run.json unless --out says otherwise. The September figure, measured
# on labels/ before the extractor was tuned against them, is kept as history.
LAST_RUN = Path(__file__).resolve().parent / "last_run.json"
TUNED_RUN = Path(__file__).resolve().parent / "tuned_run.json"

NUMERIC = {"mw_peak", "mw_nominal", "hectares", "turbines"}
EXACT = {"doc_type", "verdict", "technology"}


def _same(field: str, expected, actual) -> bool:
    if field in EXACT:
        return expected == actual
    if field in NUMERIC:
        if expected is None or actual is None:
            return expected == actual
        return abs(float(expected) - float(actual)) <= 0.02 * max(abs(float(expected)), 1e-9)
    if field == "municipalities":
        want = {normalize(m["name"]) for m in expected}
        got = {normalize(m["name"]) for m in (actual or [])}
        return want == got
    if isinstance(expected, str) and isinstance(actual, str):
        return _loose(expected) == _loose(actual)
    return expected == actual


def _loose(s: str) -> str:
    return normalize(s).replace(",", "").replace(".", "")


def score(expected: dict, actual: dict) -> dict[str, bool]:
    """One boolean per expected field. Keys of `actual` absent from `expected` are ignored."""
    return {field: _same(field, value, actual.get(field)) for field, value in expected.items()}


def misses_path(out: Path) -> Path:
    """Where a run written to `out` records its misses: `<stem>_misses.json` beside it."""
    return out.with_name(f"{out.stem}_misses.json")


def run_eval(
    conn: psycopg.Connection,
    provider: Provider,
    labels_dir: Path = LABELS_DIR,
    out: Path = TUNED_RUN,
    today: date | None = None,
) -> dict[str, float]:
    """Per-field accuracy over every label in labels_dir whose document is fetched.

    A label whose document is not in raw_documents, or whose extraction raises
    (rate limit, malformed response), is skipped with a warning so a partial
    run still records what completed. The result is printed as a table and
    written to `out`; each miss is written to `misses_path(out)`.
    """
    names = municipality_name_map(conn)
    hits: dict[str, list[bool]] = {}
    misses: list[dict] = []
    label_paths = sorted(labels_dir.glob("*.json"))
    skipped: list[str] = []
    for label_path in label_paths:
        label = json.loads(label_path.read_text(encoding="utf-8"))
        with conn.cursor() as cur:
            cur.execute(
                "SELECT title, text FROM raw_documents WHERE source = %s AND source_id = %s",
                (label["source"], label["source_id"]),
            )
            row = cur.fetchone()
        if row is None:
            log.warning("skip %s: document %s not fetched", label_path.name, label["source_id"])
            skipped.append(label_path.name)
            continue
        try:
            actual = extract_document(provider, row["title"], row["text"], names).model_dump()
        except Exception as exc:  # noqa: BLE001 - one document's failure must not abort the run
            log.warning("skip %s: extraction of %s failed: %s", label_path.name, label["source_id"], exc)
            skipped.append(label_path.name)
            continue
        for field, ok in score(label["expected"], actual).items():
            hits.setdefault(field, []).append(ok)
            if not ok:
                expected = label["expected"][field]
                misses.append({"source_id": label["source_id"], "field": field, "expected": expected, "actual": actual.get(field)})
                print(f"{label['source_id']} {field}: expected {expected!r}, got {actual.get(field)!r}")
    accuracy = {field: round(sum(v) / len(v), 3) for field, v in hits.items()}
    print("\nfield                 accuracy  n")
    for field, acc in sorted(accuracy.items()):
        print(f"{field:<22}{acc:>8.0%}  {len(hits[field])}")
    result = {
        "provider": provider.name,
        "measured": (today or datetime.now(UTC).date()).isoformat(),
        "labels": labels_dir.name,
        "accuracy": accuracy,
        # Hits per field, so the export gives each share its interval from
        # exact counts (impacto.aggregate.export.wilson).
        "correct": {field: sum(v) for field, v in hits.items()},
        "n_labels": len(label_paths),
        "n_scored": len(label_paths) - len(skipped),
        "skipped": skipped,
    }
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    misses_path(out).write_text(json.dumps(misses, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return accuracy


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="impacto eval")
    parser.add_argument("--provider", choices=PROVIDER_NAMES, default="groq")
    parser.add_argument("--labels", type=Path, default=LABELS_DIR, help="label folder; the published figure uses labels_2026-10")
    parser.add_argument("--out", type=Path, default=TUNED_RUN, help="result file; its misses go beside it")
    args = parser.parse_args(argv)
    settings = load_settings()
    provider = build_provider(settings, args.provider)
    with connect(settings.db_dsn) as conn:
        run_eval(conn, provider, args.labels, out=args.out)
    return 0
