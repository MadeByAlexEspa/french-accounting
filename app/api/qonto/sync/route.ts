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

    // Fetch account with secret key
    const { data: account, error: accErr } = await svc
      .from('qonto_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('workspace_id', workspaceId)
      .single()
    if (accErr || !account) {
      return NextResponse.json({ error: 'Compte Qonto introuvable' }, { status: 404 })
    }
    if (!account.organization_slug || !account.secret_key || !account.iban) {
      return NextResponse.json({ error: 'Configuration incomplete (slug, cle, ou IBAN manquant)' }, { status: 400 })
    }

    const slug = account.organization_slug
    const key = account.secret_key
    const iban = account.iban

    // Paginate transactions
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
          // Dedup
          const { data: existing } = await svc
            .from('qonto_imports')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('qonto_transaction_id', tx.transaction_id)
            .maybeSingle()

          if (existing) {
            skipped++
            continue
          }

          // Parse amounts
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
            // Generate numero QTO-XXXXX
            const { data: lastQto } = await svc
              .from('factures')
              .select('numero')
              .eq('workspace_id', workspaceId)
              .like('numero', 'QTO-%')
              .order('id', { ascending: false })
              .limit(1)
              .maybeSingle()
            let nextNum = 1
            if (lastQto?.numero) {
              const match = lastQto.numero.match(/QTO-(\d+)/)
              if (match) nextNum = parseInt(match[1], 10) + 1
            }
            const numero = `QTO-${String(nextNum).padStart(5, '0')}`

            const { data: inserted, error: insErr } = await svc
              .from('factures')
              .insert({
                workspace_id: workspaceId,
                numero,
                date,
                client: label,
                description: tx.reference || null,
                montant_ht,
                taux_tva,
                montant_tva,
                montant_ttc,
                categorie,
                statut: 'payee',
                bank_source: 'qonto',
                has_attachment: (tx.attachment_ids?.length ?? 0) > 0,
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
                description: tx.reference || null,
                montant_ht,
                taux_tva,
                montant_tva,
                montant_ttc,
                categorie,
                statut: 'payee',
                bank_source: 'qonto',
                has_attachment: (tx.attachment_ids?.length ?? 0) > 0,
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
          await svc.from('qonto_imports').insert({
            workspace_id: workspaceId,
            qonto_transaction_id: tx.transaction_id,
            local_type: localType,
            local_id: localId,
            has_attachment: (tx.attachment_ids?.length ?? 0) > 0,
          })

          imported++
        } catch (txErr: unknown) {
          errors.push(`Transaction ${tx.transaction_id}: ${txErr instanceof Error ? txErr.message : 'unknown'}`)
        }
      }

      // Pagination
      const meta = json.meta
      if (meta?.next_page) {
        currentPage = meta.next_page
      } else {
        hasMore = false
      }
    }

    // Update last_sync_at
    await svc
      .from('qonto_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', accountId)

    // Insert sync log
    await svc.from('qonto_sync_log').insert({
      workspace_id: workspaceId,
      account_id: accountId,
      fetched,
      imported,
      skipped,
      errors: errors.length > 0 ? errors.join('; ') : null,
    })

    return NextResponse.json({ fetched, imported, skipped, errors: errors.length > 0 ? errors.join('; ') : null })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur interne', fetched, imported, skipped },
      { status: 500 }
    )
  }
}
