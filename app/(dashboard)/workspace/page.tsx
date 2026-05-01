'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace } from '@/lib/types/database'
import { createInvitation, listInvitations, cancelInvitation, resendInvitation, type InvitationRow } from './actions'

const ACTIVITE_OPTIONS = [
  { value: '',             label: '— Non renseigné —' },
  { value: 'saas',        label: 'SaaS / Logiciel' },
  { value: 'conseil',     label: 'Conseil' },
  { value: 'evenementiel',label: 'Événementiel' },
  { value: 'commerce',    label: 'Commerce / Retail' },
  { value: 'formation',   label: 'Formation' },
  { value: 'immobilier',  label: 'Immobilier' },
  { value: 'autre',       label: 'Autre' },
]

const STRUCTURE_OPTIONS = [
  { value: '',      label: '— Non renseigné —' },
  { value: 'micro', label: 'Micro-entreprise / Auto-entrepreneur' },
  { value: 'ei',    label: 'Entreprise individuelle (EI / EIRL)' },
  { value: 'eurl',  label: 'EURL' },
  { value: 'sarl',  label: 'SARL' },
  { value: 'sas',   label: 'SAS / SASU' },
  { value: 'sa',    label: 'SA' },
  { value: 'autre', label: 'Autre' },
]

type Tab = 'general' | 'membres'

interface WorkspaceData extends Workspace {
  members: Array<{ id: string; user_id: string; role: string; email?: string; created_at: string }>
}

export default function WorkspacePage() {
  const [ws, setWs]           = useState<WorkspaceData|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string|null>(null)
  const [tab, setTab]         = useState<Tab>('general')
  const [userId, setUserId]   = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expirée — rechargez la page.'); return }
      setUserId(user.id)
      const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
      if (!m) { setError('Workspace introuvable.'); return }
      const { data: workspace, error: we } = await supabase.from('workspaces').select('*').eq('id', m.workspace_id).single()
      if (we || !workspace) { setError(we?.message ?? 'Erreur'); return }
      const { data: members } = await supabase.from('memberships').select('id, user_id, role, created_at').eq('workspace_id', m.workspace_id)
      setWs({ ...workspace, members: members ?? [] } as WorkspaceData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="dash-loading">Chargement…</div>
  if (error || !ws) return <div className="dash-error">{error ?? 'Erreur'}</div>

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Workspace</h1>
          <p className="dash-subtitle">Gérez les paramètres de votre espace de travail</p>
        </div>
      </div>

      <div className="dash-tabs">
        <button className={`dash-tab ${tab==='general'?'dash-tab-active':''}`} onClick={()=>setTab('general')}>Général</button>
        <button className={`dash-tab ${tab==='membres'?'dash-tab-active':''}`} onClick={()=>setTab('membres')}>Membres ({ws.members.length})</button>
      </div>

      {tab === 'general' && <GeneralTab ws={ws} onSaved={load} currentUserId={userId} />}
      {tab === 'membres' && <MembresTab members={ws.members} workspaceId={ws.id} currentUserId={userId} onChanged={load} />}
    </div>
  )
}

function GeneralTab({ ws, onSaved, currentUserId }: { ws: WorkspaceData; onSaved: () => void; currentUserId: string }) {
  const isOwner = ws.members.some(m => m.user_id === currentUserId && m.role === 'owner')
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <InfoSection ws={ws} onSaved={onSaved} />
      <ProfileSection ws={ws} onSaved={onSaved} />
      {isOwner && <DangerSection workspaceId={ws.id} />}
    </div>
  )
}

