'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Facture, Depense } from '@/lib/types/database'

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function round2(n: number) { return Math.round(n * 100) / 100 }
function pad(n: number) { return String(n).padStart(2, '0') }
function lastDay(y: number, m: number) { return new Date(y, m, 0).getDate() }
const CY = () => new Date().getFullYear()
const CM = () => new Date().getMonth() + 1

const MODE_LABELS: Record<string, string> = { mois: 'Mois', trimestre: 'Trimestre', semestre: 'Semestre', annee: 'Année' }
const TAUX_LABELS: Record<string, string> = {
  '20': '20 % — Taux normal', '10': '10 % — Taux intermédiaire',
  '5.5': '5,5 % — Taux réduit', '2.1': '2,1 % — Taux particulier', '0': '0 % — Exonéré',
}

function getRange(mode: string, year: number, sub: string) {
  const y = year
  if (mode === 'mois') {
    const [yr, mo] = sub.split('-').map(Number)
    return { debut: `${yr}-${pad(mo)}-01`, fin: `${yr}-${pad(mo)}-${pad(lastDay(yr, mo))}` }
  }
  if (mode === 'trimestre') {
    const q = Number(sub); const sm = (q-1)*3+1; const em = q*3
    return { debut: `${y}-${pad(sm)}-01`, fin: `${y}-${pad(em)}-${pad(lastDay(y, em))}` }
  }
  if (mode === 'semestre') {
    return Number(sub)===1 ? { debut:`${y}-01-01`, fin:`${y}-06-30` } : { debut:`${y}-07-01`, fin:`${y}-12-31` }
  }
  return { debut: `${y}-01-01`, fin: `${y}-12-31` }
}

function computeTVA(factures: Facture[], depenses: Depense[], debut: string, fin: string) {
  const ff = factures.filter(f => f.date >= debut && f.date <= fin)
  const fd = depenses.filter(d => d.date >= debut && d.date <= fin)

  function agg(rows: Array<{montant_ht:number;taux_tva:number;montant_tva:number}>) {
    const par_taux: Record<string, {base_ht:number;tva:number}> = {}
    let total_ht = 0; let total_tva = 0
    rows.forEach(r => {
      const t = String(r.taux_tva)
      if (!par_taux[t]) par_taux[t] = { base_ht:0, tva:0 }
      par_taux[t].base_ht = round2(par_taux[t].base_ht + r.montant_ht)
      par_taux[t].tva = round2(par_taux[t].tva + r.montant_tva)
      total_ht = round2(total_ht + r.montant_ht)
      total_tva = round2(total_tva + r.montant_tva)
    })
    return { par_taux, total_base_ht: total_ht, total_tva }
  }

  const collectee = agg(ff)
  const deductible = agg(fd)
  const net = round2(collectee.total_tva - deductible.total_tva)
  return {
    collectee, deductible,
    tva_a_reverser: net > 0 ? net : 0,
    credit_tva: net < 0 ? -net : 0,
    detail_factures: ff, detail_depenses: fd,
  }
}

function TauxTable({ par_taux }: { par_taux: Record<string, {base_ht:number;tva:number}> }) {
  const lines = Object.entries(par_taux).filter(([, v]) => v.base_ht !== 0 || v.tva !== 0)
  if (!lines.length) return <p className="dash-empty">Aucune opération.</p>
  return (
    <table className="dash-table" style={{ marginTop: 8 }}>
      <thead><tr><th>Taux</th><th className="right">Base HT</th><th className="right">TVA</th></tr></thead>
      <tbody>
        {lines.map(([t, v]) => (
          <tr key={t}><td>{TAUX_LABELS[t] ?? `${t} %`}</td><td className="right">{formatEur(v.base_ht)}</td><td className="right"><strong>{formatEur(v.tva)}</strong></td></tr>
        ))}
      </tbody>
    </table>
  )
}

