# Extraction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the extractor misses measured by the 20-label evaluation (project-name tails, evacuation-only municipalities, the simplified-evaluation form, two capacity misreads), repair resolve's phase guard, keep eval runs off the published accuracy file, then re-extract production and republish the dataset.

**Architecture:** Deterministic fixes live in the pipeline's extract and resolve packages and are verified by unit tests: a suffix-only name trimmer, a capacity-stripping `name_key`, a `role` field that moves evacuation-only municipalities into their own list, and two new operative-sentence branches. The prompt half is verified by an eval run whose output goes to `tuned_run.json`, never to the published `last_run.json`. The production re-run bumps `PROMPT_VERSION` to `v4` and reuses the existing `--redo-prompt-version` path.

**Tech Stack:** Python 3.12, uv, pytest, pydantic v2, psycopg 3, rapidfuzz; Mistral `ministral-14b-latest` for the eval and the re-run; Neon Postgres; Next.js 16 and Playwright for the one web sentence.

**Spec:** `docs/superpowers/specs/2026-09-22-extraction-fixes-design.md`. Read it before starting. The "Implementation order" and "The one-way door" sections govern this plan.

## Global Constraints

- Work in the worktree `C:\Users\lmiro\workspace\impacto-acumulado\.claude\worktrees\extraction-fixes` on branch `worktree-extraction-fixes` for Tasks 1 to 8. Task 9 runs in the main checkout on `main`.
- Run Python commands from `pipeline/` as `uv run python -m pytest ...`, not `uv run pytest` (an application-control policy on this machine blocks the `pytest.exe` shim).
- Four test files cannot collect on this machine (pyproj DLL block): `tests/test_aggregate.py`, `tests/test_export.py`, `tests/test_reference.py`, `tests/test_resolve_run.py`. The full-suite command used throughout is:
  `uv run python -m pytest -q --ignore=tests/test_aggregate.py --ignore=tests/test_export.py --ignore=tests/test_reference.py --ignore=tests/test_resolve_run.py`
- No code path may write `pipeline/evaluation/last_run.json` after Task 1. Never `git add` that file in this slice.
- `impacto/extract/names.py` contract: suffix removal only; never returns empty; must not cut a trailing phase marker or a trailing number with no unit after it.
- `Municipality.role` is `Literal["generacion", "evacuacion"] | None`. `role = None` entries stay in `municipalities`.
- `PROMPT_VERSION` becomes `"v4"` once, in Task 3, and does not change again in this slice.
- No production writes (fetch, extract, resolve, aggregate, export against Neon) before Task 8 has merged the branch to `main`.
- Nothing is pushed to `origin` without the user's go-ahead (Task 8 and Task 9 each ask).
- Code comments and docs: no emojis, no em-dashes. Match the surrounding comment density.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

### Task 1: Eval output path and the misses file (spec section 3)

**Files:**
- Modify: `pipeline/evaluation/run_eval.py`
- Test: `pipeline/tests/test_eval.py`

**Interfaces:**
- Produces: `evaluation.run_eval.TUNED_RUN: Path` (`pipeline/evaluation/tuned_run.json`), `evaluation.run_eval.misses_path(out: Path) -> Path` (sibling `<stem>_misses.json`), and `run_eval(conn, provider, labels_dir=LABELS_DIR, out=TUNED_RUN) -> dict[str, float]`. The keyword `last_run=` is renamed to `out=`. CLI: `impacto eval --provider P [--out PATH]`.
- The misses file is a JSON list of `{"source_id": str, "field": str, "expected": Any, "actual": Any}`.

- [ ] **Step 0: Make the database tests runnable in the worktree**

The worktree has no `pipeline/env.local`, so every `db`-fixture test skips (the baseline shows `121 passed, 21 skipped`). Copy the main checkout's file, which is gitignored:

```bash
cp /c/Users/lmiro/workspace/impacto-acumulado/pipeline/env.local /c/Users/lmiro/workspace/impacto-acumulado/.claude/worktrees/extraction-fixes/pipeline/env.local
cd /c/Users/lmiro/workspace/impacto-acumulado/.claude/worktrees/extraction-fixes/pipeline
git check-ignore -v env.local
uv run python -m pytest -q --ignore=tests/test_aggregate.py --ignore=tests/test_export.py --ignore=tests/test_reference.py --ignore=tests/test_resolve_run.py
```

Expected: `git check-ignore` prints `.gitignore:27:pipeline/env.local`, and the suite reports `142 passed` with no skips. If it still skips, stop and report: the `db` tests below need `IMPACTO_TEST_DB_DSN`.

- [ ] **Step 1: Write the failing tests**

In `pipeline/tests/test_eval.py`, change the import line to:

```python
from evaluation.run_eval import EXACT, LABELS_DIR, LAST_RUN, NUMERIC, TUNED_RUN, main, misses_path, run_eval, score
```

In `test_run_eval_skips_failed_extractions_with_warning`, replace the two occurrences of `last_run=tmp_path / "last_run.json"` / `(tmp_path / "last_run.json")` so the call and the read use `out`:

```python
    out = tmp_path / "run.json"
    accuracy = run_eval(db, Flaky(), labels, out=out)
    assert accuracy == {"verdict": 1.0, "mw_nominal": 1.0}
    assert "BAD" in caplog.text and "rate_limit_exceeded" in caplog.text
    written = json.loads(out.read_text(encoding="utf-8"))
```

(the remaining asserts of that test stay as they are). Then add, after that test:

```python
def test_run_eval_writes_misses_next_to_its_output(db, tmp_path):
    # Miss detail used to reach only stdout, which is how the project_name
    # pairs the extraction fixes were designed from became unreachable.
    upsert_raw_document(db, RawDocument("boe", "OK", date(2023, 1, 1), "t", "u", "III", "o", "Promotor X"))
    labels = tmp_path / "labels"
    labels.mkdir()
    _label(labels / "a-OK.json", "OK", {"verdict": "favorable", "mw_nominal": 50})
    provider = StubProvider([{"doc_type": "dia", "verdict": "desfavorable", "mw_nominal": 50}])
    out = tmp_path / "run.json"
    run_eval(db, provider, labels, out=out)
    misses = json.loads((tmp_path / "run_misses.json").read_text(encoding="utf-8"))
    assert misses == [{"source_id": "OK", "field": "verdict", "expected": "favorable", "actual": "desfavorable"}]


def test_run_eval_defaults_to_the_tuned_run_not_the_published_baseline():
    # export copies last_run.json to the site on every weekly run, so an eval
    # run must never land there by default.
    assert inspect.signature(run_eval).parameters["out"].default == TUNED_RUN
    assert TUNED_RUN.name == "tuned_run.json"
    assert misses_path(TUNED_RUN).name == "tuned_run_misses.json"


def test_run_eval_refuses_to_overwrite_the_published_baseline(tmp_path):
    before = LAST_RUN.read_bytes()
    with pytest.raises(ValueError, match="published baseline"):
        run_eval(None, StubProvider([]), tmp_path, out=LAST_RUN)
    with pytest.raises(SystemExit):
        main(["--provider", "stub", "--out", str(LAST_RUN)])
    assert LAST_RUN.read_bytes() == before
```

Add `import inspect` to the imports at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m pytest -q tests/test_eval.py`
Expected: collection error `ImportError: cannot import name 'TUNED_RUN'`.

- [ ] **Step 3: Implement**

In `pipeline/evaluation/run_eval.py`, below `LAST_RUN`, add:

```python
# last_run.json is the published baseline: export copies it to the site, and
# it predates any tuning against the labels, so nothing may overwrite it.
# Runs go to tuned_run.json unless --out says otherwise.
TUNED_RUN = Path(__file__).resolve().parent / "tuned_run.json"


