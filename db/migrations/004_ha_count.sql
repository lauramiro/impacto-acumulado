-- ha_count: projects in the cell whose hectares are summed (declared). The
-- hectare counterpart of mw_count (migration 003), so a cell whose projects
-- declare no surface is told apart from a measured zero.
ALTER TABLE municipality_stats ADD COLUMN ha_count int NOT NULL DEFAULT 0;
ALTER TABLE municipality_stats ALTER COLUMN ha_count DROP DEFAULT;
ALTER TABLE protected_area_stats ADD COLUMN ha_count int NOT NULL DEFAULT 0;
ALTER TABLE protected_area_stats ALTER COLUMN ha_count DROP DEFAULT;
ALTER TABLE province_stats ADD COLUMN ha_count int NOT NULL DEFAULT 0;
ALTER TABLE province_stats ALTER COLUMN ha_count DROP DEFAULT;
