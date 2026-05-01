-- Fix: restrict invitations INSERT/DELETE to owner and admin roles only.
-- The generic macro in the initial migration created overly permissive policies
-- that allowed any workspace member to insert rows with arbitrary role values.

DROP POLICY IF EXISTS invitations_insert ON invitations;
DROP POLICY IF EXISTS invitations_delete ON invitations;

-- Only owner/admin can create invitations
CREATE POLICY invitations_insert ON invitations
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Only owner/admin can cancel (delete) invitations; used invitations cannot be deleted
CREATE POLICY invitations_delete ON invitations
  FOR DELETE USING (
    used_at IS NULL AND
    workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Also tighten the role column: invitations should only ever grant member or admin
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'member'));

-- Fix the misleading default (was 'owner')
ALTER TABLE invitations ALTER COLUMN role SET DEFAULT 'member';