def misses_path(out: Path) -> Path:
    """Where a run written to `out` records its misses: `<stem>_misses.json` beside it."""
    return out.with_name(f"{out.stem}_misses.json")


def _refuse_baseline(out: Path) -> None:
    if out.resolve() == LAST_RUN.resolve():
        raise ValueError(f"{LAST_RUN.name} is the published baseline; write eval runs elsewhere")
```

Replace the `run_eval` signature, docstring and body so that it reads:

```python
def run_eval(
    conn: psycopg.Connection,
    provider: Provider,
    labels_dir: Path = LABELS_DIR,
    out: Path = TUNED_RUN,
) -> dict[str, float]:
    """Per-field accuracy over every label in labels_dir whose document is fetched.

    A label whose document is not in raw_documents, or whose extraction raises
    (rate limit, malformed response), is skipped with a warning so a partial
    run still records what completed. The result is printed as a table and
    written to `out`; each miss is written to `misses_path(out)`. `out` may
    not be the published baseline, `last_run.json`.
    """
    _refuse_baseline(out)
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
        "accuracy": accuracy,
        "n_labels": len(label_paths),
        "n_scored": len(label_paths) - len(skipped),
        "skipped": skipped,
    }
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    misses_path(out).write_text(json.dumps(misses, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return accuracy
```

Replace `main` with:

```python
def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="impacto eval")
    parser.add_argument("--provider", choices=PROVIDER_NAMES, default="groq")
    parser.add_argument("--out", type=Path, default=TUNED_RUN, help="result file; its misses go beside it")
    args = parser.parse_args(argv)
    try:
        _refuse_baseline(args.out)
    except ValueError as exc:
        parser.error(str(exc))
    settings = load_settings()
    provider = build_provider(settings, args.provider)
    with connect(settings.db_dsn) as conn:
        run_eval(conn, provider, out=args.out)
    return 0
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m pytest -q tests/test_eval.py`
Expected: all pass (the 20 `test_label_is_well_formed` cases included).

Then: `git status --short pipeline/evaluation/`
Expected: only `run_eval.py` modified; `last_run.json` untouched.

- [ ] **Step 5: Run the full suite and lint**

Run the full-suite command from Global Constraints, then `uv run ruff check .`
Expected: `145 passed`, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add pipeline/evaluation/run_eval.py pipeline/tests/test_eval.py
git commit -m "eval: write runs to tuned_run.json with a misses file, never to last_run.json

export copies last_run.json to the site on every weekly run, and it holds
the only accuracy figure measured before tuning against the labels. Runs
now default to tuned_run.json, --out refuses the baseline, and each miss is
persisted beside the result instead of reaching only stdout.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Capacity figures out of `name_key` (spec section 1c)

**Files:**
- Modify: `pipeline/impacto/resolve/blocking.py`
- Test: `pipeline/tests/test_resolve_pure.py`

**Interfaces:**
- Consumes: `impacto.text.normalize`, `impacto.text.tokens`.
- Produces: `name_key(name: str) -> str` with the same signature; capacity figures (`<number> <unit>`) no longer appear in the key. `scoring.phase_token` inherits the fix with no change.

- [ ] **Step 1: Write the failing tests**

In `pipeline/tests/test_resolve_pure.py`, change the scoring import to:

```python
from impacto.resolve.scoring import THRESHOLD, phase_token, score_pair
```

and add:

```python
def test_name_key_drops_capacity_figures():
    assert name_key("Parque eolico Ronda II de 50 MW") == "ronda ii"
    assert name_key("Planta fotovoltaica Carbo de 90,5 MWp") == "carbo"
    # A number with no unit after it is part of the name.
    assert name_key("Parque fotovoltaico Tabernas 100") == "tabernas 100"


def test_phase_token_is_not_read_from_a_capacity_figure():
    assert phase_token("Parque eolico Ronda I") == "i"
    assert phase_token("Parque eolico Ronda II de 50 MW") == "ii"
    # The evacuation tail still hides the phase here; impacto.extract.names
    # removes such tails at extraction time.
    assert phase_token("Parque eolico Ronda I de 50 MW y su infraestructura de evacuacion") is None


def test_a_capacity_figure_does_not_block_two_documents_of_one_project():
    a = rec(1, "Parque eolico Ronda II de 50 MW", mw=50)
    b = rec(2, "Parque eolico Ronda II", mw=50)
    score, reason = score_pair(a, b)
    assert reason != "phase_mismatch"
    assert score >= THRESHOLD
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m pytest -q tests/test_resolve_pure.py`
Expected: the three new tests fail; for example `assert 'ronda ii 50' == 'ronda ii'` and `(0.0, 'phase_mismatch')`.

- [ ] **Step 3: Implement**

Replace the top of `pipeline/impacto/resolve/blocking.py` (imports through `name_key`) with:

```python
from __future__ import annotations

import re
from collections import defaultdict

from impacto.resolve.model import Record
from impacto.text import normalize, tokens

GENERIC = {
    "parque", "planta", "plantas", "proyecto", "instalacion", "fotovoltaico", "fotovoltaica", "fotovoltaicos",
    "solar", "eolico", "eolica", "psfv", "pfv", "pe", "de", "la", "el", "los", "las", "del", "y", "e",
    "s", "l", "u", "a", "sl", "slu", "sa", "sau", "mw", "mwp", "mwn",
}
# A capacity figure ("50 MW", "90,5 MWp") describes a project, it does not
# name it. Left in, its number becomes the last token and phase_token reads
# it as a phase, which blocks two documents of one project from grouping.
_CAPACITY = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:mwp|mwn|mwh|mw|kwp|kwn|kw|kv)\b")


def name_key(name: str) -> str:
    return " ".join(t for t in tokens(_CAPACITY.sub(" ", normalize(name))) if t not in GENERIC)
```

(`candidate_pairs` below it is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m pytest -q tests/test_resolve_pure.py`
Expected: all pass, including the pre-existing `test_name_key_removes_generic_words` and `test_score_pair_different_phases_never_merge_without_expediente`.

- [ ] **Step 5: Full suite, lint, commit**

Run the full-suite command and `uv run ruff check .`. Expected: `148 passed`, ruff clean.

```bash
git add pipeline/impacto/resolve/blocking.py pipeline/tests/test_resolve_pure.py
git commit -m "resolve: keep capacity figures out of name_key

'Ronda II de 50 MW' keyed as 'ronda ii 50', so phase_token read '50' as the
phase and score_pair hard-blocked it against 'Ronda II'. Dropping a number
followed by a unit repairs grouping on the names already stored, with no
re-extraction.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The project-name trimmer (spec section 1b) and `PROMPT_VERSION` v4

**Files:**
- Create: `pipeline/impacto/extract/names.py`
- Create: `pipeline/tests/test_names.py`
- Modify: `pipeline/impacto/extract/run.py` (`extract_document`, after `data = merged.model_dump()`)
- Modify: `pipeline/impacto/extract/prompts.py:3`
- Modify: `pipeline/tests/test_prompts.py:5`
- Test: `pipeline/tests/test_extract_run.py`

**Interfaces:**
- Produces: `impacto.extract.names.trim_project_name(name: str) -> str`. `extract_document` applies it once to the merged `project_name`. `PROMPT_VERSION == "v4"`.

The fifteen `got` strings below are the `project_name` values stored in production for the fifteen labelled documents that carry a `project_name`, extracted with `mistral:ministral-14b-latest` under prompt `v3` (the baseline's model and prompt). They were read on 2026-09-23 with:
`SELECT d.source_id, e.payload->>'project_name' FROM raw_documents d JOIN extractions e ON e.document_id = d.id WHERE d.source_id IN (...)`.

- [ ] **Step 1: Write the failing tests**

Create `pipeline/tests/test_names.py`:

```python
import pytest

