# Web slice 3: technology filter, overlays, province table, monthly timeline

Date: 2026-09-28
Status: design approved in chat, spec under review, pre-implementation
Parent design: [2026-09-18-impacto-acumulado-design.md](2026-09-18-impacto-acumulado-design.md)
Previous slices: [2026-09-21-web-slice-1-design.md](2026-09-21-web-slice-1-design.md),
[2026-09-22-web-slice-2-design.md](2026-09-22-web-slice-2-design.md)
Data baseline: the prompt v4 re-extraction, see the 2026-09-28 progress-log
entry in [2026-09-22-extraction-fixes-design.md](2026-09-22-extraction-fixes-design.md)

## Progress log

Kept current so a compacted conversation loses nothing. Update on every
approval and every milestone.

- 2026-09-28: brainstorming. Decisions 1 to 8 below taken. Sections 1 to 4
  of the design approved in chat (section 3 amended export 2 of section 1).
  Spec written and reviewed by the user. Implementation plan written at
  `docs/superpowers/plans/2026-09-28-web-slice-3.md` (16 tasks: aggregate
  1-2, export 3-4, production data 5, web 6-15, merge and deploy 16).
  Planning settled four details recorded above: the
  `projects_for_aggregates` view, the `matching`/`splitBy` split, the
  site-count cross-check, and "Potencia evacuada" on the project page.
  Nothing implemented yet.
- 2026-09-28: Task 1 done (migration 003 adds the projects_for_aggregates
  view, mw_count, protected_area_stats technology split, and empty
  province_stats/monthly_events; 010/030/040 rewritten to read the view).
  Next: Task 2, province stats and monthly events aggregates.
- 2026-09-28: Task 2 done (050_province_stats.sql and 060_monthly_events.sql
  fill province_stats and monthly_events from projects_for_aggregates).
  Next: Task 3, export the new aggregate shapes.
- 2026-09-28: Task 3 done (municipality_stats.json and protected_area_stats.json
  rewritten to per-cell shape, province_stats.json and monthly_events.csv
  exports added). Next: Task 4, export the sensitivity layers.
- 2026-09-28: Task 4 done (export_sensitivity_geojson dissolves sensitivity_zones
  per technology, clips to the municipalities, and is skipped unless
  --refresh-sensitivity is passed). Next: Task 5, production run and data
  commit (waits for the user).
- 2026-09-28: Task 5 done. `weekly-pipeline` disabled (stays off until
  Task 16); migration 003 applied to Neon production; aggregate and
  `export --refresh-sensitivity` run from the branch, exports committed.
  Figures: 433 projects, 167 with MW; 197 sites; sensitivity tolerance
  raised to 0.004 degrees, ftv 1 481 681 bytes, eol 1 030 382. Note:
  `IMPACTO_DB_DSN` in `pipeline/env.local` is not production; production
  is reached with `neon connection-string` as in the README. Next: Task 6,
  labels, month formatting and the timeline model.
- 2026-09-28: Task 6 done (province slugs, event and sensitivity-layer
  labels, formatMonth/formatCoverage, and the timeline series model in
  timeline.ts; catalog.ts's municipality_stats.csv entry updated for
  mw_count). Next: Task 7, stats cells data model and its consumers.
- 2026-09-28: Task 7 done (moved MunicipalityStats to a cells array with
  matching/sumFigures/splitBy/mwCoverage in metrics.ts, and updated every
  consumer - map panel, municipality totals, fact sheet - to the new model).
  Next: Task 8, loaders for protected-area stats, province stats and monthly
  events.
