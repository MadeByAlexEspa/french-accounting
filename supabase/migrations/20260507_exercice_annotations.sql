CREATE TABLE IF NOT EXISTS exercice_annotations (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  annee         INT  NOT NULL,  -- e.g. 2025
  contenu       TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, annee)
);

ALTER TABLE exercice_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercice_annotations_workspace" ON exercice_annotations
  FOR ALL TO authenticated
  USING  (workspace_id = ANY(auth_workspace_ids()))
  WITH CHECK (workspace_id = ANY(auth_workspace_ids()));