from evaluation.run_eval import score
from impacto.extract.names import trim_project_name

# (source_id, stored v3 extraction, label). Seven misses are descriptive tails.
TAIL_MISSES = [
    ("BOE-A-2022-15703",
     "Parque Fotovoltaico Retuerta (38 MW) y Parque Eólico Retuerta (38 MW) con infraestructura de evacuación",
     "Parque Fotovoltaico Retuerta"),
    ("BOE-A-2022-18089", "Planta fotovoltaica Carbo de 90 MWp y su infraestructura de evacuación", "Planta fotovoltaica Carbo"),
    ("BOE-A-2024-16661", "Parque fotovoltaico Tabernas 100 MW", "Parque fotovoltaico Tabernas 100"),
    ("disposition.2024.38.48", "Solar Airport PV e infraestructura de evacuación", "Solar Airport PV"),
    ("disposition.2025.23.46", "Parque Eólico Los Morales e infraestructura de evacuación", "Parque Eólico Los Morales"),
    ("disposition.2025.63.37", "Parque eólico Los Morales e infraestructura de evacuación", "Parque eólico Los Morales"),
    ("disposition.2026.125.87",
     "Planta de Almacenamiento Teleiro Los Barrios, de potencial instalada de 5 MW y 20 MWH y línea de evacuación "
     "20 kV DC y Centro de Seccionamiento Asociados",
     "Planta de Almacenamiento Teleiro Los Barrios"),
]
# Two misses are in the head of the name, which the contract forbids touching:
# (source_id, stored, what the trimmer must return). Both stay misses.
HEAD_MISSES = [
    ("disposition.2025.144.69",
     "Proyecto de parque fotovoltaico Tabernas Solar 3 de 35 MWP y su infraestructura de evacuación",
     "Proyecto de parque fotovoltaico Tabernas Solar 3"),
    ("disposition.2026.142.33", "Repotenciación del Parque Eólico Carrascal I", "Repotenciación del Parque Eólico Carrascal I"),
]
# Six already match their label; the trimmer must leave them exactly as they are.
ALREADY_RIGHT = [
    "Instalación Fotovoltaica Don Rodrigo",
    "Parque eólico Hinojosa Ampliación",
    "Parque eólico Hinojosa",
    "Módulo de almacenamiento OPDE Miramundo",
    "Instalación híbrida Cartuja",
    "Gelo",
]


@pytest.mark.parametrize(("source_id", "got", "label"), TAIL_MISSES, ids=[c[0] for c in TAIL_MISSES])
def test_tail_misses_are_trimmed_to_the_label(source_id, got, label):
    trimmed = trim_project_name(got)
    assert trimmed == label
    assert score({"project_name": label}, {"project_name": trimmed}) == {"project_name": True}


@pytest.mark.parametrize(("source_id", "got", "want"), HEAD_MISSES, ids=[c[0] for c in HEAD_MISSES])
def test_head_misses_lose_only_their_tail(source_id, got, want):
    assert trim_project_name(got) == want


@pytest.mark.parametrize("name", ALREADY_RIGHT)
def test_names_that_already_match_are_untouched(name):
    assert trim_project_name(name) == name


@pytest.mark.parametrize("name", [
    "Parque fotovoltaico Tabernas 100",  # trailing number with no unit
    "Parque eolico Ronda II",  # trailing phase marker
    "Planta Solar Cortijo de 3 Hermanos",  # "de <number>" with no unit
])
def test_contract_keeps_numbers_and_phases_that_are_part_of_the_name(name):
    assert trim_project_name(name) == name


def test_a_cut_that_would_empty_the_name_is_not_made():
    assert trim_project_name("de 50 MW") == "de 50 MW"
```

In `pipeline/tests/test_extract_run.py`, add after `test_extract_document_folds_per_plant_lists_into_project_totals`:

```python
def test_extract_document_trims_the_descriptive_tail_of_the_project_name():
    model_says = {"doc_type": "dia", "verdict": "favorable_condicionada",
                  "project_name": "Planta fotovoltaica Carbo de 90 MWp y su infraestructura de evacuación"}
    e = extract_document(StubProvider([model_says]), "Resolución", "Promotor Y", {})
    assert e.project_name == "Planta fotovoltaica Carbo"
```

In `pipeline/tests/test_prompts.py`, change line 5 to `assert PROMPT_VERSION == "v4"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m pytest -q tests/test_names.py tests/test_extract_run.py tests/test_prompts.py`
Expected: `ModuleNotFoundError: No module named 'impacto.extract.names'` for `test_names.py`; the new extract test and the prompt-version test fail.

- [ ] **Step 3: Implement the trimmer**

Create `pipeline/impacto/extract/names.py`:

```python
"""Remove the descriptive tail the gazettes attach to project names.

The model copies a name as the resolution prints it: "Planta fotovoltaica
Carbo de 90 MWp y su infraestructura de evacuacion". The tail is not part of
the name, and resolve reads a phase marker from the last token of the name,
so a tail both breaks name matching and hides the phase.

Contract:
- suffix removal only: the head of a name is never rewritten, so a wrong
  rule can truncate but cannot corrupt;
- never returns an empty name: if a cut would empty it, no cut is made;
- cuts capacity clauses ("de 90 MWp", "(38 MW)"), "de potencia instalada"
  appositives and evacuation-infrastructure conjunctions ("y su
  infraestructura de evacuacion"), from the first one found to the end;
- keeps a trailing phase marker and a trailing number with no unit after it
  ("Parque fotovoltaico Tabernas 100"); a unit directly after a trailing
  number is dropped alone ("Tabernas 100 MW" -> "Tabernas 100").
"""

from __future__ import annotations

import re

_NUMBER = r"\d+(?:[.,]\d+)?"
_UNIT = r"(?:mwp|mwn|mwh|mw|kwp|kwn|kw|kv)\b"
_TAILS = (
    re.compile(rf"\s*,?\s*(?:\bde\s+{_NUMBER}\s*{_UNIT}|\(\s*{_NUMBER}\s*{_UNIT}[^)]*\))", re.IGNORECASE),
    re.compile(r"\s*,?\s*\bde\s+potencial?\s+instalada\b", re.IGNORECASE),
    re.compile(
        r"\s*,?\s+(?:y|e|con)\s+(?:su\s+|sus\s+|la\s+|las\s+)?(?:infraestructuras?|l[ií]neas?)\s+de\s+evacuaci[oó]n\b",
        re.IGNORECASE,
    ),
)
_TRAILING_UNIT = re.compile(rf"(?<=\d)\s*{_UNIT}\s*$", re.IGNORECASE)


def trim_project_name(name: str) -> str:
    cut = min((m.start() for pattern in _TAILS if (m := pattern.search(name))), default=len(name))
    trimmed = _TRAILING_UNIT.sub("", name[:cut]).rstrip(" ,;:-")
    return trimmed or name
