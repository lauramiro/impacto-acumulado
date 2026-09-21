# Impacto Acumulado

Cumulative environmental impact of renewable energy projects in Andalusia,
built from the official gazettes (BOE and BOJA).

Every solar or wind park in Spain is assessed on its own. This project turns
the environmental declarations and authorisations published in the gazettes
into structured data and shows the sum per municipality, per protected area
and per province, over time.

Status: pipeline implemented (fetch, extract, resolve, aggregate, export,
reference loads, evaluation harness, CI and weekly workflow). Production
database live on Neon with the reference layers loaded; the weekly workflow
runs against it and commits exports. Backfill partial: 71 BOE documents
(2019 to July 2026) extracted with Mistral `ministral-14b-latest` and
resolved into 63 projects; BOJA not fetched yet. See "Production setup"
below. Web site: map page and municipality pages live (slice 1).

- Design: [docs/superpowers/specs/2026-09-18-impacto-acumulado-design.md](docs/superpowers/specs/2026-09-18-impacto-acumulado-design.md)

## Pipeline

Python package in `pipeline/`. Stages: `fetch` (BOE and BOJA), `extract` (LLM to typed JSON), `resolve` (documents to projects), `aggregate` (PostGIS), `export` (CSV and GeoJSON into `web/public/data/`).

```bash
docker compose up -d db
cd pipeline && uv sync
uv run python -m impacto migrate
uv run python -m impacto fetch --from 2024-01-01 --to 2024-03-31
uv run python -m impacto extract --limit 20
uv run python -m impacto resolve && uv run python -m impacto aggregate && uv run python -m impacto export
uv run pytest
```

Configuration is through environment variables; see `pipeline/env.example`. Sources, filters and reference layers are documented in `docs/sources.md`. Extraction accuracy is measured with `uv run python -m impacto eval` (harness and labels in `pipeline/evaluation/`).

## Web

Next.js app in `web/`, fully static: pages read `web/public/data/` at build time and Vercel rebuilds on every commit to `main`, including the weekly data commit. No database connection from the web.

```bash
cd web && npm ci
npm run dev          # http://localhost:3000
npm test             # vitest, loaders and pure helpers against tests/fixtures/data
npm run build && npm run e2e   # playwright and axe against the built site
```

Vercel project settings: root directory `web`, framework Next.js, no environment variables. Design: [docs/superpowers/specs/2026-09-21-web-slice-1-design.md](docs/superpowers/specs/2026-09-21-web-slice-1-design.md).

## Continuous integration and the weekly run

- `.github/workflows/ci.yml` runs `ruff check` and `pytest` against a PostGIS service container on every push to `main`, every pull request, and on manual dispatch.
- `.github/workflows/pipeline.yml` (`weekly-pipeline`) runs Mondays at 06:00 UTC and on manual dispatch: `migrate`, `fetch` (last 14 days by default), `extract`, `resolve`, `aggregate`, `export`, then commits `web/public/data/` if it changed. Manual inputs: `from` (fetch start date), `extract_limit` (default 200) and `model` (exported as `IMPACTO_LLM_MODEL` when set). It reads the `NEON_DSN` and `GROQ_KEY` repository secrets. An exhausted Groq daily quota stops the extract stage early without recording an attempt against the document, and the step is `continue-on-error` so resolve, aggregate and export still run on what was extracted.

## Production setup

The weekly workflow needs a production database and the repository secrets. Steps 1 to 3 and 5 were done on 2026-09-20 and 2026-09-21 (Neon project `calm-sunset-94532458`, branch `production`, Frankfurt; secrets `NEON_DSN`, `GROQ_KEY`, `MISTRAL_KEY`; reference counts match the dev load; the first scheduled run on 2026-09-21 completed in 9 minutes and committed an export). Step 4 is in progress. The steps are kept as the record of what was done and how to redo it against a fresh database.

To run a stage against Neon from your machine without editing `pipeline/env.local`, export the DSN for the shell only (the Neon CLI is linked to the project through `.neon`):

```bash
cd pipeline
export IMPACTO_DB_DSN="$(neon connection-string --project-id calm-sunset-94532458 --branch production | tr -d '\r\n')"
uv run python -m impacto extract --provider mistral --limit 20
```

