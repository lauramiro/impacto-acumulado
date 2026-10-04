-- MW comes from projects_for_aggregates, so evacuation lines count as
-- projects but never as MW (migration 003).
DELETE FROM municipality_stats;
INSERT INTO municipality_stats (ine_code, status, technology, project_count, mw_nominal, mw_count, hectares, ha_count, turbines,
                                mw_best, mw_peak_fallback_count)
SELECT pm.ine_code,
       p.status,
       p.technology,
       count(*),
       COALESCE(sum(p.mw_nominal), 0),
       count(p.mw_nominal),
       COALESCE(sum(p.hectares), 0),
       count(p.hectares),
       COALESCE(sum(p.turbines), 0),
       COALESCE(sum(p.mw_best), 0),
       count(*) FILTER (WHERE p.mw_peak_fallback)
FROM projects_for_aggregates p
JOIN project_municipalities pm ON pm.project_id = p.id
GROUP BY pm.ine_code, p.status, p.technology;
