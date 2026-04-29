'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Facture, Depense } from '@/lib/types/database'

type Tab = 'factures' | 'depenses'
const STATUT_LABELS: Record<string, string> = { payee: 'Payée', en_attente: 'En attente' }
const TVA_OPTIONS = ['0', '5.5', '10', '20']
const CAT_ENTREES = ['Ventes de marchandises', 'Prestations de services', 'Produits financiers', 'Autres produits']
const CAT_SORTIES = [
  'Achats de marchandises', 'Achats de matières premières', 'Frais de personnel',
  'Loyers et charges locatives', 'Frais de déplacement', 'Publicité et marketing',
  'Frais bancaires', 'Assurances', 'Honoraires', 'Matériel et équipement',
  'Logiciels et abonnements', 'Fournitures de bureau', 'Charges sociales',
  'Impôts et taxes', 'Autres charges',
]

function formatEur(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
function round2(n: number) { return Math.round(n * 100) / 100 }
function computeFromHT(ht: number, taux: number) {
  const tva = round2(ht * taux / 100)
  return { montant_ht: ht, taux_tva: taux, montant_tva: tva, montant_ttc: round2(ht + tva) }
}
function today() { return new Date().toISOString().slice(0, 10) }
function nextNumero(factures: Facture[]) {
  const year = new Date().getFullYear()
  const nums = factures.map(f => { const m = f.numero.match(/(\d+)$/); return m ? parseInt(m[1], 10) : 0 })
  return `FAC-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
}

interface FForm { date:string; client:string; description:string; montant_ht:string; taux_tva:string; categorie:string; statut:'payee'|'en_attente' }
interface DForm { date:string; fournisseur:string; description:string; montant_ht:string; taux_tva:string; categorie:string; statut:'payee'|'en_attente' }

function FactureModal({ initial, factures, workspaceId, onSaved, onClose }: {
  initial?: Facture|null; factures: Facture[]; workspaceId:string; onSaved:()=>void; onClose:()=>void
}) {
  const [form, setForm] = useState<FForm>({
    date: initial?.date ?? today(), client: initial?.client ?? '', description: initial?.description ?? '',
    montant_ht: initial ? String(initial.montant_ht) : '', taux_tva: initial ? String(initial.taux_tva) : '20',
    categorie: initial?.categorie ?? CAT_ENTREES[0], statut: initial?.statut ?? 'en_attente',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const computed = computeFromHT(parseFloat(form.montant_ht.replace(',','.')), parseFloat(form.taux_tva))
    const supabase = createClient()
    const base = { date:form.date, client:form.client, description:form.description||null, categorie:form.categorie, statut:form.statut, ...computed }
    const r = initial
      ? await supabase.from('factures').update(base).eq('id', initial.id)
      : await supabase.from('factures').insert({ workspace_id:workspaceId, numero:nextNumero(factures), ...base })
    if (r.error) { setError(r.error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={e => e.stopPropagation()}>
        <div className="dash-modal-header">
          <h2 className="dash-modal-title">{initial ? 'Modifier la facture' : 'Nouvelle facture'}</h2>
          <button className="dash-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dash-modal-body">
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Date</label>
                <input type="date" className="dash-field-input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} required /></div>
              <div className="dash-field"><label className="dash-field-label">Statut</label>
                <select className="dash-field-select" value={form.statut} onChange={e=>setForm(f=>({...f,statut:e.target.value as 'payee'|'en_attente'}))}>
                  <option value="en_attente">En attente</option><option value="payee">Payée</option></select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Client</label>
              <input type="text" className="dash-field-input" value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))} required placeholder="Nom du client" /></div>
            <div className="dash-field"><label className="dash-field-label">Description</label>
              <input type="text" className="dash-field-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Optionnel" /></div>
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Montant HT (€)</label>
                <input type="number" step="0.01" min="0" className="dash-field-input" value={form.montant_ht} onChange={e=>setForm(f=>({...f,montant_ht:e.target.value}))} required placeholder="0.00" /></div>
              <div className="dash-field"><label className="dash-field-label">Taux TVA</label>
                <select className="dash-field-select" value={form.taux_tva} onChange={e=>setForm(f=>({...f,taux_tva:e.target.value}))}>
                  {TVA_OPTIONS.map(t=><option key={t} value={t}>{t} %</option>)}</select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Catégorie</label>
              <select className="dash-field-select" value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}>
                {CAT_ENTREES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
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
  initial?: Depense|null; workspaceId:string; onSaved:()=>void; onClose:()=>void
}) {
  const [form, setForm] = useState<DForm>({
    date: initial?.date ?? today(), fournisseur: initial?.fournisseur ?? '', description: initial?.description ?? '',
    montant_ht: initial ? String(initial.montant_ht) : '', taux_tva: initial ? String(initial.taux_tva) : '20',
    categorie: initial?.categorie ?? CAT_SORTIES[0], statut: initial?.statut ?? 'en_attente',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const computed = computeFromHT(parseFloat(form.montant_ht.replace(',','.')), parseFloat(form.taux_tva))
    const supabase = createClient()
    const base = { date:form.date, fournisseur:form.fournisseur, description:form.description||null, categorie:form.categorie, statut:form.statut, ...computed }
    const r = initial
      ? await supabase.from('depenses').update(base).eq('id', initial.id)
      : await supabase.from('depenses').insert({ workspace_id:workspaceId, ...base })
    if (r.error) { setError(r.error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="dash-modal-backdrop" onClick={onClose}>
      <div className="dash-modal" onClick={e => e.stopPropagation()}>
        <div className="dash-modal-header">
          <h2 className="dash-modal-title">{initial ? 'Modifier la dépense' : 'Nouvelle dépense'}</h2>
          <button className="dash-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dash-modal-body">
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Date</label>
                <input type="date" className="dash-field-input" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} required /></div>
              <div className="dash-field"><label className="dash-field-label">Statut</label>
                <select className="dash-field-select" value={form.statut} onChange={e=>setForm(f=>({...f,statut:e.target.value as 'payee'|'en_attente'}))}>
                  <option value="en_attente">En attente</option><option value="payee">Payée</option></select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Fournisseur</label>
              <input type="text" className="dash-field-input" value={form.fournisseur} onChange={e=>setForm(f=>({...f,fournisseur:e.target.value}))} required placeholder="Nom du fournisseur" /></div>
            <div className="dash-field"><label className="dash-field-label">Description</label>
              <input type="text" className="dash-field-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Optionnel" /></div>
            <div className="dash-field-row">
              <div className="dash-field"><label className="dash-field-label">Montant HT (€)</label>
                <input type="number" step="0.01" min="0" className="dash-field-input" value={form.montant_ht} onChange={e=>setForm(f=>({...f,montant_ht:e.target.value}))} required placeholder="0.00" /></div>
              <div className="dash-field"><label className="dash-field-label">Taux TVA</label>
                <select className="dash-field-select" value={form.taux_tva} onChange={e=>setForm(f=>({...f,taux_tva:e.target.value}))}>
                  {TVA_OPTIONS.map(t=><option key={t} value={t}>{t} %</option>)}</select></div>
            </div>
            <div className="dash-field"><label className="dash-field-label">Catégorie</label>
              <select className="dash-field-select" value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}>
                {CAT_SORTIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
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

export default function TransactionsPage() {
  const [tab, setTab] = useState<Tab>('factures')
  const [factures, setFactures] = useState<Facture[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editFacture, setEditFacture] = useState<Facture|null>(null)
  const [editDepense, setEditDepense] = useState<Depense|null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
    if (!m) return
    setWorkspaceId(m.workspace_id)
    const [{ data: f, error: fe }, { data: d, error: de }] = await Promise.all([
      supabase.from('factures').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }).limit(200),
      supabase.from('depenses').select('*').eq('workspace_id', m.workspace_id).order('date', { ascending: false }).limit(200),
    ])
    if (fe || de) setError((fe ?? de)?.message ?? 'Erreur')
    setFactures((f ?? []) as Facture[]); setDepenses((d ?? []) as Depense[]); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function delF(id:number) { if (!confirm('Supprimer cette facture ?')) return; await createClient().from('factures').delete().eq('id',id); load() }
  async function delD(id:number) { if (!confirm('Supprimer cette dépense ?')) return; await createClient().from('depenses').delete().eq('id',id); load() }

  const ff = factures.filter(f => {
    const q=search.toLowerCase()
    return (!q||f.client.toLowerCase().includes(q)||f.numero.toLowerCase().includes(q)||(f.description??'').toLowerCase().includes(q))&&(!filterStatut||f.statut===filterStatut)
  })
  const fd = depenses.filter(d => {
    const q=search.toLowerCase()
    return (!q||d.fournisseur.toLowerCase().includes(q)||(d.description??'').toLowerCase().includes(q))&&(!filterStatut||d.statut===filterStatut)
  })

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div><h1 className="dash-title">Transactions</h1><p className="dash-subtitle">Factures et dépenses</p></div>
        <button className="dash-btn" onClick={() => { setEditFacture(null); setEditDepense(null); setShowModal(true) }}>
          {tab === 'factures' ? '+ Facture' : '+ Dépense'}
        </button>
      </div>
      <div className="dash-tabs">
        <button className={`dash-tab ${tab==='factures'?'dash-tab-active':''}`} onClick={()=>setTab('factures')}>Factures ({factures.length})</button>
        <button className={`dash-tab ${tab==='depenses'?'dash-tab-active':''}`} onClick={()=>setTab('depenses')}>Dépenses ({depenses.length})</button>
      </div>
      <div className="dash-filter-bar">
        <input className="dash-filter-input" type="text" placeholder={tab==='factures'?'Client, numéro…':'Fournisseur…'} value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="dash-filter-select" value={filterStatut} onChange={e=>setFilterStatut(e.target.value)}>
          <option value="">Tous statuts</option><option value="payee">Payé(e)</option><option value="en_attente">En attente</option>
        </select>
        {(search||filterStatut)&&<button className="dash-btn-ghost" onClick={()=>{setSearch('');setFilterStatut('')}}>× Effacer</button>}
      </div>
      {loading&&<div className="dash-loading">Chargement…</div>}
      {error&&<div className="dash-error">{error}</div>}
      {!loading&&tab==='factures'&&(
        <div className="dash-table-wrap"><table className="dash-table">
          <thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th>Catégorie</th><th>Statut</th><th className="right">HT</th><th className="right">TVA</th><th className="right">TTC</th><th></th></tr></thead>
          <tbody>
            {ff.length===0?<tr><td colSpan={9} className="dash-empty">Aucune facture.</td></tr>:ff.map(f=>(
              <tr key={f.id}>
                <td><span style={{fontFamily:'Courier Prime,monospace',fontSize:12}}>{f.numero}</span></td>
                <td>{f.date}</td><td>{f.client}</td>
                <td style={{fontSize:12,color:'var(--pencil)'}}>{f.categorie}</td>
                <td><span className={`dash-badge ${f.statut==='payee'?'dash-badge-green':'dash-badge-orange'}`}>{STATUT_LABELS[f.statut]}</span></td>
                <td className="right">{formatEur(f.montant_ht)}</td><td className="right">{formatEur(f.montant_tva)}</td>
                <td className="right" style={{fontWeight:700}}>{formatEur(f.montant_ttc)}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <button className="dash-btn-ghost" style={{padding:'4px 10px',fontSize:12}} onClick={()=>{setEditFacture(f);setShowModal(true)}}>Éditer</button>
                  {' '}<button style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:12}} onClick={()=>delF(f.id)}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
          {ff.length>0&&<tfoot><tr>
            <td colSpan={5}><strong>Total ({ff.length})</strong></td>
            <td className="right"><strong>{formatEur(ff.reduce((s,f)=>s+f.montant_ht,0))}</strong></td>
            <td className="right"><strong>{formatEur(ff.reduce((s,f)=>s+f.montant_tva,0))}</strong></td>
            <td className="right"><strong>{formatEur(ff.reduce((s,f)=>s+f.montant_ttc,0))}</strong></td>
            <td></td>
          </tr></tfoot>}
        </table></div>
      )}
      {!loading&&tab==='depenses'&&(
        <div className="dash-table-wrap"><table className="dash-table">
          <thead><tr><th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th><th>Statut</th><th className="right">HT</th><th className="right">TVA</th><th className="right">TTC</th><th></th></tr></thead>
          <tbody>
            {fd.length===0?<tr><td colSpan={9} className="dash-empty">Aucune dépense.</td></tr>:fd.map(d=>(
              <tr key={d.id}>
                <td>{d.date}</td><td>{d.fournisseur}</td>
                <td style={{fontSize:12,color:'var(--pencil)'}}>{d.description??'—'}</td>
                <td style={{fontSize:12,color:'var(--pencil)'}}>{d.categorie}</td>
                <td><span className={`dash-badge ${d.statut==='payee'?'dash-badge-green':'dash-badge-orange'}`}>{STATUT_LABELS[d.statut]}</span></td>
                <td className="right">{formatEur(d.montant_ht)}</td><td className="right">{formatEur(d.montant_tva)}</td>
                <td className="right" style={{fontWeight:700}}>{formatEur(d.montant_ttc)}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <button className="dash-btn-ghost" style={{padding:'4px 10px',fontSize:12}} onClick={()=>{setEditDepense(d);setShowModal(true)}}>Éditer</button>
                  {' '}<button style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:12}} onClick={()=>delD(d.id)}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
          {fd.length>0&&<tfoot><tr>
            <td colSpan={4}><strong>Total ({fd.length})</strong></td><td></td>
            <td className="right"><strong>{formatEur(fd.reduce((s,d)=>s+d.montant_ht,0))}</strong></td>
            <td className="right"><strong>{formatEur(fd.reduce((s,d)=>s+d.montant_tva,0))}</strong></td>
            <td className="right"><strong>{formatEur(fd.reduce((s,d)=>s+d.montant_ttc,0))}</strong></td>
            <td></td>
          </tr></tfoot>}
        </table></div>
      )}
      {showModal&&tab==='factures'&&<FactureModal initial={editFacture} factures={factures} workspaceId={workspaceId} onSaved={()=>{setShowModal(false);setEditFacture(null);load()}} onClose={()=>{setShowModal(false);setEditFacture(null)}} />}
      {showModal&&tab==='depenses'&&<DepenseModal initial={editDepense} workspaceId={workspaceId} onSaved={()=>{setShowModal(false);setEditDepense(null);load()}} onClose={()=>{setShowModal(false);setEditDepense(null)}} />}
    </div>
  )
}
