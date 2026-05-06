'use server'

import { createClient } from '@/lib/supabase/server'
import { sendFactureEmail } from '@/lib/email'

export async function sendInvoiceEmail(
  factureId: number,
  to: string
): Promise<{ ok: boolean; error?: string }> {
  if (!to || !to.includes('@')) return { ok: false, error: 'Adresse email invalide' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  const { data: m } = await supabase
    .from('memberships')
    .select('workspace_id, workspaces(name, siret, tva_intra, adresse, code_postal, ville)')
    .eq('user_id', user.id)
    .single()
  if (!m) return { ok: false, error: 'Workspace introuvable' }

  const { data: facture } = await supabase
    .from('factures')
    .select('numero, date, client, description, montant_ht, taux_tva, montant_tva, montant_ttc, statut')
    .eq('id', factureId)
    .eq('workspace_id', m.workspace_id)
    .single()
  if (!facture) return { ok: false, error: 'Facture introuvable' }

  const wsRaw = m.workspaces
  const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://compte-pote.vercel.app'

  return sendFactureEmail({
    to,
    facture,
    workspace: ws ?? {
      name: '',
      siret: null,
      tva_intra: null,
      adresse: null,
      code_postal: null,
      ville: null,
    },
    appUrl,
  })
}
