'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import type { Facture, Depense } from '@/lib/types/database'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function round2(n: number) { return Math.round(n * 100) / 100 }
function today() { return new Date().toISOString().slice(0, 10) }

function formatDateFr(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function presets() {
  const y = new Date().getFullYear()
  const todayStr = new Date().toISOString().slice(0, 10)
  return [
    { label: 'Cette année',      debut: `${y}-01-01`,   fin: todayStr },
    { label: 'Année complète',   debut: `${y}-01-01`,   fin: `${y}-12-31` },
    { label: 'Année précédente', debut: `${y-1}-01-01`, fin: `${y-1}-12-31` },
    { label: 'S1',               debut: `${y}-01-01`,   fin: `${y}-06-30` },
    { label: 'S2',               debut: `${y}-07-01`,   fin: `${y}-12-31` },
    { label: 'T1',               debut: `${y}-01-01`,   fin: `${y}-03-31` },
    { label: 'T2',               debut: `${y}-04-01`,   fin: `${y}-06-30` },
    { label: 'T3',               debut: `${y}-07-01`,   fin: `${y}-09-30` },
    { label: 'T4',               debut: `${y}-10-01`,   fin: `${y}-12-31` },
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

// ── Export CSV (#4) ───────────────────────────────────────────────────────────

function exportCSV(pnl: PnL, debut: string, fin: string) {
  const BOM = '﻿'
  const lines: string[] = [
    `# Compte-Pote — Exercice ${debut} au ${fin}`,
    'Type;Catégorie;Montant HT',
  ]
  Object.entries(pnl.produits).forEach(([cat, montant]) =>
    lines.push(`Produit;${cat};${montant.toFixed(2)}`)
  )
  lines.push(`Total produits;;${pnl.total_produits.toFixed(2)}`)
  Object.entries(pnl.charges).forEach(([cat, montant]) =>
    lines.push(`Charge;${cat};${montant.toFixed(2)}`)
  )
  lines.push(`Total charges;;${pnl.total_charges.toFixed(2)}`)
  lines.push(`Résultat net;;${pnl.resultat.toFixed(2)}`)

  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `compte-resultat-${debut}-${fin}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Delta helper (Feature #7) ─────────────────────────────────────────────────

function DeltaCell({ n, n1 }: { n: number; n1: number }) {
  if (n === 0 && n1 === 0) {
    return <td className="right dash-delta-nil">—</td>
  }
  const pct = Math.round(((n - n1) / (n1 || 1)) * 1000) / 10
  const cls = pct > 0 ? 'dash-delta-pos' : pct < 0 ? 'dash-delta-neg' : 'dash-delta-nil'
  const label = pct > 0 ? `+${pct} %` : pct < 0 ? `${pct} %` : '—'
  return <td className={`right ${cls}`}>{label}</td>
}

// ── Bilan sub-components ──────────────────────────────────────────────────────

function Ref({ v, show = true }: { v: string; show?: boolean }) {
  if (!show) return null
  return (
    <span style={{ marginLeft: 8, fontSize: 10, fontFamily: 'Courier Prime,monospace', color: '#6b7280',
      background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 2, padding: '1px 5px', whiteSpace: 'nowrap' }}>
      {v}
    </span>
  )
}

function GroupHeader({ label, liasse, showRef }: { label: string; liasse?: string; showRef?: boolean }) {
  return (
    <tr className="dash-table-group-header">
      <td colSpan={2} style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{label}</span>
          {liasse && <Ref v={liasse} show={showRef} />}
        </div>
      </td>
    </tr>
  )
}

function BilanRow({ label, compte, liasse, montant, positive, hide0, showCompte }: {
  label: string; compte?: string; liasse?: string; montant: number; positive?: boolean; hide0?: boolean; showCompte?: boolean
}) {
  if (hide0 && montant === 0) return null
  const color = positive !== undefined ? (montant >= 0 ? (positive ? '#15803d' : '#dc2626') : '#dc2626') : undefined
  return (
    <tr>
      <td style={{ paddingLeft: 24 }}>
        {compte && showCompte && <span style={{ fontSize: 10, fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)', marginRight: 6 }}>{compte}</span>}
        {label}
        {liasse && <Ref v={liasse} show={showCompte} />}
      </td>
      <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color }}>{formatEur(montant)}</td>
    </tr>
  )
}

function SubtotalRow({ label, liasse, montant, bold, showRef }: { label: string; liasse?: string; montant: number; bold?: boolean; showRef?: boolean }) {
  return (
    <tr className="no-row-hover" style={{ borderTop: '1px solid var(--rule)', background: bold ? 'var(--ink)' : undefined }}>
      <td style={{ padding: '8px 12px', fontWeight: bold ? 700 : 600, color: bold ? '#fff' : undefined }}>
        {label}
        {liasse && (bold
          ? <span style={{ marginLeft: 8, fontSize: 10, fontFamily: 'Courier Prime,monospace', color: '#d1d5db',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 2, padding: '1px 5px' }}>{showRef ? liasse : ''}</span>
          : <Ref v={liasse} show={showRef} />
        )}
      </td>
      <td className="right" style={{ fontFamily: 'Courier Prime,monospace', fontWeight: bold ? 700 : 600, color: bold ? '#fff' : undefined }}>
        {formatEur(montant)}
      </td>
    </tr>
  )
}

// ── Résumé exécutif (#6) ──────────────────────────────────────────────────────

function ExecSummary({ pnl, debut, fin }: { pnl: PnL; debut: string; fin: string }) {
  if (pnl.total_produits === 0 && pnl.total_charges === 0) return null
  const marge = pnl.total_produits > 0 ? Math.round((pnl.resultat / pnl.total_produits) * 100) : null
  const text = pnl.resultat >= 0
    ? `Sur la période ${formatDateFr(debut)} – ${formatDateFr(fin)}, vous avez réalisé ${formatEur(pnl.total_produits)} de chiffre d'affaires pour ${formatEur(pnl.resultat)} de bénéfice${marge !== null ? ` (marge ${marge} %)` : ''}.`
    : `Sur la période ${formatDateFr(debut)} – ${formatDateFr(fin)}, vos charges (${formatEur(pnl.total_charges)}) dépassent vos produits (${formatEur(pnl.total_produits)}) — déficit de ${formatEur(Math.abs(pnl.resultat))}.`
  return (
    <div className="dash-exec-summary">
      <span className="dash-exec-icon">{pnl.resultat >= 0 ? '↗' : '↘'}</span>
      <p className="dash-exec-text">{text}</p>
    </div>
  )
}

// ── DrillDrawer (Feature #8) ──────────────────────────────────────────────────

function DrillDrawer({
  cat, debut, fin, factures, depenses, onClose
}: {
  cat: string; debut: string; fin: string
  factures: Facture[]; depenses: Depense[]; onClose: () => void
}) {
  const rows = useMemo(() => {
    const ff = factures
      .filter(f => f.date >= debut && f.date <= fin && f.categorie === cat)
      .map(f => ({ id: f.id, date: f.date, tiers: f.client, montant_ht: f.montant_ht, statut: f.statut, kind: 'facture' as const }))
    const dd = depenses
      .filter(d => d.date >= debut && d.date <= fin && d.categorie === cat)
      .map(d => ({ id: d.id, date: d.date, tiers: d.fournisseur, montant_ht: d.montant_ht, statut: d.statut, kind: 'depense' as const }))
    return [...ff, ...dd].sort((a, b) => b.date.localeCompare(a.date))
  }, [cat, debut, fin, factures, depenses])

  const total = round2(rows.reduce((s, r) => s + r.montant_ht, 0))

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 400 }}
      />
      {/* Drawer */}
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: 'var(--paper)', borderLeft: '1px solid var(--rule)',
        zIndex: 401, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--pencil)', marginBottom: 4 }}>Détail</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{cat}</div>
            <div style={{ fontSize: 12, color: 'var(--pencil)', marginTop: 4 }}>{debut} – {fin} · {rows.length} transaction{rows.length > 1 ? 's' : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--pencil)', padding: '4px 6px', lineHeight: 1 }} aria-label="Fermer">✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 20px' }}>
          {rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
              Aucune transaction sur cette période.
            </div>
          ) : (
            <table className="dash-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Tiers</th>
                  <th scope="col" className="right">Montant HT</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.tiers}</td>
                    <td className="right" style={{ fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>{formatEur(r.montant_ht)}</td>
                    <td>
                      <span className={`dash-badge ${r.statut === 'payee' ? 'dash-badge-green' : 'dash-badge-orange'}`} style={{ fontSize: 10 }}>
                        {r.statut === 'payee' ? 'Payée' : 'En attente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)' }}>Total HT</span>
          <span style={{ fontFamily: 'Courier Prime,monospace', fontWeight: 700, fontSize: 15 }}>{formatEur(total)}</span>
        </div>
      </aside>
    </>
  )
}

