'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Facture, Depense } from '@/lib/types/database'

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function round2(n: number) { return Math.round(n * 100) / 100 }
function today() { return new Date().toISOString().slice(0, 10) }

function presets() {
  const y = new Date().getFullYear()
  return [
    { label: 'Cette année',      debut: `${y}-01-01`,     fin: today() },
    { label: 'Année complète',   debut: `${y}-01-01`,     fin: `${y}-12-31` },
    { label: 'Année précédente', debut: `${y-1}-01-01`,   fin: `${y-1}-12-31` },
    { label: 'S1',               debut: `${y}-01-01`,     fin: `${y}-06-30` },
    { label: 'S2',               debut: `${y}-07-01`,     fin: `${y}-12-31` },
  ]
}

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

export default function ExercicePage() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string|null>(null)
  const [debut, setDebut]       = useState(`${new Date().getFullYear()}-01-01`)
  const [fin, setFin]           = useState(today())
  const [tab, setTab]           = useState<'pnl'|'kpi'>('pnl')

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

  const pnl = useMemo(() => computePnL(factures, depenses, debut, fin), [factures, depenses, debut, fin])
  const ps = presets()

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Comptes annuels</h1>
          <p className="dash-subtitle">Compte de résultat — conforme ANC</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <input type="date" className="dash-filter-input" value={debut} onChange={e=>setDebut(e.target.value)} />
          <span style={{ color:'var(--pencil)', fontSize:13 }}>→</span>
          <input type="date" className="dash-filter-input" value={fin}   onChange={e=>setFin(e.target.value)} />
        </div>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {ps.map(p=>(
          <button key={p.label} className="dash-btn-ghost" style={{ fontSize:12, padding:'6px 12px' }}
            onClick={()=>{ setDebut(p.debut); setFin(p.fin) }}>{p.label}</button>
        ))}
      </div>

      {loading && <div className="dash-loading">Chargement…</div>}
      {error   && <div className="dash-error">{error}</div>}

      {!loading && (
        <>
          <div className="dash-kpi-grid" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
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

          <div className="dash-section">
            <div className="dash-section-title">Compte de résultat</div>
            <div className="dash-table-wrap"><table className="dash-table">
              <tbody>
                <tr style={{ background:'var(--offwhite)' }}>
                  <td style={{ fontFamily:'Courier Prime,monospace', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:'var(--pencil)', padding:'8px 12px' }} colSpan={2}>
                    Produits — Chiffre d&apos;affaires HT
                  </td>
                </tr>
                {Object.entries(pnl.produits).map(([cat, montant])=>(
                  <tr key={cat}>
                    <td style={{ paddingLeft:24 }}>{cat}</td>
                    <td className="right">{formatEur(montant)}</td>
                  </tr>
                ))}
                {Object.keys(pnl.produits).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucun produit.</td></tr>}
                <tr style={{ fontWeight:700, borderBottom:'2px solid var(--ink)' }}>
                  <td>Total produits</td>
                  <td className="right">{formatEur(pnl.total_produits)}</td>
                </tr>

                <tr style={{ background:'var(--offwhite)' }}>
                  <td style={{ fontFamily:'Courier Prime,monospace', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:'var(--pencil)', padding:'8px 12px' }} colSpan={2}>
                    Charges — Dépenses HT
                  </td>
                </tr>
                {Object.entries(pnl.charges).map(([cat, montant])=>(
                  <tr key={cat}>
                    <td style={{ paddingLeft:24 }}>{cat}</td>
                    <td className="right" style={{ color:'var(--pencil)' }}>{formatEur(montant)}</td>
                  </tr>
                ))}
                {Object.keys(pnl.charges).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucune charge.</td></tr>}
                <tr style={{ fontWeight:700, borderBottom:'2px solid var(--ink)' }}>
                  <td>Total charges</td>
                  <td className="right">{formatEur(pnl.total_charges)}</td>
                </tr>

                <tr style={{ fontWeight:700, fontFamily:'Courier Prime,monospace', background: pnl.resultat >= 0 ? '#f0fdf4' : '#fff5f5' }}>
                  <td style={{ padding:'14px 12px', fontSize:15 }}>Résultat de l&apos;exercice</td>
                  <td className="right" style={{ padding:'14px 12px', fontSize:15, color: pnl.resultat >= 0 ? '#15803d' : '#dc2626' }}>
                    {formatEur(pnl.resultat)}
                  </td>
                </tr>
              </tbody>
            </table></div>
          </div>
        </>
      )}
    </div>
  )
}
