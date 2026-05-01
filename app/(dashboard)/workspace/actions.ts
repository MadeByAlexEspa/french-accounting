'use server'

import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email'

// Columns returned to client — token intentionally excluded
const INVITATION_COLS = 'id, email, role, expires_at, used_at, created_at' as const

export type InvitationRow = {
  id: string
  email: string
  role: string
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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const inviteUrl = `${appUrl}/invite/${token}`

  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', ctx.workspaceId)
    .single()

  sendInvitationEmail(email, ws?.name ?? 'votre équipe', inviteUrl).catch(() => {})

  return { inviteUrl }
}

export async function listInvitations(): Promise<{ data?: InvitationRow[]; error?: string }> {
  const ctx = await getWorkspaceCtx()
  if (!ctx) return { error: 'Session expirée.' }

  const supabase = await createClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const { data, error } = await supabase
    .from('invitations')
    .select(INVITATION_COLS)
    .eq('workspace_id', ctx.workspaceId)
    .or(`used_at.not.is.null,expires_at.gt.${new Date().toISOString()}`)
    .gt('created_at', sevenDaysAgo)
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
