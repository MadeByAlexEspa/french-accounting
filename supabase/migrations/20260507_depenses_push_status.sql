ALTER TABLE depenses
  ADD COLUMN IF NOT EXISTS push_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_target TEXT DEFAULT NULL;

COMMENT ON COLUMN depenses.push_status IS 'sent | rejected | null (not sent yet)';
COMMENT ON COLUMN depenses.push_target IS 'qonto | shine | null';
