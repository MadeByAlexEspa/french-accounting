// Types générés depuis le schéma Supabase.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          activite_type: string | null
          structure_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          activite_type?: string | null
          structure_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          activite_type?: string | null
          structure_type?: string | null
          created_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          last_login_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          last_login_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          last_login_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'memberships_workspace_id_fkey'
            columns: ['workspace_id']
            isOneToOne: false
            referencedRelation: 'workspaces'
            referencedColumns: ['id']
          },
        ]
      }
      invitations: {
        Row: {
          id: string
          workspace_id: string
          email: string
          role: 'owner' | 'admin' | 'member'
          token: string
          invited_by: string
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          email: string
          role?: 'owner' | 'admin' | 'member'
          token: string
          invited_by: string
          expires_at: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          email?: string
          role?: 'owner' | 'admin' | 'member'
          token?: string
          invited_by?: string
          expires_at?: string
          used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      factures: {
        Row: {
          id: number
          workspace_id: string
          numero: string
          date: string
          client: string
          description: string | null
          montant_ht: number
          taux_tva: number
          montant_tva: number
          montant_ttc: number
          tva_lines: Json | null
          categorie: string
          statut: 'payee' | 'en_attente'
          bank_source: string | null
          has_attachment: boolean
          created_at: string
        }
        Insert: {
          id?: number
          workspace_id: string
          numero: string
          date: string
          client: string
          description?: string | null
          montant_ht: number
          taux_tva: number
          montant_tva: number
          montant_ttc: number
          tva_lines?: Json | null
          categorie: string
          statut?: 'payee' | 'en_attente'
          bank_source?: string | null
          has_attachment?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          workspace_id?: string
          numero?: string
          date?: string
          client?: string
          description?: string | null
          montant_ht?: number
          taux_tva?: number
          montant_tva?: number
          montant_ttc?: number
          tva_lines?: Json | null
          categorie?: string
          statut?: 'payee' | 'en_attente'
          bank_source?: string | null
          has_attachment?: boolean
          created_at?: string
        }
        Relationships: []
      }
      depenses: {
        Row: {
          id: number
          workspace_id: string
          date: string
          fournisseur: string
          description: string | null
          montant_ht: number
          taux_tva: number
          montant_tva: number
          montant_ttc: number
          tva_lines: Json | null
          categorie: string
          statut: 'payee' | 'en_attente'
          bank_source: string | null
          has_attachment: boolean
          created_at: string
        }
        Insert: {
          id?: number
          workspace_id: string
          date: string
          fournisseur: string
          description?: string | null
          montant_ht: number
          taux_tva: number
          montant_tva: number
          montant_ttc: number
          tva_lines?: Json | null
          categorie: string
          statut?: 'payee' | 'en_attente'
          bank_source?: string | null
          has_attachment?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          workspace_id?: string
          date?: string
          fournisseur?: string
          description?: string | null
          montant_ht?: number
          taux_tva?: number
          montant_tva?: number
          montant_ttc?: number
          tva_lines?: Json | null
          categorie?: string
          statut?: 'payee' | 'en_attente'
          bank_source?: string | null
          has_attachment?: boolean
          created_at?: string
        }
        Relationships: []
      }
      ai_config: {
        Row: {
          workspace_id: string
          provider: string
          api_key: string | null
          model: string | null
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          workspace_id: string
          provider: string
          api_key?: string | null
          model?: string | null
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          workspace_id?: string
          provider?: string
          api_key?: string | null
          model?: string | null
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qonto_accounts: {
        Row: {
          id: number
          workspace_id: string
          name: string
          organization_slug: string | null
          secret_key: string | null
          iban: string | null
          auto_sync_enabled: boolean
          last_sync_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          workspace_id: string
          name?: string
          organization_slug?: string | null
          secret_key?: string | null
          iban?: string | null
          auto_sync_enabled?: boolean
          last_sync_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          workspace_id?: string
          name?: string
          organization_slug?: string | null
          secret_key?: string | null
          iban?: string | null
          auto_sync_enabled?: boolean
          last_sync_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      qonto_imports: {
        Row: {
          id: number
          workspace_id: string
          qonto_transaction_id: string
          local_type: 'facture' | 'depense'
          local_id: number
          has_attachment: boolean
          imported_at: string
        }
        Insert: {
          id?: number
          workspace_id: string
          qonto_transaction_id: string
          local_type: 'facture' | 'depense'
          local_id: number
          has_attachment?: boolean
          imported_at?: string
        }
        Update: {
          id?: number
          workspace_id?: string
          qonto_transaction_id?: string
          local_type?: 'facture' | 'depense'
          local_id?: number
          has_attachment?: boolean
          imported_at?: string
        }
        Relationships: []
      }
      qonto_sync_log: {
        Row: {
          id: number
          workspace_id: string
          account_id: number | null
          synced_at: string
          fetched: number
          imported: number
          skipped: number
          errors: string | null
        }
        Insert: {
          id?: number
          workspace_id: string
          account_id?: number | null
          synced_at?: string
          fetched?: number
          imported?: number
          skipped?: number
          errors?: string | null
        }
        Update: {
          id?: number
          workspace_id?: string
          account_id?: number | null
          synced_at?: string
          fetched?: number
          imported?: number
          skipped?: number
          errors?: string | null
        }
        Relationships: []
      }
      shine_accounts: {
        Row: {
          id: number
          workspace_id: string
          name: string
          access_token: string | null
          shine_account_id: string | null
          iban: string | null
          auto_sync_enabled: boolean
          last_sync_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          workspace_id: string
          name?: string
          access_token?: string | null
          shine_account_id?: string | null
          iban?: string | null
          auto_sync_enabled?: boolean
          last_sync_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          workspace_id?: string
          name?: string
          access_token?: string | null
          shine_account_id?: string | null
          iban?: string | null
          auto_sync_enabled?: boolean
          last_sync_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      shine_imports: {
        Row: {
          id: number
          workspace_id: string
          shine_transaction_id: string
          local_type: 'facture' | 'depense'
          local_id: number
          has_attachment: boolean
          imported_at: string
        }
        Insert: {
          id?: number
          workspace_id: string
          shine_transaction_id: string
          local_type: 'facture' | 'depense'
          local_id: number
          has_attachment?: boolean
          imported_at?: string
        }
        Update: {
          id?: number
          workspace_id?: string
          shine_transaction_id?: string
          local_type?: 'facture' | 'depense'
          local_id?: number
          has_attachment?: boolean
          imported_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      auth_workspace_ids: { Args: Record<string, never>; Returns: string[] }
    }
    Enums: Record<string, never>
  }
}

// Raccourcis pratiques
export type Workspace  = Database['public']['Tables']['workspaces']['Row']
export type Membership = Database['public']['Tables']['memberships']['Row']
export type Facture    = Database['public']['Tables']['factures']['Row']
export type Depense    = Database['public']['Tables']['depenses']['Row']

export type Invitation     = Database['public']['Tables']['invitations']['Row']

export type QontoAccount   = Database['public']['Tables']['qonto_accounts']['Row']
export type QontoImport    = Database['public']['Tables']['qonto_imports']['Row']
export type QontoSyncLog   = Database['public']['Tables']['qonto_sync_log']['Row']
export type ShineAccount   = Database['public']['Tables']['shine_accounts']['Row']
export type ShineImport    = Database['public']['Tables']['shine_imports']['Row']