```

- [ ] **Step 4: Wire it into `extract_document` and bump the prompt version**

In `pipeline/impacto/extract/run.py`, add the import next to the other `impacto.extract` imports:

```python
from impacto.extract.names import trim_project_name
```

and in `extract_document`, directly after `data = merged.model_dump()`, add:

```python
    if data.get("project_name"):
        # Once, on the name actually chosen after merging, not per chunk.
        data["project_name"] = trim_project_name(data["project_name"])
```

In `pipeline/impacto/extract/prompts.py`, replace `PROMPT_VERSION = "v3"` with:

```python
# v4: names trimmed of descriptive tails, municipalities tagged with a role,
# the simplified-evaluation form read by rule, and the installations under
# evaluation told apart from existing ones. Re-extract v3 rows with
# `impacto extract --redo-prompt-version v3`.
PROMPT_VERSION = "v4"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run python -m pytest -q tests/test_names.py tests/test_extract_run.py tests/test_prompts.py`
Expected: all pass (7 + 2 + 6 + 3 + 1 = 19 tests in `test_names.py`).

- [ ] **Step 6: Full suite, lint, commit**

Run the full-suite command and `uv run ruff check .`. Expected: `168 passed`, ruff clean.

```bash
git add pipeline/impacto/extract/names.py pipeline/tests/test_names.py pipeline/impacto/extract/run.py pipeline/impacto/extract/prompts.py pipeline/tests/test_prompts.py pipeline/tests/test_extract_run.py
git commit -m "extract: trim descriptive tails from project names, prompt v4

Nine of fifteen labelled names came back with the gazette's tail attached
('de 90 MWp y su infraestructura de evacuacion'). The trimmer removes
suffixes only and never empties a name: it restores seven of the nine and
leaves the six correct names untouched. The other two differ from their
labels in the head, which the contract does not touch.

PROMPT_VERSION moves to v4 for this and the rest of the extraction fixes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Municipality role and `evacuation_municipalities` (spec section 2a)

**Files:**
- Modify: `pipeline/impacto/extract/schema.py`
- Modify: `pipeline/impacto/extract/prompts.py` (the `municipalities` bullet)
- Modify: `pipeline/impacto/extract/run.py` (`_sanitize`, municipalities block, and the allowed-value sets)
- Modify: `pipeline/impacto/extract/validate.py`
- Test: `pipeline/tests/test_validate.py`, `pipeline/tests/test_extract_run.py`, `pipeline/tests/test_resolve_pure.py`

**Interfaces:**
- Produces: `schema.MunicipalityRole = Literal["generacion", "evacuacion"]`; `Municipality.role: MunicipalityRole | None = None`; `Extraction.evacuation_municipalities: list[Municipality]`. After `validate_and_score`, `municipalities` holds entries with role `generacion` or `None`; `evacuation_municipalities` holds role `evacuacion`.
- `resolve.model.Record.from_extraction` reads only `payload["municipalities"]` and is not changed.

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_validate.py`:

```python
def test_evacuation_only_municipalities_move_out_of_the_generation_site():
    e = Extraction(doc_type="dia", verdict="favorable", confidence=0.9, municipalities=[
        Municipality(name="Ronda", role="generacion"),
        Municipality(name="Cortes de la Frontera", role="evacuacion"),
        Municipality(name="MALAGA"),
    ])
    out = validate_and_score(e, NAMES)
    # An untagged municipality stays where it was: the split can only remove
    # false positives, never introduce false negatives.
    assert [(m.name, m.role) for m in out.municipalities] == [("Ronda", "generacion"), ("Málaga", None)]
    assert [(m.name, m.role) for m in out.evacuation_municipalities] == [("Cortes de la Frontera", "evacuacion")]
    assert out.confidence == 0.9
```

In `pipeline/tests/test_extract_run.py`, add `from impacto.extract.prompts import SYSTEM_PROMPT` to the imports and add:

```python
def test_extract_document_nulls_an_unknown_municipality_role_and_splits_evacuation():
    model_says = {"doc_type": "dia", "verdict": "favorable_condicionada", "municipalities": [
        {"name": "Ronda", "province": "Málaga", "role": "generacion"},
        {"name": "Almodóvar del Río", "province": "Córdoba", "role": "evacuacion"},
        {"name": "Cortes de la Frontera", "province": "Málaga", "role": "subestacion"},
    ]}
    e = extract_document(StubProvider([model_says]), "Resolución", "Promotor Y", {})
    assert [(m.name, m.role) for m in e.municipalities] == [("Ronda", "generacion"), ("Cortes de la Frontera", None)]
    assert [m.name for m in e.evacuation_municipalities] == ["Almodóvar del Río"]


def test_prompt_asks_for_every_municipality_with_a_role():
    assert '"role"' in SYSTEM_PROMPT
    assert '"evacuacion"' in SYSTEM_PROMPT and '"generacion"' in SYSTEM_PROMPT
```

Append to `pipeline/tests/test_resolve_pure.py` (a guard: it passes before and after, and fails if resolve ever starts reading the evacuation list):

```python
def test_record_groups_on_the_generation_site_only():
    payload = {"municipalities": [{"name": "Ronda", "role": "generacion"}],
               "evacuation_municipalities": [{"name": "Cortes de la Frontera", "role": "evacuacion"}]}
    r = Record.from_extraction(1, date(2023, 1, 1), payload)
    assert r.municipalities == frozenset({"ronda"})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m pytest -q tests/test_validate.py tests/test_extract_run.py tests/test_resolve_pure.py`
Expected: the validate test fails with a pydantic `ValidationError` or `AttributeError` on `role`/`evacuation_municipalities`; both new extract tests fail; the resolve guard passes.

- [ ] **Step 3: Schema**

In `pipeline/impacto/extract/schema.py`, after `ConditionCategory`, add:

```python
MunicipalityRole = Literal["generacion", "evacuacion"]
```

Replace `Municipality` with:

```python
class Municipality(BaseModel):
    name: str
    province: str | None = None
    # generacion: the plant, park, turbines, modules or batteries stand here.
    # evacuacion: only the evacuation line or substation does. None: untagged.
    role: MunicipalityRole | None = None
```

In `Extraction`, directly after `municipalities`, add:

```python
    # Municipalities reached only by the evacuation infrastructure. Kept for
    # inspection; resolve and the site use `municipalities` alone.
    evacuation_municipalities: list[Municipality] = Field(default_factory=list)
```

- [ ] **Step 4: Prompt**

In `pipeline/impacto/extract/prompts.py`, replace the three-line `municipalities` bullet (from `- municipalities: lista de {"name": ..., "province": ...} con los términos municipales del` through `ni los que solo atraviesa la línea de evacuación.`) with:

```
- municipalities: lista de {"name": ..., "province": ..., "role": ...} con todos los términos
  municipales de la alternativa seleccionada; no incluyas los de alternativas descartadas. role es
  "generacion" si en ese término se ubica la planta, el parque, sus aerogeneradores, sus módulos o
  sus baterías, y "evacuacion" si solo lo atraviesa o lo ocupa la infraestructura de evacuación
  (línea eléctrica, subestación o centro de seccionamiento). Un término con ambas cosas es
  "generacion".
