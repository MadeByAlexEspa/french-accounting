'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'
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

// ── Category helpers ──────────────────────────────────────────────────────────

function catCode(cat: string) { return (cat ?? '').split(' ')[0] }

// Cl. 1 (capitaux), Cl. 2 (immobilisations), 455 (CCA), 58 (virements internes)
function isBilanCat(cat: string) {
  const c = catCode(cat)
  return /^[12]/.test(c) || c.startsWith('455') || c.startsWith('58')
}
function isImmobi(cat: string) { return /^2/.test(catCode(cat)) }
function isImmobiIncorp(cat: string) { return /^(20|201|2051|2052)/.test(catCode(cat)) }
// Cl. 21-29 that are not 2051/2052: corporelles + terrains/constructions
function isImmobiCorp(cat: string) { return isImmobi(cat) && !isImmobiIncorp(cat) }

function isCapital(cat: string)       { return catCode(cat).startsWith('101') }
function isCompteExploit(cat: string) { return catCode(cat).startsWith('108') }
function isEmprunt(cat: string)       { return catCode(cat).startsWith('164') }
function isCCA(cat: string)           { return catCode(cat).startsWith('455') }

// ── P&L computation (Cl. 6 / 7 only — excludes balance-sheet flows) ───────────

interface PnL {
  produits: Record<string, number>
  charges: Record<string, number>
  total_produits: number
  total_charges: number
  resultat: number
}

function computePnL(factures: Facture[], depenses: Depense[], debut: string, fin: string): PnL {
  const ff = factures.filter(f => f.date >= debut && f.date <= fin && !isBilanCat(f.categorie))
  const fd = depenses.filter(d => d.date >= debut && d.date <= fin && !isBilanCat(d.categorie) && !isImmobi(d.categorie))
  const produits: Record<string, number> = {}
  ff.forEach(f => { produits[f.categorie] = round2((produits[f.categorie] ?? 0) + f.montant_ht) })
  const charges: Record<string, number> = {}
  fd.forEach(d => { charges[d.categorie] = round2((charges[d.categorie] ?? 0) + d.montant_ht) })
  const total_produits = round2(Object.values(produits).reduce((s, v) => s + v, 0))
  const total_charges  = round2(Object.values(charges).reduce((s, v) => s + v, 0))
  return { produits, charges, total_produits, total_charges, resultat: round2(total_produits - total_charges) }
}

// ── Bilan computation from transactions ───────────────────────────────────────

interface BilanData {
  // Actif immobilisé
  imm_incorp: number
  imm_corp: number
  // Actif circulant
  creances_clients: number
  credit_tva: number
  disponibilites: number
  decouvert: number
  // Capitaux propres
  capital: number
  compte_exploit: number
  report_a_nouveau: number
  resultat: number
  // Dettes financières
  emprunts: number
  cca: number
  // Dettes d'exploitation
  dettes_fournisseurs: number
  tva_a_decaisser: number
  // Debug
  tva_collectee: number
  tva_deductible: number
}

