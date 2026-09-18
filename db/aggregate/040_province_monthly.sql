DELETE FROM province_monthly;
INSERT INTO province_monthly (province, month, verdict, project_count, mw_nominal)
SELECT m.province,
       date_trunc('month', d.published_at)::date,
       p.status,
       count(DISTINCT p.id),
       COALESCE(sum(p.mw_nominal), 0)
FROM projects p
JOIN raw_documents d ON d.id = p.status_document_id
JOIN project_municipalities pm ON pm.project_id = p.id
JOIN municipalities m ON m.ine_code = pm.ine_code
GROUP BY m.province, date_trunc('month', d.published_at), p.status;
