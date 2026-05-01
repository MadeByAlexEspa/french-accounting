import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function round2(n: number) { return Math.round(n * 100) / 100 }

export async function POST(request: NextRequest) {
  let fetched = 0
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  try {
    // Auth
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })
    }
    const { data: m } = await supabase
      .from('memberships')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!m) {
      return NextResponse.json({ error: 'Workspace introuvable' }, { status: 403 })
    }
    const workspaceId = m.workspace_id

    const body = await request.json()
    const accountId = Number(body.accountId)
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId requis' }, { status: 400 })
    }

    const svc = createServiceClient()

    // Fetch account with access_token
    const { data: account, error: accErr } = await svc
      .from('shine_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('workspace_id', workspaceId)
      .single()
    if (accErr || !account) {
      return NextResponse.json({ error: 'Compte Shine introuvable' }, { status: 404 })
    }
    if (!account.access_token || !account.shine_account_id) {
      return NextResponse.json({ error: 'Configuration incomplete (token ou compte ID manquant)' }, { status: 400 })
    }

    const token = account.access_token
    const shineAccountId = account.shine_account_id

    // Paginate transactions
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
          // Dedup
          const txId = tx.id ?? tx.transactionId
          const { data: existing } = await svc
            .from('shine_imports')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('shine_transaction_id', txId)
            .maybeSingle()

          if (existing) {
            skipped++
            continue
          }

          // Parse amounts
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
            // vatAmount is in euros for Shine
            montant_tva = round2(tx.vatAmount)
            montant_ht = round2(montant_ttc - montant_tva)
            taux_tva = montant_ht > 0 ? round2((montant_tva / montant_ht) * 100) : 0
          }

          const date = (tx.executedAt ?? tx.createdAt ?? new Date().toISOString()).slice(0, 10)
          const label = tx.label || tx.counterpartyName || (side === 'credit' ? 'Virement recu' : 'Paiement')

          // Category lookup
          let categorie: string
          if (side === 'credit') {
            const { data: lastFact } = await svc
              .from('factures')
              .select('categorie')
              .eq('workspace_id', workspaceId)
              .ilike('client', label)
              .order('id', { ascending: false })
              .limit(1)
              .maybeSingle()
            categorie = lastFact?.categorie ?? 'Prestations de services'
          } else {
            const { data: lastDep } = await svc
              .from('depenses')
              .select('categorie')
              .eq('workspace_id', workspaceId)
              .ilike('fournisseur', label)
              .order('id', { ascending: false })
              .limit(1)
              .maybeSingle()
            categorie = lastDep?.categorie ?? 'Autres charges'
          }

          let localType: 'facture' | 'depense'
          let localId: number

          if (side === 'credit') {
            // Generate numero SHN-XXXXX
            const { data: lastShn } = await svc
              .from('factures')
              .select('numero')
              .eq('workspace_id', workspaceId)
              .like('numero', 'SHN-%')
              .order('id', { ascending: false })
              .limit(1)
              .maybeSingle()
            let nextNum = 1
            if (lastShn?.numero) {
              const match = lastShn.numero.match(/SHN-(\d+)/)
              if (match) nextNum = parseInt(match[1], 10) + 1
            }
            const numero = `SHN-${String(nextNum).padStart(5, '0')}`

            const { data: inserted, error: insErr } = await svc
              .from('factures')
              .insert({
                workspace_id: workspaceId,
                numero,
                date,
                client: label,
                description: tx.reference ?? tx.description ?? null,
                montant_ht,
                taux_tva,
                montant_tva,
                montant_ttc,
                categorie,
                statut: 'payee',
                bank_source: 'shine',
                has_attachment: false,
              })
              .select('id')
              .single()
            if (insErr || !inserted) {
              errors.push(`Facture insert: ${insErr?.message ?? 'unknown'}`)
              continue
            }
            localType = 'facture'
            localId = inserted.id
          } else {
            const { data: inserted, error: insErr } = await svc
              .from('depenses')
              .insert({
                workspace_id: workspaceId,
                date,
                fournisseur: label,
                description: tx.reference ?? tx.description ?? null,
                montant_ht,
                taux_tva,
                montant_tva,
                montant_ttc,
                categorie,
                statut: 'payee',
                bank_source: 'shine',
                has_attachment: false,
              })
              .select('id')
              .single()
            if (insErr || !inserted) {
              errors.push(`Depense insert: ${insErr?.message ?? 'unknown'}`)
              continue
            }
            localType = 'depense'
            localId = inserted.id
          }

          // Insert import record
          await svc.from('shine_imports').insert({
            workspace_id: workspaceId,
            shine_transaction_id: txId,
            local_type: localType,
            local_id: localId,
            has_attachment: false,
          })

          imported++
        } catch (txErr: unknown) {
          errors.push(`Transaction ${tx.id}: ${txErr instanceof Error ? txErr.message : 'unknown'}`)
        }
      }

      // Pagination
      const meta = json.meta
      const nextCursor = meta?.cursor ?? meta?.nextCursor ?? null
      if (nextCursor && transactions.length > 0) {
        cursor = nextCursor
      } else {
        hasMore = false
      }
    }

    // Update last_sync_at
    await svc
      .from('shine_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', accountId)

    return NextResponse.json({ fetched, imported, skipped, errors: errors.length > 0 ? errors.join('; ') : null })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur interne', fetched, imported, skipped },
      { status: 500 }
    )
  }
}
