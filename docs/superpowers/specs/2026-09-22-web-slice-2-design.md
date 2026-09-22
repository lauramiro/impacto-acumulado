# Web slice 2: project page, data page, methodology with published accuracy

Date: 2026-09-22
Status: spec and plan written, pre-implementation
Parent design: [2026-09-18-impacto-acumulado-design.md](2026-09-18-impacto-acumulado-design.md)
Previous slice: [2026-09-21-web-slice-1-design.md](2026-09-21-web-slice-1-design.md)

## Progress log

Kept current so a compacted conversation loses nothing. Update on every
approval and every milestone.

- 2026-09-22: brainstorming. Decisions 1 to 7 below taken. Sections 1 and 2
  of the design approved in chat, then sections 3 and 4. Spec written and
  committed. Implementation plan written at
  `docs/superpowers/plans/2026-09-22-web-slice-2.md` (15 tasks: labels 1-4,
  export 5-8, web 9-14, deploy 15). Nothing implemented yet.
- 2026-09-22: Task 1 done (label well-formedness test added in `cc49e8a`, 16
  candidates picked into `$TMP/picked.txt`). Task 2 (BOE labels) is next.
- 2026-09-22: Task 2 done (8 BOE labels written in `1f2c027`: BOE-A-2022-15703,
  BOE-A-2022-18089, BOE-A-2023-2422, BOE-A-2023-17621, BOE-A-2023-19636,
  BOE-A-2024-16661, BOE-A-2025-24233, BOE-A-2026-3880; extraction observations
  added to `docs/sources.md`). Task 3 (BOJA labels) is next.

## Decisions taken during brainstorming, in order

1. Slice 2 is "complete the paper trail": project page, `/datos`, real
   `/metodologia`. Map deepening (technology filter, overlays) and the time
   dimension (province table, monthly timeline) are later slices.
2. Accuracy figures on the methodology page come from the evaluation
   harness output, not hand-typed. Four labels is too small a sample to
   publish, so the label set is grown to 20 in this slice (the target the
   evaluation README already sets, with its mix: at least 5 BOJA, 3
   unfavourable, 2 wind, 2 public consultation notices).
3. Claude drafts the 16 new labels by reading the full text of each
   document in `raw_documents`, never that document's extraction, with a
   `note` per label; the user reviews every label before the eval is run
   and its result published.
4. The project page exposes provenance framed as caveats: which document
   fixed the status, the resolve `match_score` when below 1, the extraction
   `confidence` of the document the figures come from.
5. Dataset licence: CC BY 4.0.
6. Eval figures reach the site through the export: `export` copies
   `pipeline/evaluation/last_run.json` into `web/public/data/evaluation.json`.
   Reading the pipeline file directly from the web is not viable because
   Vercel's root directory is `web`.
7. Project ids are stable (`project_id = min(document_id)` of the group,
   `pipeline/impacto/resolve/run.py`), so `/proyecto/[id]` is shareable. A
   later merge of two groups retires the higher id; that URL then 404s.

## Section 1: Scope, order and export changes (approved)

Work happens in this order, because the web pages quote the eval and the
new columns.

1. Labels: 16 new labels in `pipeline/evaluation/labels/` to reach 20 with
   the README mix. Candidates are selected with a SQL query over
   `raw_documents` joined to `extractions`, filtered by source, doc_type and
   verdict only to guarantee the mix; each label is written from
   `raw_documents.text` without opening that document's extraction. Every
   label has a `note`. After review, `uv run python -m impacto eval
   --provider mistral` produces `last_run.json`, which is committed.
2. Export changes (`pipeline/impacto/aggregate/export.py`, tested in
   `pipeline/tests/test_export.py`, documented in `docs/sources.md`):
   - `projects.csv` gains `status_document_id` (already in the `projects`
     table).
   - New `evaluation.json`: copy of `last_run.json` plus `labels_count`
     (number of files in `labels/`) so the page can say "sobre N
     documentos". Missing `last_run.json` fails the export loudly.
   - `meta.json` gains `files`: per export `{rows, bytes}` so `/datos`
     shows sizes and counts without the web opening every file.
3. Web: `/proyecto/[id]`, `/datos`, `/metodologia`; municipality page
   project records link to the project page; `sitemap.ts` covering all
   page families (785 municipalities + 347 projects + 3 static pages),
   which the site lacks today.

