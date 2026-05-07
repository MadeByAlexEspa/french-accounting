CREATE TABLE IF NOT EXISTS exercice_clotures (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  annee         INT  NOT NULL,
  cloture_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cloture_par   UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (workspace_id, annee)
);

ALTER TABLE exercice_clotures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercice_clotures_select" ON exercice_clotures
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "exercice_clotures_insert" ON exercice_clotures
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "exercice_clotures_delete" ON exercice_clotures
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT auth_workspace_ids()));