function computeBilan(factures: Facture[], depenses: Depense[], debut: string, fin: string, resultat: number): BilanData {
  // Cumulative: all transactions up to fin (balance sheet snapshot)
  const allF = factures.filter(f => f.date <= fin)
  const allD = depenses.filter(d => d.date <= fin)
  // Period: current exercise (P&L and working capital)
  const pF = factures.filter(f => f.date >= debut && f.date <= fin)
  const pD = depenses.filter(d => d.date >= debut && d.date <= fin)

  // ── Actif immobilisé — paid Cl.2 depenses, cumulative ──
  const imm_incorp = round2(allD.filter(d => isImmobiIncorp(d.categorie) && d.statut === 'payee').reduce((s, d) => s + d.montant_ht, 0))
  const imm_corp   = round2(allD.filter(d => isImmobiCorp(d.categorie)   && d.statut === 'payee').reduce((s, d) => s + d.montant_ht, 0))

  // ── Disponibilités — all paid cash flows, cumulative ──
  const cashIn  = allF.filter(f => f.statut === 'payee').reduce((s, f) => s + f.montant_ttc, 0)
  const cashOut = allD.filter(d => d.statut === 'payee').reduce((s, d) => s + d.montant_ttc, 0)
  const treso = round2(cashIn - cashOut)

  // ── Créances clients — unpaid operating factures, period ──
  const creances_clients = round2(pF.filter(f => f.statut === 'en_attente' && !isBilanCat(f.categorie)).reduce((s, f) => s + f.montant_ttc, 0))

  // ── TVA — period ──
  const tva_collectee  = round2(pF.reduce((s, f) => s + f.montant_tva, 0))
  const tva_deductible = round2(pD.reduce((s, d) => s + d.montant_tva, 0))
  const tva_net = round2(tva_collectee - tva_deductible)

  // ── Capitaux propres — cumulative ──
  const capital = round2(allF.filter(f => isCapital(f.categorie)).reduce((s, f) => s + f.montant_ht, 0))
  const apports  = allF.filter(f => isCompteExploit(f.categorie)).reduce((s, f) => s + f.montant_ht, 0)
  const prelev   = allD.filter(d => isCompteExploit(d.categorie)).reduce((s, d) => s + d.montant_ht, 0)
  const compte_exploit = round2(apports - prelev)

  // Report à nouveau: cumulated P&L result BEFORE current period
  const prevF = factures.filter(f => f.date < debut && !isBilanCat(f.categorie))
  const prevD = depenses.filter(d => d.date < debut && !isBilanCat(d.categorie) && !isImmobi(d.categorie))
  const report_a_nouveau = round2(
    prevF.reduce((s, f) => s + f.montant_ht, 0) -
    prevD.reduce((s, d) => s + d.montant_ht, 0)
  )

  // ── Dettes financières — net cumulative ──
  const emprunts_rec = allF.filter(f => isEmprunt(f.categorie)).reduce((s, f) => s + f.montant_ht, 0)
  const emprunts_rem = allD.filter(d => isEmprunt(d.categorie)).reduce((s, d) => s + d.montant_ht, 0)
  const emprunts = round2(emprunts_rec - emprunts_rem)

  const cca_rec = allF.filter(f => isCCA(f.categorie)).reduce((s, f) => s + f.montant_ht, 0)
  const cca_rem = allD.filter(d => isCCA(d.categorie)).reduce((s, d) => s + d.montant_ht, 0)
  const cca = round2(cca_rec - cca_rem)

  // ── Dettes fournisseurs — unpaid operating depenses, period ──
  const dettes_fournisseurs = round2(pD.filter(d => d.statut === 'en_attente' && !isBilanCat(d.categorie) && !isImmobi(d.categorie)).reduce((s, d) => s + d.montant_ttc, 0))

  return {
    imm_incorp, imm_corp,
    creances_clients, credit_tva: tva_net < 0 ? -tva_net : 0,
    disponibilites: treso > 0 ? treso : 0, decouvert: treso < 0 ? -treso : 0,
    capital, compte_exploit, report_a_nouveau, resultat,
    emprunts, cca,
    dettes_fournisseurs, tva_a_decaisser: tva_net > 0 ? tva_net : 0,
    tva_collectee, tva_deductible,
  }
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
      <td colSpan={2} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2,
        textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        {liasse && <Ref v={liasse} />}
      </td>
    </tr>
  )
}

function BilanRow({ label, compte, liasse, montant, positive, hide0 }: {
  label: string; compte?: string; liasse?: string; montant: number; positive?: boolean; hide0?: boolean
}) {
  if (hide0 && montant === 0) return null
  const color = positive !== undefined ? (montant >= 0 ? (positive ? '#15803d' : '#dc2626') : '#dc2626') : undefined
  return (
    <tr>
      <td style={{ paddingLeft: 24 }}>
        {compte && <span style={{ fontSize: 10, fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)', marginRight: 6 }}>{compte}</span>}
        {label}
        {liasse && <Ref v={liasse} />}
      </td>
      <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color }}>{formatEur(montant)}</td>
    </tr>
  )
}

