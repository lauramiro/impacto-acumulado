# Impacto Acumulado: design

Date: 2026-09-18
Status: approved design, pre-implementation

## Purpose

Every solar or wind park in Spain is assessed on its own. The environmental
declaration for one project says nothing about the eight other parks already
approved in the same municipality. NGOs, town councils, journalists and
researchers cannot answer "how much renewable capacity has been approved or is
pending here, and how much of it sits in sensitive land" without reading
thousands of gazette resolutions by hand.

Impacto Acumulado turns those resolutions into structured data and shows the
sum: per municipality, per protected area and per province, over time.

Version 1 covers Andalusia. Sources are the BOE (state gazette, projects over
50 MW) and the BOJA (Andalusian gazette, regional projects).

## Users

- Environmental NGOs preparing objections (alegaciones) who need the
  cumulative picture for a municipality or a Natura 2000 site.
- Town councils and local platforms deciding whether to oppose a project.
- Journalists and researchers covering the renewables boom in Andalusia.
- Recruiters and engineers reading the repository as a portfolio piece.

## What v1 shows

A Spanish-language site.

1. **Map page.** Choropleth of Andalusia's municipalities coloured by
   cumulative renewable capacity. Metric switch: MW, hectares, project count.
   Status filter: en consulta, favorable, favorable con condiciones,
   desfavorable. Technology filter: solar, eolica, hibrida. Overlays that can
   be toggled: Natura 2000 sites, ministry sensitivity zoning for renewables.
   Clicking a municipality opens a side panel with its totals and project list.
2. **Municipality page.** Totals by status and technology, list of projects
   with links to every source document, share of municipal area in high or
   maximum sensitivity classes, Natura 2000 sites intersecting the
   municipality.
3. **Project page.** Resolved project with all its documents in date order,
   extracted fields with the evidence span for each, verdict, conditions list
   grouped by category, and extraction confidence.
4. **Province table and monthly timeline** under the map: MW and projects
   by status per province, and a monthly series of approvals and refusals.
5. **Methodology page.** States the caveats plainly: location is at
   municipality level, extraction is done by an LLM with published per-field
   accuracy, BOE only contains projects above 50 MW, the Natura 2000 and
   sensitivity overlaps use the whole municipal boundary and are an attention
   filter, not an impact assessment.
6. **Data page.** CSV and GeoJSON downloads of projects, documents and
   municipality aggregates, so others can reuse the dataset.

README and the portfolio case study are in English. The UI is Spanish only in
v1.

## Architecture

Layered pipeline with a database table between each stage. Every stage can be
rerun alone.

```
BOE API ---+
           +--> raw_documents --> extract (LLM) --> extractions
BOJA API --+                                          |
                                                      v
                      projects <-- resolve (dedupe across documents)
                         |
                         v
     aggregate (PostGIS) --> municipality_stats, protected_area_stats,
                             province_monthly
                         |
                         v
                 Next.js site on Vercel (reads Postgres)
```

Components:

| Component | Language | Responsibility | Depends on |
|---|---|---|---|
| `pipeline/fetch` | Python | Pull document indexes and full text from BOE and BOJA; store raw text and metadata | BOE API, BOJA API, Postgres |
| `pipeline/extract` | Python | Turn one raw document into one typed extraction record via an LLM | LLM provider, Postgres |
| `pipeline/resolve` | Python (Scala in v2) | Group extractions into projects; derive project status | Postgres |
| `pipeline/aggregate` | Python + SQL | Rebuild PostGIS aggregate tables | Postgres/PostGIS, reference layers |
| `pipeline/reference` | Python | Download and load municipality boundaries, Natura 2000, sensitivity zoning | Public downloads, Postgres |
| `db/migrations` | SQL | Single owner of the schema | Postgres |
| `web` | Next.js (TypeScript) | Site described above | Postgres |
| `.github/workflows` | YAML | Weekly pipeline run and site checks | Secrets |

## Data sources

### BOE

- Daily summary endpoint: `https://www.boe.es/datosabiertos/api/boe/sumario/AAAAMMDD`
  with `Accept: application/json`. Returns sections, departments and items,
  each with links to XML, PDF and HTML.
- Selection: section III (Otras disposiciones), department Ministerio para la
  Transicion Ecologica y el Reto Demografico (name varies by year; match on
  "Transicion Ecologica"), title contains "impacto ambiental", and title
  contains at least one of: fotovoltaic, solar, eolic, hibrid, renovable.
  Andalusia filter: title or body contains an Andalusian province name
  (Almeria, Cadiz, Cordoba, Granada, Huelva, Jaen, Malaga, Sevilla) or
  "Andalucia". Accent-insensitive matching throughout.
