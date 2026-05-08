-- Index composites pour les requêtes filtrées par workspace + date
-- Utilisés par les pages TVA, Comptes annuels et Transactions

CREATE INDEX IF NOT EXISTS idx_factures_workspace_date
  ON factures(workspace_id, date);

CREATE INDEX IF NOT EXISTS idx_depenses_workspace_date
  ON depenses(workspace_id, date);

-- Index pour les jointures memberships → workspaces
CREATE INDEX IF NOT EXISTS idx_memberships_user_id
  ON memberships(user_id);
