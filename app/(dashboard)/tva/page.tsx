'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Facture, Depense } from '@/lib/types/database'
import { isTvaErronnee, getTvaAlertLabel } from '@/lib/tva-validation'

// ── Helpers ────────────────────────────────────────────────────────────────────

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
const TVA_RATES = ['20', '10', '5.5', '2.1', '0']
const LS_KEY = 'tva_periode'

// ── Types ──────────────────────────────────────────────────────────────────────

type TvaLineData = { taux_tva: number; montant_ht: number; montant_tva: number }
type TvaRow = (Facture & { _kind: 'entree' }) | (Depense & { _kind: 'sortie' })

// ── Period / data helpers ─────────────────────────────────────────────────────

function getRange(mode: string, year: number, sub: string) {
  const y = year
  if (mode === 'mois') {
    const [yr, mo] = sub.split('-').map(Number)
    return { debut: `${yr}-${pad(mo)}-01`, fin: `${yr}-${pad(mo)}-${pad(lastDay(yr, mo))}` }
  }
  if (mode === 'trimestre') {
    const q = Number(sub); const sm = (q - 1) * 3 + 1; const em = q * 3
    return { debut: `${y}-${pad(sm)}-01`, fin: `${y}-${pad(em)}-${pad(lastDay(y, em))}` }
  }
  if (mode === 'semestre') {
    return Number(sub) === 1 ? { debut: `${y}-01-01`, fin: `${y}-06-30` } : { debut: `${y}-07-01`, fin: `${y}-12-31` }
  }
  return { debut: `${y}-01-01`, fin: `${y}-12-31` }
}