- 2026-09-28: Task 8 done (loadProtectedAreaStats, loadProvinceStats and
  loadMonthlyEvents added with zod-validated schemas, and loadMapData
  extended to assemble provinceStats/events/sites/lastMonth and cross-check
  each site's municipality count against municipality_protected_areas.json).
  Next: Task 9, map state for technology, overlays and province.
- 2026-09-28: Task 9 done (map state carries technologies, Natura 2000,
  sensitivity layer and province in the URL). Next: Task 10, technology
  filter, legend coverage and panel filter line.
- 2026-09-28: Task 10 done (technology checkbox filter wired into Controls,
  map-explorer and Panel, with MW coverage shown in the legend and per
  municipality, and empty-state copy when no status or technology is
  selected). Next: Task 11, Natura 2000 and sensitivity overlays.
- 2026-09-28: Task 11 done (Red Natura 2000 and sensitivity overlays fetched
  on demand via useLayers, drawn on the choropleth with a hatched pattern,
  and surfaced in Controls, the legend and inline errors). Next: Task 12,
  shared lookup table and the Natura 2000 table.
- 2026-09-28: Task 12 done (MunicipalityIndex rebuilt on a shared
  LookupTable component; NaturaTable lists all 197 Natura 2000 sites under
  the active filters). Next: Task 13, province table.
- 2026-09-28: Task 13 done (ProvinceTable shows the 8 provinces and the
  Andalucía total per active status, with province selection wired into
  MapState via the province query param). Next: Task 14, monthly timeline.
- 2026-09-29: Task 14 done (Timeline draws a hand-drawn SVG small-multiples
  chart of documents per month by event, scoped by province and technology,
  with a data table fallback). Next: Task 15, /datos, /metodologia and
  README.

## The data this is designed against

`web/public/data` as exported on 2026-09-28 (`meta.json` `generated_at`
2026-09-28T16:54Z): 433 projects, 638 documents (72 BOE, 566 BOJA), 785
municipalities, 197 protected areas (108 ZEC, 63 ZEPA, 26 LIC).

Facts that shaped the design, measured on those files:

- `mw_nominal` is null for 260 of 433 projects (213 of 347 solar, 120 of 239
  `favorable_condicionada`, 102 of 123 `desconocido`). `hectares` is null for
  356. Every MW sum on the site covers roughly 40 percent of the projects it
  names. This outweighs the run-to-run noise (solar total -5.8 percent on
  re-extraction; single-document misreads such as 300 MW read as 0.3).
- Technologies: `solar_fv` 347, `eolica` 31, `hibrida` 24,
  `linea_evacuacion` 19, `otra` 9, `almacenamiento` 3. The 19 evacuation-line
  projects carry 240 MW, which is mostly the capacity of plants counted
  elsewhere.
- `municipality_stats.json` holds `by_status` and `by_technology` as separate
  splits; the status by technology cross exists in the table and in
  `municipality_stats.csv` but not in the JSON the map reads.
- `province_monthly` counts each project once under its current status, in
  the month of the document that set it, with no technology. It does not
  measure "approvals and refusals per month".
- Documents by year: 2019 4, 2020 1, 2021 0, 2022 69, 2023 303, 2024 110,
  2025 99, 2026 52. Document role and verdict: 268 `aau` favourable with
  conditions, 178 `aau` with verdict `no_aplica`, 78 `consulta`, 49 `dia`
  favourable with conditions, 30 `aau` and 11 `dia` unfavourable, 4
  `informe` favourable with conditions, 14 `modificacion`, 5 `otro`, 1
  `caducidad`.
- 15 projects span more than one province.
- Sensitivity zoning is already vector in Postgres: `sensitivity_zones` holds
  19985 wind (`eol`) and 27179 photovoltaic (`ftv`) polygons at 250 m
  resolution, only the `alta`, `muy_alta` and `maxima` classes
  (`docs/sources.md`). `sensitivity_high_share` is computed from them.
- Municipalities include evacuation-only ones: the `role` field exists in
  the extraction payload but the prompt does not request it
  (extraction-fixes decision 2, note of 2026-09-24).

## Decisions taken during brainstorming, in order

1. Missing MW is shown, not hidden. MW stays the default metric (slice 1),
   and every MW total on the page carries its coverage: "MW declarados en x
   de y proyectos".
2. Evacuation-line MW never enters an MW sum. A `linea_evacuacion` project
   counts as a project and appears in every list, but contributes null MW to
   every aggregate. The rule lives once, in the aggregate SQL, so the
   exports and the site agree. The technology filter is a plain filter: six
   chips, all on by default. Storage (3 projects, 29 MW) is left as is and
   named on `/metodologia`.
3. Overlays: Natura 2000 outlines, and the ministry sensitivity zoning drawn
   at its own resolution from the existing `sensitivity_zones` table (one
   layer per technology, the high to maximum classes as one fill). No
   municipality hatching.
4. The timeline counts events, not snapshots: documents per month by
   outcome. Information-public notices are one series; resolving documents
   (`dia`, `aau`, `informe`) give favourable, favourable with conditions,
   unfavourable, and a fifth series "resolución sin veredicto leído" for
   `no_aplica` or null. Counts only, no MW. The chart starts in January
   2022, with a note on why.
5. One shared state. The province table and the timeline follow the map's
   technology filter; the province table also follows status and metric.
   Selecting a province in the table narrows the timeline to it.
6. Natura 2000 totals are a lookup, not a leaderboard: all 197 sites sorted
   by name with a search box, each with its number of intersecting
   municipalities, and no sort by metric. Ranking by a whole-municipality
   intersection would reward large sites for their size.
7. Aggregation happens in the pipeline (slice 1 decision 1 held). The web
   only sums the cells that match the active filters.
8. Sites on the map are not clickable; a click inside a site still selects
   the municipality below. A `/espacio/[code]` page is a later slice.

## Section 1: Scope, order and export changes (approved)

### Order

Pipeline first, then one export against Neon production, then the web,
because the web reads the new shapes. See Operations for the change-over:
the weekly workflow is disabled while the new migration is live on Neon and
the code that matches it is not yet on `main`.

### Schema

New migration `db/migrations/003_slice3_aggregates.sql`:

- `municipality_stats` gains `mw_count int NOT NULL`: projects in the cell
  with a declared MW that is summed.
- `protected_area_stats` gains `technology text NOT NULL` and
  `mw_count int NOT NULL`; primary key becomes
  `(site_code, status, technology)`.
- New table `province_stats`: `scope text`, `status text`,
  `technology text`, `project_count int`, `mw_nominal real`,
  `mw_count int`, `hectares real`, primary key
  `(scope, status, technology)`. `scope` is a province name or
  `Andalucía`. Province rows count a project once per province it touches;
  `Andalucía` rows count each project once.
- New table `monthly_events`: `month date`, `scope text`,
  `technology text`, `event text`, `document_count int`, primary key
  `(month, scope, technology, event)`. `scope` as above: the `Andalucía`
  rows count each document once.

### Aggregate rule for evacuation lines

Migration `003` creates a view `projects_for_aggregates` over `projects`
that reads MW as
`CASE WHEN technology = 'linea_evacuacion' THEN NULL ELSE mw_nominal END`
and coalesces technology to `otra`. Every aggregate SQL file that sums MW
(`010_municipality_stats.sql`, `030_protected_area_stats.sql`,
`040_province_monthly.sql` and the new ones) reads the view, so the rule is
written once. The project still counts in `project_count`; it never counts
in `mw_count`. `mw_count` is `count(mw_nominal)` over the view, so projects
with no declared MW are not counted either. `province_monthly` is otherwise
unchanged.

### New aggregate SQL

- `050_province_stats.sql`: projects joined to their municipalities'
  provinces, deduplicated to one row per (province, project) before
  summing; plus the `Andalucía` rows from projects directly. Technology
  coalesced to `otra` as in `010`.
- `060_monthly_events.sql`: documents joined through `project_documents`
  to projects (technology) and municipalities (province).
  - Event mapping: role `consulta` gives `consulta`; role `dia`, `aau` or
    `informe` gives the extracted verdict when it is `favorable`,
    `favorable_condicionada` or `desfavorable`, and `sin_veredicto`
    otherwise. Roles `modificacion`, `caducidad` and `otro` are excluded,
    as are documents without a project.
  - `month` is `date_trunc('month', published_at)`. Deduplicated to one row
    per (province, document) before counting; `Andalucía` rows count
    distinct documents.
  - The verdict is read the way `export_documents` reads it
    (`extractions.payload->>'verdict'`).

### Export changes

All in `pipeline/impacto/aggregate/export.py`, tested in
`pipeline/tests/test_export.py`, documented in `docs/sources.md`.

1. `municipality_stats.json`: each entry becomes
   `{"cells": [{status, technology, project_count, mw_nominal, mw_count, hectares, turbines}]}`.
   `by_status`, `by_technology` and the totals are dropped; the web derives
   any split from `cells`. `municipality_stats.csv` gains `mw_count`.
2. `protected_area_stats.json`: keyed by `site_code` for all 197 sites,
   value `{name, type, municipality_count, cells: [{status, technology, project_count, mw_nominal, mw_count, hectares}]}`.
   Sites with no projects have empty `cells`. `municipality_count` is the
   number of municipalities whose geometry intersects the site (same
   `ST_Intersects` test as `030`), independent of the filters. Name and type
   are included so the page never loads the 1 MB geometry file to list
   sites.
3. New `province_stats.json`: internal, web-shaped, keyed by scope, value
   `{cells: [...]}` with the `province_stats` columns.
4. New `monthly_events.csv`: public, columns `month, scope, technology,
   event, document_count`, ordered by those columns.
5. New `sensitivity_ftv.geojson` and `sensitivity_eol.geojson`: public.
   - One feature each, properties `{technology}`: `ST_Union` of that
     technology's `sensitivity_zones` rows, intersected with the union of
     municipalities, simplified with `ST_SimplifyPreserveTopology`, parts
     below a minimum area dropped, `ST_AsGeoJSON(..., 4)`.
   - Budget: at most 1.5 MB raw per file. The tolerance and the area floor
     are tuned once against production and recorded in `docs/sources.md`.
     When over budget, the tolerance is raised; the budget is not.
6. `meta.files` picks up the new files through the existing mechanism.

### Out of scope

Resolve or extraction changes; requesting evacuation municipality roles in
the prompt (stays a `/metodologia` caveat); confirming disagreeing capacity
figures; a protected-area page; dark mode; English.

## Section 2: Map controls, state and overlays (approved)

### State and URL

`MapState` (`src/lib/map-state.ts`) gains four fields. Each is omitted from
the URL at its default, and unknown values fall back to the default, as
today.

| Field | Default | URL |
|---|---|---|
| `technologies: Set<Technology>` | all six | `tecnologia=solar_fv,eolica` |
| `natura: boolean` | `false` | `natura=1` |
| `sensitivity: "ninguna" \| "ftv" \| "eol"` | `"ninguna"` | `sensibilidad=fv` or `sensibilidad=eolica` |
| `province: ProvinceSlug \| null` | `null` | `provincia=almeria` |

Province slugs are ASCII (`almeria`, `cadiz`, `cordoba`, `granada`,
`huelva`, `jaen`, `malaga`, `sevilla`), mapped to the exported names in
`src/lib/labels.ts`.

### Metrics

Pure functions in `src/lib/metrics.ts`, unit-tested:

- `metricValue(cells, metric, statuses, technologies)`: sum over cells
  matching both filters.
- `mwCoverage(cells, filters)`: `{ withMw, total }` from `mw_count` and
  `project_count`.
- `matching(cells, filters)` and `splitBy(cells, "status" | "technology")`:
  callers filter first, then split, giving the per-status or per-technology
  figures the panel and the municipality page show today.
- Filters are one value, `{ statuses, technologies }`.
- `classify` and `classIndex` unchanged.

`MunicipalityStats` in `types.ts` becomes `{ cells: StatsCell[] }`; the
loader and every consumer move to it.

### Controls

`controls.tsx` gains two fieldsets after Estado:

- "Tecnología": six checkboxes with `TECHNOLOGY_LABELS`, same pattern as
  Estado. Turning all off is allowed and shows the empty map, as for
  statuses ("Ninguna tecnología seleccionada").
- "Capas": a checkbox "Red Natura 2000", and a radio group "Sensibilidad
  ambiental" with Ninguna, Fotovoltaica, Eólica.

They wrap below 768 px as the existing fieldsets do.

### Overlay rendering

In `choropleth.tsx`, in SVG order, all through the existing projection
instance:

1. Municipality fills, unchanged.
2. Sensitivity: one `<path>` from the one feature, filled with an SVG
   `<pattern>` of diagonal hatching in `--alerta` at 1 px,
   `pointer-events: none`. Hatching keeps the choropleth classes readable
   underneath.
3. Province outlines, unchanged.
4. Natura 2000: one `<path>` per site, stroke `--oficial` 1 px dashed, no
   fill, `pointer-events: stroke`. Hovering the outline shows the tooltip
   with name, code and type. One style for all three types.

Each layer is fetched from `/data/` the first time it is switched on, and
held in `MapExplorer` as `idle | loading | loaded | error`; nothing is
preloaded. Paths are computed once per loaded layer in a memo. On failure,
the text "No se ha podido cargar la capa. Vuelve a intentarlo." appears next
to that control; unticking and ticking again retries. Map, tables and
timeline keep working.

### Legend and panel

- Legend, metric MW: under the class boundaries, "MW declarados en 167 de
  433 proyectos" computed with `mwCoverage` over the `Andalucía` cells of
  `province_stats` under the active filters, so a multi-municipality
  project counts once. The figure is from the 2026-09-28 export (433
  projects, 173 with MW, 6 of them evacuation lines). When no project
  matches the filters, the line is omitted.
- Legend, overlays: a key per active overlay. Natura: dashed swatch, "Red
  Natura 2000 (ZEC, ZEPA, LIC)". Sensitivity: hatched swatch,
  "Zonificación del Ministerio, clases alta a máxima (fotovoltaica|eólica).
  La ubicación de los proyectos dentro del municipio no se conoce."
- Panel: totals under both filters; its own coverage line; "Filtrado por
  tecnología: ..." when not all technologies are active.

### Municipality page

Totals derive from `cells` through `splitBy` and are otherwise unchanged.
New: the coverage line under the totals, and, when the municipality has
evacuation-line projects, "Línea de evacuación: N proyectos, potencia no
sumada (ya contada en las plantas que evacúa)". The page shows all
technologies and ignores map state, as today.

On the project page, an evacuation line's MW is labelled "Potencia evacuada"
instead of "Potencia nominal" (the figure is shown, just never summed).

### Index

Unchanged, but its values follow both filters.

## Section 3: Province table, timeline and Natura 2000 table (approved)

### Page order on `/`

Controls; map and panel; "Por provincia"; "Evolución mensual"; "Índice de
municipios"; "Red Natura 2000". The regional summaries sit under the map,
the two lookups come last. All are siblings under `MapExplorer`, read the
shared state, and render their initial HTML with the default state.

### Por provincia (`components/map/province-table.tsx`)

```
+----------------------------------------------------------------------+
| Por provincia                                                        |
|            En consulta  Favorable  Fav. cond.  ...  Total  Con MW    |
| [Almería]      20,0       ...         ...           ...    12 de 30  |
| [Cádiz]        ...                                                   |
| ...                                                                  |
| Andalucía      ...                                  ...    167 de 433|
| Un proyecto en varias provincias cuenta en cada una; en el total de  |
| Andalucía cuenta una vez.                                            |
+----------------------------------------------------------------------+
```

- Rows: 8 provinces in alphabetical order, then `Andalucía` as a total
  row.
- Columns: one per active status, then Total; each cell the active metric.
  With metric MW, a last column "Con MW declarado" shows `withMw de total`.
- Technology filter applies.
- Province name is a `<button aria-pressed>` that sets `province`; the
  selected row is highlighted; pressing it again clears it.
- Below 768 px the table scrolls horizontally inside its own container,
  first column sticky; the page does not scroll horizontally.

### Evolución mensual (`components/map/timeline.tsx`)

```
Resoluciones por mes · Provincia de Sevilla · Solar fotovoltaica
[Toda Andalucía]
Información pública          |  | |   ||  |     |
Favorable                        |
Favorable con condiciones   | ||| |||||| || | ||  |
Desfavorable                  |  |    |
Sin veredicto leído          | |||| ||  |  |
                            2022    2023    2024    2025    2026
Entre 2019 y 2021 la colección solo contiene 5 documentos; la serie
empieza en 2022.
> Ver los datos
```

- Hand-drawn SVG, no chart library. A band scale in `src/lib/timeline.ts`
  (pure, unit-tested) maps months from January 2022 to the month of
  `meta.generated_at`, with empty months as zero.
- Small multiples: five rows sharing one y-scale and one month axis, in
  the order above. Bars `--tinta`; Desfavorable `--alerta`; sin veredicto
  `--regla`. Year ticks on the axis. Chosen over stacked colour bars
  because it keeps status colours as small marks (slice 1) and gives each
  series a flat baseline.
- Title states the scope and, when filtered, the technologies. A "Toda
  Andalucía" button clears the province.
- Hover on a bar: tooltip with month, event and count (existing
  `Tooltip`).
- Accessibility: `role="img"` with an `aria-label` summarising totals per
  event; a `<details>` "Ver los datos" with a table of year by event, which
  is the keyboard and screen-reader path.
- Empty under the filters: "Ninguna resolución con estos filtros."

### Red Natura 2000 (`components/lookup-table.tsx`)

- All 197 sites, sorted by name, accent-insensitive search via
  `search.ts`. No sort controls.
- Columns: Código, Espacio (as exported), Tipo, Municipios
  (`municipality_count`), and the active metric under both filters.
- One sentence above the table: "Suma de todos los proyectos de los
  municipios que tocan el espacio. Mide cercanía a escala municipal, no
  afección al espacio."
- `MunicipalityIndex` and this table share one `LookupTable` component
  parameterised by columns and row key, so the index structure is not
  copied.

### Client payload

`province_stats.json`, `monthly_events.csv` and `protected_area_stats.json`
are loaded server-side, validated with zod, converted to compact arrays and
passed as props to `MapExplorer` (slice 1 `server-serialization`). The
geometry files stay runtime fetches.

## Section 4: Testing, error handling, operations (approved)

### Testing

Test-driven throughout: each unit gets its failing test first.

- Pipeline (pytest, `test_aggregate.py` and `test_export.py` fixtures):
  - A `linea_evacuacion` project adds to `project_count` and not to
    `mw_nominal` or `mw_count` in `municipality_stats`,
    `protected_area_stats`, `province_stats` and `province_monthly`.
  - `mw_count` counts only non-null MW.
  - `province_stats`: a two-province project counts once in each province
    and once in `Andalucía`.
  - `monthly_events`: role to event mapping; `no_aplica` and null give
    `sin_veredicto`; `modificacion`, `caducidad`, `otro` excluded; a
    document of a two-province project counts once in `Andalucía`.
  - `protected_area_stats.json`: every site present with name, type and
    `municipality_count`; every cell has a technology.
  - Sensitivity GeoJSON: one feature per file, coordinates within the
    Andalusia bounding box, at most 4 decimals. The 1.5 MB budget is
    checked on the real export in the plan's export step.
- Web unit (vitest):
  - `metricValue`, `mwCoverage` and `splitBy` with partial status and
    technology sets.
  - `parseMapState` and `serializeMapState` round-trip the four new
    fields; unknown values dropped.
  - Province slug mapping for all 8 provinces.
  - Timeline band scale: first month January 2022, last month from
    `generated_at`, empty months present as zero.
  - Loaders for `province_stats.json`, `monthly_events.csv` and the new
    `protected_area_stats.json` and `municipality_stats.json` shapes; zod
    rejects an unknown `event`, technology or scope.
  - `catalog.ts` columns equal the fixture headers of `monthly_events.csv`.
  - The aggregate fixtures (`municipality_stats.json`,
    `province_stats.json`, `monthly_events.csv`,
    `protected_area_stats.json`) carry a line cell, a two-province project
    and a `sin_veredicto` event. `projects.csv` and `documents.csv` fixtures
    stay as they are, so the slice 2 tests are untouched.
- Playwright:
  - Unticking "Solar fotovoltaica" changes the legend and writes
    `tecnologia=` to the URL.
  - Ticking "Red Natura 2000" requests `protected_areas.geojson` only then,
    and draws 197 site paths; choosing a sensitivity layer draws one
    hatched path.
  - Selecting Sevilla in the province table changes the timeline title and
    writes `provincia=sevilla`.
  - The Natura table search finds a Doñana site.
  - With metric MW the legend shows "MW declarados en".
  - A municipality with an evacuation-line project shows "potencia no
    sumada".
  - `/datos` lists the new public files and each download returns 200.
  - Axe on `/` with both overlays on and "Ver los datos" open: zero serious
    or critical violations.
  - 375 px viewport: no horizontal page scroll with the province table
    present.

### Error handling

| Failure | Behaviour |
|---|---|
| New export missing or invalid at build | Build fails, previous deploy stays live (slice 1 policy) |
| `province_stats` scope not one of the 8 provinces or `Andalucía` | Build fails (zod enum) |
| A site's `municipality_count` differs from the number of municipalities listing it in `municipality_protected_areas.json` | Build fails (cross-file check in `loadMapData`, as for INE codes) |
| Overlay fetch fails in the browser | Inline message next to the control; everything else unaffected |
| Sensitivity file over 1.5 MB at export | Tolerance raised and recorded; budget unchanged |
| Unknown `tecnologia`, `sensibilidad` or `provincia` in the URL | Ignored, defaults used |

### Operations

- Change-over. The weekly workflow runs `migrate` and then `main`'s
  aggregate SQL; with migration `003` applied and the old `030` on `main`,
  the run would fail on the new `protected_area_stats` key. So:
  1. Work in a worktree branch.
  2. Disable the weekly workflow before applying `003` to Neon production.
  3. From the branch: migrate, aggregate, export against production;
     commit the exports on the branch.
  4. Merge to `main` (`git pull` first: the workflow may have pushed a
     "data: weekly export" commit before it was disabled).
  5. Re-enable the workflow and trigger it once with `workflow_dispatch`
     to prove the full weekly path.
- `/datos`: `catalog.ts` lists `monthly_events.csv`,
  `sensitivity_ftv.geojson` and `sensitivity_eol.geojson` with contents and
  the `monthly_events.csv` column reference; `province_stats.json` is
  internal and omitted like `municipality_stats.json`.
- `/metodologia`, Agregación: line MW not summed and why; MW coverage;
  storage may double count with its plant; the Natura proximity wording;
  sensitivity layer source, classes and 250 m resolution; the timeline's
  event definition and 2022 start; evacuation-only municipalities are not
  yet separated by the extractor.
- Lighthouse on `/` after deploy: performance at least 85 on mobile
  (slice 1 target); overlays load only on demand. README gets the slice 3
  line.

## Success criteria for the slice

- A reader can filter the map by technology and status together, and every
  MW figure on the page states how many projects it covers.
- Evacuation-line MW is not summed anywhere on the site or in the aggregate
  exports.
- Natura 2000 outlines and the ministry sensitivity zoning can be shown
  over the choropleth, and every site's totals can be looked up with their
  municipality-scale caveat.
- Province totals and a monthly series of decisions follow the filters,
  and the series can be narrowed to a province.
- All checks pass in CI, and the weekly run deploys the new exports with no
  manual step once re-enabled.
