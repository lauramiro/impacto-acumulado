# Impacto Acumulado

Cumulative environmental impact of renewable energy projects in Andalusia,
built from the official gazettes (BOE and BOJA).

Every solar or wind park in Spain is assessed on its own. This project turns
the environmental declarations and authorisations published in the gazettes
into structured data and shows the sum per municipality, per protected area
and per province, over time.

Status: pipeline implemented (fetch, extract, resolve, aggregate, export,
reference loads, evaluation harness, CI and weekly workflow). Production
database and backfill pending; see "Production setup" below. Web site not
started.

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

Configuration is through environment variables; see `pipeline/env.example`. Sources, filters and reference layers are documented in `docs/sources.md`. Extraction accuracy is measured with `uv run python -m impacto eval`.

## Continuous integration and the weekly run

- `.github/workflows/ci.yml` runs `ruff check` and `pytest` against a PostGIS service container on every push to `main`, every pull request, and on manual dispatch.
- `.github/workflows/pipeline.yml` (`weekly-pipeline`) runs Mondays at 06:00 UTC and on manual dispatch: `migrate`, `fetch` (last 14 days by default), `extract`, `resolve`, `aggregate`, `export`, then commits `web/public/data/` if it changed. Manual inputs: `from` (fetch start date), `extract_limit` (default 200) and `model` (exported as `IMPACTO_LLM_MODEL` when set). It reads the `NEON_DSN` and `GROQ_KEY` repository secrets. A Groq quota error is recorded per document by the extract stage and does not fail the run.

## Production setup

The weekly workflow needs a production database and two repository secrets. None of these exist yet; the owner must do the following once.

1. Create the Neon project. In the Neon console create a project named `impacto-acumulado` in an EU region (Frankfurt). No manual extension setup is needed: the first `migrate` run executes `CREATE EXTENSION postgis`, which Neon allows. Copy the pooled connection string.

2. Add the repository secrets. In GitHub, Settings, Secrets and variables, Actions, create:
   - `NEON_DSN`: the Neon pooled connection string.
   - `GROQ_KEY`: the Groq API key.

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

5. Trigger the weekly workflow once by hand (`gh workflow run weekly-pipeline`) and confirm it completes and either commits new exports or reports no changes.
