# Web slice 1: map page and municipality page

Date: 2026-09-21
Status: design under review, pre-implementation
Parent design: [2026-09-18-impacto-acumulado-design.md](2026-09-18-impacto-acumulado-design.md)

## Scope

The first slice of the site: the map page (`/`) and the municipality page
(`/municipio/[ine]`), both built from the static exports the weekly pipeline
commits to `web/public/data/`. It also makes the small export changes the
two pages need, and a placeholder `/metodologia` so no link is dead.

Decisions taken during brainstorming, in order:

1. Export gaps are closed in the pipeline, not worked around in the web.
2. The map is an SVG choropleth drawn with d3-geo, no tiles, no basemap.
3. Clicking a municipality opens a side panel with a link to its page.
4. Map controls in this slice: metric switch and status filter. Technology
   filter and the Natura 2000 and sensitivity overlays are slice 2.
5. Visual identity: gazette typography carrying an atlas-style map.
6. Data access: fully static. Pages read the exports at build time; the only
   runtime fetch is the municipality GeoJSON.

Out of scope for this slice: technology filter, map overlays, project page,
province table, monthly timeline, data download page, dark mode, English UI,
any database connection from the web.

## Users and the job of each page

- Map page: "where is the capacity concentrated, and under which status".
  A journalist or NGO lands here, sees the distribution, clicks a
  municipality, reads its totals, follows the link.
- Municipality page: "what has been approved or is pending here, and where
  is the paper trail". An NGO writing an objection or a council member needs
  the totals, the caveats and every source document in two clicks. Each
  page is a shareable, crawlable URL.

## Visual system

### Direction

The site should look like it was set from the official record and drawn
onto a survey sheet. The gazette supplies the typography and the structure
of the records; the atlas supplies the map treatment. It should not read as
a dashboard.

### Palette

Defined as CSS custom properties on `:root`. Dark mode is not in this slice,
but every colour goes through a token so it stays cheap to add.

| Token | Hex | Use |
|---|---|---|
| `--papel` | `#F1F2EE` | Page background, cool off-white like a map sheet |
| `--tinta` | `#1A1D1B` | Text, municipality outlines |
| `--regla` | `#B9BDB7` | Hairlines, table rules, fill of municipalities with no projects |
| `--escala-1` .. `--escala-5` | `#EAD9B3`, `#D2A85C`, `#B8862B`, `#8A5A1B`, `#5B3A12` | Choropleth classes, light to dark, "land occupied" |
| `--oficial` | `#24406E` | Links, status `favorable` |
| `--alerta` | `#C2401C` | Status `desfavorable`, sensitivity share above 50 percent |

Status colours are used as small marks (a badge border, a legend swatch),
never as large fills, so the choropleth ramp stays the only large colour on
the page.

### Typography

Loaded with `next/font/google`, self-hosted at build, no runtime request.

| Role | Face | Where |
|---|---|---|
| Display | Bodoni Moda | Masthead, municipality name on both pages. Nowhere else. |
| Body | Source Serif 4 | Everything that is prose or a record |
| Data | IBM Plex Mono | Every figure, unit, INE code, gazette id and date, so numbers align in tables and read as data |

Type scale: one display size for the masthead (`clamp(2rem, 5vw, 3.25rem)`),
one for municipality names (`clamp(1.75rem, 4vw, 2.5rem)`), body `1rem/1.55`,
data `0.9375rem`, captions `0.8125rem`. Sentence case throughout; the
gazette's uppercase is quoted only where a name is uppercase in the source
(Natura 2000 site names are exported that way and are shown as exported).

### Signature

The date line, drawn from `meta.json` and shown under the masthead on every
page, set like the BOE's "Núm. / Sec. / Pág." line:

> Andalucía · Datos a 21 de septiembre de 2026 · 63 proyectos · 71 resoluciones

It is the site's honesty statement: the reader always knows how fresh and
how complete the data is.

### Motion

None beyond fill and outline transitions on map hover and focus (120 ms).
`prefers-reduced-motion: reduce` disables them.

### Copy register

