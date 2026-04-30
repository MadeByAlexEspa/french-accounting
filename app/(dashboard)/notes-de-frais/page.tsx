'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Depense } from '@/lib/types/database'

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }

interface NoteForm {
  date: string
  description: string
  montant_ttc: string
  fournisseur: string
  categorie: string
}

function today() { return new Date().toISOString().slice(0, 10) }

const CAT_SORTIES = [
  'Frais de déplacement', 'Repas et réceptions', 'Fournitures de bureau',
  'Frais de personnel', 'Publicité et marketing', 'Autres charges',
]

function round2(n: number) { return Math.round(n * 100) / 100 }

export default function NotesDefraisPage() {
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string|null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [file, setFile]         = useState<File|null>(null)
  const [preview, setPreview]   = useState<string|null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<NoteForm>({
    date: today(), description: '', montant_ttc: '', fournisseur: '', categorie: CAT_SORTIES[0],
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
      const { data: d, error: de } = await supabase.from('depenses').select('*')
        .eq('workspace_id', m.workspace_id).or('bank_source.eq.note_de_frais,bank_source.ilike.upload:%').order('date', { ascending: false })
      if (de) { setError(de.message); return }
      setDepenses((d ?? []) as Depense[])
    } finally {
      setLoading(false)
    }
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
    setFile(null); setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setForm({ date: today(), description: '', montant_ttc: '', fournisseur: '', categorie: CAT_SORTIES[0] })
    setFormOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(null)
    const supabase = createClient()
    const ttc = parseFloat(form.montant_ttc.replace(',', '.')) || 0
    const taux = 20
    const ht = round2(ttc / (1 + taux / 100))
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

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Notes de frais</h1>
          <p className="dash-subtitle">Photographiez vos justificatifs et enregistrez vos frais</p>
        </div>
        <button className="dash-btn" onClick={()=>setFormOpen(v=>!v)}>
          + Ajouter une note
        </button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {formOpen && (
        <div className="dash-card" style={{ marginBottom:24 }}>
          <div className="dash-card-title">Nouvelle note de frais</div>
          <form onSubmit={handleSubmit}>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div
                style={{ border:'2px dashed var(--rule)', borderRadius:2, padding:24, textAlign:'center', cursor:'pointer', background:'var(--offwhite)' }}
                onClick={()=>fileInputRef.current?.click()}
              >
                {preview
                  ? <img src={preview} alt="Aperçu" style={{ maxHeight:160, maxWidth:'100%', objectFit:'contain' }} />
                  : <div style={{ color:'var(--pencil)', fontFamily:'Courier Prime,monospace', fontSize:13 }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>📷</div>
                      <div>Appuyer pour prendre une photo ou choisir un fichier</div>
                      <div style={{ fontSize:11, marginTop:4 }}>JPEG, PNG, HEIC, PDF — max 10 Mo</div>
                    </div>
                }
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFileChange} style={{ display:'none' }} />
              </div>
              {file && <div style={{ fontFamily:'Courier Prime,monospace', fontSize:12, color:'var(--pencil)' }}>📎 {file.name}</div>}
              <div className="dash-field-row">
                <div className="dash-field"><label className="dash-field-label">Date</label>
                  <input type="date" className="dash-field-input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} required /></div>
                <div className="dash-field"><label className="dash-field-label">Montant TTC (€)</label>
                  <input type="number" step="0.01" min="0" className="dash-field-input" value={form.montant_ttc} onChange={e=>setForm(f=>({...f,montant_ttc:e.target.value}))} placeholder="0.00" /></div>
              </div>
              <div className="dash-field"><label className="dash-field-label">Fournisseur</label>
                <input type="text" className="dash-field-input" value={form.fournisseur} onChange={e=>setForm(f=>({...f,fournisseur:e.target.value}))} placeholder="Taxi, Restaurant, SNCF…" /></div>
              <div className="dash-field"><label className="dash-field-label">Description</label>
                <input type="text" className="dash-field-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="ex. Repas client, Taxi aéroport…" /></div>
              <div className="dash-field"><label className="dash-field-label">Catégorie</label>
                <select className="dash-field-select" value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}>
                  {CAT_SORTIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select></div>
              <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
                <button type="button" className="dash-btn-ghost" onClick={resetForm}>Annuler</button>
                <button type="submit" className="dash-btn" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="dash-loading">Chargement…</div>}

      {!loading && depenses.length === 0 && !formOpen && (
        <div className="dash-card" style={{ textAlign:'center', padding:48 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📷</div>
          <p style={{ fontFamily:'Courier Prime,monospace', color:'var(--pencil)', fontSize:14 }}>Aucune note de frais.</p>
          <p style={{ fontSize:12, color:'var(--pencil)', marginTop:4 }}>Cliquez sur « Ajouter une note » pour commencer.</p>
        </div>
      )}

      {!loading && depenses.length > 0 && (
        <div className="dash-table-wrap"><table className="dash-table">
          <thead><tr><th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th><th>Pièce jointe</th><th className="right">TTC</th></tr></thead>
          <tbody>
            {depenses.map(d=>(
              <tr key={d.id}>
                <td>{d.date}</td>
                <td>{d.fournisseur}</td>
                <td style={{ fontSize:12, color:'var(--pencil)' }}>{d.description ?? '—'}</td>
                <td style={{ fontSize:12, color:'var(--pencil)' }}>{d.categorie}</td>
                <td className="center">{d.has_attachment ? '📎' : '—'}</td>
                <td className="right" style={{ fontWeight:700 }}>{formatEur(d.montant_ttc)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr>
            <td colSpan={5}><strong>Total</strong></td>
            <td className="right"><strong>{formatEur(depenses.reduce((s,d)=>s+d.montant_ttc,0))}</strong></td>
          </tr></tfoot>
        </table></div>
      )}
    </div>
  )
}
