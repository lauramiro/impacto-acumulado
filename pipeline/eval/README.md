# Extraction evaluation

One JSON file per hand-labelled document in `labels/`. Only the fields listed
under `expected` are scored; any other key (for example `note`) is ignored by
the scorer and exists to explain a labelling decision. Run with
`uv run python -m impacto eval` (add `--provider stub` for a dry run); results
go to `last_run.json` and are quoted on the site's methodology page.

Scoring (`eval/run_eval.py`):
- `doc_type`, `verdict`, `technology`: exact match.
- `mw_peak`, `mw_nominal`, `hectares`, `turbines`: within 2 percent; a `null`
  label scores only when the extraction is also null.
- `municipalities`: set equality of accent-insensitive, case-insensitive names.
- other strings: equal after normalisation and dropping commas and full stops.
- A label whose document is not in `raw_documents`, or whose extraction fails
  (rate limit, malformed response), is skipped with a logged warning and listed
  under `skipped` in `last_run.json`; accuracy is over the scored labels only.

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

Status: four labels so far (see each file's `note`). The 20-document set and
the published accuracy table are deferred until after the backfill, because the
Groq free tier (200,000 tokens per day) covers only two or three long documents
a day.
