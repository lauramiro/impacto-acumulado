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
