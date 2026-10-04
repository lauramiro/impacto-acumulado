-- mw_best: the nominal MW, or the peak (MWp) where a project declares only
-- the peak. Solar peak is higher than nominal, so a total that uses it leans
-- high; mw_peak_fallback marks the projects where it is used, and every
-- aggregate counts them so the site can say so next to each total. Evacuation
-- lines still contribute no MW (migration 003). mw_nominal keeps its meaning.
CREATE OR REPLACE VIEW projects_for_aggregates AS
SELECT id,
       status,
       COALESCE(technology, 'otra') AS technology,
       CASE WHEN technology = 'linea_evacuacion' THEN NULL ELSE mw_nominal END AS mw_nominal,
       hectares,
       turbines,
       status_document_id,
       CASE WHEN technology = 'linea_evacuacion' THEN NULL ELSE COALESCE(mw_nominal, mw_peak) END AS mw_best,
       (technology IS DISTINCT FROM 'linea_evacuacion' AND mw_nominal IS NULL AND mw_peak IS NOT NULL) AS mw_peak_fallback
FROM projects;

ALTER TABLE municipality_stats ADD COLUMN mw_best real NOT NULL DEFAULT 0;
ALTER TABLE municipality_stats ADD COLUMN mw_peak_fallback_count int NOT NULL DEFAULT 0;
ALTER TABLE protected_area_stats ADD COLUMN mw_best real NOT NULL DEFAULT 0;
ALTER TABLE protected_area_stats ADD COLUMN mw_peak_fallback_count int NOT NULL DEFAULT 0;
ALTER TABLE province_stats ADD COLUMN mw_best real NOT NULL DEFAULT 0;
ALTER TABLE province_stats ADD COLUMN mw_peak_fallback_count int NOT NULL DEFAULT 0;
ALTER TABLE province_monthly ADD COLUMN mw_best real NOT NULL DEFAULT 0;
ALTER TABLE province_monthly ADD COLUMN mw_peak_fallback_count int NOT NULL DEFAULT 0;
ALTER TABLE municipality_stats ALTER COLUMN mw_best DROP DEFAULT;
ALTER TABLE municipality_stats ALTER COLUMN mw_peak_fallback_count DROP DEFAULT;
ALTER TABLE protected_area_stats ALTER COLUMN mw_best DROP DEFAULT;
ALTER TABLE protected_area_stats ALTER COLUMN mw_peak_fallback_count DROP DEFAULT;
ALTER TABLE province_stats ALTER COLUMN mw_best DROP DEFAULT;
ALTER TABLE province_stats ALTER COLUMN mw_peak_fallback_count DROP DEFAULT;
ALTER TABLE province_monthly ALTER COLUMN mw_best DROP DEFAULT;
ALTER TABLE province_monthly ALTER COLUMN mw_peak_fallback_count DROP DEFAULT;
