'use server'

import { createServiceClient } from '@/lib/supabase/server'

export async function acceptInvitation(
  token: string,
  password: string
): Promise<{ error?: string; success?: boolean }> {
  if (password.length < 8)  return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }
  if (password.length > 128) return { error: 'Le mot de passe est trop long.' }

  const service = createServiceClient()

  const { data: inv, error: fetchErr } = await service
    .from('invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (fetchErr || !inv) return { error: 'Invitation invalide.' }
  if (new Date(inv.expires_at) < new Date()) return { error: 'Cette invitation a expiré.' }
  if (inv.used_at) return { error: 'Cette invitation a déjà été utilisée.' }

  // Anti-race: mark used only if still unused
  const { count } = await service
    .from('invitations')
    .update({ used_at: new Date().toISOString() }, { count: 'exact' })
    .eq('token', token)
    .is('used_at', null)

  if (!count || count === 0) return { error: 'Cette invitation a déjà été utilisée.' }

  const { data: userData, error: userErr } = await service.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
  })

  if (userErr || !userData.user) {
    const { error: rbErr } = await service.from('invitations').update({ used_at: null }).eq('token', token)
    if (rbErr) console.error('[acceptInvitation] Rollback échoué — token brûlé:', rbErr.message)
    if (userErr?.message?.includes('already registered')) {
      return { error: 'Un compte existe déjà avec cette adresse email. Connectez-vous directement.' }
    }
    return { error: userErr?.message ?? 'Erreur lors de la création du compte.' }
  }

  // Invitations never grant 'owner' — cap at 'admin' to prevent role escalation
  const safeRole: 'admin' | 'member' = inv.role === 'admin' ? 'admin' : 'member'

  const { error: memberErr } = await service.from('memberships').insert({
    workspace_id: inv.workspace_id,
    user_id: userData.user.id,
    role: safeRole,
  })

  if (memberErr) {
    await service.auth.admin.deleteUser(userData.user.id)
    const { error: rbErr } = await service.from('invitations').update({ used_at: null }).eq('token', token)
    if (rbErr) console.error('[acceptInvitation] Rollback membership échoué:', rbErr.message)
    return { error: memberErr.message }
  }

  return { success: true }
}