function InfoSection({ ws, onSaved }: { ws: WorkspaceData; onSaved: () => void }) {
  const [name, setName]     = useState(ws.name)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string|null>(null)
  const [error, setError]   = useState<string|null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSuccess(null); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('workspaces').update({ name }).eq('id', ws.id)
    if (err) { setError(err.message) } else { setSuccess('Nom mis à jour.'); onSaved() }
    setSaving(false)
  }

  return (
    <div className="dash-card">
      <div className="dash-card-title">Informations</div>
      <div style={{ marginBottom:12, fontSize:13, color:'var(--pencil)', fontFamily:'Courier Prime,monospace' }}>
        Slug : <strong>{ws.slug}</strong>
      </div>
      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div className="dash-field"><label className="dash-field-label">Nom du workspace</label>
          <div style={{ display:'flex', gap:12 }}>
            <input type="text" className="dash-field-input" style={{ flex:1 }} value={name} onChange={e=>{setName(e.target.value);setSuccess(null)}} required minLength={2} />
            <button type="submit" className="dash-btn" disabled={saving||name===ws.name}>{saving?'Enregistrement…':'Enregistrer'}</button>
          </div>
        </div>
        {success && <div className="dash-success-msg">{success}</div>}
        {error   && <div className="dash-error">{error}</div>}
      </form>
    </div>
  )
}

function ProfileSection({ ws, onSaved }: { ws: WorkspaceData; onSaved: () => void }) {
  const [activite, setActivite]   = useState(ws.activite_type ?? '')
  const [structure, setStructure] = useState(ws.structure_type ?? '')
  const [saving, setSaving]       = useState(false)
  const [success, setSuccess]     = useState<string|null>(null)
  const [error, setError]         = useState<string|null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSuccess(null); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('workspaces').update({
      activite_type: activite || null, structure_type: structure || null,
    }).eq('id', ws.id)
    if (err) { setError(err.message) } else { setSuccess('Profil enregistré.'); onSaved() }
    setSaving(false)
  }

  const unchanged = activite === (ws.activite_type ?? '') && structure === (ws.structure_type ?? '')

  return (
    <div className="dash-card">
      <div className="dash-card-title">Profil d&apos;activité</div>
      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div className="dash-field"><label className="dash-field-label">Type d&apos;activité</label>
          <select className="dash-field-select" value={activite} onChange={e=>{setActivite(e.target.value);setSuccess(null)}}>
            {ACTIVITE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        <div className="dash-field"><label className="dash-field-label">Type de structure</label>
          <select className="dash-field-select" value={structure} onChange={e=>{setStructure(e.target.value);setSuccess(null)}}>
            {STRUCTURE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        <div>
          <button type="submit" className="dash-btn" disabled={saving||unchanged}>{saving?'Enregistrement…':'Enregistrer'}</button>
        </div>
        {success && <div className="dash-success-msg">{success}</div>}
        {error   && <div className="dash-error">{error}</div>}
      </form>
    </div>
  )
}

function daysSince(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 3600 * 24))
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'il y a 1 jour'
  return `il y a ${days} jours`
}

function inviteStatus(inv: InvitationRow): { label: string; cls: string } {
  if (inv.used_at) return { label: 'Acceptée', cls: 'dash-badge-green' }
  if (new Date(inv.expires_at) < new Date()) return { label: 'Expirée', cls: 'dash-badge-red' }
  return { label: 'Envoyée', cls: 'dash-badge-blue' }
}