Out of scope: technology filter, overlays, province table, timeline, dark
mode, English, any resolve or extraction change. Extraction bugs found while
labelling are recorded in `docs/sources.md` and left for a later slice; the
eval measures the extractor as it is.

## Section 2: Project page `/proyecto/[id]` (approved)

Statically generated for every row of `projects.csv` (347 today). Unknown or
retired ids 404 through `notFound()`.

```
+------------------------------------------------------------+
| masthead + date line                                       |
+------------------------------------------------------------+
| Solar fotovoltaica · Favorable con condiciones   (caption) |
| Planta solar fotovoltaica Las Quinientas          (Bodoni) |
| Cartuja Solar, S.L.                                        |
+------------------------------------------------------------+
| Ficha                                                      |
| Potencia nominal   109,5 MW      Superficie   358,6 ha     |
| Potencia pico      109,5 MW      Aerogeneradores  —        |
| Municipios   Jerez de la Frontera (Cádiz)  -> /municipio   |
| Primera publicación  8 de agosto de 2019                   |
| Última publicación   13 de noviembre de 2020               |
+------------------------------------------------------------+
| Documentos (2)                                             |
| 8 de agosto de 2019 · BOE-A-2019-11702                     |
|   Declaración de impacto ambiental · Favorable con cond.   |
|   "Resolución de 26 de julio de 2019, de la Dirección..."  |
|   [Ver en el BOE]                          Fija el estado  |
| 13 de noviembre de 2020 · BOE-A-2020-14181                 |
|   Modificación · No aplica                                 |
|   "Resolución de ..."                                      |
|   [Ver en el BOE]         Agrupado con confianza 0,82      |
+------------------------------------------------------------+
| Cómo se ha construido esta ficha                           |
| Los datos proceden de la lectura automática de los         |
| documentos anteriores. El estado lo fija la resolución     |
| marcada. La potencia y la superficie son las del documento |
| más reciente que las cita; la confianza declarada por el   |
| modelo para ese documento es 0,93. Precisión medida en     |
| Metodología.                                               |
+------------------------------------------------------------+
| footer: date line · Metodología · Datos                    |
+------------------------------------------------------------+
```

- Documents in `published_at` ascending (a timeline reads forward; the
  municipality page keeps `last_seen` descending for its project list).
  Each row: date and gazette id in mono, role and verdict as text with the
  existing `StatusBadge` for the verdict, the full gazette title as a
  quotation, the outbound link. "Fija el estado" marks
  `status_document_id`. "Agrupado con confianza X" appears only when
  `match_score < 1`, in caption size.
- The provenance block quotes the extraction `confidence` of the latest
  document, since that is where the figures come from (`_latest_with` in
  resolve). Absent fields show "—" and are not omitted, so a missing MW is
  visible.
- Multi-municipality projects list every municipality with its province,
  each a link to `/municipio/[ine]`.
- `generateMetadata`: title "<name> · Impacto Acumulado", description with
  status, MW and municipalities.
- Municipality page change: each project record's name becomes a link to
  `/proyecto/[id]`; documents stay linked to the gazette.
- Data: `loadProjects()` gains `statusDocumentId`; `loadDocumentsByProject()`
  groups the existing document loader by `projectId`. Components:
  `components/project/record-header.tsx`, `fact-sheet.tsx`,
  `document-timeline.tsx`, `provenance.tsx`. Ships no client JS.

## Section 3: `/datos` and `/metodologia` (approved)

### `/datos`

One static page. Top: the date line and one paragraph: what the dataset
is, CC BY 4.0 with the licence link, and a citation block in mono:

> Impacto Acumulado (2026). Resoluciones ambientales de proyectos
> renovables en Andalucía, 2019 a 2026. Datos a 22 de septiembre de 2026.
> https://impacto-acumulado.vercel.app/datos

Then a table, one row per export, from `meta.files`: file, content, rows,
size, download link. Files listed, in this order: `projects.csv`,
`documents.csv`, `municipality_stats.csv`, `province_monthly.csv`,
`protected_area_stats.json`, `municipality_protected_areas.json`,
`municipalities.geojson`, `protected_areas.geojson`, `provinces.geojson`,
`meta.json`, `evaluation.json`. The two internal files
(`municipality_stats.json`, `municipalities_map.geojson`) are omitted: they
duplicate listed content in web-shaped form. Under the table, a column
reference per CSV (name, type, meaning) from `src/lib/data/catalog.ts`,
unit-tested against the real headers so it cannot drift from the exports.
Enumeration values with their Spanish labels are listed once, reusing
`labels.ts`.

