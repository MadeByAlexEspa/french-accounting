'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Facture, Depense } from '@/lib/types/database'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function round2(n: number) { return Math.round(n * 100) / 100 }
function today() { return new Date().toISOString().slice(0, 10) }

function presets() {
  const y = new Date().getFullYear()
  return [
    { label: 'Cette année',      debut: `${y}-01-01`,   fin: today() },
    { label: 'Année complète',   debut: `${y}-01-01`,   fin: `${y}-12-31` },
    { label: 'Année précédente', debut: `${y-1}-01-01`, fin: `${y-1}-12-31` },
    { label: 'S1',               debut: `${y}-01-01`,   fin: `${y}-06-30` },
    { label: 'S2',               debut: `${y}-07-01`,   fin: `${y}-12-31` },
  ]
}

// ── P&L computation ───────────────────────────────────────────────────────────

interface PnL {
  produits: Record<string, number>
  charges: Record<string, number>
  total_produits: number
  total_charges: number
  resultat: number
}

function computePnL(factures: Facture[], depenses: Depense[], debut: string, fin: string): PnL {
  const ff = factures.filter(f => f.date >= debut && f.date <= fin)
  const fd = depenses.filter(d => d.date >= debut && d.date <= fin)
  const produits: Record<string, number> = {}
  ff.forEach(f => { produits[f.categorie] = round2((produits[f.categorie] ?? 0) + f.montant_ht) })
  const charges: Record<string, number> = {}
  fd.forEach(d => { charges[d.categorie] = round2((charges[d.categorie] ?? 0) + d.montant_ht) })
  const total_produits = round2(Object.values(produits).reduce((s, v) => s + v, 0))
  const total_charges  = round2(Object.values(charges).reduce((s, v) => s + v, 0))
  return { produits, charges, total_produits, total_charges, resultat: round2(total_produits - total_charges) }
}

// ── Bilan computation ─────────────────────────────────────────────────────────

interface Bilan {
  actif: {
    tresorerie: number
    creances_clients: number
    credit_tva: number
    total: number
  }
  passif: {
    resultat: number
    dettes_fournisseurs: number
    tva_reverser: number
    total: number
  }
  tva_collectee: number
  tva_deductible: number
}

