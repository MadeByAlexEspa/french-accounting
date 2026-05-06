import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function round2(n: number) { return Math.round(n * 100) / 100 }

// ---------------------------------------------------------------------------
// Qonto sync logic (mirrors app/api/qonto/sync/route.ts but uses svc client)
// ---------------------------------------------------------------------------
async function syncQontoAccount(accountId: number) {
  const svc = createServiceClient()
  let fetched = 0
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  const { data: account, error: accErr } = await svc
    .from('qonto_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (accErr || !account) {
    return { ok: false, error: 'Compte Qonto introuvable' }
  }
  if (!account.organization_slug || !account.secret_key || !account.iban) {
    return { ok: false, error: 'Configuration incomplete (slug, cle, ou IBAN manquant)' }
  }

  const workspaceId = account.workspace_id
  const slug = account.organization_slug
  const key = account.secret_key
  const iban = account.iban

  let currentPage = 1
  let hasMore = true

  while (hasMore) {
    let url = `https://thirdparty.qonto.com/v2/transactions?iban=${encodeURIComponent(iban)}&status=completed&sort_by=settled_at:asc&current_page=${currentPage}&per_page=100`
    if (account.last_sync_at) {
      url += `&filters[settled_at_from]=${encodeURIComponent(account.last_sync_at)}`
    }

    const res = await fetch(url, {
      headers: { Authorization: `${slug}:${key}` },
    })
    if (!res.ok) {
      const body = await res.text()
      errors.push(`Qonto API ${res.status}: ${body.slice(0, 200)}`)
      break
    }

    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions: any[] = json.transactions ?? []
    fetched += transactions.length

    for (const tx of transactions) {
      try {
        const { data: existing } = await svc
          .from('qonto_imports')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('qonto_transaction_id', tx.transaction_id)
          .maybeSingle()

        if (existing) { skipped++; continue }

        const montant_ttc = round2((tx.amount_cents ?? tx.amount * 100) / 100)
        let taux_tva = 0
        let montant_tva = 0
        let montant_ht = montant_ttc

        if (tx.vat_rate && tx.vat_rate > 0) {
          taux_tva = tx.vat_rate
          montant_ht = round2(montant_ttc / (1 + taux_tva / 100))
          montant_tva = round2(montant_ttc - montant_ht)
        } else if (tx.vat_amount && tx.vat_amount > 0) {
          montant_tva = round2(tx.vat_amount)
          montant_ht = round2(montant_ttc - montant_tva)
          taux_tva = montant_ht > 0 ? round2((montant_tva / montant_ht) * 100) : 0
        }

        const date = (tx.settled_at ?? tx.emitted_at ?? new Date().toISOString()).slice(0, 10)
        const label = tx.label || (tx.side === 'credit' ? 'Virement recu' : 'Paiement')
        const side = tx.side as 'credit' | 'debit'

        let categorie: string
        if (side === 'credit') {
          const { data: lastFact } = await svc
            .from('factures').select('categorie').eq('workspace_id', workspaceId)
            .ilike('client', label).order('id', { ascending: false }).limit(1).maybeSingle()
          categorie = lastFact?.categorie ?? 'Prestations de services'
        } else {
          const { data: lastDep } = await svc
            .from('depenses').select('categorie').eq('workspace_id', workspaceId)
            .ilike('fournisseur', label).order('id', { ascending: false }).limit(1).maybeSingle()
          categorie = lastDep?.categorie ?? 'Autres charges'
        }

        let localType: 'facture' | 'depense'
        let localId: number

        if (side === 'credit') {
          const { data: lastQto } = await svc
            .from('factures').select('numero').eq('workspace_id', workspaceId)
            .like('numero', 'QTO-%').order('id', { ascending: false }).limit(1).maybeSingle()
          let nextNum = 1
          if (lastQto?.numero) {
            const match = lastQto.numero.match(/QTO-(\d+)/)
            if (match) nextNum = parseInt(match[1], 10) + 1
          }
          const numero = `QTO-${String(nextNum).padStart(5, '0')}`

          const { data: inserted, error: insErr } = await svc.from('factures').insert({
            workspace_id: workspaceId, numero, date, client: label,
            description: tx.reference || null, montant_ht, taux_tva, montant_tva, montant_ttc,
            categorie, statut: 'payee', bank_source: 'qonto',
            has_attachment: (tx.attachment_ids?.length ?? 0) > 0,
          }).select('id').single()
          if (insErr || !inserted) { errors.push(`Facture insert: ${insErr?.message ?? 'unknown'}`); continue }
          localType = 'facture'
          localId = inserted.id
        } else {
          const { data: inserted, error: insErr } = await svc.from('depenses').insert({
            workspace_id: workspaceId, date, fournisseur: label,
            description: tx.reference || null, montant_ht, taux_tva, montant_tva, montant_ttc,
            categorie, statut: 'payee', bank_source: 'qonto',
            has_attachment: (tx.attachment_ids?.length ?? 0) > 0,
          }).select('id').single()
          if (insErr || !inserted) { errors.push(`Depense insert: ${insErr?.message ?? 'unknown'}`); continue }
          localType = 'depense'
          localId = inserted.id
        }

        await svc.from('qonto_imports').insert({
          workspace_id: workspaceId, qonto_transaction_id: tx.transaction_id,
          local_type: localType, local_id: localId,
          has_attachment: (tx.attachment_ids?.length ?? 0) > 0,
        })
        imported++
      } catch (txErr: unknown) {
        errors.push(`Transaction ${tx.transaction_id}: ${txErr instanceof Error ? txErr.message : 'unknown'}`)
      }
    }

    const meta = json.meta
    if (meta?.next_page) { currentPage = meta.next_page } else { hasMore = false }
  }

  await svc.from('qonto_accounts').update({ last_sync_at: new Date().toISOString() }).eq('id', accountId)
  await svc.from('qonto_sync_log').insert({
    workspace_id: workspaceId, account_id: accountId,
    fetched, imported, skipped,
    errors: errors.length > 0 ? errors.join('; ') : null,
  })

  return { ok: errors.length === 0 || imported > 0, fetched, imported, skipped }
}