// ── Bilan Tab ─────────────────────────────────────────────────────────────────

function BilanTab({ debut, fin, bilan, vueComptable }: { debut: string; fin: string; bilan: BilanData; vueComptable: boolean }) {
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
              <GroupHeader label="Actif immobilisé" liasse="Formulaire 2050" showRef={vueComptable} />
              <BilanRow label="Immobilisations incorporelles (net)" compte="(20x)" liasse="2050 · AU" montant={bilan.imm_incorp} hide0 showCompte={vueComptable} />
              <BilanRow label="Immobilisations corporelles (net)"   compte="(21x)" liasse="2050 · BP" montant={bilan.imm_corp}   hide0 showCompte={vueComptable} />
              {totalImmobi === 0
                ? <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune immobilisation (catégories 20x, 21x).</td></tr>
                : <SubtotalRow label="Total actif immobilisé" liasse="2050 · BV" montant={totalImmobi} showRef={vueComptable} />}

              {/* Actif circulant */}
              <GroupHeader label="Actif circulant" liasse="Formulaire 2050" showRef={vueComptable} />
              <BilanRow label="Créances clients"        compte="(41)"    liasse="2050 · CT" montant={bilan.creances_clients} hide0 showCompte={vueComptable} />
              <BilanRow label="Crédit de TVA"           compte="(44567)" liasse="2050 · CW" montant={bilan.credit_tva}       hide0 showCompte={vueComptable} />
              <BilanRow label="Disponibilités – Banque" compte="(512)"   liasse="2050 · DB" montant={bilan.disponibilites}   hide0 showCompte={vueComptable} />
              {totalCirculant === 0 && <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucun actif circulant.</td></tr>}
              <SubtotalRow label="Total actif circulant" liasse="2050 · DH" montant={totalCirculant} showRef={vueComptable} />
            </tbody>
            <tfoot>
              <SubtotalRow label="TOTAL ACTIF" liasse="2050 · DP" montant={totalActif} bold showRef={vueComptable} />
            </tfoot>
          </table></div>
        </div>

        {/* ── PASSIF ── */}
        <div className="dash-ventilation-card">
          <div className="dash-section-title" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>PASSIF</div>
          <div className="dash-table-wrap"><table className="dash-table">
            <tbody>
              {/* Capitaux propres */}
              <GroupHeader label="Capitaux propres" liasse="Formulaire 2051" showRef={vueComptable} />
              <BilanRow label="Capital social"        compte="(101)" liasse="2051 · DA" montant={bilan.capital}         hide0 showCompte={vueComptable} />
              <BilanRow label="Compte exploitant"     compte="(108)" liasse="2051 · DH" montant={bilan.compte_exploit}  hide0 showCompte={vueComptable} />
              <BilanRow label="Report à nouveau"      compte="(11)"  liasse="2051 · DG" montant={bilan.report_a_nouveau} hide0 showCompte={vueComptable} />
              <BilanRow
                label={bilan.resultat >= 0 ? 'Résultat de l\'exercice (bénéfice)' : 'Résultat de l\'exercice (déficit)'}
                compte={bilan.resultat >= 0 ? '(120)' : '(129)'}
                liasse="2051 · DI/DJ"
                montant={bilan.resultat}
                positive={bilan.resultat >= 0}
                showCompte={vueComptable}
              />
              {totalCapPropres === 0 && <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune entrée (101, 108…).</td></tr>}
              <SubtotalRow label="Total capitaux propres" liasse="2051 · DM" montant={totalCapPropres} showRef={vueComptable} />

              {/* Dettes financières */}
              {totalDettesFin > 0 && (
                <>
                  <GroupHeader label="Dettes financières" liasse="Formulaire 2051" showRef={vueComptable} />
                  <BilanRow label="Emprunts bancaires"          compte="(164)" liasse="2051 · FB" montant={bilan.emprunts} hide0 showCompte={vueComptable} />
                  <BilanRow label="Comptes courants associés"   compte="(455)" liasse="2051 · FC" montant={bilan.cca}      hide0 showCompte={vueComptable} />
                  <SubtotalRow label="Total dettes financières" liasse="2051 · FJ" montant={totalDettesFin} showRef={vueComptable} />
                </>
              )}

              {/* Dettes d'exploitation */}
              <GroupHeader label="Dettes d'exploitation" liasse="Formulaire 2051" showRef={vueComptable} />
              <BilanRow label="Dettes fournisseurs" compte="(40)"    liasse="2051 · FE" montant={bilan.dettes_fournisseurs} hide0 showCompte={vueComptable} />
              <BilanRow label="TVA à décaisser"     compte="(44551)" liasse="2051 · FF" montant={bilan.tva_a_decaisser}    hide0 showCompte={vueComptable} />
              <BilanRow label="Découvert bancaire"  compte="(564)"   liasse="2051 · FB" montant={bilan.decouvert}          hide0 showCompte={vueComptable} />
              {totalDettesExpl === 0 && <tr><td colSpan={2} className="dash-empty" style={{ paddingLeft: 24 }}>Aucune dette d'exploitation.</td></tr>}
              <SubtotalRow label="Total dettes d'exploitation" liasse="2051 · FJ" montant={totalDettesExpl} showRef={vueComptable} />
            </tbody>
            <tfoot>
              <SubtotalRow label="TOTAL PASSIF" liasse="2051 · FL" montant={totalPassif} bold showRef={vueComptable} />
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
        Calculé depuis vos transactions · Période {debut} – {fin} pour le résultat et le fonds de roulement · Cumulatif depuis l&apos;origine pour le bilan patrimonial.
        TVA collectée {formatEur(bilan.tva_collectee)} · TVA déductible {formatEur(bilan.tva_deductible)}.
        Pour équilibrer le bilan, catégorisez apports en capital (101), emprunts (164), immobilisations (2051, 2052, 213…).
      </p>
    </>
  )
}