function computeBilan(factures: Facture[], depenses: Depense[], debut: string, fin: string, resultat: number): Bilan {
  const ff = factures.filter(f => f.date >= debut && f.date <= fin)
  const fd = depenses.filter(d => d.date >= debut && d.date <= fin)

  const tresorerie = round2(
    ff.filter(f => f.statut === 'payee').reduce((s, f) => s + f.montant_ttc, 0) -
    fd.filter(d => d.statut === 'payee').reduce((s, d) => s + d.montant_ttc, 0)
  )
  const creances_clients    = round2(ff.filter(f => f.statut === 'en_attente').reduce((s, f) => s + f.montant_ttc, 0))
  const dettes_fournisseurs = round2(fd.filter(d => d.statut === 'en_attente').reduce((s, d) => s + d.montant_ttc, 0))
  const tva_collectee  = round2(ff.reduce((s, f) => s + f.montant_tva, 0))
  const tva_deductible = round2(fd.reduce((s, d) => s + d.montant_tva, 0))
  const tva_net = round2(tva_collectee - tva_deductible)
  const tva_reverser = tva_net > 0 ? tva_net : 0
  const credit_tva   = tva_net < 0 ? -tva_net : 0

  return {
    actif:  { tresorerie, creances_clients, credit_tva, total: round2(tresorerie + creances_clients + credit_tva) },
    passif: { resultat, dettes_fournisseurs, tva_reverser, total: round2(resultat + dettes_fournisseurs + tva_reverser) },
    tva_collectee, tva_deductible,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BilanRow({ label, pcg, amount, indent, bold, positive }: {
  label: string; pcg?: string; amount: number; indent?: boolean; bold?: boolean; positive?: boolean
}) {
  const color = positive !== undefined ? (positive ? '#15803d' : '#dc2626') : undefined
  return (
    <tr style={bold ? { fontWeight: 700, borderTop: '2px solid var(--ink)' } : {}}>
      <td style={{ paddingLeft: indent ? 24 : 12 }}>
        {pcg && <span style={{ fontFamily: 'Courier Prime,monospace', fontSize: 10, color: 'var(--pencil)', marginRight: 8 }}>{pcg}</span>}
        {label}
      </td>
      <td className="right" style={{ color, fontFamily: 'Courier Prime,monospace' }}>{formatEur(amount)}</td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'resultat' | 'bilan'

export default function ExercicePage() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [debut, setDebut]       = useState(`${new Date().getFullYear()}-01-01`)
  const [fin, setFin]           = useState(today())
  const [tab, setTab]           = useState<Tab>('resultat')

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      setLoading(true); setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setError('Session expirée — rechargez la page.'); return }
        const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
        if (!m) { setError('Workspace introuvable.'); return }
        const [{ data: f, error: fe }, { data: d, error: de }] = await Promise.all([
          supabase.from('factures').select('*').eq('workspace_id', m.workspace_id),
          supabase.from('depenses').select('*').eq('workspace_id', m.workspace_id),
        ])
        if (fe || de) { setError((fe ?? de)?.message ?? 'Erreur'); return }
        setFactures((f ?? []) as Facture[]); setDepenses((d ?? []) as Depense[])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const pnl   = useMemo(() => computePnL(factures, depenses, debut, fin), [factures, depenses, debut, fin])
  const bilan = useMemo(() => computeBilan(factures, depenses, debut, fin, pnl.resultat), [factures, depenses, debut, fin, pnl.resultat])
  const ps = presets()

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Comptes annuels</h1>
          <p className="dash-subtitle">Compte de résultat & bilan simplifié — conforme ANC</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" className="dash-filter-input" value={debut} onChange={e => setDebut(e.target.value)} />
          <span style={{ color: 'var(--pencil)', fontSize: 13 }}>→</span>
          <input type="date" className="dash-filter-input" value={fin}   onChange={e => setFin(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {ps.map(p => (
          <button key={p.label} className="dash-btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => { setDebut(p.debut); setFin(p.fin) }}>{p.label}</button>
        ))}
      </div>

      {loading && <div className="dash-loading">Chargement…</div>}
      {error   && <div className="dash-error">{error}</div>}

      {!loading && (
        <>
          {/* KPIs */}
          <div className="dash-kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Produits HT</p>
              <p className="dash-kpi-value">{formatEur(pnl.total_produits)}</p>
              <p className="dash-kpi-sub">{debut} → {fin}</p>
            </div>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Charges HT</p>
              <p className="dash-kpi-value">{formatEur(pnl.total_charges)}</p>
              <p className="dash-kpi-sub">{debut} → {fin}</p>
            </div>
            {pnl.resultat >= 0
              ? <div className="dash-kpi-card dash-kpi-card-credit">
                  <p className="dash-kpi-label">Résultat</p>
                  <p className="dash-kpi-value dash-kpi-value-success">{formatEur(pnl.resultat)}</p>
                  <p className="dash-kpi-sub">Bénéfice</p>
                </div>
              : <div className="dash-kpi-card dash-kpi-card-due">
                  <p className="dash-kpi-label">Résultat</p>
                  <p className="dash-kpi-value dash-kpi-value-danger">{formatEur(pnl.resultat)}</p>
                  <p className="dash-kpi-sub">Déficit</p>
                </div>
            }
          </div>

          {/* Tabs */}
          <div className="dash-tabs">
            <button className={`dash-tab ${tab === 'resultat' ? 'dash-tab-active' : ''}`} onClick={() => setTab('resultat')}>
              Compte de résultat
            </button>
            <button className={`dash-tab ${tab === 'bilan' ? 'dash-tab-active' : ''}`} onClick={() => setTab('bilan')}>
              Bilan simplifié
            </button>
          </div>

          {/* ── Compte de résultat ──────────────────────────────────────────── */}
          {tab === 'resultat' && (
            <div className="dash-section">
              <div className="dash-table-wrap"><table className="dash-table">
                <tbody>
                  <tr style={{ background: 'var(--offwhite)' }}>
                    <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px' }} colSpan={2}>
                      Produits — Chiffre d&apos;affaires HT
                    </td>
                  </tr>
                  {Object.entries(pnl.produits).map(([cat, montant]) => (
                    <tr key={cat}>
                      <td style={{ paddingLeft: 24 }}>{cat}</td>
                      <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(montant)}</td>
                    </tr>
                  ))}
                  {Object.keys(pnl.produits).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucun produit.</td></tr>}
                  <tr style={{ fontWeight: 700, borderBottom: '2px solid var(--ink)' }}>
                    <td>Total produits</td>
                    <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_produits)}</td>
                  </tr>

                  <tr style={{ background: 'var(--offwhite)' }}>
                    <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px' }} colSpan={2}>
                      Charges — Dépenses HT
                    </td>
                  </tr>
                  {Object.entries(pnl.charges).map(([cat, montant]) => (
                    <tr key={cat}>
                      <td style={{ paddingLeft: 24 }}>{cat}</td>
                      <td className="right" style={{ color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}>{formatEur(montant)}</td>
                    </tr>
                  ))}
                  {Object.keys(pnl.charges).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucune charge.</td></tr>}
                  <tr style={{ fontWeight: 700, borderBottom: '2px solid var(--ink)' }}>
                    <td>Total charges</td>
                    <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_charges)}</td>
                  </tr>

                  <tr style={{ fontWeight: 700, fontFamily: 'Courier Prime,monospace', background: pnl.resultat >= 0 ? '#f0fdf4' : '#fff5f5' }}>
                    <td style={{ padding: '14px 12px', fontSize: 15 }}>
                      Résultat de l&apos;exercice {pnl.resultat >= 0 ? '(120)' : '(129)'}
                    </td>
                    <td className="right" style={{ padding: '14px 12px', fontSize: 15, color: pnl.resultat >= 0 ? '#15803d' : '#dc2626' }}>
                      {formatEur(pnl.resultat)}
                    </td>
                  </tr>
                </tbody>
              </table></div>
            </div>
          )}

          {/* ── Bilan simplifié ──────────────────────────────────────────────── */}
          {tab === 'bilan' && (
            <div className="dash-ventilation-grid">
              {/* ACTIF */}
              <div className="dash-ventilation-card">
                <div className="dash-section-title">ACTIF</div>
                <div className="dash-table-wrap"><table className="dash-table">
                  <tbody>
                    <tr style={{ background: 'var(--offwhite)' }}>
                      <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px' }} colSpan={2}>
                        Actif circulant
                      </td>
                    </tr>
                    <BilanRow label="Trésorerie nette" pcg="512" amount={bilan.actif.tresorerie} indent />
                    <BilanRow label="Créances clients" pcg="411" amount={bilan.actif.creances_clients} indent />
                    {bilan.actif.credit_tva > 0 && (
                      <BilanRow label="Crédit de TVA" pcg="44567" amount={bilan.actif.credit_tva} indent />
                    )}
                    <BilanRow label="Total actif" amount={bilan.actif.total} bold positive={bilan.actif.total >= 0} />
                  </tbody>
                </table></div>
                <div style={{ marginTop: 12, fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)', lineHeight: 1.6 }}>
                  <div>Trésorerie = encaissements – décaissements (TTC payés)</div>
                  <div>Créances = factures en attente de paiement (TTC)</div>
                </div>
              </div>

              {/* PASSIF */}
              <div className="dash-ventilation-card">
                <div className="dash-section-title">PASSIF & CAPITAUX PROPRES</div>
                <div className="dash-table-wrap"><table className="dash-table">
                  <tbody>
                    <tr style={{ background: 'var(--offwhite)' }}>
                      <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px' }} colSpan={2}>
                        Capitaux propres
                      </td>
                    </tr>
                    <BilanRow label={pnl.resultat >= 0 ? 'Résultat (bénéfice)' : 'Résultat (déficit)'}
                      pcg={pnl.resultat >= 0 ? '120' : '129'}
                      amount={pnl.resultat} indent positive={pnl.resultat >= 0} />

                    <tr style={{ background: 'var(--offwhite)' }}>
                      <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px' }} colSpan={2}>
                        Dettes
                      </td>
                    </tr>
                    <BilanRow label="Dettes fournisseurs" pcg="401" amount={bilan.passif.dettes_fournisseurs} indent />
                    {bilan.passif.tva_reverser > 0 && (
                      <BilanRow label="TVA à reverser" pcg="44551" amount={bilan.passif.tva_reverser} indent />
                    )}
                    <BilanRow label="Total passif" amount={bilan.passif.total} bold positive={bilan.passif.total >= 0} />
                  </tbody>
                </table></div>
                <div style={{ marginTop: 12, fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)', lineHeight: 1.6 }}>
                  <div>Dettes = dépenses en attente de paiement (TTC)</div>
                  <div>TVA collectée {formatEur(bilan.tva_collectee)} — déductible {formatEur(bilan.tva_deductible)}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