// ---------------------------------------------------------------------------
// Shine sync logic (mirrors app/api/shine/sync/route.ts but uses svc client)
// ---------------------------------------------------------------------------
async function syncShineAccount(accountId: number) {
  const svc = createServiceClient()
  let fetched = 0
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  const { data: account, error: accErr } = await svc
    .from('shine_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (accErr || !account) {
    return { ok: false, error: 'Compte Shine introuvable' }
  }
  if (!account.access_token || !account.shine_account_id) {
    return { ok: false, error: 'Configuration incomplete (token ou compte ID manquant)' }
  }

  const workspaceId = account.workspace_id
  const token = account.access_token
  const shineAccountId = account.shine_account_id

  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    let url = `https://api.shine.fr/v2/accounts/${encodeURIComponent(shineAccountId)}/transactions?limit=100`
    if (account.last_sync_at) {
      url += `&from=${encodeURIComponent(account.last_sync_at.slice(0, 10))}`
    }
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.text()
      errors.push(`Shine API ${res.status}: ${body.slice(0, 200)}`)
      break
    }

    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions: any[] = json.transactions ?? json.data ?? (Array.isArray(json) ? json : [])
    fetched += transactions.length

    for (const tx of transactions) {
      try {
        const txId = tx.id ?? tx.transactionId
        const { data: existing } = await svc
          .from('shine_imports')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('shine_transaction_id', txId)
          .maybeSingle()

        if (existing) { skipped++; continue }

        const rawAmount = tx.amount ?? 0
        const montant_ttc = round2(Math.abs(rawAmount) / 100)
        const side = rawAmount >= 0 ? 'credit' : 'debit'

        let taux_tva = 0
        let montant_tva = 0
        let montant_ht = montant_ttc

        if (tx.vatRate && tx.vatRate > 0) {
          taux_tva = tx.vatRate
          montant_ht = round2(montant_ttc / (1 + taux_tva / 100))
          montant_tva = round2(montant_ttc - montant_ht)
        } else if (tx.vatAmount && tx.vatAmount > 0) {
          montant_tva = round2(tx.vatAmount)
          montant_ht = round2(montant_ttc - montant_tva)
          taux_tva = montant_ht > 0 ? round2((montant_tva / montant_ht) * 100) : 0
        }

        const date = (tx.executedAt ?? tx.createdAt ?? new Date().toISOString()).slice(0, 10)
        const label = tx.label || tx.counterpartyName || (side === 'credit' ? 'Virement recu' : 'Paiement')

        let categorie: string
        if (side === 'credit') {
          const { data: lastFact } = await svc
            .from('factures').select('categorie').eq('workspace_id', workspaceId)
            .ilike('client', label).order('id', { ascending: false }).limit(1).maybeSingle()
          categorie = lastFact?.categorie ?? 'Prestations de services'
        } else {
          const { data: lastDep } = await svc
            .from('depenses').select('categorie').eq('workspace_id', workspaceId)
            .ilike('fournisseur', label).order('id', { ascending: false }).limit(1).maybeSingle()
          categorie = lastDep?.categorie ?? 'Autres charges'
        }

        let localType: 'facture' | 'depense'
        let localId: number

        if (side === 'credit') {
          const { data: lastShn } = await svc
            .from('factures').select('numero').eq('workspace_id', workspaceId)
            .like('numero', 'SHN-%').order('id', { ascending: false }).limit(1).maybeSingle()
          let nextNum = 1
          if (lastShn?.numero) {
            const match = lastShn.numero.match(/SHN-(\d+)/)
            if (match) nextNum = parseInt(match[1], 10) + 1
          }
          const numero = `SHN-${String(nextNum).padStart(5, '0')}`

          const { data: inserted, error: insErr } = await svc.from('factures').insert({
            workspace_id: workspaceId, numero, date, client: label,
            description: tx.reference ?? tx.description ?? null,
            montant_ht, taux_tva, montant_tva, montant_ttc,
            categorie, statut: 'payee', bank_source: 'shine', has_attachment: false,
          }).select('id').single()
          if (insErr || !inserted) { errors.push(`Facture insert: ${insErr?.message ?? 'unknown'}`); continue }
          localType = 'facture'
          localId = inserted.id
        } else {
          const { data: inserted, error: insErr } = await svc.from('depenses').insert({
            workspace_id: workspaceId, date, fournisseur: label,
            description: tx.reference ?? tx.description ?? null,
            montant_ht, taux_tva, montant_tva, montant_ttc,
            categorie, statut: 'payee', bank_source: 'shine', has_attachment: false,
          }).select('id').single()
          if (insErr || !inserted) { errors.push(`Depense insert: ${insErr?.message ?? 'unknown'}`); continue }
          localType = 'depense'
          localId = inserted.id
        }

        await svc.from('shine_imports').insert({
          workspace_id: workspaceId, shine_transaction_id: txId,
          local_type: localType, local_id: localId, has_attachment: false,
        })
        imported++
      } catch (txErr: unknown) {
        errors.push(`Transaction ${tx.id}: ${txErr instanceof Error ? txErr.message : 'unknown'}`)
      }
    }

    const meta = json.meta
    const nextCursor = meta?.cursor ?? meta?.nextCursor ?? null
    if (nextCursor && transactions.length > 0) { cursor = nextCursor } else { hasMore = false }
  }

  await svc.from('shine_accounts').update({ last_sync_at: new Date().toISOString() }).eq('id', accountId)

  return { ok: errors.length === 0 || imported > 0, fetched, imported, skipped }
}

