-- Web slice 3. The one place the evacuation-line rule lives: a line's
-- mw_nominal is the capacity it evacuates, already counted under the plant,
-- so no aggregate may sum it. Lines still count as projects.
CREATE VIEW projects_for_aggregates AS
SELECT id,
       status,
       COALESCE(technology, 'otra') AS technology,
       CASE WHEN technology = 'linea_evacuacion' THEN NULL ELSE mw_nominal END AS mw_nominal,
       hectares,
       turbines,
       status_document_id
FROM projects;

-- mw_count: projects in the cell whose MW is summed (declared and not a line).
ALTER TABLE municipality_stats ADD COLUMN mw_count int NOT NULL DEFAULT 0;
ALTER TABLE municipality_stats ALTER COLUMN mw_count DROP DEFAULT;

-- protected_area_stats gains the technology split; it is rebuilt by 030 on
-- every aggregate run, so emptying it here loses nothing.
DELETE FROM protected_area_stats;
ALTER TABLE protected_area_stats DROP CONSTRAINT protected_area_stats_pkey;
ALTER TABLE protected_area_stats ADD COLUMN technology text NOT NULL DEFAULT 'otra';
ALTER TABLE protected_area_stats ADD COLUMN mw_count int NOT NULL DEFAULT 0;
ALTER TABLE protected_area_stats ALTER COLUMN technology DROP DEFAULT;
ALTER TABLE protected_area_stats ALTER COLUMN mw_count DROP DEFAULT;
ALTER TABLE protected_area_stats ADD PRIMARY KEY (site_code, status, technology);

-- scope: a province name, or 'Andalucía' where each project counts once.
CREATE TABLE province_stats (
  scope          text NOT NULL,
  status         text NOT NULL,
  technology     text NOT NULL,
  project_count  int NOT NULL,
  mw_nominal     real NOT NULL,
  mw_count       int NOT NULL,
  hectares       real NOT NULL,
  PRIMARY KEY (scope, status, technology)
);

-- event: consulta, favorable, favorable_condicionada, desfavorable, sin_veredicto.
CREATE TABLE monthly_events (
  month           date NOT NULL,
  scope           text NOT NULL,
  technology      text NOT NULL,
  event           text NOT NULL,
  document_count  int NOT NULL,
  PRIMARY KEY (month, scope, technology, event)
);
