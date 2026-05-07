'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { X, Check, ChevronLeft, ChevronRight, PenLine, AlertTriangle } from 'lucide-react'
import type { Facture, Depense } from '@/lib/types/database'
import { getCatEntreesGroups, getCatSortiesGroups, type CatGroup } from '@/lib/categories'
import { isTvaErronnee, getTvaAlertLabel } from '@/lib/tva-validation'
import { sendInvoiceEmail } from './actions'

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const TVA_RATES = ['0', '5.5', '10', '20']

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function round2(n: number) { return Math.round(n * 100) / 100 }
function today() { return new Date().toISOString().slice(0, 10) }
function recalcFromTtc(ttc: number, taux: number) {
  const ht = round2(ttc / (1 + taux / 100))
  return { montant_ht: ht, montant_tva: round2(ttc - ht), taux_tva: taux, montant_ttc: ttc }
}
function nextFactureNumero(factures: Facture[]) {
  const year = new Date().getFullYear()
  const nums = factures
    .filter(f => f.numero.match(/^FAC-/))
    .map(f => { const m = f.numero.match(/(\d+)$/); return m ? parseInt(m[1], 10) : 0 })
  return `FAC-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'tous' | 'entrees' | 'sorties'
type AnyRow = (Facture & { _type: 'entree'; _key: string }) | (Depense & { _type: 'sortie'; _key: string })
type TvaLineData = { taux_tva: number; montant_ht: number; montant_tva: number }
type PendingCat = { row: AnyRow; newCategory: string; matchingRows: AnyRow[]; isEntree: boolean }

// ── TVA Split Panel ────────────────────────────────────────────────────────────

function TvaSplitPanel({ row, onSave, onClose }: {
  row: AnyRow
  onSave: (row: AnyRow, lines: TvaLineData[]) => Promise<void>
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
                  {['20','10','5.5','2.1','0'].map(t => <option key={t} value={t}>{t} %</option>)}
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
              : totalTtc > 0 && <span style={{ marginLeft: 16, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Correspond au TTC</span>}
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

// ── Entry Form Modals ─────────────────────────────────────────────────────────

interface FForm { date: string; client: string; description: string; montant_ht: string; taux_tva: string; categorie: string; statut: 'payee' | 'en_attente' }
interface DForm { date: string; fournisseur: string; description: string; montant_ht: string; taux_tva: string; categorie: string; statut: 'payee' | 'en_attente' }

function FactureModal({ initial, factures, workspaceId, activiteType, onSaved, onClose }: {
  initial?: Facture | null; factures: Facture[]; workspaceId: string; activiteType: string | null; onSaved: () => void; onClose: () => void
}) {
  const cats = getCatEntreesGroups(activiteType)
  const firstCat = cats[0]?.options[0]?.value ?? ''
  const [form, setForm] = useState<FForm>({
    date: initial?.date ?? today(), client: initial?.client ?? '',
    description: initial?.description ?? '',
    montant_ht: initial ? String(initial.montant_ht) : '',
    taux_tva: initial ? String(Math.max(0, initial.taux_tva)) : '20',
    categorie: initial?.categorie ?? firstCat, statut: initial?.statut ?? 'en_attente',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const ht = parseFloat(form.montant_ht.replace(',', '.')) || 0
    const taux = parseFloat(form.taux_tva) || 0
    const tva = round2(ht * taux / 100)
    const supabase = createClient()
    const base = { date: form.date, client: form.client, description: form.description || null, categorie: form.categorie, statut: form.statut, montant_ht: ht, taux_tva: taux, montant_tva: tva, montant_ttc: round2(ht + tva) }
    const r = initial
      ? await supabase.from('factures').update(base).eq('id', initial.id)
      : await supabase.from('factures').insert({ workspace_id: workspaceId, numero: nextFactureNumero(factures), ...base })
    if (r.error) { setError(r.error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={e => e.stopPropagation()}>
        <div className="dash-modal-header">
          <h2 className="dash-modal-title">{initial ? 'Modifier l\'entrée' : 'Nouvelle entrée'}</h2>
          <button className="dash-modal-close" aria-label="Fermer" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dash-modal-body">
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Date</label>
                <input type="date" className="dash-field-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
              <div className="dash-field"><label className="dash-field-label">Statut</label>
                <select className="dash-field-select" value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value as 'payee' | 'en_attente' }))}>
                  <option value="en_attente">En attente</option><option value="payee">Payée</option></select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Client</label>
              <input type="text" className="dash-field-input" value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} required placeholder="Nom du client" /></div>
            <div className="dash-field"><label className="dash-field-label">Description</label>
              <input type="text" className="dash-field-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optionnel" /></div>
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Montant HT (€)</label>
                <input type="number" step="0.01" min="0" className="dash-field-input" value={form.montant_ht} onChange={e => setForm(f => ({ ...f, montant_ht: e.target.value }))} required placeholder="0.00" /></div>
              <div className="dash-field"><label className="dash-field-label">Taux TVA</label>
                <select className="dash-field-select" value={form.taux_tva} onChange={e => setForm(f => ({ ...f, taux_tva: e.target.value }))}>
                  {TVA_RATES.map(t => <option key={t} value={t}>{t} %</option>)}</select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Catégorie</label>
              <select className="dash-field-select" value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
                {cats.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select></div>
            {error && <div className="dash-error">{error}</div>}
          </div>
          <div className="dash-modal-footer">
            <button type="button" className="dash-btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="dash-btn" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DepenseModal({ initial, workspaceId, activiteType, onSaved, onClose }: {
  initial?: Depense | null; workspaceId: string; activiteType: string | null; onSaved: () => void; onClose: () => void
}) {
  const cats = getCatSortiesGroups(activiteType)
  const firstCat = cats[0]?.options[0]?.value ?? ''
  const [form, setForm] = useState<DForm>({
    date: initial?.date ?? today(), fournisseur: initial?.fournisseur ?? '',
    description: initial?.description ?? '',
    montant_ht: initial ? String(initial.montant_ht) : '',
    taux_tva: initial ? String(Math.max(0, initial.taux_tva)) : '20',
    categorie: initial?.categorie ?? firstCat, statut: initial?.statut ?? 'en_attente',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const ht = parseFloat(form.montant_ht.replace(',', '.')) || 0
    const taux = parseFloat(form.taux_tva) || 0
    const tva = round2(ht * taux / 100)
    const supabase = createClient()
    const base = { date: form.date, fournisseur: form.fournisseur, description: form.description || null, categorie: form.categorie, statut: form.statut, montant_ht: ht, taux_tva: taux, montant_tva: tva, montant_ttc: round2(ht + tva) }
    const r = initial
      ? await supabase.from('depenses').update(base).eq('id', initial.id)
      : await supabase.from('depenses').insert({ workspace_id: workspaceId, ...base })
    if (r.error) { setError(r.error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={e => e.stopPropagation()}>
        <div className="dash-modal-header">
          <h2 className="dash-modal-title">{initial ? 'Modifier la sortie' : 'Nouvelle sortie'}</h2>
          <button className="dash-modal-close" aria-label="Fermer" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dash-modal-body">
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Date</label>
                <input type="date" className="dash-field-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></div>
              <div className="dash-field"><label className="dash-field-label">Statut</label>
                <select className="dash-field-select" value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value as 'payee' | 'en_attente' }))}>
                  <option value="en_attente">En attente</option><option value="payee">Payée</option></select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Fournisseur</label>
              <input type="text" className="dash-field-input" value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} required placeholder="Nom du fournisseur" /></div>
            <div className="dash-field"><label className="dash-field-label">Description</label>
              <input type="text" className="dash-field-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optionnel" /></div>
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Montant HT (€)</label>
                <input type="number" step="0.01" min="0" className="dash-field-input" value={form.montant_ht} onChange={e => setForm(f => ({ ...f, montant_ht: e.target.value }))} required placeholder="0.00" /></div>
              <div className="dash-field"><label className="dash-field-label">Taux TVA</label>
                <select className="dash-field-select" value={form.taux_tva} onChange={e => setForm(f => ({ ...f, taux_tva: e.target.value }))}>
                  {TVA_RATES.map(t => <option key={t} value={t}>{t} %</option>)}</select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Catégorie</label>
              <select className="dash-field-select" value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
                {cats.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select></div>
            {error && <div className="dash-error">{error}</div>}
          </div>
          <div className="dash-modal-footer">
            <button type="button" className="dash-btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="dash-btn" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── InlineCombobox (portaled dropdown, no layout shift) ───────────────────────

function InlineCombobox({ groups, initialValue, onCommit, onCancel }: {
  groups: CatGroup[]
  initialValue: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [dropPos, setDropPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const flatAll = groups.flatMap(g => g.options)
  const q = query.trim().toLowerCase()
  const filtered = q ? flatAll.filter(o => o.label.toLowerCase().includes(q)) : null

  let _idx = 0
  const displayGroups = filtered
    ? [{ group: null as string | null, options: filtered.map(o => ({ ...o, _idx: _idx++ })) }]
    : groups.map(g => ({ group: g.group, options: g.options.map(o => ({ ...o, _idx: _idx++ })) }))
  const totalOptions = _idx

  useEffect(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const dropW = Math.max(rect.width, 320)
    const dropH = Math.min(300, flatAll.length * 32 + 48)
    const spaceBelow = window.innerHeight - rect.bottom
    const above = spaceBelow < dropH && rect.top > dropH
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropW - 8))
    setDropPos(above
      ? { bottom: window.innerHeight - rect.top + 2, left, width: dropW }
      : { top: rect.bottom + 2, left, width: dropW })
    const curIdx = flatAll.findIndex(o => o.value === initialValue)
    setHighlighted(curIdx >= 0 ? curIdx : 0)
    inputRef.current?.focus({ preventScroll: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const fn = (e: Event) => { if (listRef.current?.contains(e.target as Node)) return; onCancel() }
    document.addEventListener('scroll', fn, { passive: true, capture: true })
    return () => document.removeEventListener('scroll', fn, { capture: true })
  }, [onCancel])

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) onCancel()
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [onCancel])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, totalOptions - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const item = displayGroups.flatMap(g => g.options).find(o => o._idx === highlighted)
      if (item) onCommit(item.value)
    }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  const dropStyle: React.CSSProperties = {
    position: 'fixed',
    left: dropPos?.left,
    width: dropPos?.width,
    top: dropPos?.top,
    bottom: dropPos?.bottom,
    zIndex: 9999,
    background: '#fff',
    border: '1px solid var(--ink)',
    borderRadius: 2,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    maxHeight: 300,
    overflowY: 'auto',
    fontFamily: 'Courier Prime, monospace',
    fontSize: 12,
  }

  return (
    <>
      <div ref={triggerRef} style={{ display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setHighlighted(0) }}
          onKeyDown={handleKeyDown}
          placeholder={initialValue || 'Rechercher…'}
          style={{ width: '100%', minWidth: 140, fontSize: 12, padding: '2px 6px', border: '1px solid var(--ink)', borderRadius: 2, fontFamily: 'Courier Prime, monospace', outline: 'none' }}
        />
      </div>
      {dropPos && createPortal(
        <div ref={listRef} style={dropStyle} onMouseDown={e => e.preventDefault()}>
          {totalOptions === 0
            ? <div style={{ padding: '8px 12px', color: 'var(--pencil)' }}>Aucun résultat</div>
            : displayGroups.map((group, gi) => (
              <div key={gi}>
                {group.group && (
                  <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: 'var(--pencil)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--offwhite)', borderBottom: '1px solid var(--rule)' }}>
                    {group.group}
                  </div>
                )}
                {group.options.map(opt => (
                  <div
                    key={opt.value}
                    data-idx={opt._idx}
                    onClick={() => onCommit(opt.value)}
                    onMouseEnter={() => setHighlighted(opt._idx)}
                    style={{
                      padding: '6px 10px',
                      cursor: 'pointer',
                      background: opt._idx === highlighted ? 'var(--ink)' : opt.value === initialValue ? 'var(--offwhite)' : '#fff',
                      color: opt._idx === highlighted ? '#fff' : 'var(--ink)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ width: 12, flexShrink: 0, color: opt._idx === highlighted ? '#fff' : '#16a34a' }}>{opt.value === initialValue ? '✓' : ''}</span>
                    {opt.label}
                  </div>
                ))}
              </div>
            ))
          }
        </div>,
        document.body
      )}
    </>
  )
}

// ── InlineCell (self-contained per-cell state) ────────────────────────────────

type SaveFn = (row: AnyRow, field: string, value: string) => Promise<void>

function InlineCell({ row, field, display, editType, value, options, groups, onSave, onSplitClick }: {
  row: AnyRow
  field: string
  display: React.ReactNode
  editType?: string
  value: string
  options?: { value: string; label: string }[]
  groups?: CatGroup[]
  onSave: SaveFn
  onSplitClick?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [saveStatus, setSaveStatus] = useState<null | 'saving' | 'saved' | 'error'>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  useEffect(() => {
    if (editing && inputRef.current && editType !== 'combobox' && editType !== 'pills') {
      inputRef.current.focus({ preventScroll: true })
      if (editType !== 'select') (inputRef.current as HTMLInputElement).select?.()
    }
  }, [editing, editType])

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    if (!editType) return
    setEditVal(value)
    setEditing(true)
  }

  async function commit(override?: string) {
    const rawVal = override !== undefined ? override : editVal
    setEditing(false)
    if (String(rawVal) === String(value)) return
    setSaveStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await onSave(row, field, rawVal)
      setSaveStatus('saved')
      timerRef.current = setTimeout(() => setSaveStatus(null), 1500)
    } catch {
      setSaveStatus('error')
      timerRef.current = setTimeout(() => setSaveStatus(null), 2500)
    }
  }

  function cancel() { setEditing(false) }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.stopPropagation(); cancel() }
  }

  const statusColor = saveStatus === 'saving' ? 'var(--pencil)' : saveStatus === 'saved' ? '#16a34a' : saveStatus === 'error' ? '#dc2626' : undefined

  if (editing) {
    if (editType === 'combobox' && groups) {
      return (
        <InlineCombobox
          groups={groups}
          initialValue={editVal}
          onCommit={v => commit(v)}
          onCancel={cancel}
        />
      )
    }
    if (editType === 'pills') {
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', alignItems: 'center' }}>
          {(options ?? []).map(o => (
            <button key={o.value} type="button"
              style={{ padding: '2px 7px', fontSize: 11, border: '1px solid', borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap', background: editVal === o.value ? 'var(--ink)' : '#fff', color: editVal === o.value ? '#fff' : 'var(--ink)', borderColor: 'var(--ink)', fontFamily: 'Courier Prime, monospace' }}
              onMouseDown={e => e.preventDefault()}
              onClick={() => commit(o.value)}>
              {o.label}
            </button>
          ))}
          <button type="button" style={{ padding: '2px 4px', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--pencil)', display: 'inline-flex', alignItems: 'center' }} onClick={cancel}><X size={14} /></button>
        </div>
      )
    }
    if (editType === 'select') {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={handleKeyDown}
          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--ink)', borderRadius: 2, fontFamily: 'Courier Prime, monospace' }}
        >
          {(options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={editType}
        value={editVal}
        onChange={e => setEditVal(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={handleKeyDown}
        step={editType === 'number' ? '0.01' : undefined}
        style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--ink)', borderRadius: 2, fontFamily: 'Courier Prime, monospace', width: editType === 'date' ? 120 : editType === 'number' ? 90 : 130 }}
      />
    )
  }

  if (field === 'taux_tva') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ cursor: editType ? 'pointer' : 'default' }} onClick={editType ? startEdit : undefined}>{display}</span>
        {onSplitClick && (
          <button type="button" title="Ventiler la TVA"
            onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSplitClick() }}
            style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 2, cursor: 'pointer', fontSize: 10, padding: '1px 4px', color: 'var(--pencil)', lineHeight: 1 }}>⊞</button>
        )}
        {saveStatus && <span style={{ fontSize: 10, color: statusColor, display: 'inline-flex', alignItems: 'center' }}>
          {saveStatus === 'saving' ? '···' : saveStatus === 'saved' ? <Check size={13} /> : <X size={13} />}
        </span>}
      </span>
    )
  }

  return (
    <span
      onClick={editType ? startEdit : undefined}
      title={editType ? 'Cliquer pour modifier' : undefined}
      style={{ cursor: editType ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 20 }}
    >
      <span>{display}</span>
      {saveStatus && <span style={{ fontSize: 10, color: statusColor, display: 'inline-flex', alignItems: 'center' }}>
        {saveStatus === 'saving' ? '···' : saveStatus === 'saved' ? <Check size={13} /> : <X size={13} />}
      </span>}
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce<(number | '…')[]>((acc, p, i, arr) => {
      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…')
      acc.push(p); return acc
    }, [])

  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 20, fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
      {[['«', 1], ['‹', page - 1]].map(([label, target]) => (
        <button key={String(label)} disabled={page === 1} onClick={() => onChange(target as number)}
          style={{ padding: '4px 10px', border: '1px solid var(--rule)', borderRadius: 2, background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>{label}</button>
      ))}
      {pages.map((p, i) => p === '…'
        ? <span key={`e${i}`} style={{ padding: '4px 6px', color: 'var(--pencil)' }}>…</span>
        : <button key={p} onClick={() => onChange(p as number)}
            style={{ padding: '4px 10px', border: '1px solid', borderRadius: 2, cursor: 'pointer', borderColor: p === page ? 'var(--ink)' : 'var(--rule)', background: p === page ? 'var(--ink)' : '#fff', color: p === page ? '#fff' : 'var(--ink)' }}>{p}</button>
      )}
      {[['›', page + 1], ['»', totalPages]].map(([label, target]) => (
        <button key={String(label)} disabled={page === totalPages} onClick={() => onChange(target as number)}
          style={{ padding: '4px 10px', border: '1px solid var(--rule)', borderRadius: 2, background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>{label}</button>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const LS_TXN = 'transactions_filters'

type SavedFilters = { tab: Tab; filterTiers: string; filterDateFrom: string; filterDateTo: string; filterCategorie: string; filterStatut: string }

function loadFilters(): Partial<SavedFilters> {
  try { return JSON.parse(localStorage.getItem(LS_TXN) ?? '{}') } catch { return {} }
}

export default function TransactionsPage() {
  const [tab, setTab] = useState<Tab>('tous')
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [activiteType, setActiviteType] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterTiers, setFilterTiers] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCategorie, setFilterCategorie] = useState('')
  const [filterStatut, setFilterStatut] = useState('')

  // Restore filters from localStorage after hydration
  useEffect(() => {
    const s = loadFilters()
    if (s.tab) setTab(s.tab)
    if (s.filterTiers) setFilterTiers(s.filterTiers)
    if (s.filterDateFrom) setFilterDateFrom(s.filterDateFrom)
    if (s.filterDateTo) setFilterDateTo(s.filterDateTo)
    if (s.filterCategorie) setFilterCategorie(s.filterCategorie)
    if (s.filterStatut) setFilterStatut(s.filterStatut)
  }, [])

  // Pagination
  const [page, setPage] = useState(1)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modals
  const [showForm, setShowForm] = useState(false)
  const [editFact, setEditFact] = useState<Facture | null>(null)
  const [editDep, setEditDep] = useState<Depense | null>(null)
  const [splitTarget, setSplitTarget] = useState<AnyRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AnyRow | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [pendingCat, setPendingCat] = useState<PendingCat | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [emailTarget, setEmailTarget] = useState<{ id: number; client: string } | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expirée'); return }
      const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
      if (!m) { setError('Workspace introuvable'); return }
      setWorkspaceId(m.workspace_id)
      const [{ data: ws }, { data: f, error: fe }, { data: d, error: de }] = await Promise.all([
        supabase.from('workspaces').select('activite_type').eq('id', m.workspace_id).single(),
        supabase.from('factures').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }).limit(500),
        supabase.from('depenses').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }).limit(500),
      ])
      if (ws?.activite_type) setActiviteType(ws.activite_type)
      if (fe || de) { setError((fe ?? de)?.message ?? 'Erreur de chargement'); return }
      setFactures((f ?? []) as Facture[])
      setDepenses((d ?? []) as Depense[])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return
      e.preventDefault()
      if (tab === 'tous') setTab('entrees')
      setEditFact(null); setEditDep(null); setShowForm(true); setActionError(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tab])

  useEffect(() => { setPage(1) }, [filterTiers, filterDateFrom, filterDateTo, filterCategorie, filterStatut, tab])
  useEffect(() => {
    try { localStorage.setItem(LS_TXN, JSON.stringify({ tab, filterTiers, filterDateFrom, filterDateTo, filterCategorie, filterStatut })) } catch { /* ignore */ }
  }, [tab, filterTiers, filterDateFrom, filterDateTo, filterCategorie, filterStatut])

  // ── Rows ───────────────────────────────────────────────────────────────────

  const allRows = useMemo<AnyRow[]>(() => {
    const entries: AnyRow[] = factures.map(f => ({ ...f, _type: 'entree' as const, _key: `entree-${f.id}` }))
    const exits: AnyRow[] = depenses.map(d => ({ ...d, _type: 'sortie' as const, _key: `sortie-${d.id}` }))
    return [...entries, ...exits].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [factures, depenses])

  const alertCount = useMemo(
    () => allRows.filter(r => isTvaErronnee(r)).length,
    [allRows]
  )

  const baseRows = tab === 'tous' ? allRows
    : tab === 'entrees' ? factures.map(f => ({ ...f, _type: 'entree' as const, _key: `entree-${f.id}` }))
    : depenses.map(d => ({ ...d, _type: 'sortie' as const, _key: `sortie-${d.id}` }))

  const catOptions = useMemo(() => [...new Set(baseRows.map(r => r.categorie).filter(Boolean))].sort(), [baseRows])

  const filtered = useMemo(() => {
    let rows = baseRows
    if (filterTiers) { const q = filterTiers.toLowerCase(); rows = rows.filter(r => ('client' in r ? r.client : r.fournisseur).toLowerCase().includes(q)) }
    if (filterDateFrom) rows = rows.filter(r => r.date >= filterDateFrom)
    if (filterDateTo) rows = rows.filter(r => r.date <= filterDateTo)
    if (filterCategorie) rows = rows.filter(r => r.categorie === filterCategorie)
    if (filterStatut) rows = rows.filter(r => r.statut === filterStatut)
    return rows
  }, [baseRows, filterTiers, filterDateFrom, filterDateTo, filterCategorie, filterStatut])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const hasFilters = !!(filterTiers || filterDateFrom || filterDateTo || filterCategorie || filterStatut)

  // ── Cell save ──────────────────────────────────────────────────────────────

  const handleCellSave: SaveFn = useCallback(async (row, field, rawValue) => {
    const supabase = createClient()
    const isEntree = row._type === 'entree'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let patch: Record<string, any>

    if (field === 'taux_tva') {
      if (row.taux_tva === -1) return
      const taux = parseFloat(rawValue) || 0
      patch = { taux_tva: taux, montant_ht: round2(row.montant_ttc / (1 + taux / 100)), montant_tva: round2(row.montant_ttc - round2(row.montant_ttc / (1 + taux / 100))) }
    } else if (field === 'montant_ttc') {
      const ttc = round2(parseFloat(rawValue) || 0)
      const taux = row.taux_tva >= 0 ? row.taux_tva : 0
      patch = recalcFromTtc(ttc, taux)
    } else if (field === 'categorie') {
      const tiers = isEntree ? (row as Facture & { _type: 'entree'; _key: string }).client : (row as Depense & { _type: 'sortie'; _key: string }).fournisseur
      const pool = (isEntree ? allRows.filter(r => r._type === 'entree') : allRows.filter(r => r._type === 'sortie')) as AnyRow[]
      const tiersKey = isEntree ? 'client' : 'fournisseur'
      const matches = pool.filter(r => (r as unknown as Record<string, unknown>)[tiersKey] === tiers && r.id !== row.id && r.categorie !== rawValue)
      if (matches.length > 0) {
        setPendingCat({ row, newCategory: rawValue, matchingRows: matches, isEntree })
        if (isEntree) await supabase.from('factures').update({ categorie: rawValue }).eq('id', row.id)
        else await supabase.from('depenses').update({ categorie: rawValue }).eq('id', row.id)
        await load()
        return
      }
      patch = { categorie: rawValue }
    } else {
      patch = { [field]: rawValue }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (isEntree) await supabase.from('factures').update(patch as any).eq('id', row.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else await supabase.from('depenses').update(patch as any).eq('id', row.id)
    if (isEntree) setFactures(fs => fs.map(f => f.id === row.id ? { ...f, ...patch } : f))
    else setDepenses(ds => ds.map(d => d.id === row.id ? { ...d, ...patch } : d))
  }, [allRows, load])

  async function handleSplitSave(row: AnyRow, lines: TvaLineData[]) {
    const supabase = createClient()
    const totalHt = round2(lines.reduce((s, l) => s + l.montant_ht, 0))
    const totalTva = round2(lines.reduce((s, l) => s + l.montant_tva, 0))
    const patch = { taux_tva: -1, montant_ht: totalHt, montant_tva: totalTva, tva_lines: lines }
    if (row._type === 'entree') await supabase.from('factures').update(patch).eq('id', row.id)
    else await supabase.from('depenses').update(patch).eq('id', row.id)
    setSplitTarget(null); await load()
  }

  async function handleDelete(row: AnyRow) {
    const supabase = createClient()
    if (row._type === 'entree') await supabase.from('factures').delete().eq('id', row.id)
    else await supabase.from('depenses').delete().eq('id', row.id)
    setConfirmDelete(null); await load()
  }

  function exportCsv() {
    const BOM = '﻿'
    const headers = ['Date', 'Type', 'Tiers', 'Description', 'HT (€)', 'TVA (€)', 'TTC (€)', 'Catégorie', 'Statut', 'Numéro']
    const rows = filtered.map(row => {
      const isEntree = row._type === 'entree'
      const tiers = isEntree
        ? (row as Facture & { _type: 'entree'; _key: string }).client
        : (row as Depense & { _type: 'sortie'; _key: string }).fournisseur
      const numero = isEntree ? (row as Facture & { _type: 'entree'; _key: string }).numero : ''
      const statut = row.statut === 'payee' ? 'Payée' : 'En attente'
      const type = isEntree ? 'Entrée' : 'Sortie'
      function csvNum(n: number) { return n.toFixed(2).replace('.', ',') }
      function csvStr(s: string | null | undefined) {
        const v = s ?? ''
        return v.includes(';') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
      }
      return [
        row.date, type, csvStr(tiers), csvStr(row.description),
        csvNum(row.montant_ht), csvNum(row.montant_tva), csvNum(row.montant_ttc),
        csvStr(row.categorie), statut, csvStr(numero),
      ].join(';')
    })
    const csv = BOM + [headers.join(';'), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleBulkDelete() {
    setBulkDeleting(true); setActionError(null)
    const supabase = createClient()
    const results = await Promise.allSettled(
      [...selectedIds].map(key =>
        key.startsWith('entree-')
          ? supabase.from('factures').delete().eq('id', parseInt(key.slice(7)))
          : supabase.from('depenses').delete().eq('id', parseInt(key.slice(7)))
      )
    )
    const failed = results.filter(r => r.status === 'rejected').length
    setSelectedIds(new Set()); setConfirmBulkDelete(false); setBulkDeleting(false)
    if (failed) setActionError(`${failed} suppression(s) ont échoué.`)
    await load()
  }

  async function handleSendEmail() {
    if (!emailTarget || !emailInput) return
    setEmailSending(true); setEmailResult(null)
    const res = await sendInvoiceEmail(emailTarget.id, emailInput)
    setEmailSending(false)
    setEmailResult({ ok: res.ok, msg: res.ok ? 'Email envoyé avec succès.' : `Erreur : ${res.error ?? 'inconnue'}` })
    if (res.ok) setTimeout(() => setEmailTarget(null), 1500)
  }

  async function applyPropagation(all: boolean) {
    if (!pendingCat) return
    const { matchingRows, newCategory, isEntree } = pendingCat
    setPendingCat(null)
    if (!all) return
    const supabase = createClient()
    try {
      for (const r of matchingRows) {
        if (isEntree) await supabase.from('factures').update({ categorie: newCategory }).eq('id', r.id)
        else await supabase.from('depenses').update({ categorie: newCategory }).eq('id', r.id)
      }
      await load()
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Erreur propagation') }
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  function toggleSelect(key: string) {
    setSelectedIds(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleSelectAll() {
    const allKeys = pageRows.map(r => r._key)
    const allSelected = allKeys.every(k => selectedIds.has(k))
    setSelectedIds(s => { const n = new Set(s); allSelected ? allKeys.forEach(k => n.delete(k)) : allKeys.forEach(k => n.add(k)); return n })
  }

  // ── Period presets ─────────────────────────────────────────────────────────

  function applyPeriodPreset(preset: 'month' | 'quarter' | 'semester' | 'year') {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() // 0-based
    let from = '', to = ''
    if (preset === 'month') {
      from = `${y}-${String(m + 1).padStart(2, '0')}-01`
      to = new Date(y, m + 1, 0).toISOString().slice(0, 10)
    } else if (preset === 'quarter') {
      const q = Math.floor(m / 3)
      from = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`
      to = new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10)
    } else if (preset === 'semester') {
      from = m < 6 ? `${y}-01-01` : `${y}-07-01`
      to   = m < 6 ? `${y}-06-30` : `${y}-12-31`
    } else {
      from = `${y}-01-01`
      to   = `${y}-12-31`
    }
    setFilterDateFrom(from)
    setFilterDateTo(to)
    setPage(1)
  }

  // ── Row render ─────────────────────────────────────────────────────────────

  function renderRow(row: AnyRow) {
    const isEntree = row._type === 'entree'
    const tiers = isEntree ? (row as Facture & { _type: 'entree'; _key: string }).client : (row as Depense & { _type: 'sortie'; _key: string }).fournisseur
    const key = row._key
    const catGroups = isEntree ? getCatEntreesGroups(activiteType) : getCatSortiesGroups(activiteType)
    const statutOptions = [{ value: 'payee', label: 'Payée' }, { value: 'en_attente', label: 'En attente' }]
    const tvaOptions = TVA_RATES.map(v => ({ value: v, label: `${v} %` }))

    const tvaBadge = row.taux_tva === -1
      ? <span className="dash-badge dash-badge-blue" style={{ fontSize: 10 }}>Multi</span>
      : `${row.taux_tva} %`

    const erreur = isTvaErronnee(row)
    return (
      <tr key={key} style={{ background: selectedIds.has(key) ? '#f0f4ff' : erreur ? '#fefce8' : undefined }}>
        <td style={{ textAlign: 'center', width: 32 }}>
          <input type="checkbox" checked={selectedIds.has(key)} onChange={() => toggleSelect(key)} />
        </td>
        {tab === 'tous' && (
          <td>
            <span className={`dash-badge ${isEntree ? 'dash-badge-green' : 'dash-badge-orange'}`} style={{ fontSize: 11 }}>
              {isEntree ? '↑ Entrée' : '↓ Sortie'}
            </span>
          </td>
        )}
        <td>
          <InlineCell row={row} field="date" editType="date" value={row.date}
            display={row.date} onSave={handleCellSave} />
        </td>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <InlineCell row={row} field={isEntree ? 'client' : 'fournisseur'} editType="text" value={tiers}
              display={tiers || '—'} onSave={handleCellSave} />
            {erreur && (
              <span title={getTvaAlertLabel(row)} style={{ display: 'inline-flex', alignItems: 'center', color: '#f59e0b', cursor: 'default', flexShrink: 0 }}>
                <AlertTriangle size={12} />
              </span>
            )}
          </span>
        </td>
        <td className="right" style={{ fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>{formatEur(row.montant_ht)}</td>
        <td className="center">
          <InlineCell row={row} field="taux_tva" editType={row.taux_tva === -1 ? undefined : 'pills'} value={String(row.taux_tva)}
            display={tvaBadge} options={tvaOptions} onSave={handleCellSave}
            onSplitClick={() => setSplitTarget(row)} />
        </td>
        <td className="right">
          <InlineCell row={row} field="montant_ttc" editType="number" value={String(row.montant_ttc)}
            display={<strong>{formatEur(row.montant_ttc)}</strong>} onSave={handleCellSave} />
        </td>
        <td>
          <InlineCell row={row} field="categorie" editType="combobox" value={row.categorie ?? ''}
            display={<span style={{ fontSize: 12, color: 'var(--pencil)', maxWidth: 200, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{row.categorie || '—'}</span>}
            groups={catGroups} onSave={handleCellSave} />
        </td>
        <td>
          <InlineCell row={row} field="statut" editType="select" value={row.statut}
            display={<span className={`dash-badge ${row.statut === 'payee' ? 'dash-badge-green' : 'dash-badge-orange'}`}>{row.statut === 'payee' ? 'Payée' : 'En attente'}</span>}
            options={statutOptions} onSave={handleCellSave} />
        </td>
        <td className="center" style={{ fontSize: 12, color: row.has_attachment ? '#16a34a' : 'var(--pencil)' }}>
          {row.bank_source ? (row.has_attachment ? '📎' : '—') : null}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <button className="dash-btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={() => { setActionError(null); if (isEntree) { setEditFact(row as unknown as Facture); setEditDep(null) } else { setEditDep(row as unknown as Depense); setEditFact(null) }; setShowForm(true) }}>
            Éditer
          </button>{' '}
          {isEntree && (
            <button className="dash-btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => window.open(`/transactions/imprimer/${row.id}`, '_blank')}>
              PDF
            </button>
          )}{' '}
          {isEntree && (
            <button className="dash-btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => { setEmailTarget({ id: row.id, client: (row as Facture & { _type: 'entree'; _key: string }).client }); setEmailInput(''); setEmailResult(null) }}>
              ✉
            </button>
          )}{' '}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 11, fontFamily: 'Courier Prime,monospace' }}
            onClick={() => setConfirmDelete(row)}>Suppr.</button>
        </td>
      </tr>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isEntrees = tab === 'entrees'
  const allPageSelected = pageRows.length > 0 && pageRows.every(r => selectedIds.has(r._key))

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Transactions</h1>
          <p className="dash-subtitle">{factures.length} entrée{factures.length !== 1 ? 's' : ''} · {depenses.length} sortie{depenses.length !== 1 ? 's' : ''}</p>
          {alertCount > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
              <AlertTriangle size={12} />
              {alertCount} transaction{alertCount > 1 ? 's' : ''} avec TVA à vérifier
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="dash-btn-ghost" onClick={exportCsv} disabled={filtered.length === 0} title={`Exporter ${filtered.length} ligne(s) en CSV`}>
            ↓ CSV {filtered.length > 0 && `(${filtered.length})`}
          </button>
          {tab !== 'tous' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="dash-btn" onClick={() => { setEditFact(null); setEditDep(null); setShowForm(true); setActionError(null) }}>
                {isEntrees ? '+ Nouvelle entrée' : '+ Nouvelle sortie'}
              </button>
              <span className="dash-kbd" title="Raccourci clavier">n</span>
            </div>
          )}
        </div>
      </div>

      <div className="dash-tabs">
        {(['tous', 'entrees', 'sorties'] as Tab[]).map(t => (
          <button key={t} className={`dash-tab ${tab === t ? 'dash-tab-active' : ''}`}
            onClick={() => { setTab(t); setSelectedIds(new Set()) }}>
            {t === 'tous' ? 'Tous' : t === 'entrees' ? 'Entrées' : 'Sorties'}
            <span style={{ marginLeft: 6, fontFamily: 'Courier Prime,monospace', fontSize: 11, opacity: 0.7 }}>
              {t === 'tous' ? factures.length + depenses.length : t === 'entrees' ? factures.length : depenses.length}
            </span>
          </button>
        ))}
      </div>

      {/* Period presets */}
      <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {([
          { label: 'Ce mois',      preset: 'month'    },
          { label: 'Ce trimestre', preset: 'quarter'  },
          { label: 'Ce semestre',  preset: 'semester' },
          { label: 'Cette année',  preset: 'year'     },
        ] as { label: string; preset: 'month' | 'quarter' | 'semester' | 'year' }[]).map(({ label, preset }) => {
          const isActive = (() => {
            const now = new Date()
            const y = now.getFullYear()
            const m = now.getMonth()
            if (preset === 'month') return filterDateFrom === `${y}-${String(m + 1).padStart(2, '0')}-01`
            if (preset === 'quarter') { const q = Math.floor(m / 3); return filterDateFrom === `${y}-${String(q * 3 + 1).padStart(2, '0')}-01` }
            if (preset === 'semester') return filterDateFrom === (m < 6 ? `${y}-01-01` : `${y}-07-01`)
            return filterDateFrom === `${y}-01-01` && filterDateTo === `${y}-12-31`
          })()
          return (
            <button
              key={preset}
              className="dash-btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px', fontWeight: isActive ? 700 : undefined, borderColor: isActive ? 'var(--ink)' : undefined, borderWidth: isActive ? '1.5px' : undefined }}
              onClick={() => applyPeriodPreset(preset)}
            >
              {label}
            </button>
          )
        })}
        {(filterDateFrom || filterDateTo) && (
          <button
            className="dash-btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px', color: 'var(--pencil)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setPage(1) }}
          >
            <X size={12} /> Effacer dates
          </button>
        )}
      </div>

      <div className="dash-filter-bar">
        <input className="dash-filter-input" type="text" placeholder="Rechercher un tiers…" value={filterTiers} onChange={e => setFilterTiers(e.target.value)} />
        <input className="dash-filter-input" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="Date début" />
        <ChevronRight size={14} style={{ color: 'var(--pencil)', flexShrink: 0 }} />
        <input className="dash-filter-input" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title="Date fin" />
        <select className="dash-filter-select" value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}>
          <option value="">Toutes catégories</option>
          {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="dash-filter-select" value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="payee">Payée</option>
          <option value="en_attente">En attente</option>
        </select>
        {hasFilters && <button className="dash-btn-ghost" onClick={() => { setFilterTiers(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterCategorie(''); setFilterStatut('') }} title="Effacer tous les filtres">×</button>}
      </div>

      {actionError && <div className="dash-error" style={{ marginBottom: 12 }}>⚠️ {actionError}</div>}

      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--offwhite)', border: '1px solid var(--rule)', borderRadius: 2, marginBottom: 12, fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
          <span>{selectedIds.size} ligne{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
          <button className="dash-btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelectedIds(new Set())}>Désélectionner</button>
          <button className="dash-btn-danger" style={{ fontSize: 12 }} onClick={() => setConfirmBulkDelete(true)}>Supprimer la sélection</button>
        </div>
      )}

      {loading && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: tab === 'tous' ? 11 : 10 }).map((_, j) => (
                    <td key={j}>
                      <span className="dash-skeleton-line" style={{ width: `${50 + (j * 19 + i * 31) % 45}%`, height: 13 }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="dash-error">{error}</div>}

      {!loading && (
        <>
          <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)', marginBottom: 8 }}>
            {filtered.length === 0
              ? (hasFilters ? 'Aucun résultat' : 'Aucune transaction')
              : hasFilters
                ? `${filtered.length} sur ${baseRows.length} — page ${safePage} / ${totalPages}`
                : `${baseRows.length} transaction${baseRows.length > 1 ? 's' : ''} — page ${safePage} / ${totalPages}`}
          </div>

          {pageRows.length === 0 && !hasFilters ? (
            <div className="dash-empty-state">
              <div className="dash-empty-state-glyph"><PenLine size={32} /></div>
              <p className="dash-empty-state-title">
                {tab === 'entrees' ? "Aucune entrée pour l’instant"
                  : tab === 'sorties' ? "Aucune sortie pour l’instant"
                  : "Aucune transaction pour l’instant"}
              </p>
              <p className="dash-empty-state-desc">
                {tab === 'entrees' ? "Enregistrez votre première facture client pour commencer à suivre votre chiffre d’affaires."
                  : tab === 'sorties' ? "Enregistrez votre première dépense pour suivre vos charges."
                  : "Passez sur l’onglet Entrées ou Sorties pour créer votre première transaction."}
              </p>
              {tab !== 'tous' && (
                <button className="dash-btn" onClick={() => { setEditFact(null); setEditDep(null); setShowForm(true); setActionError(null) }}>
                  {tab === 'entrees' ? '+ Nouvelle entrée' : '+ Nouvelle sortie'}
                </button>
              )}
            </div>
          ) : pageRows.length === 0 && hasFilters ? (
            <div className="dash-empty-state">
              <div className="dash-empty-state-glyph">◎</div>
              <p className="dash-empty-state-title">Aucun résultat</p>
              <p className="dash-empty-state-desc">Aucune transaction ne correspond aux filtres actifs.</p>
              <button className="dash-btn-ghost" onClick={() => { setFilterTiers(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterCategorie(''); setFilterStatut('') }}>
                × Effacer les filtres
              </button>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} title="Tout sélectionner" />
                    </th>
                    {tab === 'tous' && <th>Type</th>}
                    <th>Date</th>
                    <th>Tiers</th>
                    <th className="right">HT</th>
                    <th className="center">TVA</th>
                    <th className="right">TTC</th>
                    <th>Catégorie</th>
                    <th>Statut</th>
                    <th className="center">📎</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(row => renderRow(row))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={tab === 'tous' ? 4 : 3}><strong>Total ({filtered.length})</strong></td>
                    <td className="right"><strong>{formatEur(filtered.reduce((s, r) => s + r.montant_ht, 0))}</strong></td>
                    <td />
                    <td className="right"><strong>{formatEur(filtered.reduce((s, r) => s + r.montant_ttc, 0))}</strong></td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {showForm && (tab === 'entrees' || (tab === 'tous' && editFact)) && (
        <FactureModal initial={editFact} factures={factures} workspaceId={workspaceId} activiteType={activiteType}
          onSaved={() => { setShowForm(false); setEditFact(null); load() }} onClose={() => { setShowForm(false); setEditFact(null) }} />
      )}
      {showForm && (tab === 'sorties' || (tab === 'tous' && editDep)) && (
        <DepenseModal initial={editDep} workspaceId={workspaceId} activiteType={activiteType}
          onSaved={() => { setShowForm(false); setEditDep(null); load() }} onClose={() => { setShowForm(false); setEditDep(null) }} />
      )}

      {splitTarget && (
        <TvaSplitPanel row={splitTarget} onSave={handleSplitSave} onClose={() => setSplitTarget(null)} />
      )}

      {confirmDelete && (
        <div className="dash-modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="dash-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header"><h2 className="dash-modal-title">Confirmer la suppression</h2><button className="dash-modal-close" aria-label="Fermer" onClick={() => setConfirmDelete(null)}>×</button></div>
            <div className="dash-modal-body">
              <p style={{ fontSize: 14 }}>Supprimer cette transaction ?</p>
              <p style={{ fontSize: 13, color: '#dc2626', marginTop: 8 }}>Cette action est irréversible.</p>
            </div>
            <div className="dash-modal-footer">
              <button className="dash-btn-ghost" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button className="dash-btn-danger" onClick={() => handleDelete(confirmDelete)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {pendingCat && (
        <div className="dash-modal-backdrop" onClick={() => applyPropagation(false)}>
          <div className="dash-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header"><h2 className="dash-modal-title">Appliquer à toutes les transactions ?</h2><button className="dash-modal-close" aria-label="Fermer" onClick={() => applyPropagation(false)}>×</button></div>
            <div className="dash-modal-body">
              <p style={{ fontSize: 14 }}>Vous changez la catégorie en <strong>{pendingCat.newCategory}</strong>.</p>
              <p style={{ fontSize: 13, color: 'var(--pencil)', marginTop: 8 }}>
                {pendingCat.matchingRows.length} autre{pendingCat.matchingRows.length > 1 ? 's' : ''} transaction{pendingCat.matchingRows.length > 1 ? 's' : ''} liée{pendingCat.matchingRows.length > 1 ? 's' : ''} à <strong>{pendingCat.isEntree ? (pendingCat.row as Facture & { _key: string; _type: 'entree' }).client : (pendingCat.row as Depense & { _key: string; _type: 'sortie' }).fournisseur}</strong>{pendingCat.matchingRows.length > 1 ? ' ont' : ' a'} une catégorie différente.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
                {pendingCat.matchingRows.slice(0, 5).map(r => (
                  <li key={r._key} style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.date} — {formatEur(r.montant_ttc)}</span>
                    <span style={{ color: 'var(--pencil)' }}>{r.categorie}</span>
                  </li>
                ))}
                {pendingCat.matchingRows.length > 5 && <li style={{ fontSize: 12, color: 'var(--pencil)', paddingTop: 4 }}>…et {pendingCat.matchingRows.length - 5} autre{pendingCat.matchingRows.length - 5 > 1 ? 's' : ''}</li>}
              </ul>
            </div>
            <div className="dash-modal-footer">
              <button className="dash-btn-ghost" onClick={() => applyPropagation(false)}>Juste cette fois</button>
              <button className="dash-btn" onClick={() => applyPropagation(true)}>Appliquer à toutes ({pendingCat.matchingRows.length + 1})</button>
            </div>
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <div className="dash-modal-backdrop" onClick={() => setConfirmBulkDelete(false)}>
          <div className="dash-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header"><h2 className="dash-modal-title">Suppression en masse</h2><button className="dash-modal-close" aria-label="Fermer" onClick={() => setConfirmBulkDelete(false)}>×</button></div>
            <div className="dash-modal-body">
              <p style={{ fontSize: 14 }}>Supprimer <strong>{selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''}</strong> ?</p>
              <p style={{ fontSize: 13, color: '#dc2626', marginTop: 8 }}>Cette action est irréversible.</p>
            </div>
            <div className="dash-modal-footer">
              <button className="dash-btn-ghost" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting}>Annuler</button>
              <button className="dash-btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? 'Suppression…' : `Supprimer ${selectedIds.size} ligne${selectedIds.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email modal */}
      {emailTarget && typeof document !== 'undefined' && createPortal(
        <div className="dash-modal-overlay" onClick={() => setEmailTarget(null)}>
          <div className="dash-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h3 className="dash-modal-title">Envoyer la facture</h3>
              <button className="dash-modal-close" onClick={() => setEmailTarget(null)}><X size={14} /></button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 13, color: 'var(--pencil)', marginBottom: 16 }}>
                Destinataire pour <strong>{emailTarget.client}</strong>
              </p>
              <input
                type="email"
                className="dash-input"
                placeholder="email@client.fr"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendEmail() }}
                disabled={emailSending}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
              />
              {emailResult && (
                <p style={{ fontSize: 12, color: emailResult.ok ? '#16a34a' : '#dc2626', marginBottom: 12 }}>
                  {emailResult.msg}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="dash-btn-ghost" onClick={() => setEmailTarget(null)} disabled={emailSending}>Annuler</button>
                <button className="dash-btn" onClick={handleSendEmail} disabled={emailSending || !emailInput}>
                  {emailSending ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