Spanish, sentence case, plain verbs. Controls say what they do ("Ver
municipio"). Empty states direct the reader ("Ningún proyecto registrado en
los boletines desde 2019 para este municipio"). Errors say what failed and
what to do ("No se ha podido cargar el mapa. Recarga la página o usa el
índice de municipios.").

## Pages

### Map page `/`

```
+------------------------------------------------------------+
| IMPACTO ACUMULADO                                          |
| Andalucía · Datos a 21 de septiembre de 2026 · 63 proyectos |
+------------------------------------------------------------+
| Métrica [MW] [ha] [proyectos]   Estado [x][x][x][x][x][x]   |
+--------------------------------------+---------------------+
|                                      | Panel               |
|          SVG choropleth              | nothing selected:   |
|          d3-geo conic conformal      |   legend with real  |
|          province borders heavier    |   thresholds, how   |
|          hover: tooltip name + value |   to read, caveat   |
|                                      | selected:           |
|                                      |   name, province,   |
|                                      |   totals by status, |
|                                      |   "Ver municipio"   |
+--------------------------------------+---------------------+
| Índice de municipios                                       |
| search box · table: municipio, provincia, MW, ha, proyectos |
| sorted by the active metric, filtered by the active status |
| every row links to /municipio/[ine]; keyboard reachable    |
+------------------------------------------------------------+
| footer: date line · Metodología                            |
+------------------------------------------------------------+
```

Below 768 px: masthead, controls (wrapping), map full width, panel as a
section directly under the map, then the index, then the footer. 16 px side
gutter, no horizontal scroll.

Behaviour:

- Metric: `mw` (MW nominal), `ha` (hectares), `proyectos` (project count).
  Default `mw`.
- Status filter: six chips, all on by default: `en_consulta`, `favorable`,
  `favorable_condicionada`, `desfavorable`, `caducado`, `desconocido`. A
  municipality's value is the sum over the active statuses. Turning every
  chip off is allowed and shows an empty map with the legend reading "Ningún
  estado seleccionado".
- Choropleth classes: five quantile classes over municipalities with value
  greater than zero, recomputed when metric or statuses change. Zero-value
  municipalities are filled `--regla` and labelled "sin proyectos" in the
  legend. Legend shows the actual class boundaries in the metric's unit,
  formatted for `es-ES`.
- Hover: outline in `--tinta` at 1.5 px, native `<title>` plus a positioned
  tooltip with name and value.
- Click: selects; panel shows the municipality. Clicking the selected
  municipality again, or the panel's close control, deselects.
- URL state: `metrica`, `estado` (comma list) and `m` (selected INE) live in
  the search params and are written with `router.replace` inside
  `startTransition`, so a map state is shareable. The page stays statically
  rendered; the component that reads search params sits under a `Suspense`
  boundary as Next.js requires on static pages.
- Index table: searchable by name (accent-insensitive), sorted by the active
  metric descending, showing only municipalities with a non-zero value under
  the active filter, plus a count line ("142 municipios con proyectos"). It
  is the keyboard alternative to the map: map paths are not tab stops (785
  stops would be unusable), the table rows are.
- Panel is `aria-live="polite"` so a screen reader hears the selection.

### Municipality page `/municipio/[ine]`

Statically generated for all 785 municipalities from the GeoJSON, including
those with no projects.

```
+------------------------------------------------------------+
| masthead + date line                                       |
+------------------------------------------------------------+
| Provincia de Málaga · INE 29084          (mono, caption)   |
| Ronda                                    (Bodoni)          |
+------------------------------------------------------------+
| Totales                                                    |
| status      proyectos    MW      ha                        |
| favorable con condiciones   1    93,0   210,4              |
| desfavorable                0     0,0     0,0   (rows with |
| ...                                              zero hidden)|
| Total                       1    93,0   210,4              |
| Por tecnología: solar 1 · 93,0 MW                           |
+------------------------------------------------------------+
| Sensibilidad ambiental                                     |
| 48 % del término en clases alta o máxima (eólica y FV)     |
| one-sentence caveat, link to Metodología                   |
| Red Natura 2000 que intersecta el término                  |
| ES6170002 · Sierra de las Nieves · ZEC                      |
+------------------------------------------------------------+
| Proyectos (1)                                              |
| Planta solar fotovoltaica Ronda Sur       favorable c.c.   |
| Cartuja Solar, S.L. · solar · 93,0 MW · 210,4 ha           |
| BOE-A-2019-11702 · 8 de agosto de 2019 · DIA · favorable  |
| BOE-A-2020-14181 · 13 de noviembre de 2020 · modificación  |
+------------------------------------------------------------+
| footer: date line · Metodología · "Volver al mapa"         |
+------------------------------------------------------------+
```

- Totals table lists statuses with at least one project, then a total row.
  Technology split is a single line per technology with count and MW.
- Sensitivity share is shown as an integer percentage. Above 50 percent it
  is set in `--alerta`. The caveat under it: "Calculado sobre todo el
  término municipal; es un filtro de atención, no una evaluación de
  impacto."
- Natura 2000 list: site code, name as exported, type. Empty: "Ningún
  espacio de la Red Natura 2000 intersecta el término."
- Projects: one record per project, ordered by `last_seen` descending.
  Each shows name, developer, technology, status, MW nominal, hectares,
  turbines when present, and the documents in publication order with
  gazette id, date, role and verdict, each linking to the gazette URL.
  There is no project page yet, so the documents are the links.
- A note under the projects heading when any project spans several
  municipalities: "Un proyecto situado en varios municipios cuenta íntegro
  en cada uno de ellos." This is how the aggregate works today
  (`municipality_stats` assigns the full MW to every municipality of the
  project) and it must be visible.
- Empty state (no projects): the totals block is replaced by "Ningún
  proyecto registrado en los boletines desde 2019 para este municipio";
  sensitivity and Natura 2000 blocks still render.
- Unknown INE: 404 through `notFound()`, rendered by `not-found.tsx` with a
  link back to the map.
- `generateMetadata`: title "Ronda · Impacto Acumulado", description with
  the total MW and project count.

### `/metodologia` (placeholder)

One page with the caveats paragraph from the parent design (municipality
level location, LLM extraction, BOE above 50 MW only, whole-boundary
overlaps, full MW per municipality) and the date line. The full page with
published accuracy figures is a later slice.

## Data

### Export changes (pipeline)

All in `pipeline/impacto/aggregate/export.py`, tested in
`pipeline/tests/test_export.py`, documented in `docs/sources.md`.

1. `projects.csv`: new column `ine_codes`, semicolon-separated INE codes
   from `project_municipalities`, in the same order as `municipalities`.
2. `municipality_stats.json`: each entry gains `by_technology`, keyed by
   technology with `project_count`, `mw_nominal`, `hectares`. `by_status`
   stays as it is.
3. New file `municipality_protected_areas.json`: keyed by INE for all 785
   municipalities, value a list of `{site_code, name, type}` for every
   protected area whose geometry intersects the municipality
   (`ST_Intersects`, the same test `030_protected_area_stats.sql` uses).
   Empty lists are included so the web can distinguish "none" from
   "missing". This is reference data and changes only when the reference
   layers are reloaded.
4. `municipalities.geojson` and `protected_areas.geojson`: coordinates
   written with five decimals (`ST_AsGeoJSON(geom, 5)`, roughly one metre)
   instead of the default nine. Reduces the municipality file by roughly a
   third before compression; no visual change at map scale.
5. New file `provinces.geojson`: eight features, one per province,
   dissolved with `ST_Union` over the municipalities and simplified with the
   same tolerance, properties `{province}`. About 100 KB. Used only for the
   heavier province outlines on the map.

After the change, `export` is run once against Neon from a machine and the
result committed, so the web build has the new columns before the next
weekly run.

### Web data layer

`web/src/lib/data/`, server-only (`import 'server-only'`), pure functions
that read `public/data/` with `fs` at build time. `process.cwd()` is `web`
both locally and on Vercel (root directory set to `web`).

| Function | Reads | Returns |
|---|---|---|
| `loadMeta()` | `meta.json` | `{ generatedAt: Date, counts }` |
| `loadMunicipalities()` | `municipalities.geojson` | `Municipality[]` from properties only: `ine`, `name`, `province`, `areaHa`, `sensitivityHighShare` |
| `loadMunicipalityStats()` | `municipality_stats.json` | `Map<ine, MunicipalityStats>` |
| `loadMunicipalityProtectedAreas()` | `municipality_protected_areas.json` | `Map<ine, ProtectedAreaRef[]>` |
| `loadProjects()` | `projects.csv` | `Project[]` with `ineCodes: string[]`, nullable numbers |
| `loadDocuments()` | `documents.csv` | `Document[]` grouped later by `projectId` |

Every loader parses with `csv-parse/sync` (CSV) or `JSON.parse` and then
validates with a zod schema. A malformed export fails the build with the
file and field named, which is the correct outcome: the last good deploy
stays live.

Enumerations, each with a Spanish label in `src/lib/labels.ts`:

- Status: `en_consulta` "En consulta", `favorable` "Favorable",
  `favorable_condicionada` "Favorable con condiciones", `desfavorable`
  "Desfavorable", `caducado` "Caducado", `desconocido` "Sin determinar".
- Technology: `solar_fv` "Solar fotovoltaica", `eolica` "Eólica", `hibrida`
  "Híbrida", `almacenamiento` "Almacenamiento", `linea_evacuacion` "Línea
  de evacuación", `otra` "Otra".
- Document role: `consulta`, `informe`, `dia`, `aau`, `modificacion`,
  `caducidad`, `otro`, with labels "Información pública", "Informe de
  impacto", "Declaración de impacto ambiental", "Autorización ambiental
  unificada", "Modificación", "Caducidad", "Otro".
- Verdict: same labels as status where they coincide; `no_aplica` "No
  aplica".

Values outside these lists fail zod validation at build, so a new value
added by the pipeline is noticed immediately rather than rendered as a raw
key.

Formatting in `src/lib/format.ts` through `Intl` with `es-ES`: numbers with
one decimal for MW and hectares ("1.206,6 ha"), integers for counts and
percentages, long dates ("8 de agosto de 2019").

### What reaches the client

- Map page: `municipality_stats.json` content (about 19 KB today, bounded
  by 785 entries), the municipality list with names and provinces (about
  40 KB), and `meta`. Passed as props to one client component, serialised
  once.
- `municipalities.geojson` (2.6 MB raw today, under 1 MB after the
  precision change and Brotli) is fetched by the client component on mount
  from `/data/municipalities.geojson`, with `<link rel="preload">` emitted
  from the page so the request starts with the HTML. It is cached by the
  browser and only changes when the reference layer is reloaded.
  `provinces.geojson` is fetched in parallel with it (`Promise.all`, one
  loading state for both).
- Municipality pages ship no client data beyond the HTML.

### Map rendering

- Projection: `geoConicConformal` from `d3-geo` with standard parallels 36
  and 39, `fitSize` to a fixed `viewBox` (1000 by 560), computed once with
  `useMemo` from the GeoJSON. 785 path strings computed in the same memo.
- Metric and status changes only change `fill` attributes; paths are not
  recomputed.
- Outlines: municipality paths are stroked at 0.4 px in `--papel`, which
  also hides simplification slivers between neighbours. On top, the eight
  features of `provinces.geojson` (export change 5) are stroked at 1 px in
  `--tinta` with no fill. Dissolving provinces in the browser from 785
  polygons is avoided; the pipeline does it once.
- Quantile thresholds and the legend are computed in a pure function
  `classify(values, 5)` in `src/lib/metrics.ts`, unit-tested.
- `d3-geo` is imported by module path (`d3-geo`), never the `d3` bundle.

## Components

```
web/
  package.json  next.config.ts  tsconfig.json  .nvmrc
  public/data/                     exports (committed by the pipeline)
  src/
    app/
      layout.tsx                   fonts, masthead, date line, footer, lang="es"
      page.tsx                     map page (server): loads data, renders MapExplorer
      municipio/[ine]/page.tsx     generateStaticParams, generateMetadata, record layout
      metodologia/page.tsx         placeholder caveats
      not-found.tsx
    components/
      masthead.tsx  dateline.tsx  figure.tsx  status-badge.tsx
      map/
        map-explorer.tsx           client; owns metric, statuses, selection, URL sync
        choropleth.tsx             SVG, paths, fills, hover, click
        controls.tsx               metric switch and status chips
        legend.tsx
        panel.tsx                  selected municipality summary
        tooltip.tsx
      municipality-index.tsx       search and table, shares state with the map
      municipality/
        totals.tsx  sensitivity.tsx  protected-areas.tsx  project-record.tsx
    lib/
      data/                        loaders and zod schemas
      labels.ts  format.ts  metrics.ts  search.ts (accent folding)
    styles/globals.css             tokens, type scale, reset
  tests/                           vitest, with fixtures/data/ copied from a small export
  e2e/                             playwright
```

Styling: CSS Modules over the global tokens. No Tailwind and no component
library: the visual system is bespoke and small, and the bundle stays
minimal. A single `globals.css` owns the tokens, type scale and reset;
each component owns its module.

State lives in `MapExplorer` only: `metric`, `statuses: Set<Status>`,
`selectedIne: string | null`, `geo: FeatureCollection | null | 'error'`.
Derived values (`valuesByIne`, thresholds, sorted index rows) are computed
in render with `useMemo` keyed on primitives. No effects derive state.
The index table and the choropleth are siblings under `MapExplorer` and
receive derived data as props.

React rules from the Vercel best-practices skill that apply here and are
followed: `bundle-barrel-imports` (d3-geo by path), `bundle-dynamic-imports`
(the choropleth is loaded with `next/dynamic` so the index and controls
render before the map bundle arrives), `rendering-resource-hints` (preload
the GeoJSON), `rerender-derived-state-no-effect`, `rerender-transitions`
(URL sync inside `startTransition`), `rendering-conditional-render`
(ternaries), `server-serialization` (only the fields the client uses are
passed as props), `rendering-content-visibility` on the index table rows.

## Error handling

| Failure | Behaviour |
|---|---|
| Export missing or invalid at build | Build fails with file and field named; previous deploy stays live |
| GeoJSON fetch fails in the browser | Map area shows "No se ha podido cargar el mapa. Recarga la página o usa el índice de municipios." The index, controls and panel still work because they do not need geometry |
| Municipality in GeoJSON but not in stats | Treated as zero on every metric; page renders the empty state |
| INE in stats but not in GeoJSON | Build fails (zod refinement across files), because it means the reference layer and the aggregate disagree |
| Unknown INE in the URL | 404 |
| Search params with unknown metric or status | Ignored, defaults used, URL rewritten on the next state change |

## Testing

Test-driven throughout: each unit below gets its failing test first.

- Pipeline (pytest, existing harness): `ine_codes` column present and
  aligned with `municipalities`; `by_technology` sums equal `mw_total`;
  `municipality_protected_areas.json` has 785 keys and Ronda's list
  contains a known site from the fixtures; coordinates have at most five
  decimals; `provinces.geojson` has eight features.
- Web unit (vitest): every loader against `tests/fixtures/data/` (a small
  export with two municipalities, two projects, three documents); zod
  failure messages name the field; `classify` thresholds and edge cases
  (fewer than five distinct values, all zeros); `metricValue` with partial
  status sets; `format` outputs for `es-ES`; accent-insensitive `search`.
- Web end-to-end (playwright, against `next build && next start`):
  - `/` renders the date line from `meta.json` and 785 `path[data-ine]`.
  - Switching metric to `ha` updates the legend units and the URL.
  - Clicking a path selects it, the panel shows the name and "Ver
    municipio" navigates to the page.
  - Keyboard only: tab to the index, type in the search box, arrow to a
    row, Enter opens the municipality page.
  - `/municipio/29084` shows the heading, totals and at least one document
    link to `boe.es`; `/municipio/00000` returns 404.
  - Viewport 375 px: no horizontal scroll on either page.
- Accessibility: `@axe-core/playwright` on both pages with zero serious or
  critical violations.

## Operations

- CI (`.github/workflows/ci.yml`): a second job `web` with
  `working-directory: web`: `npm ci`, `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run build`, `npx playwright install --with-deps
  chromium`, `npm run e2e`. Runs on the same triggers as the pipeline job.
- Vercel: project root directory `web`, framework preset Next.js, no
  environment variables. Every commit to `main`, including the weekly data
  commit, deploys. Preview deployments on pull requests.
- Node version pinned in `web/.nvmrc` and `package.json` `engines`; the
  Next.js, React and library versions are the latest stable at
  implementation time, looked up with `npm view`, never assumed, and
  recorded in `package-lock.json`.
- The 2.6 MB GeoJSON and 1.4 MB protected areas file stay in the repo as
  they are today; git history growth is bounded because they only change
  with reference reloads.

## Gaps found in review and how they are closed

- Projects carried municipality names, not codes: closed by export change 1.
- No municipality to Natura 2000 relation: closed by export change 3, for
  all 785 municipalities so "none" is representable.
- Stats JSON had no technology split: closed by export change 2.
- Province outlines had no source: closed by export change 5.
- Status values in the data include `desconocido` and the parent design
  listed four statuses: the filter carries all six with labels.
- A project in several municipalities counts fully in each: stated on the
  municipality page and the methodology placeholder, not silently shown.
- Search params on a static page: the reader sits under `Suspense`.
- 785 tab stops on the map: the index table is the keyboard path, the map
  paths are not focusable.
- Simplification slivers between neighbours: hidden by the `--papel`
  outline pass.
- A new enum value from the pipeline: fails the build via zod instead of
  rendering a raw key.
- Fresh export needed before the first web build: a plan step runs `export`
  against Neon and commits.

## Success criteria for the slice

- From `/`, any municipality's cumulative MW, hectares and project count by
  status is visible in one click, and every source document is reachable
  in two.
- Both pages pass the Playwright and axe checks in CI.
- Lighthouse performance on `/municipio/[ine]` is 95 or above on mobile;
  `/` is 85 or above given the GeoJSON load.
- The weekly data commit deploys the site with no manual step.