function SubtotalRow({ label, liasse, montant, bold }: { label: string; liasse?: string; montant: number; bold?: boolean }) {
  return (
    <tr className="no-row-hover" style={{ borderTop: '1px solid var(--rule)', background: bold ? 'var(--ink)' : undefined }}>
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

function BilanTab({ debut, fin, bilan }: { debut: string; fin: string; bilan: BilanData }) {
  const totalImmobi     = round2(bilan.imm_incorp + bilan.imm_corp)
  const totalCirculant  = round2(bilan.creances_clients + bilan.credit_tva + bilan.disponibilites)
  const totalActif      = round2(totalImmobi + totalCirculant)

  const totalCapPropres = round2(bilan.capital + bilan.compte_exploit + bilan.report_a_nouveau + bilan.resultat)
  const totalDettesFin  = round2(bilan.emprunts + bilan.cca)
  const totalDettesExpl = round2(bilan.dettes_fournisseurs + bilan.tva_a_decaisser + bilan.decouvert)
  const totalPassif     = round2(totalCapPropres + totalDettesFin + totalDettesExpl)

  const ecart    = round2(totalActif - totalPassif)
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
              <BilanRow label="Immobilisations incorporelles (net)" compte="(20x)" liasse="2050 · AU" montant={bilan.imm_incorp} hide0 />
              <BilanRow label="Immobilisations corporelles (net)"   compte="(21x)" liasse="2050 · BP" montant={bilan.imm_corp}   hide0 />
              {totalImmobi === 0
                ? <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune immobilisation (catégories 20x, 21x).</td></tr>
                : <SubtotalRow label="Total actif immobilisé" liasse="2050 · BV" montant={totalImmobi} />}

              {/* Actif circulant */}
              <GroupHeader label="Actif circulant" liasse="Formulaire 2050" />
              <BilanRow label="Créances clients"        compte="(41)"    liasse="2050 · CT" montant={bilan.creances_clients} hide0 />
              <BilanRow label="Crédit de TVA"           compte="(44567)" liasse="2050 · CW" montant={bilan.credit_tva}       hide0 />
              <BilanRow label="Disponibilités – Banque" compte="(512)"   liasse="2050 · DB" montant={bilan.disponibilites}   hide0 />
              {totalCirculant === 0 && <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucun actif circulant.</td></tr>}
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
              <BilanRow label="Capital social"        compte="(101)" liasse="2051 · DA" montant={bilan.capital}         hide0 />
              <BilanRow label="Compte exploitant"     compte="(108)" liasse="2051 · DH" montant={bilan.compte_exploit}  hide0 />
              <BilanRow label="Report à nouveau"      compte="(11)"  liasse="2051 · DG" montant={bilan.report_a_nouveau} hide0 />
              <BilanRow
                label={bilan.resultat >= 0 ? 'Résultat de l\'exercice (bénéfice)' : 'Résultat de l\'exercice (déficit)'}
                compte={bilan.resultat >= 0 ? '(120)' : '(129)'}
                liasse="2051 · DI/DJ"
                montant={bilan.resultat}
                positive={bilan.resultat >= 0}
              />
              {totalCapPropres === 0 && <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune entrée (101, 108…).</td></tr>}
              <SubtotalRow label="Total capitaux propres" liasse="2051 · DM" montant={totalCapPropres} />

              {/* Dettes financières */}
              {totalDettesFin > 0 && (
                <>
                  <GroupHeader label="Dettes financières" liasse="Formulaire 2051" />
                  <BilanRow label="Emprunts bancaires"          compte="(164)" liasse="2051 · FB" montant={bilan.emprunts} hide0 />
                  <BilanRow label="Comptes courants associés"   compte="(455)" liasse="2051 · FC" montant={bilan.cca}      hide0 />
                  <SubtotalRow label="Total dettes financières" liasse="2051 · FJ" montant={totalDettesFin} />
                </>
              )}

              {/* Dettes d'exploitation */}
              <GroupHeader label="Dettes d'exploitation" liasse="Formulaire 2051" />
              <BilanRow label="Dettes fournisseurs" compte="(40)"    liasse="2051 · FE" montant={bilan.dettes_fournisseurs} hide0 />
              <BilanRow label="TVA à décaisser"     compte="(44551)" liasse="2051 · FF" montant={bilan.tva_a_decaisser}    hide0 />
              <BilanRow label="Découvert bancaire"  compte="(564)"   liasse="2051 · FB" montant={bilan.decouvert}          hide0 />
              {totalDettesExpl === 0 && <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune dette d'exploitation.</td></tr>}
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
            {equilibre
              ? <><CheckCircle size={14} style={{ color: '#16a34a', verticalAlign: 'middle', marginRight: 4 }} /> Bilan équilibré — Actif = Passif</>
              : <><AlertTriangle size={14} style={{ color: '#dc2626', verticalAlign: 'middle', marginRight: 4 }} /> Écart de {formatEur(Math.abs(ecart))}</>}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
            <span>Total Actif : <strong>{formatEur(totalActif)}</strong></span>
            <span>Total Passif : <strong>{formatEur(totalPassif)}</strong></span>
          </div>
        </div>
        {!equilibre && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#7f1d1d' }}>
            {ecart > 0
              ? `L'actif dépasse le passif de ${formatEur(ecart)}. Vérifiez vos saisies de capital (101), emprunts (164) ou immobilisations (2x).`
              : `Le passif dépasse l'actif de ${formatEur(-ecart)}. Des transactions pourraient manquer ou être mal catégorisées.`}
          </div>
        )}
      </div>

      <p style={{ marginTop: 12, fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)', lineHeight: 1.7 }}>
        Calculé depuis vos transactions · Période {debut} – {fin} pour le résultat et le fonds de roulement · Cumulatif depuis l'origine pour le bilan patrimonial.
        TVA collectée {formatEur(bilan.tva_collectee)} · TVA déductible {formatEur(bilan.tva_deductible)}.
        Pour équilibrer le bilan, catégorisez apports en capital (101), emprunts (164), immobilisations (2051, 2052, 213…).
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
  function handleDebut(v: string) { setDebut(v); setActivePreset(null); persist({ debut: v, fin, tab, activePreset: null }) }
  function handleFin(v: string)   { setFin(v);   setActivePreset(null); persist({ debut, fin: v, tab, activePreset: null }) }
  function handleTab(t: Tab)      { setTab(t); persist({ debut, fin, tab: t, activePreset }) }

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

  const pnl   = useMemo(() => computePnL(factures, depenses, debut, fin),            [factures, depenses, debut, fin])
  const bilan = useMemo(() => computeBilan(factures, depenses, debut, fin, pnl.resultat), [factures, depenses, debut, fin, pnl.resultat])

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Comptes annuels</h1>
          <p className="dash-subtitle">Compte de résultat & Bilan — PCG règlement ANC n°2014-03</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="dash-btn-ghost"
            onClick={() => { window.location.href = '/api/fec/' + debut.slice(0, 4) }}
          >
            ↓ FEC
          </button>
          <button className="dash-btn-ghost" onClick={() => window.print()}>
            ↓ Imprimer / PDF
          </button>
          <input type="date" className="dash-filter-input" value={debut} onChange={e => handleDebut(e.target.value)} />
          <ChevronRight size={13} style={{ color: 'var(--pencil)' }} />
          <input type="date" className="dash-filter-input" value={fin}   onChange={e => handleFin(e.target.value)} />
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {ps.map((p, i) => (
          <button key={p.label}
            className="dash-btn-ghost"
            style={{ fontSize: 12, padding: '6px 12px', fontWeight: activePreset === i ? 700 : undefined, borderColor: activePreset === i ? 'var(--ink)' : undefined }}
            onClick={() => applyPreset(i)}>{p.label}</button>
        ))}
      </div>

      {loading && <div className="dash-loading">Chargement…</div>}
      {error   && <div className="dash-error">{error}</div>}

      {!loading && (
        <>
          <div className="dash-kpi-grid">
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Produits HT</p>
              <p className="dash-kpi-value">{formatEur(pnl.total_produits)}</p>
              <p className="dash-kpi-sub">{debut} – {fin}</p>
            </div>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Charges HT</p>
              <p className="dash-kpi-value">{formatEur(pnl.total_charges)}</p>
              <p className="dash-kpi-sub">{debut} – {fin}</p>
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

          <div className="dash-tabs no-print">
            <button className={`dash-tab ${tab === 'resultat' ? 'dash-tab-active' : ''}`} onClick={() => handleTab('resultat')}>Compte de résultat</button>
            <button className={`dash-tab ${tab === 'bilan' ? 'dash-tab-active' : ''}`} onClick={() => handleTab('bilan')}>Bilan simplifié</button>
          </div>

          {/* ── Compte de résultat ──────────────────────────────────────── */}
          {tab === 'resultat' && (
            <div className="dash-section">
              <div className="dash-table-wrap"><table className="dash-table">
                <tbody>
                  <tr style={{ background: 'var(--offwhite)' }}>
                    <td colSpan={2} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2,
                      textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px',
                      display: 'flex', justifyContent: 'space-between' }}>
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
                  {Object.keys(pnl.produits).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucun produit sur cette période.</td></tr>}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--ink)' }}>
                    <td>Total produits <Ref v="2052 · FJ" /></td>
                    <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_produits)}</td>
                  </tr>

                  <tr style={{ background: 'var(--offwhite)' }}>
                    <td colSpan={2} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2,
                      textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px',
                      display: 'flex', justifyContent: 'space-between' }}>
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
                  {Object.keys(pnl.charges).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucune charge sur cette période.</td></tr>}
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
                Les mouvements de capitaux (Cl. 1), immobilisations (Cl. 2) et virements internes (58) sont exclus du compte de résultat — ils figurent au Bilan.
              </p>
            </div>
          )}

          {/* ── Bilan ───────────────────────────────────────────────────── */}
          {tab === 'bilan' && <BilanTab debut={debut} fin={fin} bilan={bilan} />}
        </>
      )}
    </div>
  )
}