function computeTVA(factures: Facture[], depenses: Depense[], debut: string, fin: string) {
  const ff = factures.filter(f => f.date >= debut && f.date <= fin)
  const fd = depenses.filter(d => d.date >= debut && d.date <= fin)

  function agg(rows: Array<{ montant_ht: number; taux_tva: number; montant_tva: number }>) {
    const par_taux: Record<string, { base_ht: number; tva: number }> = {}
    let total_ht = 0; let total_tva = 0
    rows.forEach(r => {
      const t = r.taux_tva === -1 ? 'multi' : String(r.taux_tva)
      if (!par_taux[t]) par_taux[t] = { base_ht: 0, tva: 0 }
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
  return { collectee, deductible, tva_a_reverser: net > 0 ? net : 0, credit_tva: net < 0 ? -net : 0, detail_factures: ff, detail_depenses: fd }
}

function computePatch(field: string, newValue: string, row: TvaRow): Record<string, number> {
  const val = parseFloat(newValue) || 0
  if (field === 'taux_tva') {
    if (row.taux_tva === -1) return {}
    const ht = round2(row.montant_ttc / (1 + val / 100))
    return { taux_tva: val, montant_ht: ht, montant_tva: round2(row.montant_ttc - ht) }
  }
  if (field === 'montant_tva') {
    return { montant_tva: val, montant_ht: round2(row.montant_ttc - val) }
  }
  if (field === 'montant_ttc') {
    const taux = row.taux_tva >= 0 ? row.taux_tva : 0
    const ht = round2(val / (1 + taux / 100))
    return { montant_ht: ht, montant_tva: round2(val - ht), montant_ttc: val }
  }
  return {}
}

// ── CA3Section ────────────────────────────────────────────────────────────────

function CA3Section({ data }: { data: ReturnType<typeof computeTVA>; debut: string; fin: string }) {
  const [open, setOpen] = useState(false)
  const [copiedCase, setCopiedCase] = useState<string | null>(null)

  function copyToClipboard(caseId: string, value: number) {
    navigator.clipboard.writeText(value.toFixed(2)).then(() => {
      setCopiedCase(caseId)
      setTimeout(() => setCopiedCase(null), 1500)
    })
  }

  const rows: Array<{ id: string; label: string; value: number }> = [
    { id: 'CA', label: 'Chiffre d\'affaires HT total',  value: data.collectee.total_base_ht },
    { id: 'A1', label: 'Base imposable 20 %',           value: data.collectee.par_taux['20']?.base_ht ?? 0 },
    { id: 'B1', label: 'TVA brute 20 %',                value: data.collectee.par_taux['20']?.tva ?? 0 },
    { id: 'A2', label: 'Base imposable 10 %',           value: data.collectee.par_taux['10']?.base_ht ?? 0 },
    { id: 'B2', label: 'TVA brute 10 %',                value: data.collectee.par_taux['10']?.tva ?? 0 },
    { id: 'A3', label: 'Base imposable 5,5 %',          value: data.collectee.par_taux['5.5']?.base_ht ?? 0 },
    { id: 'B3', label: 'TVA brute 5,5 %',               value: data.collectee.par_taux['5.5']?.tva ?? 0 },
    { id: '20', label: 'TVA déductible sur achats',     value: data.deductible.total_tva },
    { id: 'AC', label: 'TVA nette à reverser',          value: Math.max(0, data.collectee.total_tva - data.deductible.total_tva) },
  ]

  return (
    <div className="dash-ca3-section">
      <div className="dash-ca3-header" onClick={() => setOpen(o => !o)} role="button" aria-expanded={open}>
        <span>{open ? '▼' : '▶'}</span>
        <span>Récapitulatif CA3 — Prêt pour impots.gouv.fr</span>
        <span style={{ fontSize: 10, fontFamily: 'Courier Prime, monospace', background: 'var(--ink)', color: '#fff', padding: '1px 6px', borderRadius: 2, marginLeft: 'auto' }}>BETA</span>
      </div>
      {open && (
        <div className="dash-ca3-body">
          {rows.map(row => (
            <div key={row.id} className="dash-ca3-row">
              <span className="dash-ca3-case">{row.id}</span>
              <span className="dash-ca3-label">{row.label}</span>
              <span className="dash-ca3-amount">{formatEur(row.value)}</span>
              <button
                type="button"
                className="dash-ca3-copy"
                aria-label={`Copier la case ${row.id}`}
                onClick={() => copyToClipboard(row.id, row.value)}
              >
                {copiedCase === row.id ? '✓' : '📋'}
              </button>
            </div>
          ))}
          <div className="dash-ca3-footer">
            <a href="https://cfspro.impots.gouv.fr" target="_blank" rel="noopener noreferrer">
              Déclarer sur impots.gouv.fr →
            </a>
            <p style={{ margin: 0 }}>Transmission manuelle — Compte-Pote n&apos;est pas connecté à la DGFiP.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TauxTable (ventilation summary) ──────────────────────────────────────────

function TauxTable({ par_taux }: { par_taux: Record<string, { base_ht: number; tva: number }> }) {
  const lines = Object.entries(par_taux).filter(([, v]) => v.base_ht !== 0 || v.tva !== 0)
  if (!lines.length) return <p className="dash-empty">Aucune opération.</p>
  return (
    <table className="dash-table" style={{ marginTop: 8 }}>
      <thead><tr><th>Taux</th><th className="right">Base HT</th><th className="right">TVA</th></tr></thead>
      <tbody>
        {lines.map(([t, v]) => (
          <tr key={t}>
            <td>{TAUX_LABELS[t] ?? (t === 'multi' ? 'Multi-taux' : `${t} %`)}</td>
            <td className="right">{formatEur(v.base_ht)}</td>
            <td className="right"><strong>{formatEur(v.tva)}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── TvaSplitPanel ─────────────────────────────────────────────────────────────

function TvaSplitPanel({ row, onSave, onClose }: {
  row: TvaRow
  onSave: (row: TvaRow, lines: TvaLineData[]) => Promise<void>
  onClose: () => void
}) {
  const ttcRef = row.montant_ttc
  const [lines, setLines] = useState<{ taux_tva: string; montant_ht: string }[]>(() => {
    if (row.taux_tva === -1 && row.tva_lines) {
      try {
        const parsed = (typeof row.tva_lines === 'string' ? JSON.parse(row.tva_lines) : row.tva_lines) as TvaLineData[]
        return parsed.map(l => ({ taux_tva: String(l.taux_tva), montant_ht: String(l.montant_ht) }))
      } catch { /* fall through */ }
    }
    return [{ taux_tva: row.taux_tva >= 0 ? String(row.taux_tva) : '20', montant_ht: '' }]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const computed = lines.map(l => {
    const ht = round2(parseFloat(l.montant_ht) || 0)
    const taux = parseFloat(l.taux_tva) || 0
    const tva = round2(ht * taux / 100)
    return { ...l, _ht: ht, _taux: taux, _tva: tva, _ttc: round2(ht + tva) }
  })
  const totalTtc = round2(computed.reduce((s, l) => s + l._ttc, 0))
  const diff = round2(totalTtc - ttcRef)
  const valid = lines.length >= 1 && computed.every(l => l._ht > 0) && Math.abs(diff) < 0.02

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await onSave(row, computed.map(l => ({ taux_tva: l._taux, montant_ht: l._ht, montant_tva: l._tva })))
      onClose()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur'); setSaving(false) }
  }

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={e => e.stopPropagation()}>
        <div className="dash-modal-header">
          <h2 className="dash-modal-title">Ventiler la TVA</h2>
          <button className="dash-modal-close" aria-label="Fermer" onClick={onClose}>×</button>
        </div>
        <div className="dash-modal-body">
          <p style={{ fontFamily: 'Courier Prime,monospace', fontSize: 13, color: 'var(--pencil)', marginBottom: 16 }}>
            TTC de référence : <strong style={{ color: 'var(--ink)' }}>{formatEur(ttcRef)}</strong>
          </p>
          {computed.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12, padding: 12, background: 'var(--offwhite)' }}>
              <div className="dash-field" style={{ flex: 2 }}>
                <label className="dash-field-label">Montant HT</label>
                <input type="number" step="0.01" min="0" className="dash-field-input"
                  value={line.montant_ht} autoFocus={i === 0} placeholder="0.00"
                  onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, montant_ht: e.target.value } : x))} />
              </div>
              <div className="dash-field" style={{ flex: 1 }}>
                <label className="dash-field-label">Taux TVA</label>
                <select className="dash-field-select" value={line.taux_tva}
                  onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, taux_tva: e.target.value } : x))}>
                  {TVA_RATES.map(t => <option key={t} value={t}>{t} %</option>)}
                </select>
              </div>
              <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)', paddingBottom: 10 }}>
                TVA: {formatEur(line._tva)} · TTC: <strong>{formatEur(line._ttc)}</strong>
              </div>
              {lines.length > 1 && (
                <button type="button" aria-label="Supprimer cette ligne" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 20, lineHeight: 1, paddingBottom: 8 }}>×</button>
              )}
            </div>
          ))}
          <button type="button" className="dash-btn-ghost" style={{ fontSize: 13, marginBottom: 16 }}
            onClick={() => setLines(ls => [...ls, { taux_tva: '20', montant_ht: '' }])}>
            + Ajouter une ligne TVA
          </button>
          <div style={{ padding: 12, borderRadius: 2, background: Math.abs(diff) >= 0.02 ? '#fff5f5' : '#f0fdf4', fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
            Total TTC : <strong>{formatEur(totalTtc)}</strong>
            {Math.abs(diff) >= 0.02
              ? <span style={{ marginLeft: 16, color: '#dc2626' }}>Écart {diff > 0 ? '+' : ''}{formatEur(diff)} — ajustez les HT</span>
              : totalTtc > 0 && <span style={{ marginLeft: 16, color: '#16a34a' }}>✓ Correspond au TTC</span>}
          </div>
          {error && <div className="dash-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="dash-modal-footer">
          <button type="button" className="dash-btn-ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="dash-btn" onClick={handleSave} disabled={!valid || saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer la ventilation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TauxCell — pills selector + split button ──────────────────────────────────

function TauxCell({ row, onSave, onSplitClick }: {
  row: TvaRow
  onSave: (row: TvaRow, field: string, value: string) => Promise<void>
  onSplitClick: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<null | 'saving' | 'saved' | 'error'>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const isMulti = row.taux_tva === -1
  const display = isMulti
    ? <span className="dash-badge dash-badge-blue" style={{ fontSize: 10 }}>Multi</span>
    : `${row.taux_tva} %`

  async function handlePill(val: string) {
    setEditing(false)
    setSaveStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await onSave(row, 'taux_tva', val)
      setSaveStatus('saved')
      timerRef.current = setTimeout(() => setSaveStatus(null), 1500)
    } catch {
      setSaveStatus('error')
      timerRef.current = setTimeout(() => setSaveStatus(null), 2500)
    }
  }

  const statusColor = saveStatus === 'saving' ? 'var(--pencil)' : saveStatus === 'saved' ? '#16a34a' : '#dc2626'

  if (editing && !isMulti) {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', alignItems: 'center' }}>
        {TVA_RATES.map(r => (
          <button key={r} type="button" onMouseDown={e => e.preventDefault()} onClick={() => handlePill(r)}
            style={{ padding: '2px 7px', fontSize: 11, border: '1px solid', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
              background: String(row.taux_tva) === r ? 'var(--ink)' : '#fff',
              color: String(row.taux_tva) === r ? '#fff' : 'var(--ink)',
              borderColor: 'var(--ink)', fontFamily: 'Courier Prime, monospace' }}>
            {r} %
          </button>
        ))}
        <button type="button" style={{ padding: '2px 4px', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--pencil)' }}
          onClick={() => setEditing(false)}>✕</button>
      </div>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ cursor: isMulti ? 'default' : 'pointer' }}
        onClick={isMulti ? undefined : () => setEditing(true)}>
        {display}
      </span>
      <button type="button" title="Ventiler la TVA" onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onSplitClick() }}
        style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 2, cursor: 'pointer', fontSize: 10, padding: '1px 4px', color: 'var(--pencil)', lineHeight: 1 }}>⊞</button>
      {saveStatus && <span style={{ fontSize: 10, color: statusColor }}>
        {saveStatus === 'saving' ? '···' : saveStatus === 'saved' ? '✓' : '✕'}
      </span>}
    </span>
  )
}

