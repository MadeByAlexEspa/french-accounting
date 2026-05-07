CREATE TABLE IF NOT EXISTS exercice_annotations (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  annee         INT  NOT NULL,  -- e.g. 2025
  contenu       TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, annee)
);

ALTER TABLE exercice_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercice_annotations_select" ON exercice_annotations
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "exercice_annotations_insert" ON exercice_annotations
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "exercice_annotations_update" ON exercice_annotations
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "exercice_annotations_delete" ON exercice_annotations
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT auth_workspace_ids()));