// ---------------------------------------------------------------------------
// Cron handler — called by Vercel Cron every 6 hours
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const svc = createServiceClient()
  const results: { type: string; id: number; ok: boolean; error?: string }[] = []

  // Qonto accounts with auto-sync enabled
  const { data: qAccounts } = await svc
    .from('qonto_accounts')
    .select('id')
    .eq('auto_sync_enabled', true)

  for (const account of qAccounts ?? []) {
    try {
      const result = await syncQontoAccount(account.id)
      results.push({ type: 'qonto', id: account.id, ok: result.ok, error: result.ok ? undefined : (result as { ok: false; error: string }).error })
    } catch (e) {
      results.push({ type: 'qonto', id: account.id, ok: false, error: String(e) })
    }
  }

  // Shine accounts with auto-sync enabled
  const { data: sAccounts } = await svc
    .from('shine_accounts')
    .select('id')
    .eq('auto_sync_enabled', true)

  for (const account of sAccounts ?? []) {
    try {
      const result = await syncShineAccount(account.id)
      results.push({ type: 'shine', id: account.id, ok: result.ok, error: result.ok ? undefined : (result as { ok: false; error: string }).error })
    } catch (e) {
      results.push({ type: 'shine', id: account.id, ok: false, error: String(e) })
    }
  }

  const synced = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({
    ok: true,
    synced,
    failed,
    results,
    timestamp: new Date().toISOString(),
  })
}
