-- sensitivity_zones only stores the high-sensitivity classes (maxima, muy_alta,
-- alta), across both technologies (eol, ftv); every stored row counts toward
-- sensitivity_high_share regardless of klass or technology. Overlapping
-- polygons (adjacent raster tiles within a technology, or overlap between the
-- eol and ftv layers) must not be double-counted, so the union of intersecting
-- zones is taken per municipality before measuring the shared area.
--
-- Reset first so municipalities with no intersecting zone end up at 0 (a plain
-- UPDATE ... FROM only touches rows produced by the subquery).
UPDATE municipalities SET sensitivity_high_share = 0;

-- A LATERAL subquery per municipality lets the planner use the
-- sensitivity_zones_geom_idx GIST index to prune candidates for each
-- municipality's ST_Intersects test, instead of joining municipalities against
-- all ~47k zone rows before grouping. ST_Union collapses overlaps within the
-- matched set so the intersection area is not inflated.
UPDATE municipalities m
SET sensitivity_high_share = sub.share
FROM (
  SELECT m2.ine_code,
         ST_Area(ST_Intersection(m2.geom, u.geom)::geography)
           / NULLIF(ST_Area(m2.geom::geography), 0) AS share
  FROM municipalities m2
  CROSS JOIN LATERAL (
    SELECT ST_Union(z.geom) AS geom
    FROM sensitivity_zones z
    WHERE ST_Intersects(z.geom, m2.geom)
  ) u
  WHERE u.geom IS NOT NULL
) sub
WHERE sub.ine_code = m.ine_code;
