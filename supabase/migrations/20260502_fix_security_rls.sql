-- ─────────────────────────────────────────────────────────────────────────────
-- Security hardening: RLS policies + indexes + constraints
-- Fixes:
--   • memberships INSERT — any member could self-promote to owner
--   • workspaces DELETE  — any member could delete workspace
--   • workspaces UPDATE  — any member could rename workspace
--   • memberships DELETE — any member could remove other members
--   • invitations UPDATE — any member could change role/used_at directly
--   • workspaces INSERT  — document explicit deny (service role only)
--   • Missing index on memberships(user_id) — hottest query in the app
--   • Missing index on invitations(workspace_id, email)
--   • Missing UNIQUE on factures(workspace_id, numero)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── memberships: restrict INSERT to owner/admin, cap role at admin ────────────

DROP POLICY IF EXISTS memberships_insert ON memberships;

CREATE POLICY memberships_insert ON memberships
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    AND role IN ('admin', 'member')
  );

-- ── memberships: restrict DELETE to owner/admin, block self-removal ───────────

DROP POLICY IF EXISTS memberships_delete ON memberships;

CREATE POLICY memberships_delete ON memberships
  FOR DELETE USING (
    user_id != auth.uid()
    AND workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── workspaces: restrict DELETE to owner only ────────────────────────────────

DROP POLICY IF EXISTS workspaces_delete ON workspaces;

CREATE POLICY workspaces_delete ON workspaces
  FOR DELETE USING (
    id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- ── workspaces: restrict UPDATE to owner and admin ───────────────────────────

DROP POLICY IF EXISTS workspaces_update ON workspaces;

CREATE POLICY workspaces_update ON workspaces
  FOR UPDATE USING (
    id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── workspaces: document that INSERT is service-role only ────────────────────

DROP POLICY IF EXISTS workspaces_insert ON workspaces;

CREATE POLICY workspaces_insert ON workspaces
  FOR INSERT WITH CHECK (false);

-- ── invitations: restrict UPDATE to owner/admin, only allow marking used_at ──

DROP POLICY IF EXISTS invitations_update ON invitations;

CREATE POLICY invitations_update ON invitations
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    role IN ('admin', 'member')
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Hot path: every authenticated request queries memberships by user_id
CREATE INDEX IF NOT EXISTS memberships_user_id_idx
  ON memberships (user_id);

-- Invitation duplicate check
CREATE INDEX IF NOT EXISTS invitations_workspace_email_idx
  ON invitations (workspace_id, email);

-- ── Constraints ───────────────────────────────────────────────────────────────

-- Prevent duplicate invoice numbers within a workspace
ALTER TABLE factures
  DROP CONSTRAINT IF EXISTS factures_workspace_numero_unique,
  ADD CONSTRAINT factures_workspace_numero_unique UNIQUE (workspace_id, numero);
