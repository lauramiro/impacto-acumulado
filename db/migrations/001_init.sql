CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE raw_documents (
  id            bigserial PRIMARY KEY,
  source        text NOT NULL CHECK (source IN ('boe', 'boja')),
  source_id     text NOT NULL,
  published_at  date NOT NULL,
  title         text NOT NULL,
  url           text NOT NULL,
  section       text,
  organisation  text,
  text          text NOT NULL,
  content_hash  text NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX raw_documents_published_idx ON raw_documents (published_at);

CREATE TABLE extractions (
  document_id     bigint PRIMARY KEY REFERENCES raw_documents (id) ON DELETE CASCADE,
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  extracted_at    timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  attempts        int NOT NULL DEFAULT 1,
  error           text,
  confidence      real,
  payload         jsonb
);

CREATE TABLE projects (
  id                  bigserial PRIMARY KEY,
  canonical_name      text NOT NULL,
  developer           text,
  technology          text,
  mw_peak             real,
  mw_nominal          real,
  hectares            real,
  turbines            int,
  status              text NOT NULL,
  status_document_id  bigint REFERENCES raw_documents (id),
  first_seen          date NOT NULL,
  last_seen           date NOT NULL
);

CREATE TABLE project_documents (
  project_id    bigint NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  document_id   bigint NOT NULL REFERENCES raw_documents (id) ON DELETE CASCADE,
  role          text NOT NULL,
  match_score   real NOT NULL,
  match_reason  text NOT NULL,
  PRIMARY KEY (project_id, document_id)
);

CREATE TABLE municipalities (
  ine_code                text PRIMARY KEY,
  name                    text NOT NULL,
  province                text NOT NULL,
  geom                    geometry(MultiPolygon, 4326) NOT NULL,
  area_ha                 real NOT NULL,
  sensitivity_high_share  real
);
CREATE INDEX municipalities_geom_idx ON municipalities USING gist (geom);

CREATE TABLE project_municipalities (
  project_id  bigint NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  ine_code    text NOT NULL REFERENCES municipalities (ine_code),
  PRIMARY KEY (project_id, ine_code)
);

CREATE TABLE resolution_overrides (
  document_id  bigint PRIMARY KEY REFERENCES raw_documents (id) ON DELETE CASCADE,
  group_key    text NOT NULL,
  note         text NOT NULL
);

CREATE TABLE protected_areas (
  site_code  text PRIMARY KEY,
  name       text NOT NULL,
  type       text NOT NULL,
  geom       geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX protected_areas_geom_idx ON protected_areas USING gist (geom);

CREATE TABLE sensitivity_zones (
  id     bigserial PRIMARY KEY,
  klass  text NOT NULL,
  geom   geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX sensitivity_zones_geom_idx ON sensitivity_zones USING gist (geom);

CREATE TABLE municipality_stats (
  ine_code       text NOT NULL REFERENCES municipalities (ine_code),
  status         text NOT NULL,
  technology     text NOT NULL,
  project_count  int NOT NULL,
  mw_nominal     real NOT NULL,
  hectares       real NOT NULL,
  turbines       int NOT NULL,
  PRIMARY KEY (ine_code, status, technology)
);

CREATE TABLE protected_area_stats (
  site_code      text NOT NULL REFERENCES protected_areas (site_code),
  status         text NOT NULL,
  project_count  int NOT NULL,
  mw_nominal     real NOT NULL,
  hectares       real NOT NULL,
  PRIMARY KEY (site_code, status)
);

CREATE TABLE province_monthly (
  province       text NOT NULL,
  month          date NOT NULL,
  verdict        text NOT NULL,
  project_count  int NOT NULL,
  mw_nominal     real NOT NULL,
  PRIMARY KEY (province, month, verdict)
);