// ── EditableCell — number field with TTC-fixed save ───────────────────────────

function EditableCell({ row, field, display, onSave }: {
  row: TvaRow; field: string; display: React.ReactNode
  onSave: (row: TvaRow, field: string, value: string) => Promise<void>
}) {
  const rawVal = String((row as unknown as Record<string, unknown>)[field] ?? '')
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [saveStatus, setSaveStatus] = useState<null | 'saving' | 'saved' | 'error'>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])
  useEffect(() => { if (editing) { inputRef.current?.focus({ preventScroll: true }); inputRef.current?.select() } }, [editing])

  async function commit() {
    setEditing(false)
    if (editVal === rawVal) return
    setSaveStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await onSave(row, field, editVal)
      setSaveStatus('saved')
      timerRef.current = setTimeout(() => setSaveStatus(null), 1500)
    } catch {
      setSaveStatus('error')
      timerRef.current = setTimeout(() => setSaveStatus(null), 2500)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.stopPropagation(); setEditing(false) }
  }

  const statusColor = saveStatus === 'saving' ? 'var(--pencil)' : saveStatus === 'saved' ? '#16a34a' : '#dc2626'

  if (editing) {
    return (
      <input ref={inputRef} type="number" step="0.01" value={editVal}
        onChange={e => setEditVal(e.target.value)} onBlur={commit} onKeyDown={handleKeyDown}
        style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--ink)', borderRadius: 2, fontFamily: 'Courier Prime, monospace', width: 90, textAlign: 'right' }} />
    )
  }

  return (
    <span onClick={() => { setEditVal(rawVal); setEditing(true) }} title="Cliquer pour modifier"
      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 20 }}>
      <span>{display}</span>
      {saveStatus && <span style={{ fontSize: 10, color: statusColor }}>
        {saveStatus === 'saving' ? '···' : saveStatus === 'saved' ? '✓' : '✕'}
      </span>}
    </span>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TVAPage() {
  const [mode, setMode] = useState('mois')
  const [year, setYear] = useState(CY())
  const [sub, setSub]   = useState(`${CY()}-${pad(CM())}`)
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [fSearch, setFSearch]   = useState('')
  const [dSearch, setDSearch]   = useState('')
  const [fTaux, setFTaux]       = useState('')
  const [dTaux, setDTaux]       = useState('')
  const [splitTarget, setSplitTarget] = useState<TvaRow | null>(null)

  // Restore period from localStorage after hydration
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) {
        const p = JSON.parse(saved) as { mode: string; year: number; sub: string }
        setMode(p.mode); setYear(p.year); setSub(p.sub)
      }
    } catch { /* ignore */ }
  }, [])

  // Persist period to localStorage
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ mode, year, sub })) } catch { /* ignore */ }
  }, [mode, year, sub])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expirée — rechargez la page.'); return }
      const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
      if (!m) { setError('Workspace introuvable.'); return }
      const [{ data: f, error: fe }, { data: d, error: de }] = await Promise.all([
        supabase.from('factures').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }),
        supabase.from('depenses').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }),
      ])
      if (fe || de) { setError((fe ?? de)?.message ?? 'Erreur'); return }
      setFactures((f ?? []) as Facture[])
      setDepenses((d ?? []) as Depense[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { debut, fin } = useMemo(() => getRange(mode, year, sub), [mode, year, sub])
  const data = useMemo(() => computeTVA(factures, depenses, debut, fin), [factures, depenses, debut, fin])

  const years = Array.from({ length: 6 }, (_, i) => CY() - i)

  function handleMode(m: string) {
    setMode(m)
    if (m === 'mois') setSub(`${CY()}-${pad(CM())}`)
    else if (m === 'trimestre') setSub(String(Math.ceil(CM() / 3)))
    else if (m === 'semestre') setSub(CM() <= 6 ? '1' : '2')
  }

  // ── Cell save ──────────────────────────────────────────────────────────────

  const handleCellSave = useCallback(async (row: TvaRow, field: string, rawValue: string) => {
    const patch = computePatch(field, rawValue, row)
    if (Object.keys(patch).length === 0) return
    const supabase = createClient()
    if (row._kind === 'entree') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: err } = await supabase.from('factures').update(patch as any).eq('id', row.id)
      if (err) throw new Error(err.message)
      setFactures(fs => fs.map(f => f.id === row.id ? { ...f, ...patch } : f))
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: err } = await supabase.from('depenses').update(patch as any).eq('id', row.id)
      if (err) throw new Error(err.message)
      setDepenses(ds => ds.map(d => d.id === row.id ? { ...d, ...patch } : d))
    }
  }, [])

  async function handleSplitSave(row: TvaRow, lines: TvaLineData[]) {
    const supabase = createClient()
    const totalHt = round2(lines.reduce((s, l) => s + l.montant_ht, 0))
    const totalTva = round2(lines.reduce((s, l) => s + l.montant_tva, 0))
    const patch = { taux_tva: -1, montant_ht: totalHt, montant_tva: totalTva, tva_lines: lines }
    if (row._kind === 'entree') await supabase.from('factures').update(patch).eq('id', row.id)
    else await supabase.from('depenses').update(patch).eq('id', row.id)
    setSplitTarget(null); await load()
  }

  // ── Filtered detail rows ────────────────────────────────────────────────────

  const ff = useMemo(() => {
    let rows = data.detail_factures.map(f => ({ ...f, _kind: 'entree' as const }))
    if (fSearch) { const q = fSearch.toLowerCase(); rows = rows.filter(r => r.client.toLowerCase().includes(q)) }
    if (fTaux) rows = rows.filter(r => String(r.taux_tva) === fTaux)
    return rows
  }, [data.detail_factures, fSearch, fTaux])

  const fd = useMemo(() => {
    let rows = data.detail_depenses.map(d => ({ ...d, _kind: 'sortie' as const }))
    if (dSearch) { const q = dSearch.toLowerCase(); rows = rows.filter(r => r.fournisseur.toLowerCase().includes(q)) }
    if (dTaux) rows = rows.filter(r => String(r.taux_tva) === dTaux)
    return rows
  }, [data.detail_depenses, dSearch, dTaux])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">TVA</h1>
          <p className="dash-subtitle">Déclaration conforme CA3 (art. 287 CGI)</p>
        </div>
        <button className="dash-btn-ghost no-print" onClick={() => window.print()}>
          ↓ Imprimer / PDF
        </button>
        <div className="dash-period-picker">
          <div className="dash-period-mode-row">
            {Object.keys(MODE_LABELS).map(m => (
              <button key={m} className={`dash-period-btn ${mode === m ? 'dash-period-btn-active' : ''}`} onClick={() => handleMode(m)}>{MODE_LABELS[m]}</button>
            ))}
          </div>
          {mode !== 'mois' && (
            <select className="dash-filter-select" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {mode === 'mois' && <input type="month" className="dash-filter-input" value={sub} onChange={e => setSub(e.target.value)} />}
          {mode === 'trimestre' && (
            <div className="dash-period-mode-row">
              {[1, 2, 3, 4].map(q => <button key={q} className={`dash-period-btn ${sub === String(q) ? 'dash-period-btn-active' : ''}`} onClick={() => setSub(String(q))}>T{q}</button>)}
            </div>
          )}
          {mode === 'semestre' && (
            <div className="dash-period-mode-row">
              {[1, 2].map(s => <button key={s} className={`dash-period-btn ${sub === String(s) ? 'dash-period-btn-active' : ''}`} onClick={() => setSub(String(s))}>S{s}</button>)}
            </div>
          )}
        </div>
      </div>

      {loading && <div className="dash-loading">Chargement…</div>}
      {error && <div className="dash-error">{error}</div>}

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

          {/* ── Entrées ──────────────────────────────────────────────────────── */}
          <div className="dash-section">
            <div className="dash-section-title">Entrées <span className="dash-section-count">{ff.length} / {data.detail_factures.length}</span></div>
            {data.detail_factures.length > 0 && (
              <div className="dash-filter-bar">
                <input className="dash-filter-input" placeholder="Rechercher un client…" value={fSearch} onChange={e => setFSearch(e.target.value)} />
                <select className="dash-filter-select" value={fTaux} onChange={e => setFTaux(e.target.value)}>
                  <option value="">Tous les taux</option>
                  {TVA_RATES.map(r => <option key={r} value={r}>{r} %</option>)}
                </select>
              </div>
            )}
            {data.detail_factures.length === 0
              ? <p className="dash-empty">Aucune entrée sur cette période.</p>
              : (
                <div className="dash-table-wrap"><table className="dash-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Client</th>
                      <th className="right">HT</th>
                      <th className="center">Taux</th>
                      <th className="right">TVA</th>
                      <th className="right">TTC</th>
                      <th className="center">📎</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ff.map(f => {
                      const erreur = isTvaErronnee(f)
                      return (
                      <tr key={f.id} style={erreur ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                        <td>{f.date}</td>
                        <td>
                          {f.client}
                          {erreur && (
                            <span title={getTvaAlertLabel(f)} style={{ marginLeft: 6, color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'default' }}>
                              ⚠ {getTvaAlertLabel(f)}
                            </span>
                          )}
                        </td>
                        <td className="right">{formatEur(f.montant_ht)}</td>
                        <td className="center">
                          <TauxCell row={f} onSave={handleCellSave} onSplitClick={() => setSplitTarget(f)} />
                        </td>
                        <td className="right">
                          <EditableCell row={f} field="montant_tva" display={formatEur(f.montant_tva)} onSave={handleCellSave} />
                        </td>
                        <td className="right">
                          <EditableCell row={f} field="montant_ttc" display={<strong>{formatEur(f.montant_ttc)}</strong>} onSave={handleCellSave} />
                        </td>
                        <td className="center" style={{ fontSize: 12, color: f.has_attachment ? '#16a34a' : 'var(--pencil)' }}>
                          {f.bank_source ? (f.has_attachment ? '📎' : '—') : null}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr>
                    <td colSpan={2}><strong>Total</strong></td>
                    <td className="right"><strong>{formatEur(ff.reduce((s, f) => s + f.montant_ht, 0))}</strong></td>
                    <td />
                    <td className="right"><strong>{formatEur(ff.reduce((s, f) => s + f.montant_tva, 0))}</strong></td>
                    <td className="right"><strong>{formatEur(ff.reduce((s, f) => s + f.montant_ttc, 0))}</strong></td>
                    <td />
                  </tr></tfoot>
                </table></div>
              )}
          </div>

          {/* ── Sorties ──────────────────────────────────────────────────────── */}
          <div className="dash-section">
            <div className="dash-section-title">Sorties <span className="dash-section-count">{fd.length} / {data.detail_depenses.length}</span></div>
            {data.detail_depenses.length > 0 && (
              <div className="dash-filter-bar">
                <input className="dash-filter-input" placeholder="Rechercher un fournisseur…" value={dSearch} onChange={e => setDSearch(e.target.value)} />
                <select className="dash-filter-select" value={dTaux} onChange={e => setDTaux(e.target.value)}>
                  <option value="">Tous les taux</option>
                  {TVA_RATES.map(r => <option key={r} value={r}>{r} %</option>)}
                </select>
              </div>
            )}
            {data.detail_depenses.length === 0
              ? <p className="dash-empty">Aucune sortie sur cette période.</p>
              : (
                <div className="dash-table-wrap"><table className="dash-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Fournisseur</th>
                      <th className="right">HT</th>
                      <th className="center">Taux</th>
                      <th className="right">TVA</th>
                      <th className="right">TTC</th>
                      <th className="center">📎</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fd.map(d => {
                      const erreur = isTvaErronnee(d)
                      return (
                      <tr key={d.id} style={erreur ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                        <td>{d.date}</td>
                        <td>
                          {d.fournisseur}
                          {erreur && (
                            <span title={getTvaAlertLabel(d)} style={{ marginLeft: 6, color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'default' }}>
                              ⚠ {getTvaAlertLabel(d)}
                            </span>
                          )}
                        </td>
                        <td className="right">{formatEur(d.montant_ht)}</td>
                        <td className="center">
                          <TauxCell row={d} onSave={handleCellSave} onSplitClick={() => setSplitTarget(d)} />
                        </td>
                        <td className="right">
                          <EditableCell row={d} field="montant_tva" display={formatEur(d.montant_tva)} onSave={handleCellSave} />
                        </td>
                        <td className="right">
                          <EditableCell row={d} field="montant_ttc" display={<strong>{formatEur(d.montant_ttc)}</strong>} onSave={handleCellSave} />
                        </td>
                        <td className="center" style={{ fontSize: 12, color: d.has_attachment ? '#16a34a' : 'var(--pencil)' }}>
                          {d.bank_source ? (d.has_attachment ? '📎' : '—') : null}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr>
                    <td colSpan={2}><strong>Total</strong></td>
                    <td className="right"><strong>{formatEur(fd.reduce((s, d) => s + d.montant_ht, 0))}</strong></td>
                    <td />
                    <td className="right"><strong>{formatEur(fd.reduce((s, d) => s + d.montant_tva, 0))}</strong></td>
                    <td className="right"><strong>{formatEur(fd.reduce((s, d) => s + d.montant_ttc, 0))}</strong></td>
                    <td />
                  </tr></tfoot>
                </table></div>
              )}
          </div>

          <CA3Section data={data} debut={debut} fin={fin} />
        </>
      )}

      {splitTarget && (
        <TvaSplitPanel row={splitTarget} onSave={handleSplitSave} onClose={() => setSplitTarget(null)} />
      )}
    </div>
  )
}
