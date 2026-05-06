-- Add French fiscal/legal fields to workspaces
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS siret       TEXT,
  ADD COLUMN IF NOT EXISTS tva_intra   TEXT,
  ADD COLUMN IF NOT EXISTS adresse     TEXT,
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville       TEXT;
