-- A project spanning several municipalities in the same province would
-- otherwise match one row per municipality, summing its mw_nominal once per
-- municipality instead of once per project. Deduplicate to one
-- (province, month, verdict, project) row first, then aggregate.
DELETE FROM province_monthly;
INSERT INTO province_monthly (province, month, verdict, project_count, mw_nominal)
SELECT province, month, verdict, count(*), COALESCE(sum(mw_nominal), 0)
FROM (
  SELECT DISTINCT m.province,
         date_trunc('month', d.published_at)::date AS month,
         p.status AS verdict,
         p.id,
         p.mw_nominal
  FROM projects p
  JOIN raw_documents d ON d.id = p.status_document_id
  JOIN project_municipalities pm ON pm.project_id = p.id
  JOIN municipalities m ON m.ine_code = pm.ine_code
) matched_projects
GROUP BY province, month, verdict;