```

- [ ] **Step 5: `_sanitize`**

In `pipeline/impacto/extract/run.py`, change the schema import to include `MunicipalityRole`:

```python
from impacto.extract.schema import ConditionCategory, DocType, Extraction, MunicipalityRole, Technology, Verdict
```

After `_ALLOWED_CONDITION_CATEGORIES = set(get_args(ConditionCategory))`, add:

```python
_ALLOWED_MUNICIPALITY_ROLES = set(get_args(MunicipalityRole))
```

Replace the municipalities block in `_sanitize`:

```python
    municipalities = raw.get("municipalities")
    if isinstance(municipalities, list):
        raw["municipalities"] = [
            m for m in municipalities if not isinstance(m, dict) or m.get("name")
        ]  # a municipality without a name is nothing to link (seen live from ministral-14b)
```

with:

```python
    municipalities = raw.get("municipalities")
    if isinstance(municipalities, list):
        clean_municipalities = []
        for m in municipalities:
            if isinstance(m, dict):
                if not m.get("name"):
                    continue  # a municipality without a name is nothing to link (seen live from ministral-14b)
                if m.get("role") not in _ALLOWED_MUNICIPALITY_ROLES:
                    m = {**m, "role": None}  # an unknown role is no tag, and keeps the municipality in place
            clean_municipalities.append(m)
        raw["municipalities"] = clean_municipalities
```

Add one line to the `_sanitize` docstring, after the condition-category bullet:

```
    - a municipality's `role` outside "generacion"/"evacuacion" becomes
      null, which leaves it in `municipalities`.
```

- [ ] **Step 6: `validate_and_score`**

Replace `pipeline/impacto/extract/validate.py`'s `validate_and_score` with:

```python
def _canonicalise(municipalities: list[Municipality], names: dict[str, str]) -> tuple[list[Municipality], int]:
    fixed, problems = [], 0
    for m in municipalities:
        canonical = canonical_municipality(m.name, names)
        if canonical is None:
            problems += 1
        fixed.append(m.model_copy(update={"name": canonical or m.name}))
    return fixed, problems


def validate_and_score(extraction: Extraction, municipality_names: dict[str, str]) -> Extraction:
    data = extraction.model_dump()

    # Municipalities the model tagged as reached only by the evacuation line
    # leave the generation site. Untagged ones stay, so a document the model
    # declines to tag behaves exactly as before.
    generation = [m for m in extraction.municipalities if m.role != "evacuacion"]
    evacuation = list(extraction.evacuation_municipalities) + [
        m for m in extraction.municipalities if m.role == "evacuacion"
    ]
    generation, problems = _canonicalise(generation, municipality_names)
    evacuation, evacuation_problems = _canonicalise(evacuation, municipality_names)
    problems += evacuation_problems
    data["municipalities"] = [m.model_dump() for m in generation]
    data["evacuation_municipalities"] = [m.model_dump() for m in evacuation]

    for field, (lo, hi) in RANGES.items():
        value = data.get(field)
        if value is not None and not (lo <= value <= hi):
            data[field] = None
            problems += 1

    data["confidence"] = max(0.0, round(extraction.confidence - 0.1 * problems, 6))
    return Extraction.model_validate(data)
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `uv run python -m pytest -q tests/test_validate.py tests/test_extract_run.py tests/test_resolve_pure.py tests/test_prompts.py`
Expected: all pass, including the pre-existing validate tests (their expected confidences do not change: they have no evacuation entries).

- [ ] **Step 8: Full suite, lint, commit**

Run the full-suite command and `uv run ruff check .`. Expected: `172 passed`, ruff clean.

```bash
git add pipeline/impacto/extract/schema.py pipeline/impacto/extract/prompts.py pipeline/impacto/extract/run.py pipeline/impacto/extract/validate.py pipeline/tests/test_validate.py pipeline/tests/test_extract_run.py pipeline/tests/test_resolve_pure.py
git commit -m "extract: tag municipalities by role and move evacuation-only ones out

The prompt always told the model to omit municipalities the evacuation line
merely crosses, and it ignored that on 4 of 20 labels, attributing projects
to municipalities with only a cable. It now returns every municipality with
a role; validate moves 'evacuacion' entries to evacuation_municipalities.
Untagged entries stay put, so the change can only remove false positives.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The simplified-evaluation form (spec section 2b)

**Files:**
- Modify: `pipeline/impacto/extract/operative.py`
- Modify: `pipeline/impacto/extract/run.py` (`_OVERRIDABLE_DOC_TYPES`)
- Test: `pipeline/tests/test_operative.py`, `pipeline/tests/test_extract_run.py`

**Interfaces:**
- Produces: `find_operative` may return `OperativeHit("informe_impacto", "favorable_condicionada" | "no_aplica", sentence)`. `_OVERRIDABLE_DOC_TYPES["informe_impacto"] == {"informe_impacto", "otro"}`.

Verified on 2026-09-23 against the stored text of BOE-A-2025-24233: "formula informe de impacto ambiental" appears only in the title, which `find_operative` does not receive. The body quotes both halves of article 47 in its legal grounds ("si el proyecto debe someterse a una evaluación de impacto ambiental ordinaria ... o si por el contrario no es necesario dicho procedimiento"), after the marker "dispone" and before "resuelve:". The rule therefore reads only the part after the last resolving marker.

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_operative.py`:

```python
# BOE-A-2025-24233 (OPDE Miramundo), abridged from the stored text: the legal
# grounds quote both halves of article 47 before the operative sentence.
MIRAMUNDO = (
    "El artículo 47 dispone que el órgano ambiental determinará, mediante la emisión del informe de impacto "
    "ambiental, si el proyecto debe someterse a una evaluación de impacto ambiental ordinaria, por tener efectos "
    "significativos sobre el medio ambiente, o si por el contrario no es necesario dicho procedimiento.\n"
    "Esta Dirección General resuelve:\nDe acuerdo con los antecedentes de hecho y fundamentos de derecho alegados "
    "y como resultado de la evaluación de impacto ambiental practicada, que no es necesario el sometimiento al "
    "procedimiento de evaluación ambiental ordinaria del proyecto «Módulo de almacenamiento OPDE Miramundo», ya que "
    "no se prevén efectos adversos significativos sobre el medio ambiente, siempre que se cumplan las medidas y "
    "prescripciones establecidas en el documento ambiental y en la presente resolución."
)


def test_simplified_evaluation_without_ordinary_procedure_is_favourable_with_conditions():
    # The grounds' "debe someterse ... ordinaria" sits before "resuelve" and must not count.
    hit = find_operative(MIRAMUNDO)
    assert hit is not None
    assert hit.doc_type == "informe_impacto"
    assert hit.verdict == "favorable_condicionada"
    assert "no es necesario el sometimiento" in hit.sentence


def test_simplified_evaluation_requiring_ordinary_procedure_has_no_verdict():
    # The other half of the form routes the procedure; it says nothing about effects.
    routed = MIRAMUNDO.replace(
        "que no es necesario el sometimiento al procedimiento de evaluación ambiental ordinaria",
        "que el proyecto debe someterse a una evaluación ambiental ordinaria",
    )
    hit = find_operative(routed)
    assert (hit.doc_type, hit.verdict) == ("informe_impacto", "no_aplica")
    needed = ("Esta Dirección General resuelve que es necesario el sometimiento al procedimiento de evaluación de "
              "impacto ambiental ordinaria del proyecto PSFV Sol.")
    assert (find_operative(needed).doc_type, find_operative(needed).verdict) == ("informe_impacto", "no_aplica")
```

In `pipeline/tests/test_extract_run.py`, add:

