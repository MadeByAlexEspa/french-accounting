'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Facture, Depense } from '@/lib/types/database'

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const CAT_ENTREES = ['Ventes de marchandises', 'Prestations de services', 'Produits financiers', 'Autres produits']
const CAT_SORTIES = [
  'Achats de marchandises', 'Achats de matières premières', 'Frais de personnel',
  'Loyers et charges locatives', 'Frais de déplacement', 'Publicité et marketing',
  'Frais bancaires', 'Assurances', 'Honoraires', 'Matériel et équipement',
  'Logiciels et abonnements', 'Fournitures de bureau', 'Charges sociales',
  'Impôts et taxes', 'Autres charges',
]
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
          <button className="dash-modal-close" onClick={onClose}>×</button>
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
                <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
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

// ── Entry Form Modal ───────────────────────────────────────────────────────────

interface FForm { date: string; client: string; description: string; montant_ht: string; taux_tva: string; categorie: string; statut: 'payee' | 'en_attente' }
interface DForm { date: string; fournisseur: string; description: string; montant_ht: string; taux_tva: string; categorie: string; statut: 'payee' | 'en_attente' }

function FactureModal({ initial, factures, workspaceId, onSaved, onClose }: {
  initial?: Facture | null; factures: Facture[]; workspaceId: string; onSaved: () => void; onClose: () => void
}) {
  const [form, setForm] = useState<FForm>({
    date: initial?.date ?? today(), client: initial?.client ?? '',
    description: initial?.description ?? '',
    montant_ht: initial ? String(initial.montant_ht) : '',
    taux_tva: initial ? String(Math.max(0, initial.taux_tva)) : '20',
    categorie: initial?.categorie ?? CAT_ENTREES[0], statut: initial?.statut ?? 'en_attente',
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
          <button className="dash-modal-close" onClick={onClose}>×</button>
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
                {CAT_ENTREES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
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

function DepenseModal({ initial, workspaceId, onSaved, onClose }: {
  initial?: Depense | null; workspaceId: string; onSaved: () => void; onClose: () => void
}) {
  const [form, setForm] = useState<DForm>({
    date: initial?.date ?? today(), fournisseur: initial?.fournisseur ?? '',
    description: initial?.description ?? '',
    montant_ht: initial ? String(initial.montant_ht) : '',
    taux_tva: initial ? String(Math.max(0, initial.taux_tva)) : '20',
    categorie: initial?.categorie ?? CAT_SORTIES[0], statut: initial?.statut ?? 'en_attente',
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
          <button className="dash-modal-close" onClick={onClose}>×</button>
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
                {CAT_SORTIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
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

// ── Inline Cell ────────────────────────────────────────────────────────────────

function InlineCell({ rowKey, field, display, editType, value, options, catOptions, onStartEdit, onSave, isEditing, editingValue, setEditingValue, onSplitClick }: {
  rowKey: string; field: string; display: React.ReactNode; editType?: string
  value: string; options?: { value: string; label: string }[]; catOptions?: string[]
  onStartEdit: (rowKey: string, field: string, value: string) => void
  onSave: (value: string) => void; isEditing: boolean
  editingValue: string; setEditingValue: (v: string) => void
  onSplitClick?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (isEditing && inputRef.current) inputRef.current.focus() }, [isEditing])

  if (!editType) return <>{display}</>

  if (isEditing) {
    if (editType === 'pills') {
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(options ?? []).map(o => (
            <button key={o.value} type="button"
              style={{ padding: '2px 8px', fontSize: 11, border: '1px solid', borderRadius: 2, cursor: 'pointer', background: editingValue === o.value ? 'var(--ink)' : '#fff', color: editingValue === o.value ? '#fff' : 'var(--ink)', fontFamily: 'Courier Prime,monospace' }}
              onClick={() => { setEditingValue(o.value); onSave(o.value) }}>
              {o.label}
            </button>
          ))}
          <button type="button" style={{ padding: '2px 4px', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--pencil)' }}
            onClick={() => onSave(editingValue)}>✕</button>
        </div>
      )
    }
    if (editType === 'select') {
      return (
        <select autoFocus value={editingValue} style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--ink)', borderRadius: 2, fontFamily: 'Courier Prime,monospace' }}
          onChange={e => setEditingValue(e.target.value)}
          onBlur={() => onSave(editingValue)}>
          {(options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    }
    if (editType === 'combobox') {
      const listId = `cat-list-${rowKey}-${field}`
      return (
        <div style={{ position: 'relative' }}>
          <input ref={inputRef} list={listId} value={editingValue}
            style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--ink)', borderRadius: 2, fontFamily: 'Courier Prime,monospace', width: 160 }}
            onChange={e => setEditingValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave(editingValue) } if (e.key === 'Escape') onSave(value) }}
            onBlur={() => onSave(editingValue)} />
          <datalist id={listId}>
            {(catOptions ?? []).map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      )
    }
    // date, number, text
    return (
      <input ref={inputRef} type={editType} value={editingValue} step={editType === 'number' ? '0.01' : undefined}
        style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--ink)', borderRadius: 2, fontFamily: 'Courier Prime,monospace', width: editType === 'date' ? 120 : editType === 'number' ? 80 : 130 }}
        onChange={e => setEditingValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave(editingValue) } if (e.key === 'Escape') onSave(value) }}
        onBlur={() => onSave(editingValue)} />
    )
  }

  if (field === 'taux_tva') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ cursor: 'pointer' }} onClick={() => onStartEdit(rowKey, field, value)}>{display}</span>
        {onSplitClick && (
          <button type="button" title="Ventiler la TVA" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSplitClick() }}
            style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 2, cursor: 'pointer', fontSize: 10, padding: '1px 4px', color: 'var(--pencil)', lineHeight: 1 }}>⊞</button>
        )}
      </span>
    )
  }

  return (
    <span style={{ cursor: 'pointer', display: 'block', minHeight: 20 }}
      onClick={() => onStartEdit(rowKey, field, value)}
      title="Cliquer pour modifier">
      {display}
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

export default function TransactionsPage() {
  const [tab, setTab] = useState<Tab>('tous')
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterTiers, setFilterTiers] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCategorie, setFilterCategorie] = useState('')
  const [filterStatut, setFilterStatut] = useState('')

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

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ rowKey: string; field: string } | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expirée'); return }
      const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
      if (!m) { setError('Workspace introuvable'); return }
      setWorkspaceId(m.workspace_id)
      const [{ data: f, error: fe }, { data: d, error: de }] = await Promise.all([
        supabase.from('factures').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }).limit(500),
        supabase.from('depenses').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }).limit(500),
      ])
      if (fe || de) { setError((fe ?? de)?.message ?? 'Erreur de chargement'); return }
      setFactures((f ?? []) as Facture[])
      setDepenses((d ?? []) as Depense[])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [filterTiers, filterDateFrom, filterDateTo, filterCategorie, filterStatut, tab])

  // ── Rows ───────────────────────────────────────────────────────────────────

  const allRows = useMemo<AnyRow[]>(() => {
    const entries: AnyRow[] = factures.map(f => ({ ...f, _type: 'entree' as const, _key: `entree-${f.id}` }))
    const exits: AnyRow[] = depenses.map(d => ({ ...d, _type: 'sortie' as const, _key: `sortie-${d.id}` }))
    return [...entries, ...exits].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [factures, depenses])

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

  // ── Cell save logic ────────────────────────────────────────────────────────

  function startEditing(rowKey: string, field: string, value: string) {
    setEditingCell({ rowKey, field })
    setEditingValue(value)
  }

  async function handleCellSave(row: AnyRow, field: string, rawValue: string) {
    setEditingCell(null)
    const supabase = createClient()
    const isEntree = row._type === 'entree'

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let patch: Record<string, any>

      if (field === 'taux_tva') {
        if (row.taux_tva === -1) return // multi-TVA, use split panel
        const taux = parseFloat(rawValue) || 0
        patch = { taux_tva: taux, montant_ht: round2(row.montant_ttc / (1 + taux / 100)), montant_tva: round2(row.montant_ttc - round2(row.montant_ttc / (1 + taux / 100))) }
      } else if (field === 'montant_ttc') {
        const ttc = round2(parseFloat(rawValue) || 0)
        const taux = row.taux_tva >= 0 ? row.taux_tva : 0
        patch = recalcFromTtc(ttc, taux)
      } else if (field === 'categorie') {
        // Check for propagation
        const tiers = isEntree ? (row as Facture & { _type: 'entree'; _key: string }).client : (row as Depense & { _type: 'sortie'; _key: string }).fournisseur
        const pool = (isEntree ? allRows.filter(r => r._type === 'entree') : allRows.filter(r => r._type === 'sortie')) as AnyRow[]
        const tiersKey = isEntree ? 'client' : 'fournisseur'
        const matches = pool.filter(r => (r as unknown as Record<string,unknown>)[tiersKey] === tiers && r.id !== row.id && r.categorie !== rawValue)
        if (matches.length > 0) {
          setPendingCat({ row, newCategory: rawValue, matchingRows: matches, isEntree })
          // Apply to current row immediately
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
      // Optimistic update
      if (isEntree) setFactures(fs => fs.map(f => f.id === row.id ? { ...f, ...patch } : f))
      else setDepenses(ds => ds.map(d => d.id === row.id ? { ...d, ...patch } : d))
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Erreur'); load() }
  }

  async function handleSplitSave(row: AnyRow, lines: TvaLineData[]) {
    const supabase = createClient()
    const totalHt = round2(lines.reduce((s, l) => s + l.montant_ht, 0))
    const totalTva = round2(lines.reduce((s, l) => s + l.montant_tva, 0))
    const patch = { taux_tva: -1, montant_ht: totalHt, montant_tva: totalTva, tva_lines: lines }
    if (row._type === 'entree') await supabase.from('factures').update(patch).eq('id', row.id)
    else await supabase.from('depenses').update(patch).eq('id', row.id)
    setSplitTarget(null)
    await load()
  }

  async function handleDelete(row: AnyRow) {
    const supabase = createClient()
    if (row._type === 'entree') await supabase.from('factures').delete().eq('id', row.id)
    else await supabase.from('depenses').delete().eq('id', row.id)
    setConfirmDelete(null)
    await load()
  }

  async function handleBulkDelete() {
    setBulkDeleting(true); setActionError(null)
    const supabase = createClient()
    const errs: string[] = []
    for (const key of selectedIds) {
      try {
        if (key.startsWith('entree-')) await supabase.from('factures').delete().eq('id', parseInt(key.slice(7)))
        else await supabase.from('depenses').delete().eq('id', parseInt(key.slice(7)))
      } catch (e: unknown) { errs.push(e instanceof Error ? e.message : key) }
    }
    setSelectedIds(new Set()); setConfirmBulkDelete(false); setBulkDeleting(false)
    if (errs.length) setActionError(`${errs.length} suppression(s) ont échoué.`)
    await load()
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

  // ── Columns ────────────────────────────────────────────────────────────────

  function renderRow(row: AnyRow) {
    const isEntree = row._type === 'entree'
    const tiers = isEntree ? (row as Facture & { _type: 'entree'; _key: string }).client : (row as Depense & { _type: 'sortie'; _key: string }).fournisseur
    const key = row._key
    const isCellEditing = (field: string) => editingCell?.rowKey === key && editingCell?.field === field

    const cats = isEntree ? CAT_ENTREES : CAT_SORTIES
    const statutOptions = [{ value: 'payee', label: 'Payée' }, { value: 'en_attente', label: 'En attente' }]
    const tvaOptions = TVA_RATES.map(v => ({ value: v, label: `${v} %` }))

    const tvaBadge = row.taux_tva === -1
      ? <span className="dash-badge dash-badge-blue" style={{ fontSize: 10 }}>Multi</span>
      : `${row.taux_tva} %`

    return (
      <tr key={key} style={{ background: selectedIds.has(key) ? '#f0f4ff' : undefined }}>
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
          <InlineCell rowKey={key} field="date" editType="date" value={row.date}
            display={row.date} options={[]} onStartEdit={startEditing} onSave={v => handleCellSave(row, 'date', v)}
            isEditing={isCellEditing('date')} editingValue={editingValue} setEditingValue={setEditingValue} />
        </td>
        <td>
          <InlineCell rowKey={key} field={isEntree ? 'client' : 'fournisseur'} editType="text" value={tiers}
            display={tiers || '—'} onStartEdit={startEditing} onSave={v => handleCellSave(row, isEntree ? 'client' : 'fournisseur', v)}
            isEditing={isCellEditing(isEntree ? 'client' : 'fournisseur')} editingValue={editingValue} setEditingValue={setEditingValue} />
        </td>
        <td className="right" style={{ fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>{formatEur(row.montant_ht)}</td>
        <td className="center">
          <InlineCell rowKey={key} field="taux_tva" editType={row.taux_tva === -1 ? undefined : 'pills'} value={String(row.taux_tva)}
            display={tvaBadge} options={tvaOptions} onStartEdit={startEditing}
            onSave={v => handleCellSave(row, 'taux_tva', v)}
            isEditing={isCellEditing('taux_tva')} editingValue={editingValue} setEditingValue={setEditingValue}
            onSplitClick={() => setSplitTarget(row)} />
        </td>
        <td className="right">
          <InlineCell rowKey={key} field="montant_ttc" editType="number" value={String(row.montant_ttc)}
            display={<strong>{formatEur(row.montant_ttc)}</strong>} onStartEdit={startEditing}
            onSave={v => handleCellSave(row, 'montant_ttc', v)}
            isEditing={isCellEditing('montant_ttc')} editingValue={editingValue} setEditingValue={setEditingValue} />
        </td>
        <td>
          <InlineCell rowKey={key} field="categorie" editType="combobox" value={row.categorie ?? ''}
            display={<span style={{ fontSize: 12, color: 'var(--pencil)' }}>{row.categorie}</span>} catOptions={cats}
            onStartEdit={startEditing} onSave={v => handleCellSave(row, 'categorie', v)}
            isEditing={isCellEditing('categorie')} editingValue={editingValue} setEditingValue={setEditingValue} />
        </td>
        <td>
          <InlineCell rowKey={key} field="statut" editType="select" value={row.statut}
            display={<span className={`dash-badge ${row.statut === 'payee' ? 'dash-badge-green' : 'dash-badge-orange'}`}>{row.statut === 'payee' ? 'Payée' : 'En attente'}</span>}
            options={statutOptions} onStartEdit={startEditing} onSave={v => handleCellSave(row, 'statut', v)}
            isEditing={isCellEditing('statut')} editingValue={editingValue} setEditingValue={setEditingValue} />
        </td>
        <td className="center" style={{ fontSize: 12, color: row.has_attachment ? '#16a34a' : 'var(--pencil)' }}>
          {row.bank_source ? (row.has_attachment ? '📎' : '—') : null}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <button className="dash-btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={() => { setActionError(null); if (isEntree) { setEditFact(row as unknown as Facture); setEditDep(null) } else { setEditDep(row as unknown as Depense); setEditFact(null) }; setShowForm(true) }}>
            Éditer
          </button>{' '}
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
        </div>
        {tab !== 'tous' && (
          <button className="dash-btn" onClick={() => { setEditFact(null); setEditDep(null); setShowForm(true); setActionError(null) }}>
            {isEntrees ? '+ Nouvelle entrée' : '+ Nouvelle sortie'}
          </button>
        )}
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

      <div className="dash-filter-bar">
        <input className="dash-filter-input" type="text" placeholder="Rechercher un tiers…" value={filterTiers} onChange={e => setFilterTiers(e.target.value)} />
        <input className="dash-filter-input" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="Date début" />
        <span style={{ color: 'var(--pencil)', fontSize: 13, padding: '0 2px' }}>→</span>
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
        {hasFilters && <button className="dash-btn-ghost" onClick={() => { setFilterTiers(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterCategorie(''); setFilterStatut('') }}>× Effacer</button>}
      </div>

      {actionError && <div className="dash-error" style={{ marginBottom: 12 }}>⚠️ {actionError}</div>}

      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--offwhite)', border: '1px solid var(--rule)', borderRadius: 2, marginBottom: 12, fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
          <span>{selectedIds.size} ligne{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
          <button className="dash-btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelectedIds(new Set())}>Désélectionner</button>
          <button className="dash-btn-danger" style={{ fontSize: 12 }} onClick={() => setConfirmBulkDelete(true)}>Supprimer la sélection</button>
        </div>
      )}

      {loading && <div className="dash-loading">Chargement…</div>}
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
                {pageRows.length === 0
                  ? <tr><td colSpan={tab === 'tous' ? 11 : 10} className="dash-empty">Aucune transaction.</td></tr>
                  : pageRows.map(row => renderRow(row))
                }
              </tbody>
              {pageRows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={tab === 'tous' ? 4 : 3}><strong>Total ({filtered.length})</strong></td>
                    <td className="right"><strong>{formatEur(filtered.reduce((s, r) => s + r.montant_ht, 0))}</strong></td>
                    <td />
                    <td className="right"><strong>{formatEur(filtered.reduce((s, r) => s + r.montant_ttc, 0))}</strong></td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {showForm && (tab === 'entrees' || (tab === 'tous' && editFact)) && (
        <FactureModal initial={editFact} factures={factures} workspaceId={workspaceId}
          onSaved={() => { setShowForm(false); setEditFact(null); load() }} onClose={() => { setShowForm(false); setEditFact(null) }} />
      )}
      {showForm && (tab === 'sorties' || (tab === 'tous' && editDep)) && (
        <DepenseModal initial={editDep} workspaceId={workspaceId}
          onSaved={() => { setShowForm(false); setEditDep(null); load() }} onClose={() => { setShowForm(false); setEditDep(null) }} />
      )}

      {splitTarget && (
        <TvaSplitPanel row={splitTarget} onSave={handleSplitSave} onClose={() => setSplitTarget(null)} />
      )}

      {confirmDelete && (
        <div className="dash-modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="dash-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header"><h2 className="dash-modal-title">Confirmer la suppression</h2><button className="dash-modal-close" onClick={() => setConfirmDelete(null)}>×</button></div>
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
            <div className="dash-modal-header"><h2 className="dash-modal-title">Appliquer à toutes les transactions ?</h2><button className="dash-modal-close" onClick={() => applyPropagation(false)}>×</button></div>
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
            <div className="dash-modal-header"><h2 className="dash-modal-title">Suppression en masse</h2><button className="dash-modal-close" onClick={() => setConfirmBulkDelete(false)}>×</button></div>
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
    </div>
  )
}
