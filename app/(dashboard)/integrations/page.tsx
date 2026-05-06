'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getQontoAccounts,
  saveQontoAccount,
  deleteQontoAccount,
  testQontoConnection,
  getQontoSyncLog,
  getShineAccounts,
  saveShineAccount,
  deleteShineAccount,
  testShineConnection,
} from './actions'
import type { QontoAccountSafe, ShineAccountSafe, BankAccountInfo } from './actions'
import type { QontoSyncLog } from '@/lib/types/database'

function formatEur(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null) {
  if (!d) return 'Jamais'
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Tab = 'qonto' | 'shine' | 'rapprochement'

// ==================== RAPPROCHEMENT ====================

function ReconciliationSection() {
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Array<{
    id: number; numero: string; date: string; client: string; montant_ttc: number
  }>>([])
  const [bankCredits, setBankCredits] = useState<Array<{
    id: number; numero: string; date: string; client: string; montant_ttc: number; bank_source: string
  }>>([])
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
    if (!m) { setLoading(false); return }

    const [{ data: pRows }, { data: bRows }] = await Promise.all([
      supabase.from('factures')
        .select('id, numero, date, client, montant_ttc')
        .eq('workspace_id', m.workspace_id)
        .eq('statut', 'en_attente')
        .is('bank_source', null)
        .order('date', { ascending: false })
        .limit(50),
      supabase.from('factures')
        .select('id, numero, date, client, montant_ttc, bank_source')
        .eq('workspace_id', m.workspace_id)
        .eq('statut', 'en_attente')
        .in('bank_source', ['qonto', 'shine'])
        .order('date', { ascending: false })
        .limit(50),
    ])
    setPending(pRows ?? [])
    setBankCredits(
      (bRows ?? []).map(r => ({ ...r, bank_source: r.bank_source ?? '' }))
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markPaid(id: number) {
    setSaving(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('factures').update({ statut: 'payee' }).eq('id', id)
    if (err) { setError(err.message); setSaving(false); return }
    setConfirmId(null); setSaving(false); await load()
  }

  function suggestedMatch(inv: typeof pending[0]) {
    return bankCredits.find(b => Math.abs(b.montant_ttc - inv.montant_ttc) <= 1)
  }

  if (loading) return <div className="dash-loading">Chargement…</div>

  return (
    <div>
      <div className="dash-card" style={{ marginTop: 8 }}>
        <p className="dash-card-title">Factures en attente de paiement</p>
        <p style={{ fontSize: 12, color: 'var(--pencil)', marginBottom: 16 }}>
          Ces factures ont été créées manuellement et n&apos;ont pas encore été rapprochées d&apos;un virement bancaire.
        </p>

        {error && <div className="dash-error" style={{ marginBottom: 12 }}>{error}</div>}

        {pending.length === 0 ? (
          <div className="dash-empty-state" style={{ border: 'none', padding: '32px 0' }}>
            <span className="dash-empty-state-glyph">✓</span>
            <p className="dash-empty-state-title">Tout est rapproché</p>
            <p className="dash-empty-state-desc">Aucune facture manuelle en attente de paiement.</p>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th className="right">TTC</th>
                  <th>Correspondance banque</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map(inv => {
                  const match = suggestedMatch(inv)
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12 }}>{inv.numero}</td>
                      <td>{inv.date}</td>
                      <td>{inv.client}</td>
                      <td className="right" style={{ fontFamily: 'Courier Prime,monospace', fontWeight: 700 }}>
                        {formatEur(inv.montant_ttc)}
                      </td>
                      <td>
                        {match ? (
                          <span style={{ fontSize: 12, color: '#16a34a', fontFamily: 'Courier Prime,monospace' }}>
                            ✓ {match.bank_source} · {match.date} · {formatEur(match.montant_ttc)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}>
                            — Aucune correspondance
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {confirmId === inv.id ? (
                          <>
                            <button
                              style={{ background: '#16a34a', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Courier Prime,monospace', padding: '2px 8px' }}
                              onClick={() => markPaid(inv.id)} disabled={saving}>
                              {saving ? '…' : 'Confirmer'}
                            </button>{' '}
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}
                              onClick={() => setConfirmId(null)}>Annuler</button>
                          </>
                        ) : (
                          <button className="dash-btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => setConfirmId(inv.id)}>
                            Marquer payée
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bankCredits.length > 0 && (
        <div className="dash-card" style={{ marginTop: 8 }}>
          <p className="dash-card-title">Crédits bancaires non rapprochés</p>
          <p style={{ fontSize: 12, color: 'var(--pencil)', marginBottom: 16 }}>
            Transactions importées depuis Qonto/Shine sans facture manuelle correspondante.
          </p>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Source</th><th>Date</th><th>Client / Libellé</th><th className="right">TTC</th>
                </tr>
              </thead>
              <tbody>
                {bankCredits.map(b => (
                  <tr key={b.id}>
                    <td><span className="dash-badge dash-badge-blue" style={{ fontSize: 10, textTransform: 'uppercase' }}>{b.bank_source}</span></td>
                    <td>{b.date}</td>
                    <td>{b.client}</td>
                    <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(b.montant_ttc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>('qonto')

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Connexions API</h1>
          <p className="dash-subtitle">Synchronisez vos transactions bancaires automatiquement</p>
        </div>
      </div>

      <div className="dash-tabs">
        <button
          className={`dash-tab ${tab === 'qonto' ? 'dash-tab-active' : ''}`}
          onClick={() => setTab('qonto')}
        >
          Qonto
        </button>
        <button
          className={`dash-tab ${tab === 'shine' ? 'dash-tab-active' : ''}`}
          onClick={() => setTab('shine')}
        >
          Shine
        </button>
        <button
          className={`dash-tab ${tab === 'rapprochement' ? 'dash-tab-active' : ''}`}
          onClick={() => setTab('rapprochement')}
        >
          Rapprochement
        </button>
      </div>

      {tab === 'qonto' && <QontoSection />}
      {tab === 'shine' && <ShineSection />}
      {tab === 'rapprochement' && <ReconciliationSection />}
    </div>
  )
}

// ==================== QONTO ====================

function QontoSection() {
  const [accounts, setAccounts] = useState<QontoAccountSafe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getQontoAccounts()
      if (res.error) { setError(res.error); return }
      setAccounts(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="dash-loading">Chargement…</div>
  if (error) return <div className="dash-error">{error}</div>

  if (accounts.length === 0 && !showForm) {
    return (
      <div className="dash-card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ width: 48, height: 48, borderRadius: 2, background: '#ff5c35', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Special Elite,cursive', fontSize: 22, color: '#fff', fontWeight: 700, marginBottom: 16 }}>Q</div>
        <p style={{ fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)', fontSize: 14 }}>
          Aucun compte Qonto configuré.
        </p>
        <button className="dash-btn" onClick={() => setShowForm(true)} style={{ marginTop: 16 }}>
          Ajouter un compte Qonto
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showForm && (
        <QontoForm
          onSaved={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {accounts.map(a => (
        <QontoAccountCard key={a.id} account={a} onChanged={load} />
      ))}
      {!showForm && accounts.length > 0 && (
        <button className="dash-btn-ghost" onClick={() => setShowForm(true)}>
          + Ajouter un autre compte
        </button>
      )}
    </div>
  )
}

function QontoForm({ account, onSaved, onCancel }: {
  account?: QontoAccountSafe
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(account?.name ?? 'Compte Qonto')
  const [slug, setSlug] = useState(account?.organization_slug ?? '')
  const [key, setKey] = useState(account?.secret_key_masked ?? '')
  const [iban, setIban] = useState(account?.iban ?? '')
  const [autoSync, setAutoSync] = useState(account?.auto_sync_enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bankAccounts, setBankAccounts] = useState<BankAccountInfo[] | null>(null)

  async function handleTest() {
    if (!account?.id) {
      setError('Enregistrez d\'abord le compte pour tester la connexion.')
      return
    }
    setTesting(true)
    setError(null)
    setBankAccounts(null)
    const res = await testQontoConnection(account.id)
    if (res.error) { setError(res.error) }
    else { setBankAccounts(res.data) }
    setTesting(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await saveQontoAccount({
      id: account?.id,
      name,
      organization_slug: slug,
      secret_key: key,
      iban: iban || undefined,
      auto_sync_enabled: autoSync,
    })
    if (res.error) { setError(res.error); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="dash-card">
      <div className="dash-card-title">{account ? 'Modifier le compte Qonto' : 'Nouveau compte Qonto'}</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="dash-field">
          <label className="dash-field-label">Nom</label>
          <input type="text" className="dash-field-input" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">Organization Slug</label>
          <input type="text" className="dash-field-input" value={slug} onChange={e => setSlug(e.target.value)} required placeholder="mon-organisation" />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">Clé API</label>
          <input type="password" className="dash-field-input" value={key} onChange={e => setKey(e.target.value)} required placeholder="Votre clé secrète Qonto" />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">IBAN (optionnel)</label>
          <input type="text" className="dash-field-input" value={iban} onChange={e => setIban(e.target.value)} placeholder="FR76..." />
        </div>
        <div className="dash-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="qonto-auto-sync" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} />
          <label htmlFor="qonto-auto-sync" className="dash-field-label" style={{ margin: 0 }}>Synchronisation automatique</label>
        </div>

        {error && <div className="dash-error">{error}</div>}

        {bankAccounts && bankAccounts.length > 0 && (
          <div className="dash-section">
            <div className="dash-section-title">Comptes bancaires détectés</div>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead><tr><th>Nom</th><th>IBAN</th><th className="right">Solde</th><th></th></tr></thead>
                <tbody>
                  {bankAccounts.map((ba, i) => (
                    <tr key={i}>
                      <td>{ba.name}</td>
                      <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12 }}>{ba.iban}</td>
                      <td className="right">{formatEur(ba.balance)}</td>
                      <td>
                        <button type="button" className="dash-btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setIban(ba.iban)}>
                          Utiliser
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="dash-btn-ghost" onClick={onCancel}>Annuler</button>
          {account?.id && (
            <button type="button" className="dash-btn-ghost" onClick={handleTest} disabled={testing}>
              {testing ? 'Test en cours…' : 'Tester la connexion'}
            </button>
          )}
          <button type="submit" className="dash-btn" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  )
}

function QontoAccountCard({ account, onChanged }: { account: QontoAccountSafe; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<QontoSyncLog[]>([])
  const [showLogs, setShowLogs] = useState(false)

  async function handleSync() {
    setSyncing(true)
    setError(null)
    setSyncResult(null)
    try {
      const res = await fetch('/api/qonto/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur de synchronisation')
      } else {
        setSyncResult(`${data.imported} importée(s), ${data.skipped} ignorée(s)${data.errors ? ` — ${data.errors}` : ''}`)
        onChanged()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce compte Qonto ? Les transactions deja importees ne seront pas supprimees.')) return
    setDeleting(true)
    const res = await deleteQontoAccount(account.id)
    if (res.error) { setError(res.error); setDeleting(false); return }
    onChanged()
  }

  async function loadLogs() {
    const res = await getQontoSyncLog(account.id)
    if (!res.error) setLogs(res.data)
    setShowLogs(true)
  }

  if (editing) {
    return <QontoForm account={account} onSaved={() => { setEditing(false); onChanged() }} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="dash-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 2, background: '#ff5c35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Special Elite,cursive', fontSize: 22, color: '#fff', fontWeight: 700 }}>Q</div>
        <div style={{ flex: 1 }}>
          <div className="dash-card-title" style={{ margin: 0 }}>{account.name}</div>
          <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)', marginTop: 4 }}>
            Slug: {account.organization_slug} | Clé: {account.secret_key_masked}
            {account.iban && ` | IBAN: ${account.iban}`}
          </div>
        </div>
        <span className={`dash-badge ${account.auto_sync_enabled ? 'dash-badge-green' : 'dash-badge-gray'}`}>
          {account.auto_sync_enabled ? 'Auto-sync' : 'Manuel'}
        </span>
      </div>

      <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)', marginBottom: 16 }}>
        Dernière sync : {formatDate(account.last_sync_at)}
      </div>

      {error && <div className="dash-error" style={{ marginBottom: 12 }}>{error}</div>}
      {syncResult && <div className="dash-success-msg" style={{ marginBottom: 12 }}>{syncResult}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="dash-btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
        <button className="dash-btn-ghost" onClick={() => setEditing(true)}>Modifier</button>
        <button className="dash-btn-ghost" onClick={loadLogs}>Historique</button>
        <button className="dash-btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Suppression...' : 'Supprimer'}
        </button>
      </div>

      {showLogs && (
        <div style={{ marginTop: 16 }}>
          <div className="dash-section-title">Historique de synchronisation</div>
          {logs.length === 0 ? (
            <div className="dash-empty">Aucun historique.</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead><tr><th>Date</th><th className="right">Reçues</th><th className="right">Importées</th><th className="right">Ignorées</th><th>Erreurs</th></tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontSize: 12 }}>{formatDate(l.synced_at)}</td>
                      <td className="right">{l.fetched}</td>
                      <td className="right">{l.imported}</td>
                      <td className="right">{l.skipped}</td>
                      <td style={{ fontSize: 11, color: l.errors ? '#dc2626' : 'var(--pencil)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.errors ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== SHINE ====================

function ShineSection() {
  const [accounts, setAccounts] = useState<ShineAccountSafe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getShineAccounts()
      if (res.error) { setError(res.error); return }
      setAccounts(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="dash-loading">Chargement…</div>
  if (error) return <div className="dash-error">{error}</div>

  if (accounts.length === 0 && !showForm) {
    return (
      <div className="dash-card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ width: 48, height: 48, borderRadius: 2, background: '#6c3fc5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Special Elite,cursive', fontSize: 22, color: '#fff', fontWeight: 700, marginBottom: 16 }}>S</div>
        <p style={{ fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)', fontSize: 14 }}>
          Aucun compte Shine configuré.
        </p>
        <button className="dash-btn" onClick={() => setShowForm(true)} style={{ marginTop: 16 }}>
          Ajouter un compte Shine
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showForm && (
        <ShineForm
          onSaved={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {accounts.map(a => (
        <ShineAccountCard key={a.id} account={a} onChanged={load} />
      ))}
      {!showForm && accounts.length > 0 && (
        <button className="dash-btn-ghost" onClick={() => setShowForm(true)}>
          + Ajouter un autre compte
        </button>
      )}
    </div>
  )
}

function ShineForm({ account, onSaved, onCancel }: {
  account?: ShineAccountSafe
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(account?.name ?? 'Compte Shine')
  const [token, setToken] = useState(account?.access_token_masked ?? '')
  const [shineAccountId, setShineAccountId] = useState(account?.shine_account_id ?? '')
  const [iban, setIban] = useState(account?.iban ?? '')
  const [autoSync, setAutoSync] = useState(account?.auto_sync_enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bankAccounts, setBankAccounts] = useState<BankAccountInfo[] | null>(null)

  async function handleTest() {
    if (!account?.id) {
      setError('Enregistrez d\'abord le compte pour tester la connexion.')
      return
    }
    setTesting(true)
    setError(null)
    setBankAccounts(null)
    const res = await testShineConnection(account.id)
    if (res.error) { setError(res.error) }
    else { setBankAccounts(res.data) }
    setTesting(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await saveShineAccount({
      id: account?.id,
      name,
      access_token: token,
      shine_account_id: shineAccountId || undefined,
      iban: iban || undefined,
      auto_sync_enabled: autoSync,
    })
    if (res.error) { setError(res.error); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="dash-card">
      <div className="dash-card-title">{account ? 'Modifier le compte Shine' : 'Nouveau compte Shine'}</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="dash-field">
          <label className="dash-field-label">Nom</label>
          <input type="text" className="dash-field-input" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">{"Token d'accès"}</label>
          <input type="password" className="dash-field-input" value={token} onChange={e => setToken(e.target.value)} required placeholder="Votre token Shine" />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">Compte Shine ID (optionnel)</label>
          <input type="text" className="dash-field-input" value={shineAccountId} onChange={e => setShineAccountId(e.target.value)} placeholder="ID du compte Shine" />
        </div>
        <div className="dash-field">
          <label className="dash-field-label">IBAN (optionnel)</label>
          <input type="text" className="dash-field-input" value={iban} onChange={e => setIban(e.target.value)} placeholder="FR76..." />
        </div>
        <div className="dash-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="shine-auto-sync" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} />
          <label htmlFor="shine-auto-sync" className="dash-field-label" style={{ margin: 0 }}>Synchronisation automatique</label>
        </div>

        {error && <div className="dash-error">{error}</div>}

        {bankAccounts && bankAccounts.length > 0 && (
          <div className="dash-section">
            <div className="dash-section-title">Comptes bancaires détectés</div>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead><tr><th>Nom</th><th>IBAN</th><th className="right">Solde</th><th></th></tr></thead>
                <tbody>
                  {bankAccounts.map((ba, i) => (
                    <tr key={i}>
                      <td>{ba.name}</td>
                      <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12 }}>{ba.iban}</td>
                      <td className="right">{formatEur(ba.balance)}</td>
                      <td>
                        <button type="button" className="dash-btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setShineAccountId(ba.name); setIban(ba.iban) }}>
                          Utiliser
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="dash-btn-ghost" onClick={onCancel}>Annuler</button>
          {account?.id && (
            <button type="button" className="dash-btn-ghost" onClick={handleTest} disabled={testing}>
              {testing ? 'Test en cours…' : 'Tester la connexion'}
            </button>
          )}
          <button type="submit" className="dash-btn" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ShineAccountCard({ account, onChanged }: { account: ShineAccountSafe; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setError(null)
    setSyncResult(null)
    try {
      const res = await fetch('/api/shine/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur de synchronisation')
      } else {
        setSyncResult(`${data.imported} importée(s), ${data.skipped} ignorée(s)${data.errors ? ` — ${data.errors}` : ''}`)
        onChanged()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce compte Shine ? Les transactions deja importees ne seront pas supprimees.')) return
    setDeleting(true)
    const res = await deleteShineAccount(account.id)
    if (res.error) { setError(res.error); setDeleting(false); return }
    onChanged()
  }

  if (editing) {
    return <ShineForm account={account} onSaved={() => { setEditing(false); onChanged() }} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="dash-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 2, background: '#6c3fc5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Special Elite,cursive', fontSize: 22, color: '#fff', fontWeight: 700 }}>S</div>
        <div style={{ flex: 1 }}>
          <div className="dash-card-title" style={{ margin: 0 }}>{account.name}</div>
          <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)', marginTop: 4 }}>
            Token: {account.access_token_masked}
            {account.shine_account_id && ` | Compte: ${account.shine_account_id}`}
            {account.iban && ` | IBAN: ${account.iban}`}
          </div>
        </div>
        <span className={`dash-badge ${account.auto_sync_enabled ? 'dash-badge-green' : 'dash-badge-gray'}`}>
          {account.auto_sync_enabled ? 'Auto-sync' : 'Manuel'}
        </span>
      </div>

      <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)', marginBottom: 16 }}>
        Dernière sync : {formatDate(account.last_sync_at)}
      </div>

      {error && <div className="dash-error" style={{ marginBottom: 12 }}>{error}</div>}
      {syncResult && <div className="dash-success-msg" style={{ marginBottom: 12 }}>{syncResult}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="dash-btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
        <button className="dash-btn-ghost" onClick={() => setEditing(true)}>Modifier</button>
        <button className="dash-btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Suppression...' : 'Supprimer'}
        </button>
      </div>
    </div>
  )
}