```python
def test_extract_document_simplified_evaluation_overrides_otro():
    model_says = {"doc_type": "otro", "verdict": "no_aplica", "project_name": "Módulo de almacenamiento OPDE Miramundo"}
    text = ("Esta Dirección General resuelve: que no es necesario el sometimiento al procedimiento de evaluación "
            "ambiental ordinaria del proyecto «Módulo de almacenamiento OPDE Miramundo».")
    e = extract_document(StubProvider([model_says]), "Resolución", text, {})
    assert (e.doc_type, e.verdict) == ("informe_impacto", "favorable_condicionada")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run python -m pytest -q tests/test_operative.py tests/test_extract_run.py`
Expected: the three new tests fail (`find_operative` returns `None`; the extract test gets `('otro', 'no_aplica')`). If the extract test instead fails with `StubProvider has no responses left`, the text split into more than one section: shorten it to the single sentence shown, which has no section headings.

- [ ] **Step 3: Implement**

In `pipeline/impacto/extract/operative.py`, add after `_AAU_DENY`:

```python
_IIA_NOT_NEEDED = re.compile(
    r"no es necesari[oa] (?:el sometimiento|someter(?:lo)?) (?:al procedimiento de |a )?"
    r"evaluacion (?:de impacto )?ambiental ordinaria"
)
_IIA_NEEDED = re.compile(
    r"(?<!\bno )(?:es necesari[oa] (?:el sometimiento|someter(?:lo)?)|debe someterse) "
    r"(?:al procedimiento de |a (?:una )?)?evaluacion (?:de impacto )?ambiental ordinaria"
)
```

In `find_operative`, inside `if resolving is not None:` after the two AAU loops, add:

```python
        for match in _IIA_NOT_NEEDED.finditer(part):
            hits.append((offset + match.start(), OperativeHit("informe_impacto", "favorable_condicionada", match.group(0))))
        for match in _IIA_NEEDED.finditer(part):
            hits.append((offset + match.start(), OperativeHit("informe_impacto", "no_aplica", match.group(0))))
```

In the module docstring, add after the AAU bullets:

```
- "no es necesario el sometimiento al procedimiento de evaluacion ambiental
  ordinaria" (simplified evaluation, Ley 21/2013 article 47)
  -> informe_impacto, favorable_condicionada
- "es necesario el sometimiento ..." / "debe someterse a ... evaluacion ...
  ordinaria" -> informe_impacto, no_aplica (the report routes the procedure
  and says nothing about the project's effects)
```

and change the paragraph beginning "AAU verbs are only read inside the resolving part" to begin "AAU verbs and the simplified-evaluation forms are only read inside the resolving part", adding at its end: "The simplified form's legal grounds quote both halves of article 47 before the operative sentence, and its opening, \"formula informe de impacto ambiental\", appears only in the title."

In `pipeline/impacto/extract/run.py`, change `_OVERRIDABLE_DOC_TYPES` to:

```python
_OVERRIDABLE_DOC_TYPES = {
    "dia": {"dia", "otro"},
    "aau": {"aau", "otro"},
    "informe_impacto": {"informe_impacto", "otro"},
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run python -m pytest -q tests/test_operative.py tests/test_extract_run.py`
Expected: all pass, including every pre-existing operative test (the three BOE fixtures and the AAU cases).

- [ ] **Step 5: Full suite, lint, commit**

Run the full-suite command and `uv run ruff check .`. Expected: `175 passed`, ruff clean.

```bash
git add pipeline/impacto/extract/operative.py pipeline/impacto/extract/run.py pipeline/tests/test_operative.py pipeline/tests/test_extract_run.py
git commit -m "extract: read the simplified-evaluation form by rule

A simplified evaluation resolves 'que no es necesario el sometimiento al
procedimiento de evaluacion ambiental ordinaria', a form neither DIA
pattern covers, so OPDE Miramundo came back otro / no_aplica. Both halves
of the statutory form are now read after the last resolving marker; the
half that routes to ordinary evaluation carries no verdict.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The prompt half (spec section 4), the after-figure and the docs

**Files:**
- Modify: `pipeline/impacto/extract/prompts.py` (the `technology` and capacity bullets)
- Create (by the eval run): `pipeline/evaluation/tuned_run.json`, `pipeline/evaluation/tuned_run_misses.json`
- Modify: `pipeline/evaluation/README.md`, `docs/sources.md`, `docs/superpowers/specs/2026-09-22-extraction-fixes-design.md` (progress log)
- Test: `pipeline/tests/test_prompts.py`

**Interfaces:**
- Consumes: `impacto eval --provider mistral [--out PATH]` from Task 1; everything from Tasks 2 to 5.

This task spends Mistral calls: each eval run extracts the 20 labelled documents from production `raw_documents` (read-only) using `IMPACTO_DB_DSN` and `IMPACTO_MISTRAL_KEY` from `pipeline/env.local`. Temperature is 0, so reruns are close to deterministic.

The baseline's 18 misses, as `(source_id, field)`. The nine `project_name` entries are the production `v3` misses from Task 3; the rest are listed in the spec:

```python
BASELINE_MISSES = {
    ("BOE-A-2022-15703", "project_name"), ("BOE-A-2022-18089", "project_name"), ("BOE-A-2024-16661", "project_name"),
    ("disposition.2024.38.48", "project_name"), ("disposition.2025.144.69", "project_name"),
    ("disposition.2025.23.46", "project_name"), ("disposition.2025.63.37", "project_name"),
    ("disposition.2026.125.87", "project_name"), ("disposition.2026.142.33", "project_name"),
    ("BOE-A-2022-18089", "municipalities"), ("BOE-A-2023-19636", "municipalities"),
    ("BOE-A-2023-2422", "municipalities"), ("BOE-A-2026-3880", "municipalities"),
    ("BOE-A-2025-24233", "doc_type"), ("BOE-A-2025-24233", "verdict"),
    ("BOE-A-2022-15703", "technology"), ("BOE-A-2022-15703", "mw_nominal"),
    ("BOE-A-2023-2907", "mw_nominal"),
}
```

- [ ] **Step 1: Measure the deterministic fixes before touching the prompt**

Save the comparison script to the scratchpad as `compare_misses.py`:

```python
import json
import sys

BASELINE_MISSES = {
    ("BOE-A-2022-15703", "project_name"), ("BOE-A-2022-18089", "project_name"), ("BOE-A-2024-16661", "project_name"),
    ("disposition.2024.38.48", "project_name"), ("disposition.2025.144.69", "project_name"),
    ("disposition.2025.23.46", "project_name"), ("disposition.2025.63.37", "project_name"),
    ("disposition.2026.125.87", "project_name"), ("disposition.2026.142.33", "project_name"),
    ("BOE-A-2022-18089", "municipalities"), ("BOE-A-2023-19636", "municipalities"),
    ("BOE-A-2023-2422", "municipalities"), ("BOE-A-2026-3880", "municipalities"),
    ("BOE-A-2025-24233", "doc_type"), ("BOE-A-2025-24233", "verdict"),
    ("BOE-A-2022-15703", "technology"), ("BOE-A-2022-15703", "mw_nominal"),
    ("BOE-A-2023-2907", "mw_nominal"),
}
misses = {(m["source_id"], m["field"]) for m in json.load(open(sys.argv[1], encoding="utf-8"))}
new = sorted(misses - BASELINE_MISSES)
fixed = sorted(BASELINE_MISSES - misses)
kept = sorted(misses & BASELINE_MISSES)
print("NEW (regressions):", new)
print("FIXED:", fixed)
print("STILL MISSED:", kept)
sys.exit(1 if new else 0)
```

Run from `pipeline/`:

```bash
uv run python -m impacto eval --provider mistral --out "$SCRATCH/before_prompt.json"
uv run python "$SCRATCH/compare_misses.py" "$SCRATCH/before_prompt_misses.json"
```

(`$SCRATCH` is the session scratchpad directory.) Record the three lists in the spec's progress log. Expected: the `project_name` tail misses, the `municipalities` misses and the two BOE-A-2025-24233 misses are gone or reduced; the three section-4 misses remain. If NEW is non-empty, stop and report: a deterministic fix regressed a field, and that is Task 3, 4 or 5's defect, not something to correct in the prompt.

- [ ] **Step 2: Write the failing prompt test**

Append to `pipeline/tests/test_prompts.py`:

```python
def test_prompt_separates_the_installations_under_evaluation_from_existing_ones():
    assert "objeto de esta evaluación" in SYSTEM_PROMPT
    assert "existente" in SYSTEM_PROMPT
    assert "descripción final" in SYSTEM_PROMPT
