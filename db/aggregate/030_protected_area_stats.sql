-- A project spanning several municipalities that all intersect the same
-- protected area would otherwise match one row per municipality, summing its
-- mw_nominal/hectares once per municipality instead of once per project.
-- Deduplicate to one (site_code, project) row first, then aggregate.
DELETE FROM protected_area_stats;
INSERT INTO protected_area_stats (site_code, status, project_count, mw_nominal, hectares)
SELECT site_code, status, count(*), COALESCE(sum(mw_nominal), 0), COALESCE(sum(hectares), 0)
FROM (
  SELECT DISTINCT pa.site_code, p.status, p.id, p.mw_nominal, p.hectares
  FROM protected_areas pa
  JOIN municipalities m ON ST_Intersects(m.geom, pa.geom)
  JOIN project_municipalities pm ON pm.ine_code = m.ine_code
  JOIN projects p ON p.id = pm.project_id
) matched_projects
GROUP BY site_code, status;
