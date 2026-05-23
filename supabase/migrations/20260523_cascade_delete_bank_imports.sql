-- Cascade-delete qonto_imports / shine_imports when the linked facture or depense is deleted.
-- Prevents the dedup table from blocking re-imports after a manual delete.

CREATE OR REPLACE FUNCTION _cascade_delete_bank_imports()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM qonto_imports WHERE local_id = OLD.id AND local_type = TG_ARGV[0];
  DELETE FROM shine_imports  WHERE local_id = OLD.id AND local_type = TG_ARGV[0];
  RETURN OLD;
END;
$$;

CREATE TRIGGER cascade_delete_facture_imports
BEFORE DELETE ON factures
FOR EACH ROW EXECUTE FUNCTION _cascade_delete_bank_imports('facture');

CREATE TRIGGER cascade_delete_depense_imports
BEFORE DELETE ON depenses
FOR EACH ROW EXECUTE FUNCTION _cascade_delete_bank_imports('depense');

-- One-time cleanup: remove orphaned import records whose facture/depense no longer exists.
DELETE FROM qonto_imports qi
WHERE local_type = 'facture'
  AND NOT EXISTS (SELECT 1 FROM factures f WHERE f.id = qi.local_id);

DELETE FROM qonto_imports qi
WHERE local_type = 'depense'
  AND NOT EXISTS (SELECT 1 FROM depenses d WHERE d.id = qi.local_id);

DELETE FROM shine_imports si
WHERE local_type = 'facture'
  AND NOT EXISTS (SELECT 1 FROM factures f WHERE f.id = si.local_id);

DELETE FROM shine_imports si
WHERE local_type = 'depense'
  AND NOT EXISTS (SELECT 1 FROM depenses d WHERE d.id = si.local_id);