function MembresTab({ members, workspaceId, currentUserId, onChanged }: {
  members: WorkspaceData['members']; workspaceId: string; currentUserId: string; onChanged: () => void
}) {
  const [invitations, setInvitations]     = useState<InvitationRow[]>([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail]     = useState('')
  const [inviting, setInviting]           = useState(false)
  const [inviteError, setInviteError]     = useState<string|null>(null)
  const [generatedUrl, setGeneratedUrl]   = useState<string|null>(null)
  const [copiedId, setCopiedId]           = useState<string|null>(null)
  const [resendingId, setResendingId]     = useState<string|null>(null)
  const [resendError, setResendError]     = useState<string|null>(null)

  const loadInvitations = useCallback(async () => {
    const res = await listInvitations()
    if (res.data) setInvitations(res.data)
  }, [])

  useEffect(() => { loadInvitations() }, [loadInvitations])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true); setInviteError(null); setGeneratedUrl(null)
    const res = await createInvitation(inviteEmail)
    setInviting(false)
    if (res.error) { setInviteError(res.error); return }
    setGeneratedUrl(res.inviteUrl ?? null)
    setInviteEmail('')
    loadInvitations()
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleCancel(id: string) {
    if (!confirm('Annuler cette invitation ?')) return
    const res = await cancelInvitation(id)
    if (!res.error) loadInvitations()
  }

  async function handleResend(id: string) {
    setResendingId(id); setResendError(null)
    const res = await resendInvitation(id)
    setResendingId(null)
    if (res.error) { setResendError(res.error); return }
    loadInvitations()
  }

  const appUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/invite/`
      : '/invite/'

  const pendingCount = invitations.filter(i => !i.used_at && new Date(i.expires_at) >= new Date()).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Members table */}
      <div className="dash-card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div className="dash-card-title" style={{ margin:0 }}>Membres ({members.length})</div>
          <button className="dash-btn" onClick={() => { setShowInviteForm(v=>!v); setGeneratedUrl(null); setInviteError(null) }}>
            + Inviter un membre
          </button>
        </div>

        {showInviteForm && (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, padding:16, marginBottom:16 }}>
            <form onSubmit={handleInvite} style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
              <div className="dash-field" style={{ flex:1, minWidth:220, margin:0 }}>
                <label className="dash-field-label">Adresse email</label>
                <input
                  type="email" className="dash-field-input"
                  placeholder="collegue@exemple.com"
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteError(null); setGeneratedUrl(null) }}
                  required autoFocus
                />
              </div>
              <button type="submit" className="dash-btn" disabled={inviting}>
                {inviting ? 'Envoi…' : "Envoyer l'invitation"}
              </button>
            </form>
            {inviteError && <div className="dash-error" style={{ marginTop:10 }}>{inviteError}</div>}
            {generatedUrl && (
              <div style={{ marginTop:12, padding:12, background:'var(--bg)', borderRadius:4, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'var(--pencil)', fontFamily:'Courier Prime,monospace', wordBreak:'break-all', flex:1 }}>
                  {generatedUrl}
                </span>
                <button className="dash-btn" style={{ flexShrink:0 }} onClick={() => handleCopy(generatedUrl, 'new')}>
                  {copiedId === 'new' ? '✓ Copié' : 'Copier'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="dash-table-wrap"><table className="dash-table">
          <thead><tr><th>User ID</th><th>Rôle</th><th>Membre depuis</th><th></th></tr></thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={4} className="dash-empty">Aucun membre.</td></tr>}
            {members.map(m=>(
              <tr key={m.id}>
                <td style={{ fontFamily:'Courier Prime,monospace', fontSize:12 }}>{m.user_id.slice(0,8)}…{m.user_id === currentUserId ? ' (vous)' : ''}</td>
                <td><span className={`dash-badge ${m.role==='owner'||m.role==='admin'?'dash-badge-blue':'dash-badge-gray'}`}>{m.role}</span></td>
                <td style={{ fontSize:12, color:'var(--pencil)' }}>{new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Invitations management */}
      <div className="dash-card">
        <div className="dash-card-title">
          Invitations{invitations.length > 0 ? ` — ${pendingCount} en attente` : ''}
        </div>
        {resendError && <div className="dash-error" role="alert" style={{ marginBottom:12 }}>{resendError}</div>}

        {invitations.length === 0 ? (
          <div className="dash-empty" style={{ padding:'16px 0' }}>Aucune invitation envoyée.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Envoyée</th>
                  <th>Statut</th>
                  <th>Lien / Token</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map(inv => {
                  const st = inviteStatus(inv)
                  const isPending = !inv.used_at && new Date(inv.expires_at) >= new Date()
                  const isExpired = !inv.used_at && new Date(inv.expires_at) < new Date()
                  const fullUrl = `${appUrl}${inv.token}`

                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight:500 }}>{inv.email}</td>

                      <td style={{ fontSize:12, color:'var(--pencil)', whiteSpace:'nowrap' }}>
                        {daysSince(inv.created_at)}
                      </td>

                      <td>
                        <span className={`dash-badge ${st.cls}`}>{st.label}</span>
                      </td>

                      {/* Token + copy */}
                      <td>
                        {!inv.used_at && (
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{
                              fontFamily:'Courier Prime,monospace', fontSize:11,
                              color:'var(--pencil)', letterSpacing:'0.02em',
                              opacity: isExpired ? 0.45 : 1,
                            }}>
                              {inv.token.slice(0, 12)}…
                            </span>
                            <button
                              className="dash-btn-ghost"
                              style={{ fontSize:11, padding:'2px 8px', flexShrink:0 }}
                              onClick={() => handleCopy(fullUrl, inv.id)}
                              title="Copier le lien complet"
                            >
                              {copiedId === inv.id ? '✓' : 'Copier'}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td>
                        <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                          {(isPending || isExpired) && (
                            <button
                              className="dash-btn-ghost"
                              style={{ fontSize:12, padding:'4px 10px' }}
                              disabled={resendingId === inv.id}
                              onClick={() => handleResend(inv.id)}
                              title={isExpired ? 'Générer un nouveau lien et renvoyer' : 'Renvoyer le lien'}
                            >
                              {resendingId === inv.id ? '…' : isExpired ? 'Renouveler' : 'Renvoyer'}
                            </button>
                          )}
                          {isPending && (
                            <button
                              className="dash-btn-ghost"
                              style={{ fontSize:12, padding:'4px 10px', color:'var(--danger, #dc2626)' }}
                              onClick={() => handleCancel(inv.id)}
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

function DangerSection({ workspaceId }: { workspaceId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]     = useState<string|null>(null)

  async function handleDelete() {
    setDeleting(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('workspaces').delete().eq('id', workspaceId)
    if (err) { setError(err.message); setDeleting(false); return }
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="dash-card dash-danger-zone">
      <div className="dash-card-title dash-danger-title">Zone de danger</div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16 }}>
        <div>
          <p style={{ fontWeight:600, margin:'0 0 4px', color:'var(--ink)' }}>Supprimer le workspace</p>
          <p style={{ fontSize:13, color:'var(--pencil)', margin:0, maxWidth:480 }}>
            Cette action supprimera définitivement toutes les données : factures, dépenses, transactions et membres. Elle est irréversible.
          </p>
        </div>
        <button className="dash-btn-danger" onClick={()=>setConfirm(true)} type="button">Supprimer</button>
      </div>
      {error && !confirm && <div className="dash-error" style={{ marginTop:12 }}>{error}</div>}
      {confirm && (
        <div className="dash-modal-backdrop" onClick={()=>setConfirm(false)}>
          <div className="dash-modal" style={{ maxWidth:400 }} onClick={e=>e.stopPropagation()}>
            <div className="dash-modal-header">
              <h2 className="dash-modal-title" style={{ color:'#dc2626' }}>Supprimer le workspace</h2>
              <button className="dash-modal-close" aria-label="Fermer" onClick={()=>setConfirm(false)}>×</button>
            </div>
            <div className="dash-modal-body">
              <p style={{ fontSize:14, color:'var(--pencil)' }}>
                Cette action est <strong>irréversible</strong>. Toutes les données du workspace seront définitivement supprimées.
              </p>
              {error && <div className="dash-error" role="alert">{error}</div>}
            </div>
            <div className="dash-modal-footer">
              <button className="dash-btn-ghost" onClick={()=>setConfirm(false)} disabled={deleting}>Annuler</button>
              <button className="dash-btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Oui, supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
