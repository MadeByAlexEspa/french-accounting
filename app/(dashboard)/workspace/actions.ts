'use server'

import { randomBytes } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email'

export type MemberRow = {
  id: string
  user_id: string
  role: string
  email: string
  created_at: string
}

export type InvitationRow = {
  id: string
  email: string
  role: string
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function getWorkspaceCtx(): Promise<{
  workspaceId: string
  userId: string
  role: 'owner' | 'admin' | 'member'
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: m } = await supabase
    .from('memberships')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .single()
  if (!m) return null
  return { workspaceId: m.workspace_id, userId: user.id, role: m.role }
}

async function buildInviteUrl(token: string, workspaceId: string, supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ url: string; wsName: string }> {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const { data: ws } = await supabase.from('workspaces').select('name').eq('id', workspaceId).single()
  return { url: `${appUrl}/invite/${token}`, wsName: ws?.name ?? 'votre équipe' }
}

export async function createInvitation(
  email: string,
  role: 'admin' | 'member' = 'member'
): Promise<{ error?: string; inviteUrl?: string }> {
  if (!EMAIL_RE.test(email)) return { error: 'Adresse email invalide.' }

  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }
  if (ctx.role === 'member') return { error: 'Droits insuffisants pour inviter des membres.' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('invitations')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('email', email.toLowerCase())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) return { error: 'Une invitation est déjà en attente pour cet email.' }

  const token = randomBytes(32).toString('hex')
  const expires_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString()

  const { error: insertError } = await supabase.from('invitations').insert({
    workspace_id: ctx.workspaceId,
    email: email.toLowerCase(),
    role,
    token,
    invited_by: ctx.userId,
    expires_at,
  })

  if (insertError) return { error: insertError.message }

  const { url: inviteUrl, wsName } = await buildInviteUrl(token, ctx.workspaceId, supabase)
  sendInvitationEmail(email, wsName, inviteUrl).catch(() => {})

  return { inviteUrl }
}

export async function listInvitations(): Promise<{ data?: InvitationRow[]; error?: string }> {
  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }

  const supabase = await createClient()

  // Cleanup: delete accepted invitations older than 1 day
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  await supabase
    .from('invitations')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .not('used_at', 'is', null)
    .lt('used_at', oneDayAgo)

  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, role, token, expires_at, used_at, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: (data as InvitationRow[]) ?? [] }
}

export async function cancelInvitation(id: string): Promise<{ error?: string }> {
  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }
  if (ctx.role === 'member') return { error: 'Droits insuffisants.' }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from('invitations')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)

  if (error) return { error: error.message }
  if (!count || count === 0) return { error: 'Invitation introuvable.' }
  return {}
}

export async function resendInvitation(id: string): Promise<{ error?: string; inviteUrl?: string }> {
  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }
  if (ctx.role === 'member') return { error: 'Droits insuffisants.' }

  const supabase = await createClient()

  const { data: inv } = await supabase
    .from('invitations')
    .select('email, used_at, workspace_id')
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()

  if (!inv) return { error: 'Invitation introuvable.' }
  if (inv.used_at) return { error: 'Invitation déjà acceptée.' }

  // Delete old and create fresh (new token + reset expiry)
  await supabase.from('invitations').delete().eq('id', id)

  const token = randomBytes(32).toString('hex')
  const expires_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString()

  const { error: insertError } = await supabase.from('invitations').insert({
    workspace_id: ctx.workspaceId,
    email: inv.email,
    role: 'member',
    token,
    invited_by: ctx.userId,
    expires_at,
  })

  if (insertError) return { error: insertError.message }

  const { url: inviteUrl, wsName } = await buildInviteUrl(token, ctx.workspaceId, supabase)
  sendInvitationEmail(inv.email, wsName, inviteUrl).catch(() => {})

  return { inviteUrl }
}

export async function updateMemberRole(
  memberId: string,
  newRole: 'admin' | 'member'
): Promise<{ error?: string }> {
  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }
  if (ctx.role === 'member') return { error: 'Droits insuffisants.' }

  const supabase = await createClient()

  // Fetch target membership
  const { data: target } = await supabase
    .from('memberships')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()

  if (!target) return { error: 'Membre introuvable.' }
  if (target.role === 'owner') return { error: "Impossible de modifier le rôle du propriétaire." }
  if (target.user_id === ctx.userId) return { error: 'Vous ne pouvez pas modifier votre propre rôle.' }
  if (ctx.role === 'admin' && target.role === 'admin') return { error: "Un administrateur ne peut pas modifier le rôle d'un autre administrateur." }

  const { error } = await supabase
    .from('memberships')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('workspace_id', ctx.workspaceId)

  if (error) return { error: error.message }
  return {}
}

export async function removeMember(memberId: string): Promise<{ error?: string }> {
  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }
  if (ctx.role === 'member') return { error: 'Droits insuffisants.' }

  const supabase = await createClient()

  // Fetch target membership
  const { data: target } = await supabase
    .from('memberships')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()

  if (!target) return { error: 'Membre introuvable.' }
  if (target.role === 'owner') return { error: 'Impossible de retirer le propriétaire du workspace.' }
  if (target.user_id === ctx.userId) return { error: 'Vous ne pouvez pas vous retirer vous-même.' }
  if (ctx.role === 'admin' && target.role === 'admin') return { error: "Un administrateur ne peut pas retirer un autre administrateur." }

  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('id', memberId)
    .eq('workspace_id', ctx.workspaceId)

  if (error) return { error: error.message }
  return {}
}

export async function listMembersWithEmail(): Promise<{ data?: MemberRow[]; error?: string }> {
  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }

  const supabase = await createClient()
  const service = createServiceClient()

  const { data: members, error } = await supabase
    .from('memberships')
    .select('id, user_id, role, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: true })

  if (error || !members) return { error: error?.message ?? 'Erreur.' }

  const emailMap: Record<string, string> = {}
  await Promise.all(
    members.map(async (m) => {
      const { data } = await service.auth.admin.getUserById(m.user_id)
      if (data.user?.email) emailMap[m.user_id] = data.user.email
    })
  )

  return {
    data: members.map(m => ({
      ...m,
      email: emailMap[m.user_id] ?? '—',
    })),
  }
}