export default function TVAPage() {
  const [mode, setMode] = useState('mois')
  const [year, setYear] = useState(CY())
  const [sub, setSub]   = useState(`${CY()}-${pad(CM())}`)
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string|null>(null)
  const [fSearch, setFSearch]   = useState('')
  const [dSearch, setDSearch]   = useState('')

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
          supabase.from('factures').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }),
          supabase.from('depenses').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }),
        ])
        if (fe || de) { setError((fe ?? de)?.message ?? 'Erreur'); return }
        setFactures((f ?? []) as Facture[]); setDepenses((d ?? []) as Depense[])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const { debut, fin } = useMemo(() => getRange(mode, year, sub), [mode, year, sub])
  const data = useMemo(() => computeTVA(factures, depenses, debut, fin), [factures, depenses, debut, fin])

  const years = Array.from({ length: 6 }, (_, i) => CY() - i)

  function handleMode(m: string) {
    setMode(m)
    if (m === 'mois') setSub(`${CY()}-${pad(CM())}`)
    else if (m === 'trimestre') setSub(String(Math.ceil(CM() / 3)))
    else if (m === 'semestre') setSub(CM() <= 6 ? '1' : '2')
  }

  const ff = data.detail_factures.filter(f => !fSearch || f.client.toLowerCase().includes(fSearch.toLowerCase()))
  const fd = data.detail_depenses.filter(d => !dSearch || d.fournisseur.toLowerCase().includes(dSearch.toLowerCase()))

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">TVA</h1>
          <p className="dash-subtitle">Déclaration conforme CA3 (art. 287 CGI)</p>
        </div>
        <div className="dash-period-picker">
          <div className="dash-period-mode-row">
            {Object.keys(MODE_LABELS).map(m => (
              <button key={m} className={`dash-period-btn ${mode===m?'dash-period-btn-active':''}`} onClick={()=>handleMode(m)}>{MODE_LABELS[m]}</button>
            ))}
          </div>
          {mode !== 'mois' && (
            <select className="dash-filter-select" value={year} onChange={e=>setYear(Number(e.target.value))}>
              {years.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {mode === 'mois' && <input type="month" className="dash-filter-input" value={sub} onChange={e=>setSub(e.target.value)} />}
          {mode === 'trimestre' && (
            <div className="dash-period-mode-row">
              {[1,2,3,4].map(q=><button key={q} className={`dash-period-btn ${sub===String(q)?'dash-period-btn-active':''}`} onClick={()=>setSub(String(q))}>T{q}</button>)}
            </div>
          )}
          {mode === 'semestre' && (
            <div className="dash-period-mode-row">
              {[1,2].map(s=><button key={s} className={`dash-period-btn ${sub===String(s)?'dash-period-btn-active':''}`} onClick={()=>setSub(String(s))}>S{s}</button>)}
            </div>
          )}
        </div>
      </div>

      {loading && <div className="dash-loading">Chargement…</div>}
      {error   && <div className="dash-error">{error}</div>}

      {!loading && (
        <>
          <div className="dash-kpi-grid">
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">TVA Collectée</p>
              <p className="dash-kpi-value">{formatEur(data.collectee.total_tva)}</p>
              <p className="dash-kpi-sub">Sur entrées (44571)</p>
            </div>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">TVA Déductible</p>
              <p className="dash-kpi-value">{formatEur(data.deductible.total_tva)}</p>
              <p className="dash-kpi-sub">Sur sorties (44566)</p>
            </div>
            {data.tva_a_reverser > 0
              ? <div className="dash-kpi-card dash-kpi-card-due">
                  <p className="dash-kpi-label">TVA à Reverser</p>
                  <p className="dash-kpi-value dash-kpi-value-danger">{formatEur(data.tva_a_reverser)}</p>
                  <p className="dash-kpi-sub">À régler à l&apos;État (44551)</p>
                </div>
              : <div className="dash-kpi-card dash-kpi-card-credit">
                  <p className="dash-kpi-label">Crédit de TVA</p>
                  <p className="dash-kpi-value dash-kpi-value-success">{formatEur(data.credit_tva)}</p>
                  <p className="dash-kpi-sub">Remboursable ou reportable (44567)</p>
                </div>
            }
          </div>

          <div className="dash-ventilation-grid">
            <div className="dash-ventilation-card">
              <div className="dash-section-title">TVA Collectée — Ventilation <span className="dash-section-note">Lignes A1–A4 CA3</span></div>
              <TauxTable par_taux={data.collectee.par_taux} />
              {Object.keys(data.collectee.par_taux).length > 0 && (
                <div className="dash-ventilation-total">
                  Base HT : <strong>{formatEur(data.collectee.total_base_ht)}</strong> · TVA : <strong>{formatEur(data.collectee.total_tva)}</strong>
                </div>
              )}
            </div>
            <div className="dash-ventilation-card">
              <div className="dash-section-title">TVA Déductible — Ventilation <span className="dash-section-note">Ligne 20 CA3</span></div>
              <TauxTable par_taux={data.deductible.par_taux} />
              {Object.keys(data.deductible.par_taux).length > 0 && (
                <div className="dash-ventilation-total">
                  Base HT : <strong>{formatEur(data.deductible.total_base_ht)}</strong> · TVA : <strong>{formatEur(data.deductible.total_tva)}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="dash-section">
            <div className="dash-section-title">Entrées <span className="dash-section-count">{ff.length} / {data.detail_factures.length}</span></div>
            {data.detail_factures.length > 0 && (
              <div className="dash-filter-bar"><input className="dash-filter-input" placeholder="Rechercher un client…" value={fSearch} onChange={e=>setFSearch(e.target.value)} /></div>
            )}
            {data.detail_factures.length === 0 ? <p className="dash-empty">Aucune entrée sur cette période.</p> : (
              <div className="dash-table-wrap"><table className="dash-table">
                <thead><tr><th>Date</th><th>Client</th><th className="right">HT</th><th className="right">Taux</th><th className="right">TVA</th><th className="right">TTC</th></tr></thead>
                <tbody>
                  {ff.map(f=><tr key={f.id}>
                    <td>{f.date}</td><td>{f.client}</td>
                    <td className="right">{formatEur(f.montant_ht)}</td>
                    <td className="right">{f.taux_tva} %</td>
                    <td className="right">{formatEur(f.montant_tva)}</td>
                    <td className="right">{formatEur(f.montant_ttc)}</td>
                  </tr>)}
                </tbody>
                <tfoot><tr>
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className="right"><strong>{formatEur(ff.reduce((s,f)=>s+f.montant_ht,0))}</strong></td><td/>
                  <td className="right"><strong>{formatEur(ff.reduce((s,f)=>s+f.montant_tva,0))}</strong></td>
                  <td className="right"><strong>{formatEur(ff.reduce((s,f)=>s+f.montant_ttc,0))}</strong></td>
                </tr></tfoot>
              </table></div>
            )}
          </div>

          <div className="dash-section">
            <div className="dash-section-title">Sorties <span className="dash-section-count">{fd.length} / {data.detail_depenses.length}</span></div>
            {data.detail_depenses.length > 0 && (
              <div className="dash-filter-bar"><input className="dash-filter-input" placeholder="Rechercher un fournisseur…" value={dSearch} onChange={e=>setDSearch(e.target.value)} /></div>
            )}
            {data.detail_depenses.length === 0 ? <p className="dash-empty">Aucune sortie sur cette période.</p> : (
              <div className="dash-table-wrap"><table className="dash-table">
                <thead><tr><th>Date</th><th>Fournisseur</th><th className="right">HT</th><th className="right">Taux</th><th className="right">TVA</th><th className="right">TTC</th></tr></thead>
                <tbody>
                  {fd.map(d=><tr key={d.id}>
                    <td>{d.date}</td><td>{d.fournisseur}</td>
                    <td className="right">{formatEur(d.montant_ht)}</td>
                    <td className="right">{d.taux_tva} %</td>
                    <td className="right">{formatEur(d.montant_tva)}</td>
                    <td className="right">{formatEur(d.montant_ttc)}</td>
                  </tr>)}
                </tbody>
                <tfoot><tr>
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className="right"><strong>{formatEur(fd.reduce((s,d)=>s+d.montant_ht,0))}</strong></td><td/>
                  <td className="right"><strong>{formatEur(fd.reduce((s,d)=>s+d.montant_tva,0))}</strong></td>
                  <td className="right"><strong>{formatEur(fd.reduce((s,d)=>s+d.montant_ttc,0))}</strong></td>
                </tr></tfoot>
              </table></div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