- Full text: the XML link of each selected item.
- Backfill from 2019-01-01.

### BOJA

- Open API at `https://datos.juntadeandalucia.es/api/v0/boja/` with a
  `get/search_pagination` endpoint taking `date_from`, `date_to`, a text
  query and paging, returning records with `body`, `bodyNoHtml` and
  `publicUrl`. Coverage from 2019.
- Selection: organisation is the environment department (name varies by
  legislature; match on "Sostenibilidad" or "Medio Ambiente"), and the text
  matches "autorizacion ambiental unificada" or "impacto ambiental" or
  "informacion publica", plus a renewables keyword as for BOE.
- The exact organisation values and query syntax are not documented. The
  first task in the implementation plan is a one-day discovery that records
  working filters and sample document ids in `docs/sources.md`.
- Backfill from 2019-01-01.

### Reference layers (downloaded by script, stored in Postgres)

- Municipality boundaries with INE codes: Instituto de Estadistica y
  Cartografia de Andalucia (DERA) or IGN. Simplified for the web map.
- Natura 2000 sites: MITECO download.
- Environmental sensitivity zoning for wind and photovoltaic: MITECO
  download.

All sources are free and openly licensed. Requests are rate-limited and
cached; nothing is fetched twice.

## Data model

Schema owned by SQL migration files under `db/migrations`, applied by a small
runner in the pipeline package. PostGIS enabled.

- `raw_documents`: id, source (`boe`|`boja`), source_id, published_at,
  title, url, section, organisation, text, fetched_at, content_hash.
- `extractions`: document_id (FK), model, prompt_version, extracted_at,
  payload (JSON matching the extraction schema), confidence,
  status (`ok`|`failed`|`skipped`), error.
- `projects`: id, canonical_name, developer, technology, mw_peak,
  mw_nominal, hectares, turbines, status, status_document_id, first_seen,
  last_seen.
- `project_documents`: project_id, document_id, role (`consulta`,
  `informe`, `dia`, `aau`, `modificacion`, `caducidad`, `otro`), match_score,
  match_reason.
- `project_municipalities`: project_id, ine_code.
- `resolution_overrides`: document_id, project_id or `new`, note. Manual
  corrections that the resolve stage applies last.
- `municipalities`: ine_code, name, province, geom, area_ha,
  sensitivity_high_share.
- `protected_areas`: site_code, name, type, geom.
- `municipality_stats`, `protected_area_stats`, `province_monthly`:
  rebuilt by the aggregate stage.

## Extraction schema

One record per document:

- `doc_type`: `dia` | `informe_impacto` | `aau` | `informacion_publica` |
  `modificacion` | `caducidad` | `otro`
- `verdict`: `favorable` | `favorable_condicionada` | `desfavorable` |
  `no_aplica`
- `project_name`, `developer`, `expediente` (file number, nullable)
- `technology`: `solar_fv` | `eolica` | `hibrida` | `almacenamiento` |
  `linea_evacuacion` | `otra`
- `mw_peak`, `mw_nominal`, `hectares`, `turbines` (nullable numbers)
- `municipalities`: list of `{name, province}`
- `utm_coordinates`: optional list of `{x, y, zone}`
- `protected_areas_mentioned`: list of names
- `species_mentioned`: list of names
- `conditions`: list of `{category, text}` with category in
  `fauna | flora | agua | suelo | paisaje | patrimonio | vigilancia |
  compensacion | general`
- `related_projects`: list of names (phases, shared evacuation lines)
- `evidence`: map from field name to a short quoted span
- `confidence`: 0 to 1, set by the model and adjusted by validation

Extraction runs per section (header and background, project description,
assessment, conditions), with each section's output merged into one record.
Numeric fields are validated (MW and hectares ranges, municipality names
matched against the reference table with accent-insensitive fuzzy matching)
and failures lower confidence rather than reject the record.

The LLM provider is behind a `Provider` interface with `complete(prompt,
schema) -> dict`. Default is Groq. Anthropic and Ollama providers are
one-file additions. Prompt text carries a version string stored with each
extraction so reruns can target a prompt version.

Rate limiting: the Groq free tier has low per-minute token limits, so the
extract stage is resumable, processes documents in publication order, and
sleeps on 429 with exponential backoff. The backfill is expected to take
days on the free tier; that is acceptable.

## Entity resolution

Rule-based and deterministic, implemented as pure functions from lists of
extraction records to lists of project groups, so it can be unit-tested
without a database and ported to Scala later.

1. Normalise names: lowercase, strip accents, remove legal suffixes and
   generic words (parque, planta, fotovoltaico, solar, eolico, de, la, el),
   collapse whitespace.
