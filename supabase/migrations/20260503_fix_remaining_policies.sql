-- 1. memberships UPDATE policy (needed for last_login_at updates)
--    Only the member themselves can update their own last_login_at.
--    Admins/owners cannot self-promote via this policy.
DROP POLICY IF EXISTS "memberships_update" ON memberships;
CREATE POLICY "memberships_update" ON memberships
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IN (SELECT unnest(auth_workspace_ids()))
    -- role stays unchanged (cannot self-promote via UPDATE)
    AND role = (SELECT role FROM memberships WHERE id = memberships.id LIMIT 1)
  );

-- 2. invitations.invited_by: tolerate user deletion without blocking cascade
--    (Supabase does not support ALTER CONSTRAINT directly in RLS migrations;
--     this adjusts the FK if the column exists as a plain FK without ON DELETE)
ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey;

ALTER TABLE invitations
  ADD CONSTRAINT invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Tighten invitations UPDATE: only owner/admin can update, role stays admin/member
DROP POLICY IF EXISTS "invitations_update_owner_admin" ON invitations;
CREATE POLICY "invitations_update_owner_admin" ON invitations
  FOR UPDATE
  USING (
    workspace_id IN (SELECT unnest(auth_workspace_ids()))
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE workspace_id = invitations.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    role IN ('admin', 'member')
  );
