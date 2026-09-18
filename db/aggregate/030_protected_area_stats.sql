DELETE FROM protected_area_stats;
INSERT INTO protected_area_stats (site_code, status, project_count, mw_nominal, hectares)
SELECT pa.site_code, p.status, count(DISTINCT p.id), COALESCE(sum(p.mw_nominal), 0), COALESCE(sum(p.hectares), 0)
FROM protected_areas pa
JOIN municipalities m ON ST_Intersects(m.geom, pa.geom)
JOIN project_municipalities pm ON pm.ine_code = m.ine_code
JOIN projects p ON p.id = pm.project_id
GROUP BY pa.site_code, p.status;
