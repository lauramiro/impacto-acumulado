# Extraction evaluation

One JSON file per hand-labelled document in `labels/`. Only the fields listed
under `expected` are scored; any other key (for example `note`) is ignored by
the scorer and exists to explain a labelling decision. Run with
`uv run python -m impacto eval` (add `--provider stub` for a dry run); results
go to `tuned_run.json` (override with `--out`), with each miss in
`tuned_run_misses.json` beside it.

Scoring (`evaluation/run_eval.py`; the package is named `evaluation` so it
does not shadow Python's built-in `eval`, while the CLI subcommand stays `eval`):
- `doc_type`, `verdict`, `technology`: exact match.
- `mw_peak`, `mw_nominal`, `hectares`, `turbines`: within 2 percent; a `null`
  label scores only when the extraction is also null.
- `municipalities`: set equality of accent-insensitive, case-insensitive names.
- other strings: equal after normalisation and dropping commas and full stops.
- A label whose document is not in `raw_documents`, or whose extraction fails
  (rate limit, malformed response), is skipped with a logged warning and listed
  under `skipped` in the result file; accuracy is over the scored labels only.

Labelling rules:
- Read the document, not the extraction. Never copy an extraction into a label.
- `verdict` is `favorable_condicionada` whenever conditions are imposed, which is
  nearly always for a favourable DIA. Ministry DIAs never use the word
  "favorable": the favourable form is "formula declaracion de impacto ambiental
  a la realizacion del proyecto ... en la que se establecen las condiciones";
  the unfavourable form adds "desfavorable" after "impacto ambiental".
- `municipalities` lists the municipalities of the generation site only, not the
  evacuation line. Use the spelling of the DERA municipality layer.
- Numbers are as printed in the resolution, MW nominal preferred over MW peak.
  `mw_nominal` is the project total: use the printed total when there is one;
  when the resolution prints only per-installation figures, sum them and say so
  in a `note`. Label `null` when the document states no capacity at all.
- Omit a field rather than guess it (for example `developer` when a document
  names a dozen special-purpose promoters and no single developer).
- Aim for a mix: at least 5 BOJA documents, at least 3 unfavourable, at least 2
  wind, at least 2 public consultation notices.

Two label sets:

- `labels/`: 20 labels (11 BOE, 9 BOJA), reviewed by hand on 2026-09-22. The
  Mistral run on them with prompt v3, made before anyone tuned the extractor,
  is kept in `2026-09-22_run.json`. The extraction fixes of 2026-09-23 (prompt
  v4) were designed and checked against these labels, so they are a tuning
  set; `tuned_run.json` records the v4 result for reference.
- `labels_2026-10/`: 20 labels written on 2026-10-05, after the tuning, on
  documents never used to tune. Chosen by keyword and at random within strata,
  not by the extractor's output: 6 ministry impact declarations (2
  unfavourable, 3 wind or hybrid), 4 BOE section V consultations, 7 BOJA AAU
  notices (2 refusals, 3 wind) and 3 BOJA consultations (hydrogen plants
  with their own solar field; their `technology` is not labelled).

`last_run.json` is the published figure (`impacto export` copies it to
`web/public/data/evaluation.json`, with the September run beside it as
history): the run on `labels_2026-10/`, made with the `extraction-eval`
workflow on 2026-10-05, misses in `last_run_misses.json`. To refresh it, run
that workflow and commit its `eval_run.json` as `last_run.json`. Once
anything is tuned against `labels_2026-10/`, a new published figure needs new
labels again.

Growing the held-out set to 100 (2026-10-06):

- `sample_2026-10.csv` is the frozen sampling list, drawn by `uv run python -m
  evaluation.sample` from the 2026-10-05 `documents.csv`: the 20 labels in
  `labels_2026-10/` plus 80 documents to label, stratified by source (BOE
  section III, BOE section V, BOJA) and technology (from the title by keyword,
  else from the project; column `technology_from`), at least 3 per stratum,
  seed 20261006. Documents in `labels/` are excluded.
- `uv run python -m evaluation.sample --stubs` writes one stub per document to
  label into `to_label/` (`expected` holds null `doc_type` and `verdict`, which
  fail `tests/test_eval.py` until filled). Read the document at its `url`,
  fill `expected` and `note` by the rules above, and move the file into
  `labels_2026-10/`. `--status` counts what is left.
- Once all 100 are in, run the `extraction-eval` workflow on `labels_2026-10`
  and commit its `eval_run.json` as `last_run.json`. The run now records
  `correct` per field; the export adds a Wilson 95 percent interval per field
  (`intervals` in `evaluation.json`), which `/metodologia` shows beside each
  percentage.
