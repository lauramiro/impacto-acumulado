DELETE FROM municipality_stats;
INSERT INTO municipality_stats (ine_code, status, technology, project_count, mw_nominal, hectares, turbines)
SELECT pm.ine_code,
       p.status,
       COALESCE(p.technology, 'otra'),
       count(*),
       COALESCE(sum(p.mw_nominal), 0),
       COALESCE(sum(p.hectares), 0),
       COALESCE(sum(p.turbines), 0)
FROM projects p
JOIN project_municipalities pm ON pm.project_id = p.id
GROUP BY pm.ine_code, p.status, COALESCE(p.technology, 'otra');
