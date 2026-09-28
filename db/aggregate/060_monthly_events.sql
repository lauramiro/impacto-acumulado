-- One event per decision or consultation document, in the month it was
-- published. consulta documents give 'consulta'; dia, aau and informe give
-- their extracted verdict, or 'sin_veredicto' when it is no_aplica, null, or
-- the extraction row is missing. modificacion, caducidad and otro are not
-- decisions and are left out. Province rows count a document once per
-- province of its project; 'Andalucía' rows count it once.
DELETE FROM monthly_events;
WITH events AS (
  SELECT d.id AS document_id,
         date_trunc('month', d.published_at)::date AS month,
         p.id AS project_id,
         p.technology,
         CASE
           WHEN pd.role = 'consulta' THEN 'consulta'
           WHEN e.payload->>'verdict' IN ('favorable', 'favorable_condicionada', 'desfavorable') THEN e.payload->>'verdict'
           ELSE 'sin_veredicto'
         END AS event
  FROM raw_documents d
  JOIN project_documents pd ON pd.document_id = d.id
  JOIN projects_for_aggregates p ON p.id = pd.project_id
  LEFT JOIN extractions e ON e.document_id = d.id
  WHERE pd.role IN ('consulta', 'dia', 'aau', 'informe')
)
INSERT INTO monthly_events (month, scope, technology, event, document_count)
SELECT month, scope, technology, event, count(*)
FROM (
  SELECT DISTINCT m.province AS scope, ev.document_id, ev.month, ev.technology, ev.event
  FROM events ev
  JOIN project_municipalities pm ON pm.project_id = ev.project_id
  JOIN municipalities m ON m.ine_code = pm.ine_code
  UNION ALL
  SELECT 'Andalucía', document_id, month, technology, event FROM events
) scoped
GROUP BY month, scope, technology, event;
