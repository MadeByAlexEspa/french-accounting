'use server'

import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email'

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
  email: string
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
    role: 'member',
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
    .is('used_at', null)

  if (error) return { error: error.message }
  if (!count || count === 0) return { error: 'Invitation introuvable ou déjà utilisée.' }
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
