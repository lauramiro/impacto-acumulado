-- A project spanning several municipalities that all intersect the same
-- protected area would otherwise match one row per municipality, summing its
-- mw_nominal/hectares once per municipality instead of once per project.
-- Deduplicate to one (site_code, project) row first, then aggregate.
-- MW comes from projects_for_aggregates (evacuation lines contribute none).
DELETE FROM protected_area_stats;
INSERT INTO protected_area_stats (site_code, status, technology, project_count, mw_nominal, mw_count, hectares, ha_count)
SELECT site_code, status, technology, count(*), COALESCE(sum(mw_nominal), 0), count(mw_nominal), COALESCE(sum(hectares), 0), count(hectares)
FROM (
  SELECT DISTINCT pa.site_code, p.status, p.technology, p.id, p.mw_nominal, p.hectares
  FROM protected_areas pa
  JOIN municipalities m ON ST_Intersects(m.geom, pa.geom)
  JOIN project_municipalities pm ON pm.ine_code = m.ine_code
  JOIN projects_for_aggregates p ON p.id = pm.project_id
) matched_projects
GROUP BY site_code, status, technology;
