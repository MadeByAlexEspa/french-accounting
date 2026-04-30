'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { QontoAccount, QontoSyncLog, ShineAccount } from '@/lib/types/database'

// ---------- helpers ----------

function maskSecret(key: string | null): string {
  if (!key) return ''
  if (key.length <= 4) return key
  return '••••' + key.slice(-4)
}

async function getWorkspaceId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Non authentifie')
  const { data: m, error: me } = await supabase
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (me || !m) throw new Error('Workspace introuvable')
  return m.workspace_id
}

// ---------- types for safe responses ----------

export type QontoAccountSafe = Omit<QontoAccount, 'secret_key'> & { secret_key_masked: string }
export type ShineAccountSafe = Omit<ShineAccount, 'access_token'> & { access_token_masked: string }

export interface BankAccountInfo {
  iban: string
  name: string
  balance: number
  currency: string
}

// ---------- Qonto actions ----------

export async function getQontoAccounts(): Promise<{ data: QontoAccountSafe[]; error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()
    const { data, error } = await svc
      .from('qonto_accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    if (error) return { data: [], error: error.message }
    const safe: QontoAccountSafe[] = (data ?? []).map((a) => {
      const { secret_key, ...rest } = a
      return { ...rest, secret_key_masked: maskSecret(secret_key) }
    })
    return { data: safe }
  } catch (e: unknown) {
    return { data: [], error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function saveQontoAccount(params: {
  id?: number
  name: string
  organization_slug: string
  secret_key: string
  iban?: string
  auto_sync_enabled: boolean
}): Promise<{ error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()

    let secretKey = params.secret_key
    // If the key starts with masking chars, preserve existing key
    if (secretKey.startsWith('••••') && params.id) {
      const { data: existing } = await svc
        .from('qonto_accounts')
        .select('secret_key')
        .eq('id', params.id)
        .eq('workspace_id', workspaceId)
        .single()
      if (existing?.secret_key) {
        secretKey = existing.secret_key
      }
    }

    if (params.id) {
      const { error } = await svc
        .from('qonto_accounts')
        .update({
          name: params.name,
          organization_slug: params.organization_slug,
          secret_key: secretKey,
          iban: params.iban || null,
          auto_sync_enabled: params.auto_sync_enabled,
        })
        .eq('id', params.id)
        .eq('workspace_id', workspaceId)
      if (error) return { error: error.message }
    } else {
      const { error } = await svc
        .from('qonto_accounts')
        .insert({
          workspace_id: workspaceId,
          name: params.name,
          organization_slug: params.organization_slug,
          secret_key: secretKey,
          iban: params.iban || null,
          auto_sync_enabled: params.auto_sync_enabled,
        })
      if (error) return { error: error.message }
    }
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function deleteQontoAccount(id: number): Promise<{ error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()
    const { error } = await svc
      .from('qonto_accounts')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)
    if (error) return { error: error.message }
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function testQontoConnection(id: number): Promise<{ data: BankAccountInfo[]; error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()
    const { data: account, error: ae } = await svc
      .from('qonto_accounts')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single()
    if (ae || !account) return { data: [], error: 'Compte introuvable' }

    const slug = account.organization_slug
    const key = account.secret_key
    if (!slug || !key) return { data: [], error: 'Slug ou cle API manquant' }

    const res = await fetch(`https://thirdparty.qonto.com/v2/organizations/${slug}`, {
      headers: { Authorization: `${slug}:${key}` },
    })
    if (!res.ok) {
      const body = await res.text()
      return { data: [], error: `Qonto API ${res.status}: ${body.slice(0, 200)}` }
    }
    const json = await res.json()
    const bankAccounts: BankAccountInfo[] = (json.organization?.bank_accounts ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ba: any) => ({
        iban: ba.iban ?? '',
        name: ba.name ?? ba.slug ?? '',
        balance: ba.balance ?? 0,
        currency: ba.currency ?? 'EUR',
      })
    )
    return { data: bankAccounts }
  } catch (e: unknown) {
    return { data: [], error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function getQontoSyncLog(accountId: number): Promise<{ data: QontoSyncLog[]; error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()
    const { data, error } = await svc
      .from('qonto_sync_log')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('account_id', accountId)
      .order('synced_at', { ascending: false })
      .limit(5)
    if (error) return { data: [], error: error.message }
    return { data: data ?? [] }
  } catch (e: unknown) {
    return { data: [], error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

// ---------- Shine actions ----------

export async function getShineAccounts(): Promise<{ data: ShineAccountSafe[]; error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()
    const { data, error } = await svc
      .from('shine_accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    if (error) return { data: [], error: error.message }
    const safe: ShineAccountSafe[] = (data ?? []).map((a) => {
      const { access_token, ...rest } = a
      return { ...rest, access_token_masked: maskSecret(access_token) }
    })
    return { data: safe }
  } catch (e: unknown) {
    return { data: [], error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function saveShineAccount(params: {
  id?: number
  name: string
  access_token: string
  shine_account_id?: string
  iban?: string
  auto_sync_enabled: boolean
}): Promise<{ error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()

    let accessToken = params.access_token
    if (accessToken.startsWith('••••') && params.id) {
      const { data: existing } = await svc
        .from('shine_accounts')
        .select('access_token')
        .eq('id', params.id)
        .eq('workspace_id', workspaceId)
        .single()
      if (existing?.access_token) {
        accessToken = existing.access_token
      }
    }

    if (params.id) {
      const { error } = await svc
        .from('shine_accounts')
        .update({
          name: params.name,
          access_token: accessToken,
          shine_account_id: params.shine_account_id || null,
          iban: params.iban || null,
          auto_sync_enabled: params.auto_sync_enabled,
        })
        .eq('id', params.id)
        .eq('workspace_id', workspaceId)
      if (error) return { error: error.message }
    } else {
      const { error } = await svc
        .from('shine_accounts')
        .insert({
          workspace_id: workspaceId,
          name: params.name,
          access_token: accessToken,
          shine_account_id: params.shine_account_id || null,
          iban: params.iban || null,
          auto_sync_enabled: params.auto_sync_enabled,
        })
      if (error) return { error: error.message }
    }
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function deleteShineAccount(id: number): Promise<{ error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()
    const { error } = await svc
      .from('shine_accounts')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)
    if (error) return { error: error.message }
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

export async function testShineConnection(id: number): Promise<{ data: BankAccountInfo[]; error?: string }> {
  try {
    const workspaceId = await getWorkspaceId()
    const svc = createServiceClient()
    const { data: account, error: ae } = await svc
      .from('shine_accounts')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single()
    if (ae || !account) return { data: [], error: 'Compte introuvable' }

    const token = account.access_token
    if (!token) return { data: [], error: 'Token d\'acces manquant' }

    const res = await fetch('https://api.shine.fr/v2/accounts', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.text()
      return { data: [], error: `Shine API ${res.status}: ${body.slice(0, 200)}` }
    }
    const json = await res.json()
    const accounts = Array.isArray(json) ? json : (json.accounts ?? json.data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bankAccounts: BankAccountInfo[] = accounts.map((a: any) => ({
      iban: a.iban ?? '',
      name: a.name ?? a.label ?? '',
      balance: typeof a.balance === 'number' ? a.balance / 100 : (a.balance ?? 0),
      currency: a.currency ?? 'EUR',
    }))
    return { data: bankAccounts }
  } catch (e: unknown) {
    return { data: [], error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}