```

Run: `uv run python -m pytest -q tests/test_prompts.py`. Expected: the new test fails.

- [ ] **Step 3: Change the prompt**

In `pipeline/impacto/extract/prompts.py`, directly after the capacity bullet's last line (`  una planta, devuelve un número.`), add:

```
  technology, mw_peak, mw_nominal, hectares y turbines describen solo las instalaciones que son objeto
  de esta evaluación. Una instalación existente que el texto solo menciona (por ejemplo "para su
  hibridación con el parque eólico existente X", o una subestación o línea ya construida que el proyecto
  comparte) no forma parte del proyecto: no sumes su potencia ni la uses para decidir technology; si una
  instalación nueva se hibrida con una existente, technology es la de la instalación nueva. Cuando la
  resolución da para una planta una cifra de la solicitud inicial y otra de la descripción final del
  proyecto evaluado, usa la de la descripción final, una sola vez por planta, e incluye todas las
  plantas evaluadas.
```

Run: `uv run python -m pytest -q tests/test_prompts.py`. Expected: pass.

- [ ] **Step 4: Measure the prompt change**

```bash
uv run python -m impacto eval --provider mistral
uv run python "$SCRATCH/compare_misses.py" evaluation/tuned_run_misses.json
```

The run writes `evaluation/tuned_run.json` and `evaluation/tuned_run_misses.json`. Acceptance:
- NEW is empty (no document/field that passed at baseline now misses), and
- `("BOE-A-2022-15703", "technology")`, `("BOE-A-2022-15703", "mw_nominal")` and `("BOE-A-2023-2907", "mw_nominal")` are in FIXED.

If NEW is non-empty, first rerun once to rule out nondeterminism. If it persists or a target miss remains, revise only the text added in Step 3 and rerun; at most three revisions. If three revisions do not meet acceptance, revert Step 3's prompt text and the Step 2 test, rerun `impacto eval --provider mistral` so `tuned_run.json` reflects the shipped code, and record in the spec's progress log that section 4 was dropped and why. That is the spec's exit for this section, not a failure of the slice.

Then confirm `git status --short pipeline/evaluation/` shows `tuned_run.json` and `tuned_run_misses.json` as new and `last_run.json` unchanged.

- [ ] **Step 5: Docs**

In `pipeline/evaluation/README.md`, change "results go to `last_run.json` and are quoted on the site's methodology page." to "results go to `tuned_run.json` (override with `--out`), with each miss in `tuned_run_misses.json` beside it." Change "listed under `skipped` in `last_run.json`" to "listed under `skipped` in the result file". Replace the final `Status:` paragraph with:

```
Status: 20 labels (11 BOE, 9 BOJA), reviewed by hand on 2026-09-22.
`last_run.json` holds the Mistral run on that set with prompt v3, made before
anyone tuned the extractor against these labels. It is the published figure
(`impacto export` copies it to `web/public/data/evaluation.json`) and it is
frozen: `run_eval` refuses to write it.

The extraction fixes of 2026-09-23 (prompt v4) were designed and checked
against these same 20 labels, so from then on they are a tuning set.
`tuned_run.json` records the v4 result for reference; it is not evidence
about unseen documents and is not published. A new published figure needs
labels written after 2026-09-23, and replacing `last_run.json` with it means
removing the guard in `run_eval.py` in the same commit.
```

In `docs/sources.md`, after the "BOE-A-2025-24233, slice 2 eval miss" bullet (the last bullet before `## Reference layers`), add:

```
- **Measured, not fixed (2026-09-23)**: the five operative-rule gaps above (Gelo's "autorización ambiental unificada otorgada por", the Los Morales revocation, the Los Barrios denial inside a "da publicidad" title, Vico y Mizán with no resolving marker, Tabernas Solar 3 headed "Acuerdo", and Solar Airport PV's consultation inside a "modificación sustancial") all scored correct `doc_type` and `verdict` in the slice 2 evaluation without the rule firing. They are latent gaps the model covers, deliberately left alone; see the extraction-fixes spec.
- **Extraction fixes, prompt v4 (2026-09-23)**: project names are trimmed of descriptive tails (`impacto.extract.names`), municipalities carry a `role` and evacuation-only ones move to `evacuation_municipalities`, and the simplified-evaluation form is read by rule. Result on the 20 labels in `pipeline/evaluation/tuned_run.json`: <copy the accuracy line per field from the run>. This is a tuning figure, not a measurement on unseen documents.
```

Replace the `<copy ...>` text with the actual per-field accuracies from `tuned_run.json`.

In the spec's progress log, add a 2026-09-23 entry with: the before-prompt and after-prompt FIXED / STILL MISSED lists, whether section 4 shipped, and the commit hashes of Tasks 1 to 6.

- [ ] **Step 6: Full suite, lint, commit**

Run the full-suite command and `uv run ruff check .`. Expected: `176 passed` (175 if section 4 was dropped), ruff clean.

```bash
git add pipeline/impacto/extract/prompts.py pipeline/tests/test_prompts.py pipeline/evaluation/tuned_run.json pipeline/evaluation/tuned_run_misses.json pipeline/evaluation/README.md docs/sources.md docs/superpowers/specs/2026-09-22-extraction-fixes-design.md
git commit -m "extract: tell evaluated installations from existing ones; record the v4 run

Retuerta summed an existing wind farm it only shares a substation with,
and BOE-A-2023-2907 mixed initial and final per-plant figures. The prompt
now limits technology and capacity to the installations under evaluation.

tuned_run.json is a post-tuning figure on the 20 labels the fixes were
designed against. It is not published; last_run.json stays the published
pre-tuning baseline.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The methodology sentence (spec section 5, web)

**Files:**
- Modify: `web/src/app/metodologia/page.tsx` (the `data-testid="muestra"` paragraph)
- Test: `web/e2e/metodologia.spec.ts`

**Interfaces:**
- None. The sentence is static text; `evaluation.json` is unchanged.

The sentence is true only once production is re-extracted with v4 (Task 9). It lands on the branch now and reaches the live site only when Task 9 pushes, after the re-run.

- [ ] **Step 1: Write the failing assertion**

In `web/e2e/metodologia.spec.ts`, after the line `await expect(page.getByTestId("muestra")).toContainText(/mistral/);`, add:

```ts
  // The published figure predates the extractor corrections made against the
  // same labelled documents; the page must say so.
  await expect(page.getByTestId("muestra")).toContainText("antes de corregir el extractor");
