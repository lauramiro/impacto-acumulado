-- Per province: a project counts once per province it touches (a project in
-- two municipalities of the same province is deduplicated first). The
-- 'Andalucía' rows count every project exactly once, including projects with
-- no identified municipality, so the regional total is not the sum of rows.
DELETE FROM province_stats;
INSERT INTO province_stats (scope, status, technology, project_count, mw_nominal, mw_count, hectares, ha_count,
                            mw_best, mw_peak_fallback_count)
SELECT scope, status, technology, count(*), COALESCE(sum(mw_nominal), 0), count(mw_nominal), COALESCE(sum(hectares), 0), count(hectares),
       COALESCE(sum(mw_best), 0), count(*) FILTER (WHERE mw_peak_fallback)
FROM (
  SELECT DISTINCT m.province AS scope, p.id, p.status, p.technology, p.mw_nominal, p.hectares, p.mw_best, p.mw_peak_fallback
  FROM projects_for_aggregates p
  JOIN project_municipalities pm ON pm.project_id = p.id
  JOIN municipalities m ON m.ine_code = pm.ine_code
  UNION ALL
  SELECT 'Andalucía', p.id, p.status, p.technology, p.mw_nominal, p.hectares, p.mw_best, p.mw_peak_fallback
  FROM projects_for_aggregates p
) scoped
GROUP BY scope, status, technology;
