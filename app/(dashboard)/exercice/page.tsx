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

// ── Bilan auto-computed values ────────────────────────────────────────────────

interface BilanAuto {
  creances_clients: number
  credit_tva: number
  disponibilites: number   // positive = cash, 0 if negative
  decouvert: number        // absolute value of negative trésorerie
  dettes_fournisseurs: number
  tva_a_decaisser: number
  tva_collectee: number
  tva_deductible: number
}

function computeBilanAuto(factures: Facture[], depenses: Depense[], debut: string, fin: string): BilanAuto {
  const ff = factures.filter(f => f.date >= debut && f.date <= fin)
  const fd = depenses.filter(d => d.date >= debut && d.date <= fin)

  const creances_clients    = round2(ff.filter(f => f.statut === 'en_attente').reduce((s, f) => s + f.montant_ttc, 0))
  const dettes_fournisseurs = round2(fd.filter(d => d.statut === 'en_attente').reduce((s, d) => s + d.montant_ttc, 0))

  const tva_collectee  = round2(ff.reduce((s, f) => s + f.montant_tva, 0))
  const tva_deductible = round2(fd.reduce((s, d) => s + d.montant_tva, 0))
  const tva_net = round2(tva_collectee - tva_deductible)

  const treso = round2(
    ff.filter(f => f.statut === 'payee').reduce((s, f) => s + f.montant_ttc, 0) -
    fd.filter(d => d.statut === 'payee').reduce((s, d) => s + d.montant_ttc, 0)
  )

  return {
    creances_clients,
    credit_tva:   tva_net < 0 ? -tva_net : 0,
    disponibilites: treso > 0 ? treso : 0,
    decouvert:      treso < 0 ? -treso : 0,
    dettes_fournisseurs,
    tva_a_decaisser: tva_net > 0 ? tva_net : 0,
    tva_collectee, tva_deductible,
  }
}

// ── Manual saisies (stored in localStorage per year) ──────────────────────────

interface Saisies {
  imm_incorp: number    // Immobilisations incorporelles — 2050 · AU
  imm_corp: number      // Immobilisations corporelles   — 2050 · BP
  capital: number       // Capital social                — 2051 · DA
  compte_exploit: number// Compte exploitant (108)       — 2051 · DH
  report_nv: number     // Report à nouveau              — 2051 · DG
  emprunts: number      // Emprunts bancaires (164)      — 2051 · FB
  cca: number           // Comptes courants associés(455)— 2051 · FC
}

const SAISIES_DEFAULTS: Saisies = {
  imm_incorp: 0, imm_corp: 0, capital: 0,
  compte_exploit: 0, report_nv: 0, emprunts: 0, cca: 0,
}

function lsKey(debut: string) { return `bilan_saisies_${debut.slice(0, 4)}` }

