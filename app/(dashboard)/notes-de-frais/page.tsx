'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Depense } from '@/lib/types/database'

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function round2(n: number) { return Math.round(n * 100) / 100 }
function today() { return new Date().toISOString().slice(0, 10) }

const TVA_RATES = [
  { value: 20,  label: '20 % — Taux normal' },
  { value: 10,  label: '10 % — Taux intermédiaire' },
  { value: 5.5, label: '5,5 % — Taux réduit' },
  { value: 0,   label: '0 % — Exonéré / art. 293B' },
]

const CAT_SORTIES = [
  'Frais de déplacement', 'Repas et réceptions', 'Fournitures de bureau',
  'Frais de personnel', 'Publicité et marketing', 'Autres charges',
]

interface NoteForm {
  date: string; description: string; montant_ttc: string
  fournisseur: string; categorie: string; taux_tva: number
}

export default function NotesDefraisPage() {
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [file, setFile]         = useState<File | null>(null)
  const [preview, setPreview]   = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<NoteForm>({
    date: today(), description: '', montant_ttc: '', fournisseur: '',
    categorie: CAT_SORTIES[0], taux_tva: 20,
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expirée — rechargez la page.'); return }
      const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
      if (!m) { setError('Workspace introuvable.'); return }
      setWorkspaceId(m.workspace_id)
      const { data: d, error: de } = await supabase
        .from('depenses').select('*')
        .eq('workspace_id', m.workspace_id)
        .or('bank_source.eq.note_de_frais,bank_source.ilike.upload:%')
        .order('date', { ascending: false })
      if (de) { setError(de.message); return }
      setDepenses((d ?? []) as Depense[])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    if (f.type.startsWith('image/')) {
      setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
    } else {
      setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }

  function resetForm() {
    setFile(null)
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setForm({ date: today(), description: '', montant_ttc: '', fournisseur: '', categorie: CAT_SORTIES[0], taux_tva: 20 })
    setFormOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(null)
    const supabase = createClient()
    const ttc = parseFloat(form.montant_ttc.replace(',', '.'))
    if (!ttc || ttc <= 0) { setError('Le montant TTC doit être supérieur à 0.'); setSubmitting(false); return }
    const taux = form.taux_tva
    const ht  = taux === 0 ? ttc : round2(ttc / (1 + taux / 100))
    const tva = round2(ttc - ht)
    const { error: err } = await supabase.from('depenses').insert({
      workspace_id: workspaceId,
      date: form.date, fournisseur: form.fournisseur || 'Note de frais',
      description: form.description || null, categorie: form.categorie,
      statut: 'en_attente', montant_ht: ht, taux_tva: taux, montant_tva: tva, montant_ttc: ttc,
      bank_source: file ? `upload:${file.name}` : 'note_de_frais',
      has_attachment: !!file,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    resetForm(); await load(); setSubmitting(false)
  }

  async function handleDelete(id: number) {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('depenses').delete().eq('id', id)
    setConfirmDeleteId(null); setDeleting(false); await load()
  }

  async function handlePushUpdate(id: number, status: 'sent' | 'rejected' | null, target: 'qonto' | 'shine' | null) {
    const supabase = createClient()
    await supabase.from('depenses').update({ push_status: status, push_target: target }).eq('id', id)
    setDepenses(prev => prev.map(d => d.id === id ? { ...d, push_status: status, push_target: target } : d))
  }

  // Category breakdown for footer
  const catTotals = depenses.reduce<Record<string, number>>((acc, d) => {
    acc[d.categorie] = round2((acc[d.categorie] ?? 0) + d.montant_ttc)
    return acc
  }, {})
  const grandTotal = round2(depenses.reduce((s, d) => s + d.montant_ttc, 0))

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Notes de frais</h1>
          <p className="dash-subtitle">
            {loading ? '…' : `${depenses.length} note${depenses.length !== 1 ? 's' : ''} · ${formatEur(grandTotal)} TTC`}
          </p>
        </div>
        <button className="dash-btn" onClick={() => setFormOpen(v => !v)}>
          + Ajouter une note
        </button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {formOpen && (
        <div className="dash-card" style={{ marginBottom: 24 }}>
          <div className="dash-card-title">Nouvelle note de frais</div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{ border: '2px dashed var(--rule)', padding: 24, textAlign: 'center', cursor: 'pointer', background: 'var(--offwhite)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                {preview
                  ? <img src={preview} alt="Aperçu du justificatif" style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain' }} />
                  : <div style={{ color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                      <div>Appuyer pour prendre une photo ou choisir un fichier</div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>JPEG, PNG, HEIC, PDF — max 10 Mo</div>
                    </div>
                }
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} aria-label="Choisir un justificatif" />
              </div>
              {file && <div style={{ fontFamily: 'Courier Prime,monospace', fontSize: 12, color: 'var(--pencil)' }}>📎 {file.name}</div>}
              <div className="dash-field-row">
                <div className="dash-field">
                  <label className="dash-field-label" htmlFor="ndf-date">Date</label>
                  <input id="ndf-date" type="date" className="dash-field-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="dash-field">
                  <label className="dash-field-label" htmlFor="ndf-montant">Montant TTC (€)</label>
                  <input id="ndf-montant" type="number" step="0.01" min="0.01" className="dash-field-input" value={form.montant_ttc} onChange={e => setForm(f => ({ ...f, montant_ttc: e.target.value }))} placeholder="0.00" required />
                </div>
              </div>
              <div className="dash-field-row">
                <div className="dash-field">
                  <label className="dash-field-label" htmlFor="ndf-tva">Taux TVA</label>
                  <select id="ndf-tva" className="dash-field-select" value={form.taux_tva} onChange={e => setForm(f => ({ ...f, taux_tva: parseFloat(e.target.value) }))}>
                    {TVA_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="dash-field">
                  <label className="dash-field-label" htmlFor="ndf-fournisseur">Fournisseur</label>
                  <input id="ndf-fournisseur" type="text" className="dash-field-input" value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} placeholder="Taxi, Restaurant, SNCF…" />
                </div>
              </div>
              <div className="dash-field">
                <label className="dash-field-label" htmlFor="ndf-description">Description</label>
                <input id="ndf-description" type="text" className="dash-field-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="ex. Repas client, Taxi aéroport…" />
              </div>
              <div className="dash-field">
                <label className="dash-field-label" htmlFor="ndf-categorie">Catégorie</label>
                <select id="ndf-categorie" className="dash-field-select" value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}>
                  {CAT_SORTIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="dash-btn-ghost" onClick={resetForm}>Annuler</button>
                <button type="submit" className="dash-btn" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Skeleton loader */}
      {loading && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th>
                <th>TVA</th><th>Statut</th><th className="center">PJ</th><th className="center">Banque</th>
                <th className="right">TTC</th><th></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j}>
                      <span
                        className="dash-skeleton-line"
                        style={{ height: 14, width: j === 0 ? 80 : j === 2 ? 160 : j === 8 ? 70 : 100, display: 'block' }}
                      />
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && depenses.length === 0 && !formOpen && (
        <div className="dash-empty-state">
          <span className="dash-empty-state-glyph">📷</span>
          <p className="dash-empty-state-title">Aucune note de frais</p>
          <p className="dash-empty-state-desc">Photographiez vos justificatifs et enregistrez vos frais professionnels pour les déduire de votre résultat.</p>
          <button className="dash-btn" onClick={() => setFormOpen(true)}>+ Ajouter une note</button>
        </div>
      )}

      {/* Table */}
      {!loading && depenses.length > 0 && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th>
                <th className="center">TVA</th><th>Statut</th><th className="center">PJ</th><th className="center">Banque</th>
                <th className="right">TTC</th><th></th>
              </tr>
            </thead>
            <tbody>
              {depenses.map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>{d.date}</td>
                  <td>{d.fournisseur}</td>
                  <td style={{ fontSize: 12, color: 'var(--pencil)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--pencil)' }}>{d.categorie}</td>
                  <td className="center" style={{ fontSize: 11, fontFamily: 'Courier Prime,monospace' }}>{d.taux_tva} %</td>
                  <td>
                    <span className={`dash-badge ${d.statut === 'payee' ? 'dash-badge-green' : 'dash-badge-orange'}`}>
                      {d.statut === 'payee' ? 'Remboursée' : 'En attente'}
                    </span>
                  </td>
                  <td className="center" style={{ color: d.has_attachment ? '#16a34a' : 'var(--pencil)', fontSize: 14 }}>
                    {d.has_attachment ? '📎' : '—'}
                  </td>
                  <td className="center">
                    {(() => {
                      if (d.push_status === 'sent') {
                        return (
                          <span
                            className="dash-badge dash-badge-green"
                            style={{ cursor: 'pointer', fontSize: 10 }}
                            title="Cliquer pour changer le statut"
                            onClick={() => handlePushUpdate(d.id, null, null)}
                          >
                            ✓ {d.push_target === 'qonto' ? 'Qonto' : 'Shine'}
                          </span>
                        )
                      }
                      if (d.push_status === 'rejected') {
                        return (
                          <span
                            className="dash-badge dash-badge-red"
                            style={{ cursor: 'pointer', fontSize: 10 }}
                            title="Cliquer pour réinitialiser"
                            onClick={() => handlePushUpdate(d.id, null, null)}
                          >
                            ✗ Rejeté
                          </span>
                        )
                      }
                      return (
                        <select
                          className="dash-filter-select"
                          style={{ fontSize: 10, padding: '2px 4px', minWidth: 90 }}
                          value=""
                          onChange={e => {
                            const val = e.target.value
                            if (val === 'qonto') handlePushUpdate(d.id, 'sent', 'qonto')
                            else if (val === 'shine') handlePushUpdate(d.id, 'sent', 'shine')
                            else if (val === 'rejected') handlePushUpdate(d.id, 'rejected', null)
                          }}
                        >
                          <option value="">— À transmettre</option>
                          <option value="qonto">✓ Envoyé Qonto</option>
                          <option value="shine">✓ Envoyé Shine</option>
                          <option value="rejected">✗ Rejeté</option>
                        </select>
                      )
                    })()}
                  </td>
                  <td className="right" style={{ fontFamily: 'Courier Prime,monospace', fontWeight: 700 }}>{formatEur(d.montant_ttc)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {confirmDeleteId === d.id ? (
                      <>
                        <button
                          style={{ background: '#dc2626', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Courier Prime,monospace', padding: '2px 8px' }}
                          onClick={() => handleDelete(d.id)}
                          disabled={deleting}
                          aria-label={`Confirmer la suppression de la note ${d.fournisseur}`}
                        >
                          {deleting ? '…' : 'Confirmer'}
                        </button>{' '}
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}
                          onClick={() => setConfirmDeleteId(null)}
                          aria-label="Annuler la suppression"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 11, fontFamily: 'Courier Prime,monospace' }}
                        onClick={() => setConfirmDeleteId(d.id)}
                        aria-label={`Supprimer la note ${d.fournisseur}`}
                      >
                        Suppr.
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                <tr key={cat} style={{ fontSize: 12, color: 'var(--pencil)' }}>
                  <td colSpan={8} style={{ fontFamily: 'Courier Prime,monospace', paddingTop: 4 }}>{cat}</td>
                  <td className="right" style={{ fontFamily: 'Courier Prime,monospace', paddingTop: 4 }}>{formatEur(total)}</td>
                  <td />
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--ink)' }}>
                <td colSpan={8}><strong>Total général</strong></td>
                <td className="right"><strong style={{ fontFamily: 'Courier Prime,monospace' }}>{formatEur(grandTotal)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
