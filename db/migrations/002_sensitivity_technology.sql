ALTER TABLE sensitivity_zones ADD COLUMN technology text NOT NULL DEFAULT 'ftv';
ALTER TABLE sensitivity_zones ALTER COLUMN technology DROP DEFAULT;