```

- [ ] **Step 2: Run it to verify it fails**

From `web/`: `npm run build` then `npm run e2e -- metodologia.spec.ts`
Expected: FAIL on `toContainText("antes de corregir el extractor")`.

- [ ] **Step 3: Add the sentence**

In `web/src/app/metodologia/page.tsx`, in the `data-testid="muestra"` paragraph, replace the closing text `se escribieron leyendo cada resolución, no la extracción, y se revisaron una a una.` with:

```tsx
        se escribieron leyendo cada resolución, no la extracción, y se revisaron una a una. Esta precisión se midió
        antes de corregir el extractor con esos mismos documentos; los datos publicados proceden ya de la versión
        corregida, y medir su precisión exige etiquetar documentos nuevos.
```

- [ ] **Step 4: Verify**

From `web/`: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass, including the axe sweep in `e2e/a11y.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/metodologia/page.tsx web/e2e/metodologia.spec.ts
git commit -m "web: say the published accuracy predates the extractor corrections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Review and merge to `main`

**Files:** none changed beyond review fixes.

- [ ] **Step 1: Whole-branch review**

Use superpowers:requesting-code-review on `main..worktree-extraction-fixes`. Fix findings with their own commits and rerun the full suite and the web checks from Task 7 Step 4.

- [ ] **Step 2: Rebase and fast-forward**

History on `main` is linear (no merge commits). From the worktree:

```bash
git fetch -q
git rebase main
```

Rerun the full suite. Then from the main checkout (`C:\Users\lmiro\workspace\impacto-acumulado`):

```bash
git merge --ff-only worktree-extraction-fixes
git log --oneline -12
```

- [ ] **Step 3: Stop for the user**

Report the commits now on `main` and ask whether to proceed with Task 9 (production re-run). Do not push: pushing `main` deploys the web sentence, which is only true after Task 9.

---

### Task 9: Production re-run and republish (spec section 5)

Runs in the main checkout, `C:\Users\lmiro\workspace\impacto-acumulado\pipeline`, on `main`, against Neon production (project `calm-sunset-94532458`). Every step below except the backup branch writes production data.

**Why the backup:** `save_extraction` overwrites the row on failure with `status = 'failed'` and `payload = NULL`, and resolve reads only `status = 'ok'`. A document whose v4 extraction fails three times would disappear from the dataset, even though it had a good v3 extraction. The backup branch holds those v3 rows.

- [ ] **Step 1: Preconditions**

```bash
gh run list --workflow pipeline.yml --limit 3
```

Expected: no run `in_progress`. The weekly run is Mondays 06:00 UTC; do not start within a few hours of it.

Create a Neon branch `pre-v4-reextract` from the default branch (Neon console, or the Neon MCP `create_branch` tool on project `calm-sunset-94532458`). Record its id in the spec's progress log.

- [ ] **Step 2: Snapshot the before-state**

Save to `$SCRATCH/before.json`:

```bash
uv run python - <<'EOF' > "$SCRATCH/before.json"
import json
from impacto.db.connect import connect
from impacto.settings import load_settings
with connect(load_settings().db_dsn) as conn, conn.cursor() as cur:
    cur.execute("SELECT id FROM projects ORDER BY id")
    ids = [r["id"] for r in cur.fetchall()]
    cur.execute("SELECT source, count(*) AS n FROM raw_documents GROUP BY source ORDER BY source")
    docs = {r["source"]: r["n"] for r in cur.fetchall()}
    cur.execute("SELECT payload->>'doc_type' AS t, count(*) AS n FROM extractions WHERE status = 'ok' GROUP BY 1 ORDER BY 1")
    types = {r["t"]: r["n"] for r in cur.fetchall()}
print(json.dumps({"project_ids": ids, "documents": docs, "doc_types": types}))
EOF
```

Expected: 347 project ids; documents `{"boe": 71, "boja": 566}`.

- [ ] **Step 3: Fetch the recovered document**

```bash
uv run python -m impacto fetch --source boe --from 2025-06-07 --to 2025-06-07
```

Expected: `BOE-A-2025-11509` stored (the fetch output names it or counts one new document). It has no extraction yet, so the next step extracts it under v4 directly.

- [ ] **Step 4: Re-extract**

```bash
for i in $(seq 1 30); do
  out=$(uv run python -m impacto extract --provider mistral --redo-prompt-version v3 --limit 50 | tail -1)
  echo "$out"
  [ "$out" = "extracted 0 document(s)" ] && break
done
```

If a run logs `provider quota exhausted`, wait for the quota to reset and rerun the loop; it resumes where it stopped because only `v3` rows are reselected.

Then check:

```bash
uv run python - <<'EOF'
from impacto.db.connect import connect
from impacto.settings import load_settings
with connect(load_settings().db_dsn) as conn, conn.cursor() as cur:
    cur.execute("SELECT prompt_version, status, count(*) AS n FROM extractions GROUP BY 1, 2 ORDER BY 1, 2")
    print(cur.fetchall())
    cur.execute("SELECT d.source_id, e.error FROM extractions e JOIN raw_documents d ON d.id = e.document_id WHERE e.status = 'failed'")
    print(cur.fetchall())
EOF
```

Expected: a single row `v4 / ok / 638` and no failed documents. **If any document is `failed`, stop and report the list to the user**: restoring those rows from `pre-v4-reextract` is the user's call.

- [ ] **Step 5: Resolve, aggregate, and check before exporting**

```bash
uv run python -m impacto resolve
uv run python -m impacto aggregate
```

Then compute the after-state with the Step 2 script into `$SCRATCH/after.json`, plus:

```sql
SELECT count(*) FROM extractions WHERE status = 'ok' AND jsonb_array_length(payload->'evacuation_municipalities') > 0;
```

Record in the spec's progress log: documents per source, project count before and after, the project ids that disappeared (`before - after`), doc_type counts before and after, and the evacuation count.

Stop and report to the user, without exporting, if any of these holds: the project count moved by more than 10% (below 312 or above 382); `informe_impacto` changed by more than a few documents without a named reason; any doc_type other than `informe_impacto` changed by more than 10%. Otherwise continue.

- [ ] **Step 6: Export and commit the data**

```bash
uv run python -m impacto export
git status --short ../web/public/data
```

Expected: `projects.csv`, `documents.csv`, the municipality and province files and `meta.json` change; `evaluation.json` is unchanged (it is still copied from the frozen `last_run.json`).

Update `README.md`'s status paragraph with the new counts ("N projects resolved from 72 BOE and 566 BOJA documents") and note the v4 extraction. Add the final progress-log entry to the spec and set its `Status:` to `implemented; production re-extracted with prompt v4 on <date>`.

```bash
git add ../web/public/data ../README.md ../docs/superpowers/specs/2026-09-22-extraction-fixes-design.md
git commit -m "data: re-extract with prompt v4, resolve and export

<one line each: document counts, project count before -> after, retired
project ids, evacuation-only municipalities now excluded>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Replace the angle-bracket lines with the recorded figures.

- [ ] **Step 7: Build check and hand-off**

From `web/`: `npm test && npm run build && npm run e2e`. Expected: all pass against the new data (the sitemap and `/proyecto/[id]` pages regenerate from `projects.csv`).

Report to the user: the figures, the retired project ids, and that `main` is ready to push. Push only on their go-ahead. After the push, confirm the CI run is green and that `/metodologia` shows the new sentence on https://impacto-acumulado.vercel.app. The backup branch `pre-v4-reextract` can be deleted once the user is satisfied; that too is their call.