function loadSaisies(debut: string): Saisies {
  try {
    const raw = localStorage.getItem(lsKey(debut))
    if (raw) return { ...SAISIES_DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...SAISIES_DEFAULTS }
}

function saveSaisies(debut: string, s: Saisies) {
  try { localStorage.setItem(lsKey(debut), JSON.stringify(s)) } catch { /* ignore */ }
}

// ── Bilan sub-components ──────────────────────────────────────────────────────

function Ref({ v }: { v: string }) {
  return (
    <span style={{ marginLeft: 8, fontSize: 10, fontFamily: 'Courier Prime,monospace', color: '#6b7280',
      background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 2, padding: '1px 5px', whiteSpace: 'nowrap' }}>
      {v}
    </span>
  )
}

function GroupHeader({ label, liasse }: { label: string; liasse?: string }) {
  return (
    <tr style={{ background: 'var(--offwhite)' }}>
      <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
        color: 'var(--pencil)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        {liasse && <Ref v={liasse} />}
      </td>
    </tr>
  )
}

function AutoRow({ label, compte, liasse, montant, positive }: {
  label: string; compte?: string; liasse?: string; montant: number; positive?: boolean
}) {
  if (montant === 0) return null
  const color = positive !== undefined ? (positive ? '#15803d' : '#dc2626') : undefined
  return (
    <tr>
      <td style={{ paddingLeft: 24 }}>
        {compte && <span style={{ fontSize: 10, fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)', marginRight: 6 }}>{compte}</span>}
        {label}
        {liasse && <Ref v={liasse} />}
        <span style={{ marginLeft: 8, fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>auto</span>
      </td>
      <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color }}>{formatEur(montant)}</td>
    </tr>
  )
}

function ManualRow({ label, compte, liasse, value, onChange }: {
  label: string; compte?: string; liasse?: string; value: number; onChange: (v: number) => void
}) {
  return (
    <tr>
      <td style={{ paddingLeft: 24 }}>
        {compte && <span style={{ fontSize: 10, fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)', marginRight: 6 }}>{compte}</span>}
        {label}
        {liasse && <Ref v={liasse} />}
      </td>
      <td className="right" style={{ width: 140 }}>
        <input
          type="number" step="0.01" value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          placeholder="0,00"
          style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--rule)', borderRadius: 2,
            fontFamily: 'Courier Prime,monospace', width: 120, textAlign: 'right', background: '#fafafa' }}
        />
      </td>
    </tr>
  )
}

function SubtotalRow({ label, liasse, montant, bold }: { label: string; liasse?: string; montant: number; bold?: boolean }) {
  return (
    <tr style={{ borderTop: '1px solid var(--rule)', background: bold ? 'var(--ink)' : undefined }}>
      <td style={{ padding: '8px 12px', fontWeight: bold ? 700 : 600, color: bold ? '#fff' : undefined }}>
        {label}
        {liasse && (bold
          ? <span style={{ marginLeft: 8, fontSize: 10, fontFamily: 'Courier Prime,monospace', color: '#d1d5db',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 2, padding: '1px 5px' }}>{liasse}</span>
          : <Ref v={liasse} />
        )}
      </td>
      <td className="right" style={{ fontFamily: 'Courier Prime,monospace', fontWeight: bold ? 700 : 600, color: bold ? '#fff' : undefined }}>
        {formatEur(montant)}
      </td>
    </tr>
  )
}

// ── Bilan Tab ─────────────────────────────────────────────────────────────────

function BilanTab({ debut, fin, pnl, bilanAuto }: {
  debut: string; fin: string; pnl: PnL; bilanAuto: BilanAuto
}) {
  const [saisies, setSaisies] = useState<Saisies>(SAISIES_DEFAULTS)

  useEffect(() => {
    setSaisies(loadSaisies(debut))
  }, [debut])

  function update(key: keyof Saisies, val: number) {
    const next = { ...saisies, [key]: val }
    setSaisies(next)
    saveSaisies(debut, next)
  }

  // ── Actif totals
  const totalImmobi = round2(saisies.imm_incorp + saisies.imm_corp)
  const totalCirculant = round2(
    bilanAuto.creances_clients + bilanAuto.credit_tva + bilanAuto.disponibilites
  )
  const totalActif = round2(totalImmobi + totalCirculant)

  // ── Passif totals
  const totalCapPropres = round2(saisies.capital + saisies.compte_exploit + saisies.report_nv + pnl.resultat)
  const totalDettesFin = round2(saisies.emprunts + saisies.cca)
  const totalDettesExpl = round2(bilanAuto.dettes_fournisseurs + bilanAuto.tva_a_decaisser + bilanAuto.decouvert)
  const totalPassif = round2(totalCapPropres + totalDettesFin + totalDettesExpl)

  const ecart = round2(totalActif - totalPassif)
  const equilibre = Math.abs(ecart) < 0.02

  return (
    <>
      <div className="dash-ventilation-grid">

        {/* ── ACTIF ── */}
        <div className="dash-ventilation-card">
          <div className="dash-section-title" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>ACTIF</div>
          <div className="dash-table-wrap"><table className="dash-table">
            <tbody>
              {/* Actif immobilisé */}
              <GroupHeader label="Actif immobilisé" liasse="Formulaire 2050" />
              <ManualRow label="Immobilisations incorporelles (net)" compte="(20x)" liasse="2050 · AU" value={saisies.imm_incorp} onChange={v => update('imm_incorp', v)} />
              <ManualRow label="Immobilisations corporelles (net)"  compte="(21x)" liasse="2050 · BP" value={saisies.imm_corp}   onChange={v => update('imm_corp', v)} />
              {totalImmobi > 0 && <SubtotalRow label="Total actif immobilisé" liasse="2050 · BV" montant={totalImmobi} />}

              {/* Actif circulant */}
              <GroupHeader label="Actif circulant" liasse="Formulaire 2050" />
              <AutoRow label="Créances clients" compte="(41)" liasse="2050 · CT" montant={bilanAuto.creances_clients} />
              <AutoRow label="Crédit de TVA"    compte="(44567)" liasse="2050 · CW" montant={bilanAuto.credit_tva} />
              <AutoRow label="Disponibilités – Banque" compte="(512)" liasse="2050 · DB" montant={bilanAuto.disponibilites} />
              {totalCirculant === 0 && (
                <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune donnée calculable.</td></tr>
              )}
              <SubtotalRow label="Total actif circulant" liasse="2050 · DH" montant={totalCirculant} />
            </tbody>
            <tfoot>
              <SubtotalRow label="TOTAL ACTIF" liasse="2050 · DP" montant={totalActif} bold />
            </tfoot>
          </table></div>
        </div>

        {/* ── PASSIF ── */}
        <div className="dash-ventilation-card">
          <div className="dash-section-title" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>PASSIF</div>
          <div className="dash-table-wrap"><table className="dash-table">
            <tbody>
              {/* Capitaux propres */}
              <GroupHeader label="Capitaux propres" liasse="Formulaire 2051" />
              <ManualRow label="Capital social"        compte="(101)" liasse="2051 · DA" value={saisies.capital}       onChange={v => update('capital', v)} />
              <ManualRow label="Compte exploitant"     compte="(108)" liasse="2051 · DH" value={saisies.compte_exploit} onChange={v => update('compte_exploit', v)} />
              <ManualRow label="Report à nouveau"      compte="(11)"  liasse="2051 · DG" value={saisies.report_nv}     onChange={v => update('report_nv', v)} />
              <AutoRow
                label={pnl.resultat >= 0 ? 'Résultat de l\'exercice (bénéfice)' : 'Résultat de l\'exercice (déficit)'}
                compte={pnl.resultat >= 0 ? '(120)' : '(129)'}
                liasse="2051 · DI/DJ"
                montant={pnl.resultat}
                positive={pnl.resultat >= 0}
              />
              <SubtotalRow label="Total capitaux propres" liasse="2051 · DM" montant={totalCapPropres} />

              {/* Dettes financières */}
              <GroupHeader label="Dettes financières" liasse="Formulaire 2051" />
              <ManualRow label="Emprunts bancaires"          compte="(164)" liasse="2051 · FB" value={saisies.emprunts} onChange={v => update('emprunts', v)} />
              <ManualRow label="Comptes courants associés"   compte="(455)" liasse="2051 · FC" value={saisies.cca}      onChange={v => update('cca', v)} />
              {totalDettesFin > 0 && <SubtotalRow label="Total dettes financières" liasse="2051 · FJ" montant={totalDettesFin} />}

              {/* Dettes d'exploitation */}
              <GroupHeader label="Dettes d'exploitation" liasse="Formulaire 2051" />
              <AutoRow label="Dettes fournisseurs" compte="(40)"    liasse="2051 · FE" montant={bilanAuto.dettes_fournisseurs} />
              <AutoRow label="TVA à décaisser"     compte="(44551)" liasse="2051 · FF" montant={bilanAuto.tva_a_decaisser} />
              <AutoRow label="Découvert bancaire"  compte="(564)"   liasse="2051 · FB" montant={bilanAuto.decouvert} />
              {totalDettesExpl === 0 && (
                <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune dette d'exploitation.</td></tr>
              )}
              <SubtotalRow label="Total dettes d'exploitation" liasse="2051 · FJ" montant={totalDettesExpl} />
            </tbody>
            <tfoot>
              <SubtotalRow label="TOTAL PASSIF" liasse="2051 · FL" montant={totalPassif} bold />
            </tfoot>
          </table></div>
        </div>
      </div>

      {/* ── Equilibre box ── */}
      <div style={{
        marginTop: 24, padding: '16px 20px', borderRadius: 2,
        border: `2px solid ${equilibre ? '#16a34a' : '#dc2626'}`,
        background: equilibre ? '#f0fdf4' : '#fff5f5',
        fontFamily: 'Courier Prime,monospace',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: equilibre ? '#15803d' : '#dc2626' }}>
            {equilibre ? '✓ Bilan équilibré — Actif = Passif' : `⚠️ Écart de ${formatEur(Math.abs(ecart))} — vérifiez les saisies`}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
            <span>Total Actif : <strong>{formatEur(totalActif)}</strong></span>
            <span>Total Passif : <strong>{formatEur(totalPassif)}</strong></span>
          </div>
        </div>
        {!equilibre && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#7f1d1d' }}>
            {ecart > 0 ? `L'actif est supérieur au passif de ${formatEur(ecart)}. Vérifiez le capital, les emprunts ou les immobilisations.`
                       : `Le passif est supérieur à l'actif de ${formatEur(-ecart)}. Vérifiez les saisies manuelles ou les transactions manquantes.`}
          </div>
        )}
      </div>

      <p style={{ marginTop: 12, fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)', lineHeight: 1.7 }}>
        Les lignes <em>auto</em> sont calculées depuis vos transactions sur la période {debut} → {fin}.
        Capital, emprunts, C/C associés et immobilisations sont à saisir manuellement — les valeurs sont conservées par année.
        TVA collectée : {formatEur(bilanAuto.tva_collectee)} · TVA déductible : {formatEur(bilanAuto.tva_deductible)}.
      </p>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'resultat' | 'bilan'
const LS_EXERCICE = 'exercice_params'

export default function ExercicePage() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [debut, setDebut]       = useState(`${new Date().getFullYear()}-01-01`)
  const [fin, setFin]           = useState(today())
  const [tab, setTab]           = useState<Tab>('resultat')
  const [activePreset, setActivePreset] = useState<number | null>(0)

  // Restore from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_EXERCICE) ?? 'null')
      if (saved?.debut && saved?.fin) {
        setDebut(saved.debut); setFin(saved.fin)
        if (saved.tab) setTab(saved.tab)
        if (saved.activePreset !== undefined) setActivePreset(saved.activePreset)
      }
    } catch { /* ignore */ }
  }, [])

  function persist(next: { debut: string; fin: string; tab: Tab; activePreset: number | null }) {
    try { localStorage.setItem(LS_EXERCICE, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const ps = presets()

  function applyPreset(i: number) {
    const p = ps[i]
    setDebut(p.debut); setFin(p.fin); setActivePreset(i)
    persist({ debut: p.debut, fin: p.fin, tab, activePreset: i })
  }

  function handleDebut(v: string) {
    setDebut(v); setActivePreset(null)
    persist({ debut: v, fin, tab, activePreset: null })
  }
  function handleFin(v: string) {
    setFin(v); setActivePreset(null)
    persist({ debut, fin: v, tab, activePreset: null })
  }
  function handleTab(t: Tab) {
    setTab(t)
    persist({ debut, fin, tab: t, activePreset })
  }

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
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const pnl      = useMemo(() => computePnL(factures, depenses, debut, fin),      [factures, depenses, debut, fin])
  const bilanAuto = useMemo(() => computeBilanAuto(factures, depenses, debut, fin), [factures, depenses, debut, fin])

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Comptes annuels</h1>
          <p className="dash-subtitle">Compte de résultat & Bilan — PCG règlement ANC n°2014-03</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" className="dash-filter-input" value={debut} onChange={e => handleDebut(e.target.value)} />
          <span style={{ color: 'var(--pencil)', fontSize: 13 }}>→</span>
          <input type="date" className="dash-filter-input" value={fin}   onChange={e => handleFin(e.target.value)} />
        </div>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {ps.map((p, i) => (
          <button key={p.label}
            className={`dash-btn-ghost ${activePreset === i ? 'dash-btn-ghost-active' : ''}`}
            style={{ fontSize: 12, padding: '6px 12px', fontWeight: activePreset === i ? 700 : undefined, borderColor: activePreset === i ? 'var(--ink)' : undefined }}
            onClick={() => applyPreset(i)}>{p.label}</button>
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
            <button className={`dash-tab ${tab === 'resultat' ? 'dash-tab-active' : ''}`} onClick={() => handleTab('resultat')}>
              Compte de résultat
            </button>
            <button className={`dash-tab ${tab === 'bilan' ? 'dash-tab-active' : ''}`} onClick={() => handleTab('bilan')}>
              Bilan simplifié
            </button>
          </div>

          {/* ── Compte de résultat ────────────────────────────────────────── */}
          {tab === 'resultat' && (
            <div className="dash-section">
              <div className="dash-table-wrap"><table className="dash-table">
                <tbody>
                  <tr style={{ background: 'var(--offwhite)' }}>
                    <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Produits — Chiffre d&apos;affaires HT</span>
                      <Ref v="Formulaire 2052" />
                    </td>
                  </tr>
                  {Object.entries(pnl.produits).map(([cat, montant]) => (
                    <tr key={cat}>
                      <td style={{ paddingLeft: 24 }}>{cat}</td>
                      <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(montant)}</td>
                    </tr>
                  ))}
                  {Object.keys(pnl.produits).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucun produit.</td></tr>}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--ink)' }}>
                    <td>Total produits <Ref v="2052 · FJ" /></td>
                    <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_produits)}</td>
                  </tr>

                  <tr style={{ background: 'var(--offwhite)' }}>
                    <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Charges — Dépenses HT</span>
                      <Ref v="Formulaire 2052" />
                    </td>
                  </tr>
                  {Object.entries(pnl.charges).map(([cat, montant]) => (
                    <tr key={cat}>
                      <td style={{ paddingLeft: 24 }}>{cat}</td>
                      <td className="right" style={{ color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}>{formatEur(montant)}</td>
                    </tr>
                  ))}
                  {Object.keys(pnl.charges).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucune charge.</td></tr>}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--ink)' }}>
                    <td>Total charges <Ref v="2052 · GM" /></td>
                    <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_charges)}</td>
                  </tr>

                  <tr style={{ fontWeight: 700, fontFamily: 'Courier Prime,monospace', background: pnl.resultat >= 0 ? '#f0fdf4' : '#fff5f5' }}>
                    <td style={{ padding: '14px 12px', fontSize: 15 }}>
                      Résultat net de l&apos;exercice {pnl.resultat >= 0 ? '(120)' : '(129)'}
                      <Ref v="2053 · KG/KH" />
                    </td>
                    <td className="right" style={{ padding: '14px 12px', fontSize: 15, color: pnl.resultat >= 0 ? '#15803d' : '#dc2626' }}>
                      {formatEur(pnl.resultat)}
                    </td>
                  </tr>
                </tbody>
              </table></div>
              <p style={{ marginTop: 12, fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)' }}>
                Les mouvements de capitaux (Cl. 1) et immobilisations (Cl. 2) n'apparaissent pas dans le compte de résultat — ils figurent au Bilan.
              </p>
            </div>
          )}

          {/* ── Bilan ─────────────────────────────────────────────────────── */}
          {tab === 'bilan' && (
            <BilanTab debut={debut} fin={fin} pnl={pnl} bilanAuto={bilanAuto} />
          )}
        </>
      )}
    </div>
  )
}