Neon terminates idle connections when the endpoint suspends or restarts, which happens while `extract` spends minutes in LLM calls; the extract stage reconnects and retries the save once when that happens, so a dropped connection costs nothing.

1. Create the Neon project. In the Neon console create a project named `impacto-acumulado` in an EU region (Frankfurt). No manual extension setup is needed: the first `migrate` run executes `CREATE EXTENSION postgis`, which Neon allows. Copy the direct (non-pooled) connection string, the one whose host does not contain `-pooler`: the pipeline is a single long-lived connection that runs multi-statement migrations and holds transactions across bulk loads, which PgBouncer's transaction-mode pooling behind the pooled endpoint does not support reliably.

2. Add the repository secrets. In GitHub, Settings, Secrets and variables, Actions, create:
   - `NEON_DSN`: the Neon direct connection string.
   - `GROQ_KEY`: the Groq API key.
   - `MISTRAL_KEY` (optional): the Mistral API key, used only when the workflow is dispatched with `provider` set to `mistral`.

3. Run the migration and the reference loads once against Neon from your machine, with `IMPACTO_DB_DSN` set to the Neon connection string (put it in the local config file described in `pipeline/env.example`; never commit it). The reference files and field names are the ones recorded in `docs/sources.md` ("Task 10 load results"); the sensitivity layer is loaded once per technology, so there are four commands for the three `reference` subcommands:

   ```bash
   cd pipeline
   uv run python -m impacto migrate
   uv run python -m impacto reference municipalities ../tmp/reference/dera_extracted/13_01_TerminoMunicipal.shp --code cod_mun --name nombre --province provincia
   uv run python -m impacto reference protected-areas ../tmp/reference/natura2000_extracted/RedNatura2000/InfGeografica/InfVectorial/Shapes/RedNatura2000_Andalucia.shp --code CODIGOEURO --name NOMBRE --type FIGURA
   uv run python -m impacto reference sensitivity ../tmp/reference/eol_extracted/Clas_ISA_eol_pb.tiff --technology eol
   uv run python -m impacto reference sensitivity ../tmp/reference/ftv_extracted/Clas_ISA_ftv_pb.tiff --technology ftv
   ```

   Expected counts (from the dev load): municipalities 785, protected areas 252 read and 197 stored, sensitivity eol 19985 polygons, sensitivity ftv 27179 polygons.

4. Run the backfill from a machine with a suitable LLM budget, not from Actions. The Groq free tier for `openai/gpt-oss-120b` is capped at 200,000 tokens per day (observed and recorded in `docs/sources.md`), which is about two to three documents per day, so the backfill from 2019 needs either a paid Groq plan or a different provider budget. With `IMPACTO_DB_DSN` pointing at Neon and `IMPACTO_LLM_KEY` set:

   ```bash
   cd pipeline
   uv run python -m impacto fetch --from 2019-01-01 --to 2026-09-18
   uv run python -m impacto extract --limit 100000
   ```

   The extract stage records each failed document and resumes on rerun; check progress with `SELECT status, count(*) FROM extractions GROUP BY 1`. Then run `resolve`, `aggregate` and `export`, and commit `web/public/data/`.

   The backfill can also run on Mistral's free Experiment plan instead of Groq: set `IMPACTO_MISTRAL_KEY` (and optionally `IMPACTO_MISTRAL_MODEL`, default `ministral-14b-latest`) and pass `--provider mistral` to `extract`. The Experiment plan's limits are only shown in the Mistral console (see `docs/sources.md`, "Mistral"); a 429 that names a monthly cap stops the run the same way Groq's daily cap does, and the run resumes where it left off when rerun.

   Progress so far (2026-09-21): 71 BOE documents fetched, all 71 extracted with `ministral-14b-latest` (two needed the `utm_coordinates` sanitiser fix), resolved into 63 projects, exported and committed. BOJA has not been fetched yet, and the BOE range has not been swept systematically; both are the remaining backfill work.

5. Trigger the weekly workflow once by hand (`gh workflow run weekly-pipeline`) and confirm it completes and either commits new exports or reports no changes. Done: the scheduled run of 2026-09-21 (run 35599195548) succeeded and committed `data: weekly export 2026-09-21`.