2. Block candidates by: identical `expediente`; or a shared normalised name
   token of length 4 or more plus at least one shared municipality.
3. Score a candidate pair: exact `expediente` match is decisive (score 1.0).
   Otherwise sum of name similarity (token set ratio, weight 0.5),
   shared municipality (0.3), MW within 15 percent when both present (0.2).
   Threshold 0.6.
4. Union-find over accepted pairs gives project groups.
5. Apply `resolution_overrides` last.
6. Project status from the latest document by role: `informacion_publica`
   gives `en_consulta`; `dia`, `informe_impacto` or `aau` give the verdict;
   `caducidad` gives `caducado`; `modificacion` keeps the previous status.
   Canonical name and numbers come from the latest document that has them.

## Aggregation

SQL run after resolve:

- `municipality_stats`: per INE code and status and technology: project
  count, sum MW nominal, sum hectares, sum turbines.
- `protected_area_stats`: per Natura 2000 site: projects whose municipality
  geometry intersects the site, with the same sums. Municipality-level, and
  labelled as such everywhere it is shown.
- `municipalities.sensitivity_high_share`: share of municipal area in the
  high and maximum sensitivity classes of the ministry zoning.
- `province_monthly`: per province and month: count and MW by verdict.

## Web

Next.js App Router, TypeScript, deployed on Vercel. Server components query
Neon with a plain Postgres client and SQL; no ORM, since the schema is owned
by the migrations. Leaflet renders the choropleth from simplified municipality
GeoJSON served from the app and joined client-side to stats fetched as JSON.
Overlays load as GeoJSON on demand.

Routes: `/` map, `/municipio/[ine]`, `/proyecto/[id]`, `/metodologia`,
`/datos`. Data exports (CSV, GeoJSON) and the simplified municipality
GeoJSON are written by the weekly job into `web/public/data/` and committed,
which triggers a Vercel redeploy. Nothing is generated on request.

Accessibility: keyboard-reachable municipality list as an alternative to the
map, colour scales with labels, WCAG AA contrast.

## Operations and cost

- GitHub Actions weekly workflow: fetch (last 14 days plus any gaps), extract
  (pending only), resolve, aggregate, export. Two repository secrets: the
  Postgres connection string and the Groq API key.
- Neon free tier for Postgres with PostGIS. Vercel free tier for the site.
- Nothing in v1 requires a paid service. The backfill uses the Groq free
  tier and is slow by design.

## Error handling

- Fetch: HTTP failures retried three times with backoff, then the document is
  recorded as `fetch_failed` and picked up on the next run. Content hash
  prevents duplicate rows.
- Extract: provider errors and schema validation failures are stored on the
  extraction row with `status = failed` and the error text; the run continues.
  A document is retried on later runs up to three times.
- Resolve and aggregate: run inside a transaction and replace tables
  atomically, so the site never reads a half-built aggregate.
- Web: pages render with cached data if the database is unreachable and show
  a "data as of" timestamp.

## Testing

- Pytest. Three to five real resolutions (BOE XML and BOJA JSON) checked in
  as fixtures. Unit tests for source filters, section splitting, numeric
  validation, name normalisation, blocking, scoring, union-find and the
  status state machine. The LLM is stubbed in unit tests.
- Extraction evaluation: twenty hand-labelled documents in
  `pipeline/evaluation/`. A script runs extraction against them and reports
  per-field accuracy. The result is published on the methodology page and
  gates prompt changes.
- Web: Playwright smoke tests for each route and keyboard navigation of the
  municipality list.
- Test-driven development for every unit above.

## Repository layout

```
impacto-acumulado/
  README.md
  docs/
    sources.md              # findings from the discovery task
    superpowers/specs/      # this document
  db/migrations/            # NNN_name.sql
  pipeline/                 # Python package, managed with uv
    impacto/
      fetch/ extract/ resolve/ aggregate/ reference/ providers/ db/
    evaluation/
    tests/
    pyproject.toml
  web/                      # Next.js app
  .github/workflows/
```

## Out of scope for v1

Provincial gazettes (BOP), email or push alerts, parcel-level geometry,
English UI, Airflow orchestration, the Scala port of resolve and aggregate,
ML-based matching, any paid API.

## Success criteria

- A visitor can pick any Andalusian municipality and see its cumulative
  approved and pending MW with links to every source document within two
  clicks.
- Extraction accuracy on the evaluation set is published, with at least 90
  percent on verdict and municipalities and at least 80 percent on MW.
- The weekly job runs unattended on free tiers.
- The dataset is downloadable and cited on the methodology page with its
  caveats.