// ── Monthly data (Feature: Tendance tab) ─────────────────────────────────────

interface MonthlyData {
  month: string   // "2025-01"
  label: string   // "Jan"
  produits: number
  charges: number
  resultat: number
}

function computeMonthly(factures: Facture[], depenses: Depense[], debut: string, fin: string): MonthlyData[] {
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  const acc: Record<string, MonthlyData> = {}
  const cur = new Date(debut.slice(0, 7) + '-01T00:00:00')
  const end = new Date(fin.slice(0, 7) + '-01T00:00:00')
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 7)
    acc[key] = { month: key, label: monthNames[cur.getMonth()], produits: 0, charges: 0, resultat: 0 }
    cur.setMonth(cur.getMonth() + 1)
  }
  for (const f of factures) {
    if (f.date < debut || f.date > fin || isBilanCat(f.categorie)) continue
    const key = f.date.slice(0, 7)
    if (acc[key]) acc[key].produits = round2(acc[key].produits + f.montant_ht)
  }
  for (const d of depenses) {
    if (d.date < debut || d.date > fin || isBilanCat(d.categorie) || isImmobi(d.categorie)) continue
    const key = d.date.slice(0, 7)
    if (acc[key]) acc[key].charges = round2(acc[key].charges + d.montant_ht)
  }
  return Object.values(acc)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({ ...m, resultat: round2(m.produits - m.charges) }))
}