### `/metodologia`

Replaces the placeholder. Sections, all prose except where noted:

1. Fuentes: BOE (section III, ministry, filters; only projects above 50
   MW), BOJA (environment department, AAU and información pública),
   backfill from 2019. Reference layers: DERA municipalities, Natura 2000,
   MITECO sensitivity zoning (raster, 5 classes).
2. De documento a dato: fetch, LLM extraction (provider and model named
   from `evaluation.json.provider`), the operative-sentence rule, resolve
   grouping by name, developer and municipality with the stable id rule,
   status derivation (latest resolving document wins).
3. Precisión medida (from `evaluation.json`): table of field, accuracy as
   percentage, sample "sobre N documentos etiquetados a mano", provider
   and model, and a sentence on what each miss usually is (the
   nominal/peak swap on hybrid parks, from `docs/sources.md`). Fields
   below 90 percent set in `--alerta`. Link to the labels directory on
   GitHub.
4. Agregación: municipality totals, full MW per municipality for
   multi-municipality projects, whole-boundary intersections for Natura
   2000 and sensitivity, the choropleth quantile classes.
5. Lo que no cubre: parcel geometry, BOP, projects under 50 MW outside
   BOJA, anything the extractor misses; pointer to `docs/sources.md` for
   the running list of known issues.
6. Datos y licencia: one line linking to `/datos`.

Both pages: `generateMetadata`, no client JS. The footer gains a "Datos"
link on every page.

## Section 4: Testing, error handling, operations (approved)

### Testing

Test-driven throughout: each unit gets its failing test first.

- Pipeline (pytest): `status_document_id` present and refers to a document
  of the same project; `evaluation.json` written with `labels_count` equal
  to the number of label files, and export fails when `last_run.json` is
  absent; `meta.files` has one entry per export with `rows` matching the
  actual line count for CSVs and feature or key count for JSON. Evaluation
  harness: no scorer changes, but `test_eval.py` gains a check that every
  label file parses and its `expected` keys are scorable fields (catches a
  typo in the 16 new labels).
- Web unit (vitest): `loadProjects` with `statusDocumentId`;
  `loadEvaluation` with zod (accuracy in [0, 1], `n_scored <= n_labels`);
  `catalog.ts` columns equal the fixture CSV headers;
  `loadDocumentsByProject` grouping and ascending order; fixtures extended
  with `evaluation.json` and the new columns.
- Playwright: `/proyecto/1` shows the Bodoni heading, the "Fija el estado"
  mark exactly once, and at least one `boe.es` link; `/proyecto/999999` is
  404; from `/municipio/11020` the project name link reaches `/proyecto/1`;
  `/datos` has 11 download links that each return 200; `/metodologia`
  renders the accuracy table with a row per scored field; `sitemap.xml`
  contains a `/proyecto/` URL; axe on all three new pages with zero serious
  or critical violations; 375 px viewport with no horizontal scroll.

### Error handling

| Failure | Behaviour |
|---|---|
| `evaluation.json` missing or invalid at build | Build fails, previous deploy stays live (same policy as every export) |
| `status_document_id` not among the project's documents | Build fails via zod refinement across files: resolve and export disagree |
| A file in `catalog.ts` absent from `meta.files` | Build fails; the catalogue and the export must list the same files |
| Evaluation `skipped` non-empty | Methodology page prints the skipped count next to the sample size rather than hiding it |
| Retired project id | 404 |

### Operations

No CI or Vercel changes; the `web` job already runs lint, typecheck,
vitest, build, playwright and axe. After the pipeline changes, `export` is
run once against Neon and committed with the new `evaluation.json`, as in
slice 1. Lighthouse checked on `/proyecto/[id]` after deploy, target 95 on
mobile like the municipality page. README gets the three new routes and the
slice 2 line.

## Success criteria for the slice

- Every project has a shareable URL showing its record, every source
  document in order, and which document fixed its status.
- `/metodologia` publishes per-field extraction accuracy measured on 20
  hand-labelled documents that the user reviewed, with sample size,
  provider and model stated.
- `/datos` lets a visitor download every export under CC BY 4.0 with a
  citation, closing the parent design's "dataset downloadable and cited"
  criterion.
- All new pages pass Playwright and axe in CI; the weekly data commit still
  deploys with no manual step.
