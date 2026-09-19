from __future__ import annotations

import argparse
import json
import logging
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

LABELS_DIR = Path(__file__).resolve().parent / "labels"
LAST_RUN = Path(__file__).resolve().parent / "last_run.json"
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


def run_eval(
    conn: psycopg.Connection,
    provider: Provider,
    labels_dir: Path = LABELS_DIR,
    last_run: Path = LAST_RUN,
) -> dict[str, float]:
    """Per-field accuracy over every label in labels_dir whose document is fetched.

    A label whose document is not in raw_documents, or whose extraction raises
    (rate limit, malformed response), is skipped with a warning so a partial
    run still records what completed. The result is printed as a table and
    written to `last_run`.
    """
    names = municipality_name_map(conn)
    hits: dict[str, list[bool]] = {}
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
                print(f"{label['source_id']} {field}: expected {label['expected'][field]!r}, got {actual.get(field)!r}")
    accuracy = {field: round(sum(v) / len(v), 3) for field, v in hits.items()}
    print("\nfield                 accuracy  n")
    for field, acc in sorted(accuracy.items()):
        print(f"{field:<22}{acc:>8.0%}  {len(hits[field])}")
    result = {
        "provider": provider.name,
        "accuracy": accuracy,
        "n_labels": len(label_paths),
        "n_scored": len(label_paths) - len(skipped),
        "skipped": skipped,
    }
    last_run.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return accuracy


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="impacto eval")
    parser.add_argument("--provider", choices=PROVIDER_NAMES, default="groq")
    args = parser.parse_args(argv)
    settings = load_settings()
    provider = build_provider(settings, args.provider)
    with connect(settings.db_dsn) as conn:
        run_eval(conn, provider)
    return 0