function TendanceChart({ monthly }: { monthly: MonthlyData[] }) {
  if (monthly.length === 0) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
      Aucune donnée sur cette période.
    </div>
  )

  const svgW = 680, svgH = 280
  const padL = 72, padR = 20, padT = 20, padB = 48
  const chartW = svgW - padL - padR
  const chartH = svgH - padT - padB

  const maxVal = Math.max(...monthly.flatMap(m => [m.produits, m.charges]), 1)
  const n = monthly.length
  const colW = chartW / n
  const barW = Math.min(colW * 0.35, 22)
  const gap = barW * 0.4

  function toY(v: number) { return padT + chartH * (1 - v / maxVal) }
  function toH(v: number) { return chartH * (v / maxVal) }

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(r => ({
    y: padT + chartH * (1 - r),
    label: formatEur(maxVal * r),
  }))

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={svgW} height={svgH} style={{ display: 'block', margin: '0 auto', fontFamily: 'Inter,sans-serif', fontSize: 11 }}>
        {ticks.map(t => (
          <g key={t.y}>
            <line x1={padL} x2={svgW - padR} y1={t.y} y2={t.y} stroke="#e8e8e4" strokeWidth={1} />
            <text x={padL - 6} y={t.y + 4} textAnchor="end" fill="#4a4a4a" fontSize={9} fontFamily="Courier Prime,monospace">
              {t.label}
            </text>
          </g>
        ))}

        {monthly.map((m, i) => {
          const cx = padL + i * colW + colW / 2
          const xP = cx - gap / 2 - barW
          const xC = cx + gap / 2
          return (
            <g key={m.month}>
              {m.produits > 0 && (
                <rect x={xP} y={toY(m.produits)} width={barW} height={toH(m.produits)}
                  fill="#1a56db" fillOpacity={0.85} rx={2} />
              )}
              {m.charges > 0 && (
                <rect x={xC} y={toY(m.charges)} width={barW} height={toH(m.charges)}
                  fill="#f59e0b" fillOpacity={0.85} rx={2} />
              )}
              <text x={cx} y={svgH - padB + 16} textAnchor="middle" fill="#4a4a4a" fontSize={10}>
                {m.label}
              </text>
              {(i === 0 || m.month.endsWith('-01')) && (
                <text x={cx} y={svgH - padB + 28} textAnchor="middle" fill="#9ca3af" fontSize={9}>
                  {m.month.slice(0, 4)}
                </text>
              )}
            </g>
          )
        })}

        {monthly.length > 1 && (() => {
          const points = monthly.map((m, i) => {
            const cx = padL + i * colW + colW / 2
            const y = toY(Math.max(m.resultat, 0))
            return `${cx},${y}`
          }).join(' ')
          return (
            <polyline points={points} fill="none" stroke="#15803d" strokeWidth={1.5}
              strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />
          )
        })()}

        <g transform={`translate(${padL}, ${svgH - 6})`}>
          <rect width={10} height={10} fill="#1a56db" fillOpacity={0.85} rx={2} y={-10} />
          <text x={14} y={0} fill="#4a4a4a" fontSize={10}>Produits</text>
          <rect x={80} width={10} height={10} fill="#f59e0b" fillOpacity={0.85} rx={2} y={-10} />
          <text x={94} y={0} fill="#4a4a4a" fontSize={10}>Charges</text>
          <line x1={168} x2={178} y1={-5} y2={-5} stroke="#15803d" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={182} y={0} fill="#4a4a4a" fontSize={10}>Résultat</text>
        </g>
      </svg>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'resultat' | 'bilan' | 'tendance'
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

  // Feature #7 — N vs N-1 compare mode
  const [compareMode, setCompareMode] = useState(false)

  // Feature #8 — Drill-down drawer
  const [drillCat, setDrillCat] = useState<string | null>(null)

  // Feature #16 — Ratios de gestion
  const [showRatios, setShowRatios] = useState(false)

  // Sprint 3 — workspace id (needed for annotation persistence)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  // Sprint 3 — Feature C: Annotation d'exercice
  const [annotation, setAnnotation]         = useState('')
  const [annotationSaved, setAnnotationSaved]   = useState(false)
  const [showAnnotation, setShowAnnotation]     = useState(false)
  const [savingAnnotation, setSavingAnnotation] = useState(false)

  // Feature: Exercice clôturé
  const [estCloture, setEstCloture]   = useState(false)
  const [clotureDate, setClotureDate] = useState<string | null>(null)
  const [cloturant, setCloturant]     = useState(false)
  const [userId, setUserId]           = useState<string | null>(null)

  const [vueComptable, setVueComptable] = useState(() => {
    try { return JSON.parse(localStorage.getItem('exercice_vue_comptable') ?? 'false') } catch { return false }
  })

  function toggleVueComptable() {
    const next = !vueComptable
    setVueComptable(next)
    try { localStorage.setItem('exercice_vue_comptable', JSON.stringify(next)) } catch { /* ignore */ }
  }

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
    if (drillCat) setDrillCat(null)
    persist({ debut: p.debut, fin: p.fin, tab, activePreset: i })
  }
  function handleDebut(v: string) {
    setDebut(v); setActivePreset(null)
    if (drillCat) setDrillCat(null)
    persist({ debut: v, fin, tab, activePreset: null })
  }
  function handleFin(v: string) {
    setFin(v); setActivePreset(null)
    if (drillCat) setDrillCat(null)
    persist({ debut, fin: v, tab, activePreset: null })
  }
  function handleTab(t: Tab) { setTab(t); persist({ debut, fin, tab: t, activePreset }) }

  // Sprint 3 — Feature A: year navigation
  function navigateYear(delta: -1 | 1) {
    const d1 = new Date(debut); d1.setFullYear(d1.getFullYear() + delta)
    const d2 = new Date(fin);   d2.setFullYear(d2.getFullYear() + delta)
    const nd = d1.toISOString().slice(0, 10)
    const nf = d2.toISOString().slice(0, 10)
    setDebut(nd); setFin(nf); setActivePreset(null)
    if (drillCat) setDrillCat(null)
    persist({ debut: nd, fin: nf, tab, activePreset: null })
  }

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      setLoading(true); setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setError('Session expirée — rechargez la page.'); return }
        setUserId(user.id)
        const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
        if (!m) { setError('Workspace introuvable.'); return }
        setWorkspaceId(m.workspace_id)
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

  // Sprint 3 — Feature C: load annotation when workspaceId or debut changes
  useEffect(() => {
    if (!workspaceId) return
    const annee = Number(debut.slice(0, 4))
    const supabase = createClient()
    supabase
      .from('exercice_annotations')
      .select('contenu')
      .eq('workspace_id', workspaceId)
      .eq('annee', annee)
      .single()
      .then(({ data }) => {
        setAnnotation(data?.contenu ?? '')
        setAnnotationSaved(false)
      })
  }, [workspaceId, debut])

  // Feature: Exercice clôturé — load status
  useEffect(() => {
    if (!workspaceId) return
    const annee = Number(debut.slice(0, 4))
    const supabase = createClient()
    supabase
      .from('exercice_clotures')
      .select('cloture_le')
      .eq('workspace_id', workspaceId)
      .eq('annee', annee)
      .single()
      .then(({ data }) => {
        setEstCloture(!!data)
        setClotureDate(data?.cloture_le ?? null)
      })
  }, [workspaceId, debut])

  async function cloturerExercice() {
    if (!workspaceId || !userId) return
    if (!window.confirm(`Clôturer l'exercice ${debut.slice(0, 4)} ? Cette action signale la fin de l'exercice comptable.`)) return
    setCloturant(true)
    const supabase = createClient()
    const annee = Number(debut.slice(0, 4))
    await supabase.from('exercice_clotures').insert({
      workspace_id: workspaceId,
      annee,
      cloture_par: userId,
    })
    setEstCloture(true)
    setClotureDate(new Date().toISOString())
    setCloturant(false)
  }

  async function rouvrirExercice() {
    if (!workspaceId) return
    if (!window.confirm(`Rouvrir l'exercice ${debut.slice(0, 4)} ?`)) return
    setCloturant(true)
    const supabase = createClient()
    const annee = Number(debut.slice(0, 4))
    await supabase.from('exercice_clotures')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('annee', annee)
    setEstCloture(false)
    setClotureDate(null)
    setCloturant(false)
  }

  async function saveAnnotation() {
    if (!workspaceId) return
    setSavingAnnotation(true)
    const supabase = createClient()
    const annee = Number(debut.slice(0, 4))
    await supabase.from('exercice_annotations').upsert(
      { workspace_id: workspaceId, annee, contenu: annotation, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id,annee' }
    )
    setAnnotationSaved(true)
    setSavingAnnotation(false)
  }

  const pnl   = useMemo(() => computePnL(factures, depenses, debut, fin),            [factures, depenses, debut, fin])
  const bilan = useMemo(() => computeBilan(factures, depenses, debut, fin, pnl.resultat), [factures, depenses, debut, fin, pnl.resultat])

  // Feature: Tendance mensuelle
  const monthly = useMemo(
    () => computeMonthly(factures, depenses, debut, fin),
    [factures, depenses, debut, fin]
  )

  // Feature #7 — N-1 PnL
  const pnlN1 = useMemo(() => {
    const d1 = new Date(debut); d1.setFullYear(d1.getFullYear() - 1)
    const d2 = new Date(fin);   d2.setFullYear(d2.getFullYear() - 1)
    return computePnL(factures, depenses, d1.toISOString().slice(0, 10), d2.toISOString().slice(0, 10))
  }, [factures, depenses, debut, fin])

  // Sprint 3 — Feature B: projection fin d'année
  const isProjectable = useMemo(() => {
    if (pnl.total_produits === 0) return false
    const y = debut.slice(0, 4)
    if (debut !== `${y}-01-01`) return false
    if (fin >= `${y}-12-31`) return false
    if (debut.slice(0, 4) !== fin.slice(0, 4)) return false
    return true
  }, [debut, fin, pnl.total_produits])

  const projection = useMemo(() => {
    if (!isProjectable) return null
    const y = Number(debut.slice(0, 4))
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
    const totalDays = isLeap ? 366 : 365
    const d1 = new Date(debut + 'T00:00:00')
    const d2 = new Date(fin + 'T00:00:00')
    const elapsed = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
    const factor = totalDays / elapsed
    return {
      produits: round2(pnl.total_produits * factor),
      charges:  round2(pnl.total_charges  * factor),
      resultat: round2(pnl.resultat       * factor),
      elapsed,
      totalDays,
      pct: Math.round((elapsed / totalDays) * 100),
    }
  }, [isProjectable, debut, fin, pnl])

  // Period labels for compare header
  const labelN  = debut.slice(0, 4) === fin.slice(0, 4) ? debut.slice(0, 4) : `${debut.slice(0, 4)}–${fin.slice(0, 4)}`
  const labelN1 = String(Number(debut.slice(0, 4)) - 1)

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Comptes annuels</h1>
          <p className="dash-subtitle">
            {vueComptable
              ? 'Compte de résultat & Bilan — PCG règlement ANC n°2014-03'
              : 'Compte de résultat & Bilan — Vue simplifiée'}
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="dash-btn-ghost"
            onClick={toggleVueComptable}
            style={{ fontSize: 11 }}
            title={vueComptable ? 'Masquer les références fiscales' : 'Afficher les références fiscales (mode comptable)'}
          >
            {vueComptable ? '◆ Vue comptable' : '◇ Vue comptable'}
          </button>
          <button
            className="dash-btn-ghost"
            onClick={() => setCompareMode(v => !v)}
            style={{ fontSize: 11 }}
            title="Comparer avec la même période N-1"
          >
            {compareMode ? '◆ N vs N-1' : '◇ N vs N-1'}
          </button>
          {workspaceId && !estCloture && (
            <button
              className="dash-btn-ghost"
              onClick={cloturerExercice}
              disabled={cloturant}
              style={{ fontSize: 11 }}
              title={`Clôturer l'exercice ${debut.slice(0, 4)}`}
            >
              {cloturant ? '…' : '⊠ Clôturer'}
            </button>
          )}
          <button
            className="dash-btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() => exportCSV(pnl, debut, fin)}
            disabled={loading || pnl.total_produits === 0}
            title="Télécharger le compte de résultat en CSV (compatible Excel)"
            aria-label="Télécharger le compte de résultat en CSV"
          >
            ↓ CSV
          </button>
          <button
            className="dash-btn-ghost"
            aria-label="Télécharger le Fichier des Écritures Comptables (FEC)"
            title="Fichier des Écritures Comptables — requis par l'administration fiscale"
            onClick={() => { window.location.href = '/api/fec/' + debut.slice(0, 4) }}
          >
            ↓ FEC
          </button>
          <button
            className="dash-btn-ghost"
            aria-label="Exporter en PDF (ouvre un nouvel onglet optimisé impression)"
            onClick={() => window.open(`/api/exercice-print?debut=${debut}&fin=${fin}`, '_blank')}
          >
            ↓ Export PDF
          </button>
          <input type="date" className="dash-filter-input" value={debut} onChange={e => handleDebut(e.target.value)} aria-label="Date de début" />
          <ChevronRight size={13} style={{ color: 'var(--pencil)' }} aria-hidden="true" />
          <input type="date" className="dash-filter-input" value={fin}   onChange={e => handleFin(e.target.value)} aria-label="Date de fin" />
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        {ps.map((p, i) => {
          const isFuture = new Date(p.debut) > new Date()
          return (
            <button key={p.label}
              className="dash-btn-ghost"
              style={{
                fontSize: 12, padding: '6px 12px',
                fontWeight: activePreset === i ? 700 : undefined,
                borderColor: activePreset === i ? 'var(--ink)' : undefined,
                opacity: isFuture ? 0.45 : 1,
              }}
              onClick={() => applyPreset(i)}
            >
              {p.label}
            </button>
          )
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            className="dash-btn-ghost"
            onClick={() => navigateYear(-1)}
            style={{ fontSize: 14, padding: '4px 10px' }}
            title="Exercice précédent"
            aria-label="Exercice précédent"
          >
            ←
          </button>
          <button
            className="dash-btn-ghost"
            onClick={() => navigateYear(1)}
            style={{ fontSize: 14, padding: '4px 10px' }}
            title="Exercice suivant"
            aria-label="Exercice suivant"
          >
            →
          </button>
        </div>
      </div>

      {loading && <div className="dash-loading">Chargement…</div>}
      {error   && <div className="dash-error">{error}</div>}

      {!loading && (
        <>
          {/* Feature: Clôture banner */}
          {estCloture && clotureDate && (
            <div className="dash-cloture-banner">
              <span>
                Exercice {debut.slice(0, 4)} clôturé le {new Date(clotureDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              <button
                className="dash-btn-ghost"
                onClick={rouvrirExercice}
                disabled={cloturant}
                style={{ fontSize: 11 }}
              >
                Rouvrir
              </button>
            </div>
          )}

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
            {(() => {
              const marge = pnl.total_produits > 0
                ? Math.round((pnl.resultat / pnl.total_produits) * 100 * 10) / 10
                : null
              const margeColor = marge === null ? 'var(--pencil)'
                : marge < 0 ? '#dc2626'
                : marge < 15 ? '#d97706'
                : '#15803d'
              return (
                <div className="dash-kpi-card">
                  <p className="dash-kpi-label">Taux de marge</p>
                  <p className="dash-kpi-value" style={{ color: margeColor }}>
                    {marge === null ? '—' : `${marge} %`}
                  </p>
                  <p className="dash-kpi-sub">Résultat / CA HT</p>
                </div>
              )
            })()}
          </div>

          <ExecSummary pnl={pnl} debut={debut} fin={fin} />

          {/* Sprint 3 — Feature B: Projection fin d'année */}
          {projection && (
            <div className="dash-projection-banner no-print">
              <div className="dash-projection-label">Projection fin d&apos;année</div>
              <div className="dash-projection-body">
                <span style={{ fontSize: 12, color: 'var(--pencil)' }}>
                  Basé sur {projection.elapsed} j / {projection.totalDays} j ({projection.pct} % de l&apos;année écoulée) — extrapolation linéaire
                </span>
                <div className="dash-projection-values">
                  <span>CA projeté : <strong style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(projection.produits)}</strong></span>
                  <span>Charges : <strong style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(projection.charges)}</strong></span>
                  <span style={{ color: projection.resultat >= 0 ? '#15803d' : '#dc2626' }}>
                    Résultat projeté : <strong style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(projection.resultat)}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Sprint 3 — Feature C: Annotation d'exercice */}
          <div className="no-print" style={{ marginBottom: 16 }}>
            <button
              className="dash-btn-ghost"
              onClick={() => setShowAnnotation(v => !v)}
              style={{ fontSize: 12, marginBottom: showAnnotation ? 10 : 0 }}
            >
              {showAnnotation ? '▼' : '▶'} Notes d&apos;exercice {debut.slice(0, 4)}
            </button>

            {showAnnotation && workspaceId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 600 }}>
                <textarea
                  className="dash-field-input"
                  value={annotation}
                  onChange={e => { setAnnotation(e.target.value); setAnnotationSaved(false) }}
                  placeholder={`Observations sur l'exercice ${debut.slice(0, 4)} — décisions prises, contexte, objectifs…`}
                  rows={4}
                  style={{ resize: 'vertical', fontFamily: 'Inter, sans-serif', fontSize: 13 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className="dash-btn"
                    onClick={saveAnnotation}
                    disabled={savingAnnotation}
                    style={{ fontSize: 12 }}
                  >
                    {savingAnnotation ? '…' : 'Enregistrer'}
                  </button>
                  {annotationSaved && (
                    <span style={{ fontSize: 12, color: '#15803d', fontFamily: 'Courier Prime,monospace' }}>
                      ✓ Enregistré
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Feature #16 — Ratios de gestion */}
          <div className="no-print" style={{ marginBottom: 20 }}>
            <button
              className="dash-btn-ghost"
              onClick={() => setShowRatios(v => !v)}
              style={{ fontSize: 12, marginBottom: showRatios ? 12 : 0 }}
            >
              {showRatios ? '▼' : '▶'} Ratios de gestion
            </button>

            {showRatios && (() => {
              const margeNette = pnl.total_produits > 0
                ? Math.round((pnl.resultat / pnl.total_produits) * 1000) / 10
                : null
              const chargesSurCA = pnl.total_produits > 0
                ? Math.round((pnl.total_charges / pnl.total_produits) * 1000) / 10
                : null
              const bfr = round2(bilan.creances_clients - bilan.dettes_fournisseurs)

              return (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {/* Marge nette */}
                  <div className="dash-ratio-card">
                    <div className="dash-ratio-label">Marge nette</div>
                    <div className="dash-ratio-value" style={{
                      color: margeNette === null ? 'var(--pencil)'
                        : margeNette < 0 ? '#dc2626'
                        : margeNette < 15 ? '#d97706'
                        : '#15803d'
                    }}>
                      {margeNette === null ? '—' : `${margeNette} %`}
                    </div>
                    <div className="dash-ratio-desc">Résultat / CA HT</div>
                  </div>

                  {/* Charges / CA */}
                  <div className="dash-ratio-card">
                    <div className="dash-ratio-label">Charges / CA</div>
                    <div className="dash-ratio-value" style={{
                      color: chargesSurCA === null ? 'var(--pencil)'
                        : chargesSurCA > 90 ? '#dc2626'
                        : chargesSurCA > 75 ? '#d97706'
                        : '#15803d'
                    }}>
                      {chargesSurCA === null ? '—' : `${chargesSurCA} %`}
                    </div>
                    <div className="dash-ratio-desc">Charges HT / CA HT</div>
                  </div>

                  {/* BFR */}
                  <div className="dash-ratio-card">
                    <div className="dash-ratio-label">BFR simplifié</div>
                    <div className="dash-ratio-value" style={{ color: bfr > 0 ? '#d97706' : '#15803d' }}>
                      {formatEur(bfr)}
                    </div>
                    <div className="dash-ratio-desc">Créances – Dettes fournisseurs</div>
                  </div>
                </div>
              )
            })()}
          </div>

          <div role="tablist" aria-label="Vues des comptes annuels" className="dash-pill-tabs no-print">
            <button
              role="tab"
              id="tab-resultat"
              aria-selected={tab === 'resultat'}
              aria-controls="tabpanel-resultat"
              className={`dash-pill-tab${tab === 'resultat' ? ' dash-pill-tab-active' : ''}`}
              onClick={() => handleTab('resultat')}
            >
              Compte de résultat
            </button>
            <button
              role="tab"
              id="tab-bilan"
              aria-selected={tab === 'bilan'}
              aria-controls="tabpanel-bilan"
              className={`dash-pill-tab${tab === 'bilan' ? ' dash-pill-tab-active' : ''}`}
              onClick={() => handleTab('bilan')}
            >
              Bilan simplifié
            </button>
            <button
              role="tab"
              id="tab-tendance"
              aria-selected={tab === 'tendance'}
              aria-controls="tabpanel-tendance"
              className={`dash-pill-tab${tab === 'tendance' ? ' dash-pill-tab-active' : ''}`}
              onClick={() => handleTab('tendance')}
            >
              Tendance mensuelle
            </button>
          </div>

          {/* ── Compte de résultat ──────────────────────────────────────── */}
          <div role="tabpanel" id="tabpanel-resultat" aria-labelledby="tab-resultat">
            {tab === 'resultat' && (
              <div className="dash-section">
                <div className="dash-table-wrap">
                  {compareMode ? (
                    /* ── 4-column compare table (Feature #7) ── */
                    <table className="dash-table">
                      <caption className="sr-only">
                        Comparaison N vs N-1 — Compte de résultat {debut} au {fin} et période équivalente N-1
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Catégorie</th>
                          <th scope="col" className="right">N ({labelN})</th>
                          <th scope="col" className="right">N-1 ({labelN1})</th>
                          <th scope="col" className="right">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Produits header */}
                        <tr style={{ background: 'var(--offwhite)' }}>
                          <td colSpan={4} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2,
                            textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px',
                            borderTop: '1px solid var(--rule)' }}>
                            Produits — Chiffre d&apos;affaires HT
                          </td>
                        </tr>
                        {/* Produits rows */}
                        {Array.from(new Set([...Object.keys(pnl.produits), ...Object.keys(pnlN1.produits)])).map(cat => {
                          const n  = pnl.produits[cat]   ?? 0
                          const n1 = pnlN1.produits[cat] ?? 0
                          return (
                            <tr
                              key={cat}
                              onClick={() => setDrillCat(cat)}
                              style={{ cursor: 'pointer' }}
                              className="dash-row-clickable"
                            >
                              <td style={{ paddingLeft: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>{cat}</span>
                                  <ChevronRight size={12} style={{ color: 'var(--pencil)', opacity: 0.5 }} />
                                </div>
                              </td>
                              <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(n)}</td>
                              <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)' }}>{formatEur(n1)}</td>
                              <DeltaCell n={n} n1={n1} />
                            </tr>
                          )
                        })}
                        {Object.keys(pnl.produits).length === 0 && Object.keys(pnlN1.produits).length === 0 && (
                          <tr><td colSpan={4} className="dash-empty">Aucun produit sur ces périodes.</td></tr>
                        )}
                        {/* Total produits */}
                        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--ink)' }}>
                          <td>Total produits</td>
                          <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_produits)}</td>
                          <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)' }}>{formatEur(pnlN1.total_produits)}</td>
                          <DeltaCell n={pnl.total_produits} n1={pnlN1.total_produits} />
                        </tr>

                        {/* Charges header */}
                        <tr style={{ background: 'var(--offwhite)' }}>
                          <td colSpan={4} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2,
                            textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px',
                            borderTop: '1px solid var(--rule)' }}>
                            Charges — Dépenses HT
                          </td>
                        </tr>
                        {/* Charges rows */}
                        {Array.from(new Set([...Object.keys(pnl.charges), ...Object.keys(pnlN1.charges)])).map(cat => {
                          const n  = pnl.charges[cat]   ?? 0
                          const n1 = pnlN1.charges[cat] ?? 0
                          return (
                            <tr
                              key={cat}
                              onClick={() => setDrillCat(cat)}
                              style={{ cursor: 'pointer' }}
                              className="dash-row-clickable"
                            >
                              <td style={{ paddingLeft: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>{cat}</span>
                                  <ChevronRight size={12} style={{ color: 'var(--pencil)', opacity: 0.5 }} />
                                </div>
                              </td>
                              <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)' }}>{formatEur(n)}</td>
                              <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)' }}>{formatEur(n1)}</td>
                              <DeltaCell n={n} n1={n1} />
                            </tr>
                          )
                        })}
                        {Object.keys(pnl.charges).length === 0 && Object.keys(pnlN1.charges).length === 0 && (
                          <tr><td colSpan={4} className="dash-empty">Aucune charge sur ces périodes.</td></tr>
                        )}
                        {/* Total charges */}
                        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--ink)' }}>
                          <td>Total charges</td>
                          <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_charges)}</td>
                          <td className="right" style={{ fontFamily: 'Courier Prime,monospace', color: 'var(--pencil)' }}>{formatEur(pnlN1.total_charges)}</td>
                          <DeltaCell n={pnl.total_charges} n1={pnlN1.total_charges} />
                        </tr>

                        {/* Résultat */}
                        <tr style={{ fontWeight: 700, fontFamily: 'Courier Prime,monospace', background: pnl.resultat >= 0 ? '#f0fdf4' : '#fff5f5' }}>
                          <td style={{ padding: '14px 12px', fontSize: 15 }}>
                            Résultat net de l&apos;exercice
                          </td>
                          <td className="right" style={{ padding: '14px 12px', fontSize: 15, color: pnl.resultat >= 0 ? '#15803d' : '#dc2626' }}>
                            {formatEur(pnl.resultat)}
                          </td>
                          <td className="right" style={{ padding: '14px 12px', fontSize: 15, color: pnlN1.resultat >= 0 ? '#15803d' : '#dc2626' }}>
                            {formatEur(pnlN1.resultat)}
                          </td>
                          <DeltaCell n={pnl.resultat} n1={pnlN1.resultat} />
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    /* ── Standard 2-column table ── */
                    <table className="dash-table">
                      <caption className="sr-only">Compte de résultat — Produits et charges de la période {debut} au {fin}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Libellé</th>
                          <th scope="col" className="right">Montant HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ background: 'var(--offwhite)' }}>
                          <td colSpan={2} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2,
                            textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px',
                            borderTop: '1px solid var(--rule)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Produits — Chiffre d&apos;affaires HT</span>
                              <Ref v="Formulaire 2052" show={vueComptable} />
                            </div>
                          </td>
                        </tr>
                        {Object.entries(pnl.produits).map(([cat, montant]) => (
                          <tr
                            key={cat}
                            onClick={() => setDrillCat(cat)}
                            style={{ cursor: 'pointer' }}
                            className="dash-row-clickable"
                          >
                            <td style={{ paddingLeft: 24 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{cat}</span>
                                <ChevronRight size={12} style={{ color: 'var(--pencil)', opacity: 0.5 }} />
                              </div>
                            </td>
                            <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(montant)}</td>
                          </tr>
                        ))}
                        {Object.keys(pnl.produits).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucun produit sur cette période.</td></tr>}
                        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--ink)' }}>
                          <td>Total produits <Ref v="2052 · FJ" show={vueComptable} /></td>
                          <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_produits)}</td>
                        </tr>

                        <tr style={{ background: 'var(--offwhite)' }}>
                          <td colSpan={2} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, letterSpacing: 2,
                            textTransform: 'uppercase', color: 'var(--pencil)', padding: '8px 12px',
                            borderTop: '1px solid var(--rule)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Charges — Dépenses HT</span>
                              <Ref v="Formulaire 2052" show={vueComptable} />
                            </div>
                          </td>
                        </tr>
                        {Object.entries(pnl.charges).map(([cat, montant]) => (
                          <tr
                            key={cat}
                            onClick={() => setDrillCat(cat)}
                            style={{ cursor: 'pointer' }}
                            className="dash-row-clickable"
                          >
                            <td style={{ paddingLeft: 24 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{cat}</span>
                                <ChevronRight size={12} style={{ color: 'var(--pencil)', opacity: 0.5 }} />
                              </div>
                            </td>
                            <td className="right" style={{ color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}>{formatEur(montant)}</td>
                          </tr>
                        ))}
                        {Object.keys(pnl.charges).length === 0 && <tr><td colSpan={2} className="dash-empty">Aucune charge sur cette période.</td></tr>}
                        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--ink)' }}>
                          <td>Total charges <Ref v="2052 · GM" show={vueComptable} /></td>
                          <td className="right" style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(pnl.total_charges)}</td>
                        </tr>

                        <tr style={{ fontWeight: 700, fontFamily: 'Courier Prime,monospace', background: pnl.resultat >= 0 ? '#f0fdf4' : '#fff5f5' }}>
                          <td style={{ padding: '14px 12px', fontSize: 15 }}>
                            Résultat net de l&apos;exercice {pnl.resultat >= 0 ? '(120)' : '(129)'}
                            <Ref v="2053 · KG/KH" show={vueComptable} />
                          </td>
                          <td className="right" style={{ padding: '14px 12px', fontSize: 15, color: pnl.resultat >= 0 ? '#15803d' : '#dc2626' }}>
                            {formatEur(pnl.resultat)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
                <p style={{ marginTop: 12, fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)' }}>
                  Les mouvements de capitaux (Cl. 1), immobilisations (Cl. 2) et virements internes (58) sont exclus du compte de résultat — ils figurent au Bilan.
                </p>
              </div>
            )}
          </div>

          {/* ── Bilan ───────────────────────────────────────────────────── */}
          <div role="tabpanel" id="tabpanel-bilan" aria-labelledby="tab-bilan">
            {tab === 'bilan' && <BilanTab debut={debut} fin={fin} bilan={bilan} vueComptable={vueComptable} />}
          </div>

          {/* ── Tendance mensuelle ───────────────────────────────────────── */}
          <div role="tabpanel" id="tabpanel-tendance" aria-labelledby="tab-tendance">
            {tab === 'tendance' && (
              <div className="dash-section">
                <TendanceChart monthly={monthly} />
                <p style={{ marginTop: 12, fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)' }}>
                  Barres bleues = produits HT · Barres ambrées = charges HT · Ligne verte pointillée = résultat mensuel.
                  Les catégories de bilan (Cl. 1, Cl. 2, 455, 58) sont exclues.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Feature #8 — Drill-down drawer */}
      {drillCat && (
        <DrillDrawer
          cat={drillCat}
          debut={debut}
          fin={fin}
          factures={factures}
          depenses={depenses}
          onClose={() => setDrillCat(null)}
        />
      )}
    </div>
  )
}
