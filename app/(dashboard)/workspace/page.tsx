'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, Users, User, AlertTriangle, Copy, Check, X,
  RefreshCw, Send, ChevronDown, Plug,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace } from '@/lib/types/database'
import { ConnexionsSection } from '@/components/ConnexionsSection'
import {
  createInvitation,
  listInvitations,
  cancelInvitation,
  resendInvitation,
  listMembersWithEmail,
  updateMemberRole,
  removeMember,
  type InvitationRow,
  type MemberRow,
} from './actions'

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTIVITE_OPTIONS = [
  { value: '',              label: '— Non renseigné —' },
  { value: 'saas',         label: 'SaaS / Logiciel' },
  { value: 'conseil',      label: 'Conseil' },
  { value: 'evenementiel', label: 'Événementiel' },
  { value: 'commerce',     label: 'Commerce / Retail' },
  { value: 'formation',    label: 'Formation' },
  { value: 'immobilier',   label: 'Immobilier' },
  { value: 'autre',        label: 'Autre' },
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

const AVATAR_COLORS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#e0e7ff', '#f3f4f6']

type Section = 'workspace' | 'equipe' | 'compte' | 'connexions' | 'danger'

interface WorkspaceData extends Workspace {
  members: MemberRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avatarColor(email: string): string {
  return AVATAR_COLORS[email.charCodeAt(0) % AVATAR_COLORS.length]
}

function initials(email: string): string {
  return email.charAt(0).toUpperCase()
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
  return { label: 'En attente', cls: 'dash-badge-blue' }
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const router = useRouter()
  const [ws, setWs]                   = useState<WorkspaceData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<Section>('workspace')
  const [userId, setUserId]           = useState('')
  const [userEmail, setUserEmail]     = useState('')
  const [userName, setUserName]       = useState('')
  const [userRole, setUserRole]       = useState<'owner' | 'admin' | 'member'>('member')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expirée — rechargez la page.'); return }
      setUserId(user.id)
      setUserEmail(user.email ?? '')
      setUserName(user.user_metadata?.full_name ?? '')

      const { data: m } = await supabase
        .from('memberships')
        .select('workspace_id, role')
        .eq('user_id', user.id)
        .single()
      if (!m) { setError('Workspace introuvable.'); return }

      setUserRole(m.role as 'owner' | 'admin' | 'member')

      const { data: workspace, error: we } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', m.workspace_id)
        .single()
      if (we || !workspace) { setError(we?.message ?? 'Erreur'); return }

      const { data: members } = await listMembersWithEmail()
      setWs({ ...workspace, members: members ?? [] } as WorkspaceData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') router.back() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  const isOwner = !!(ws && userRole === 'owner')

  return (
    <div className="settings-modal-backdrop" onClick={() => router.back()}>
      <div className="settings-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Paramètres">
        {loading && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--pencil)', fontFamily: 'Courier Prime, monospace', fontSize: 13 }}>
            Chargement…
          </div>
        )}
        {!loading && (error || !ws) && (
          <div style={{ padding: 32 }}><div className="dash-error">{error ?? 'Erreur inconnue'}</div></div>
        )}
        {!loading && ws && (
          <div className="settings-layout">
            <nav className="settings-nav" aria-label="Sections des paramètres">
              <div className="settings-nav-header">
                <span>{ws.name}</span>
                <button onClick={() => router.back()} aria-label="Fermer les paramètres" title="Fermer (Échap)">
                  <X size={15} />
                </button>
              </div>

              <span className="settings-nav-group">Workspace</span>
              <button className={`settings-nav-item${activeSection === 'workspace' ? ' settings-nav-item-active' : ''}`} onClick={() => setActiveSection('workspace')} aria-current={activeSection === 'workspace' ? 'page' : undefined}>
                <Settings size={15} aria-hidden="true" /> Général
              </button>
              <button className={`settings-nav-item${activeSection === 'equipe' ? ' settings-nav-item-active' : ''}`} onClick={() => setActiveSection('equipe')} aria-current={activeSection === 'equipe' ? 'page' : undefined}>
                <Users size={15} aria-hidden="true" /> Équipe ({ws.members.length})
              </button>
              <button
                className={`settings-nav-item${activeSection === 'connexions' ? ' settings-nav-item-active' : ''}`}
                onClick={() => setActiveSection('connexions')}
                aria-current={activeSection === 'connexions' ? 'page' : undefined}
              >
                <Plug size={15} aria-hidden="true" /> Connexions API
              </button>

              <span className="settings-nav-group">Mon compte</span>
              <button className={`settings-nav-item${activeSection === 'compte' ? ' settings-nav-item-active' : ''}`} onClick={() => setActiveSection('compte')} aria-current={activeSection === 'compte' ? 'page' : undefined}>
                <User size={15} aria-hidden="true" /> Mon compte
              </button>

              {isOwner && (
                <>
                  <span className="settings-nav-group">Avancé</span>
                  <button className={`settings-nav-item settings-nav-item-danger${activeSection === 'danger' ? ' settings-nav-item-active' : ''}`} onClick={() => setActiveSection('danger')} aria-current={activeSection === 'danger' ? 'page' : undefined}>
                    <AlertTriangle size={15} aria-hidden="true" /> Zone de danger
                  </button>
                </>
              )}
            </nav>

            <div className="settings-content">
              {activeSection === 'workspace' && <WorkspaceSection ws={ws} onSaved={load} />}
              {activeSection === 'equipe' && <EquipeSection ws={ws} currentUserId={userId} currentUserRole={userRole} onChanged={load} />}
              {activeSection === 'connexions' && <ConnexionsSection />}
              {activeSection === 'compte' && <CompteSection userEmail={userEmail} userName={userName} />}
              {activeSection === 'danger' && isOwner && <DangerSection workspaceId={ws.id} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── WorkspaceSection ─────────────────────────────────────────────────────────

function WorkspaceSection({ ws, onSaved }: { ws: WorkspaceData; onSaved: () => void }) {
  return (
    <div>
      <div className="settings-section-header">
        <h2 className="settings-section-title">Informations générales</h2>
        <p className="settings-section-desc">Nom et profil d&apos;activité de votre workspace</p>
      </div>

      <div className="settings-meta-row">
        <span>Identifiant :</span>
        <strong>{ws.slug}</strong>
      </div>

      <div className="settings-meta-row" style={{ marginBottom: 24 }}>
        <span>Créé le :</span>
        <strong>{new Date(ws.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
      </div>

      <WorkspaceNameForm ws={ws} onSaved={onSaved} />
      <WorkspaceProfileForm ws={ws} onSaved={onSaved} />
      <WorkspaceFiscalForm ws={ws} onSaved={onSaved} />
    </div>
  )
}

function WorkspaceNameForm({ ws, onSaved }: { ws: WorkspaceData; onSaved: () => void }) {
  const [name, setName]       = useState(ws.name)
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSuccess(null); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('workspaces').update({ name }).eq('id', ws.id)
    if (err) { setError(err.message) } else { setSuccess('Nom mis à jour.'); onSaved() }
    setSaving(false)
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="settings-sub-title">Nom du workspace</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="dash-field">
          <label className="dash-field-label" htmlFor="ws-name">Nom affiché</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              id="ws-name"
              type="text"
              className="dash-field-input"
              style={{ flex: 1 }}
              value={name}
              onChange={e => { setName(e.target.value); setSuccess(null) }}
              required
              minLength={2}
            />
            <button type="submit" className="dash-btn" disabled={saving || name === ws.name}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
        {success && <div className="dash-success-msg">{success}</div>}
        {error   && <div className="dash-error" role="alert">{error}</div>}
      </form>
    </div>
  )
}

function WorkspaceProfileForm({ ws, onSaved }: { ws: WorkspaceData; onSaved: () => void }) {
  const [activite, setActivite]   = useState(ws.activite_type ?? '')
  const [structure, setStructure] = useState(ws.structure_type ?? '')
  const [saving, setSaving]       = useState(false)
  const [success, setSuccess]     = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const unchanged = activite === (ws.activite_type ?? '') && structure === (ws.structure_type ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSuccess(null); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('workspaces').update({
      activite_type: activite || null,
      structure_type: structure || null,
    }).eq('id', ws.id)
    if (err) { setError(err.message) } else { setSuccess('Profil enregistré.'); onSaved() }
    setSaving(false)
  }

  return (
    <div>
      <div className="settings-sub-title">Profil d&apos;activité</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="dash-field">
          <label className="dash-field-label" htmlFor="ws-activite">Type d&apos;activité</label>
          <select
            id="ws-activite"
            className="dash-field-select"
            value={activite}
            onChange={e => { setActivite(e.target.value); setSuccess(null) }}
          >
            {ACTIVITE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="dash-field">
          <label className="dash-field-label" htmlFor="ws-structure">Type de structure</label>
          <select
            id="ws-structure"
            className="dash-field-select"
            value={structure}
            onChange={e => { setStructure(e.target.value); setSuccess(null) }}
          >
            {STRUCTURE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <button type="submit" className="dash-btn" disabled={saving || unchanged}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        {success && <div className="dash-success-msg">{success}</div>}
        {error   && <div className="dash-error" role="alert">{error}</div>}
      </form>
    </div>
  )
}

function WorkspaceFiscalForm({ ws, onSaved }: { ws: WorkspaceData; onSaved: () => void }) {
  const [siret,      setSiret]      = useState(ws.siret       ?? '')
  const [tvaIntra,   setTvaIntra]   = useState(ws.tva_intra   ?? '')
  const [adresse,    setAdresse]    = useState(ws.adresse      ?? '')
  const [codePostal, setCodePostal] = useState(ws.code_postal ?? '')
  const [ville,      setVille]      = useState(ws.ville        ?? '')
  const [saving,     setSaving]     = useState(false)
  const [success,    setSuccess]    = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  const unchanged =
    siret      === (ws.siret       ?? '') &&
    tvaIntra   === (ws.tva_intra   ?? '') &&
    adresse    === (ws.adresse      ?? '') &&
    codePostal === (ws.code_postal ?? '') &&
    ville      === (ws.ville        ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (siret && !/^\d{14}$/.test(siret.replace(/\s/g, ''))) {
      setError('Le SIRET doit contenir exactement 14 chiffres.')
      return
    }
    if (tvaIntra && !/^FR\d{11}$/i.test(tvaIntra.replace(/\s/g, ''))) {
      setError('Le N° TVA intracommunautaire doit être au format FR + 11 chiffres.')
      return
    }
    setSaving(true); setSuccess(null); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('workspaces').update({
      siret:       siret.replace(/\s/g, '')       || null,
      tva_intra:   tvaIntra.replace(/\s/g, '')    || null,
      adresse:     adresse.trim()                 || null,
      code_postal: codePostal.trim()              || null,
      ville:       ville.trim()                   || null,
    }).eq('id', ws.id)
    if (err) { setError(err.message) } else { setSuccess('Informations fiscales enregistrées.'); onSaved() }
    setSaving(false)
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="settings-sub-title">Informations fiscales</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="dash-field-row">
          <div className="dash-field">
            <label className="dash-field-label" htmlFor="ws-siret">SIRET</label>
            <input
              id="ws-siret"
              type="text"
              className="dash-field-input"
              placeholder="123 456 789 01234"
              value={siret}
              maxLength={17}
              onChange={e => { setSiret(e.target.value); setSuccess(null); setError(null) }}
            />
          </div>
          <div className="dash-field">
            <label className="dash-field-label" htmlFor="ws-tva">N° TVA intracommunautaire</label>
            <input
              id="ws-tva"
              type="text"
              className="dash-field-input"
              placeholder="FR12345678901"
              value={tvaIntra}
              maxLength={15}
              onChange={e => { setTvaIntra(e.target.value); setSuccess(null); setError(null) }}
            />
          </div>
        </div>
        <div className="dash-field">
          <label className="dash-field-label" htmlFor="ws-adresse">Adresse</label>
          <input
            id="ws-adresse"
            type="text"
            className="dash-field-input"
            placeholder="12 rue de la Paix"
            value={adresse}
            onChange={e => { setAdresse(e.target.value); setSuccess(null) }}
          />
        </div>
        <div className="dash-field-row">
          <div className="dash-field">
            <label className="dash-field-label" htmlFor="ws-cp">Code postal</label>
            <input
              id="ws-cp"
              type="text"
              className="dash-field-input"
              placeholder="75001"
              value={codePostal}
              maxLength={10}
              onChange={e => { setCodePostal(e.target.value); setSuccess(null) }}
            />
          </div>
          <div className="dash-field">
            <label className="dash-field-label" htmlFor="ws-ville">Ville</label>
            <input
              id="ws-ville"
              type="text"
              className="dash-field-input"
              placeholder="Paris"
              value={ville}
              onChange={e => { setVille(e.target.value); setSuccess(null) }}
            />
          </div>
        </div>
        <div>
          <button type="submit" className="dash-btn" disabled={saving || unchanged}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        {success && <div className="dash-success-msg">{success}</div>}
        {error   && <div className="dash-error" role="alert">{error}</div>}
      </form>
    </div>
  )
}

// ─── EquipeSection ────────────────────────────────────────────────────────────

function EquipeSection({
  ws,
  currentUserId,
  currentUserRole,
  onChanged,
}: {
  ws: WorkspaceData
  currentUserId: string
  currentUserRole: 'owner' | 'admin' | 'member'
  onChanged: () => void
}) {
  const [members, setMembers]             = useState<MemberRow[]>(ws.members)
  const [invitations, setInvitations]     = useState<InvitationRow[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail]       = useState('')
  const [inviteRole, setInviteRole]         = useState<'admin' | 'member'>('member')
  const [inviting, setInviting]           = useState(false)
  const [inviteError, setInviteError]     = useState<string | null>(null)
  const [generatedUrl, setGeneratedUrl]   = useState<string | null>(null)
  const [urlExpiry, setUrlExpiry]         = useState<ReturnType<typeof setTimeout> | null>(null)
  const [copiedId, setCopiedId]           = useState<string | null>(null)
  const [resendingId, setResendingId]     = useState<string | null>(null)
  const [resendError, setResendError]     = useState<string | null>(null)
  const [resendSuccess, setResendSuccess] = useState<string | null>(null)
  const [resendUrl, setResendUrl]         = useState<string | null>(null)
  const [roleError, setRoleError]         = useState<string | null>(null)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [removing, setRemoving]           = useState(false)
  const [removeError, setRemoveError]     = useState<string | null>(null)
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null)
  const [cancelling, setCancelling]       = useState(false)
  const [teamTab, setTeamTab]             = useState<'membres' | 'invitations'>('membres')

  const loadInvitations = useCallback(async () => {
    const res = await listInvitations()
    if (res.data) setInvitations(res.data)
  }, [])

  // Keep local members in sync with parent
  useEffect(() => { setMembers(ws.members) }, [ws.members])
  useEffect(() => { loadInvitations() }, [loadInvitations])

  const appUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/invite/`
      : '/invite/'

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true); setInviteError(null); setGeneratedUrl(null)
    if (urlExpiry) clearTimeout(urlExpiry)

    const res = await createInvitation(inviteEmail, inviteRole)
    setInviting(false)
    if (res.error) { setInviteError(res.error); return }
    setGeneratedUrl(res.inviteUrl ?? null)
    setInviteEmail('')
    setInviteRole('member')
    loadInvitations()
    onChanged()
    // Keep modal open to show the generated link — user closes manually
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleRoleChange(memberId: string, newRole: 'admin' | 'member') {
    setRoleError(null)
    // Optimistic update
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    const res = await updateMemberRole(memberId, newRole)
    if (res.error) {
      setRoleError(res.error)
      // Revert
      onChanged()
    }
  }

  async function handleRemoveConfirmed() {
    if (!removeConfirmId) return
    setRemoving(true); setRemoveError(null)
    const res = await removeMember(removeConfirmId)
    setRemoving(false)
    if (res.error) { setRemoveError(res.error); return }
    setRemoveConfirmId(null)
    onChanged()
  }

  async function handleResend(id: string) {
    setResendingId(id); setResendError(null); setResendSuccess(null); setResendUrl(null)
    const res = await resendInvitation(id)
    setResendingId(null)
    if (res.error) { setResendError(res.error); return }
    setResendSuccess('Invitation renvoyée.')
    if (res.inviteUrl) setResendUrl(res.inviteUrl)
    setTimeout(() => { setResendSuccess(null); setResendUrl(null) }, 8000)
    loadInvitations()
  }

  async function handleCancelConfirmed() {
    if (!cancelConfirmId) return
    setCancelling(true)
    const res = await cancelInvitation(cancelConfirmId)
    setCancelling(false)
    if (!res.error) {
      setCancelConfirmId(null)
      loadInvitations()
    }
  }

  function canChangeRole(target: MemberRow): boolean {
    if (target.user_id === currentUserId) return false
    if (target.role === 'owner') return false
    if (currentUserRole === 'owner') return true
    if (currentUserRole === 'admin' && target.role === 'member') return true
    return false
  }

  function canRemove(target: MemberRow): boolean {
    if (target.user_id === currentUserId) return false
    if (target.role === 'owner') return false
    if (currentUserRole === 'owner') return true
    if (currentUserRole === 'admin' && target.role === 'member') return true
    return false
  }

  const pendingInvitations = invitations.filter(
    i => !i.used_at
  )

  return (
    <div>
      <div className="settings-section-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 className="settings-section-title">Équipe</h2>
            <p className="settings-section-desc">{members.length} membre{members.length !== 1 ? 's' : ''}</p>
          </div>
          {currentUserRole !== 'member' && (
            <button
              className="dash-btn"
              style={{ flexShrink: 0 }}
              onClick={() => { setShowInviteModal(true); setGeneratedUrl(null); setInviteError(null) }}
            >
              <Send size={14} aria-hidden="true" />
              Inviter
            </button>
          )}
        </div>
      </div>

      <div className="dash-tabs" style={{ marginBottom: 20 }}>
        <button className={`dash-tab ${teamTab === 'membres' ? 'dash-tab-active' : ''}`} onClick={() => setTeamTab('membres')}>
          Membres <span style={{ marginLeft: 4, fontFamily: 'Courier Prime,monospace', fontSize: 11, opacity: 0.7 }}>{members.length}</span>
        </button>
        <button className={`dash-tab ${teamTab === 'invitations' ? 'dash-tab-active' : ''}`} onClick={() => setTeamTab('invitations')}>
          Invitations <span style={{ marginLeft: 4, fontFamily: 'Courier Prime,monospace', fontSize: 11, opacity: 0.7 }}>{pendingInvitations.length}</span>
        </button>
      </div>

      {/* Invite modal */}
      {showInviteModal && (
        <div
          className="dash-modal-backdrop"
          onClick={() => { if (!inviting) { setShowInviteModal(false); setGeneratedUrl(null); setInviteError(null) } }}
        >
          <div className="invite-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">

            {/* Header */}
            <div className="invite-modal-header">
              <div className="invite-modal-icon" aria-hidden="true">
                <Send size={18} />
              </div>
              <div>
                <h2 id="invite-modal-title" className="invite-modal-title">Inviter un membre</h2>
                <p className="invite-modal-subtitle">Un lien d&apos;accès valable 48h sera envoyé par email.</p>
              </div>
              <button
                className="dash-modal-close"
                aria-label="Fermer"
                onClick={() => { setShowInviteModal(false); setGeneratedUrl(null); setInviteError(null) }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="invite-modal-body">
              {!generatedUrl ? (
                <form id="invite-form" onSubmit={handleInvite}>
                  <div className="dash-field" style={{ marginBottom: 16 }}>
                    <label className="dash-field-label" htmlFor="invite-email">Adresse email</label>
                    <input
                      id="invite-email"
                      type="email"
                      className="dash-field-input"
                      placeholder="collegue@entreprise.com"
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteError(null) }}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="dash-field">
                    <label className="dash-field-label">Rôle</label>
                    <div className="invite-role-picker">
                      {(['member', 'admin'] as const).map(r => (
                        <label
                          key={r}
                          className={`invite-role-option${inviteRole === r ? ' invite-role-option-active' : ''}`}
                        >
                          <input
                            type="radio"
                            name="invite-role"
                            value={r}
                            checked={inviteRole === r}
                            onChange={() => setInviteRole(r)}
                            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                          />
                          <span className="invite-role-option-name">
                            {r === 'member' ? 'Membre' : 'Administrateur'}
                          </span>
                          <span className="invite-role-option-desc">
                            {r === 'member'
                              ? 'Consulte et saisit des données'
                              : 'Gère les membres et paramètres'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {inviteError && (
                    <div className="dash-error" style={{ marginTop: 16 }} role="alert">{inviteError}</div>
                  )}
                </form>
              ) : (
                <div className="invite-success">
                  <div className="invite-success-icon" aria-hidden="true">
                    <Check size={22} />
                  </div>
                  <p className="invite-success-label">Invitation envoyée à <strong>{inviteEmail || 'votre collègue'}</strong></p>
                  <p className="invite-success-hint">Partagez aussi ce lien directement si l&apos;email n&apos;arrive pas :</p>
                  <div className="invite-link-row">
                    <span className="invite-link-text">{generatedUrl}</span>
                    <button
                      className="dash-btn-ghost"
                      style={{ flexShrink: 0, padding: '6px 14px', fontSize: 12 }}
                      onClick={() => handleCopy(generatedUrl, 'new')}
                      aria-label="Copier le lien d'invitation"
                    >
                      {copiedId === 'new'
                        ? <><Check size={12} /> Copié</>
                        : <><Copy size={12} /> Copier</>}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="invite-modal-footer">
              {!generatedUrl ? (
                <>
                  <button
                    type="button"
                    className="dash-btn-ghost"
                    onClick={() => { setShowInviteModal(false); setInviteError(null) }}
                    disabled={inviting}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    form="invite-form"
                    className="dash-btn"
                    disabled={inviting || !inviteEmail}
                  >
                    {inviting
                      ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Envoi…</>
                      : <><Send size={13} /> Envoyer l&apos;invitation</>}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="dash-btn-ghost"
                    onClick={() => { setGeneratedUrl(null); setInviteEmail('') }}
                  >
                    Inviter un autre
                  </button>
                  <button
                    type="button"
                    className="dash-btn"
                    onClick={() => { setShowInviteModal(false); setGeneratedUrl(null) }}
                  >
                    Fermer
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Membres tab ─────────────────────────────────────────────── */}
      {teamTab === 'membres' && (
      <div>
      {roleError && (
        <div className="dash-error" role="alert" style={{ marginBottom: 12 }}>{roleError}</div>
      )}
      <div style={{ marginBottom: 32 }}>
        {members.map(member => {
          const isSelf = member.user_id === currentUserId
          const roleBadgeCls =
            member.role === 'owner' ? 'dash-badge-blue'
            : member.role === 'admin' ? 'dash-badge-orange'
            : 'dash-badge-gray'
          const roleLabel =
            member.role === 'owner' ? 'Propriétaire'
            : member.role === 'admin' ? 'Admin'
            : 'Membre'

          return (
            <div key={member.id} className="member-row">
              <div
                className="member-avatar"
                style={{ background: avatarColor(member.email) }}
                aria-hidden="true"
              >
                {initials(member.email)}
              </div>
              <div className="member-info">
                <div className="member-email">
                  {member.email}
                  {isSelf && <span style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)', marginLeft: 6 }}>(vous)</span>}
                </div>
                <div className="member-since">Membre depuis {new Date(member.created_at).toLocaleDateString('fr-FR')}</div>
              </div>
              <div className="member-actions">
                <span className={`dash-badge ${roleBadgeCls}`}>{roleLabel}</span>
                {canChangeRole(member) && (
                  <select
                    className="settings-role-select"
                    value={member.role}
                    onChange={e => handleRoleChange(member.id, e.target.value as 'admin' | 'member')}
                    aria-label={`Changer le rôle de ${member.email}`}
                  >
                    <option value="member">Membre</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                {canRemove(member) && (
                  <button
                    className="settings-remove-btn"
                    onClick={() => setRemoveConfirmId(member.id)}
                    aria-label={`Retirer ${member.email} de l'équipe`}
                    title="Retirer du workspace"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      </div>
      )}

      {/* ── Invitations tab ─────────────────────────────────────────── */}
      {teamTab === 'invitations' && (
      <div>
        {pendingInvitations.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}>Aucune invitation en cours.</p>
        ) : (
        <div>
          {resendError   && <div className="dash-error" role="alert" style={{ marginBottom: 12 }}>{resendError}</div>}
          {resendSuccess && (
            <div className="dash-success-msg" role="status" style={{ marginBottom: 12 }}>
              {resendSuccess}
              {resendUrl && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Courier Prime,monospace', fontSize: 11, color: 'var(--pencil)', wordBreak: 'break-all', flex: 1 }}>
                    {resendUrl}
                  </span>
                  <button
                    className="dash-btn-ghost"
                    style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                    onClick={() => handleCopy(resendUrl, 'resend')}
                  >
                    {copiedId === 'resend' ? <><Check size={13} /> Copié</> : 'Copier'}
                  </button>
                </div>
              )}
            </div>
          )}
          {pendingInvitations.map(inv => {
            const st = inviteStatus(inv)
            const isPending = !inv.used_at && new Date(inv.expires_at) >= new Date()
            const isExpired = !inv.used_at && new Date(inv.expires_at) < new Date()
            const fullUrl = `${appUrl}${inv.token}`

            return (
              <div key={inv.id} className="member-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div
                  className="member-avatar"
                  style={{ background: avatarColor(inv.email), opacity: 0.6 }}
                  aria-hidden="true"
                >
                  {initials(inv.email)}
                </div>
                <div className="member-info">
                  <div className="member-email">{inv.email}</div>
                  <div className="member-since">Envoyée {daysSince(inv.created_at)}</div>
                </div>
                <div className="member-actions" style={{ flexWrap: 'wrap' }}>
                  <span className={`dash-badge ${st.cls}`}>{st.label}</span>

                  {!inv.used_at && (
                    <button
                      className="dash-btn-ghost"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => handleCopy(fullUrl, inv.id)}
                      aria-label="Copier le lien d'invitation"
                      title="Copier le lien"
                    >
                      {copiedId === inv.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}

                  {(isPending || isExpired) && currentUserRole !== 'member' && (
                    <button
                      className="dash-btn-ghost"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      disabled={resendingId === inv.id}
                      onClick={() => handleResend(inv.id)}
                      aria-label={isExpired ? 'Renouveler l\'invitation' : 'Renvoyer l\'invitation'}
                      title={isExpired ? 'Générer un nouveau lien' : 'Renvoyer le lien'}
                    >
                      {resendingId === inv.id ? '…' : <><RefreshCw size={12} /> {isExpired ? 'Renouveler' : 'Renvoyer'}</>}
                    </button>
                  )}

                  {currentUserRole !== 'member' && (
                    <button
                      className="dash-btn-ghost"
                      style={{ fontSize: 11, padding: '4px 10px', color: '#dc2626' }}
                      onClick={() => setCancelConfirmId(inv.id)}
                      aria-label={isPending ? `Annuler l'invitation de ${inv.email}` : `Supprimer l'invitation de ${inv.email}`}
                    >
                      {isPending ? 'Annuler' : 'Supprimer'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        )}
      </div>
      )}

      {/* Remove member confirmation modal */}
      {removeConfirmId && (
        <div className="dash-modal-backdrop" onClick={() => !removing && setRemoveConfirmId(null)}>
          <div className="dash-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h2 className="dash-modal-title">Retirer le membre</h2>
              <button className="dash-modal-close" aria-label="Fermer" onClick={() => setRemoveConfirmId(null)}>×</button>
            </div>
            <div className="dash-modal-body">
              <p style={{ fontSize: 14, color: 'var(--pencil)', margin: 0 }}>
                Ce membre perdra l&apos;accès au workspace. Cette action peut être annulée en les réinvitant.
              </p>
              {removeError && <div className="dash-error" role="alert">{removeError}</div>}
            </div>
            <div className="dash-modal-footer">
              <button className="dash-btn-ghost" onClick={() => setRemoveConfirmId(null)} disabled={removing}>Annuler</button>
              <button className="dash-btn-danger" onClick={handleRemoveConfirmed} disabled={removing}>
                {removing ? 'Suppression…' : 'Retirer du workspace'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel invitation confirmation modal */}
      {cancelConfirmId && (() => {
        const target = invitations.find(i => i.id === cancelConfirmId)
        const isPendingTarget = target && !target.used_at && new Date(target.expires_at) >= new Date()
        return (
          <div className="dash-modal-backdrop" onClick={() => !cancelling && setCancelConfirmId(null)}>
            <div className="dash-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
              <div className="dash-modal-header">
                <h2 className="dash-modal-title">{isPendingTarget ? "Annuler l'invitation" : "Supprimer l'invitation"}</h2>
                <button className="dash-modal-close" aria-label="Fermer" onClick={() => setCancelConfirmId(null)}>×</button>
              </div>
              <div className="dash-modal-body">
                <p style={{ fontSize: 14, color: 'var(--pencil)', margin: 0 }}>
                  {isPendingTarget
                    ? "Le lien d'invitation sera invalidé. Vous pourrez envoyer une nouvelle invitation si nécessaire."
                    : "Cette invitation sera supprimée de l'historique."}
                </p>
              </div>
              <div className="dash-modal-footer">
                <button className="dash-btn-ghost" onClick={() => setCancelConfirmId(null)} disabled={cancelling}>Fermer</button>
                <button className="dash-btn-danger" onClick={handleCancelConfirmed} disabled={cancelling}>
                  {cancelling ? '…' : isPendingTarget ? "Annuler l'invitation" : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── CompteSection ────────────────────────────────────────────────────────────

function CompteSection({ userEmail, userName }: { userEmail: string; userName: string }) {
  const [sending, setSending]   = useState(false)
  const [success, setSuccess]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const [displayName, setDisplayName]   = useState(userName)
  const [savingName, setSavingName]     = useState(false)
  const [nameSuccess, setNameSuccess]   = useState<string | null>(null)
  const [nameError, setNameError]       = useState<string | null>(null)

  async function handleSaveName() {
    if (!displayName.trim()) return
    setSavingName(true); setNameSuccess(null); setNameError(null)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({
      data: { full_name: displayName.trim() }
    })
    setSavingName(false)
    if (err) { setNameError(err.message) }
    else { setNameSuccess('Nom mis à jour.') }
  }

  async function handlePasswordReset() {
    setSending(true); setSuccess(null); setError(null)
    const supabase = createClient()
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : '/reset-password'
    const { error: err } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo })
    setSending(false)
    if (err) { setError(err.message) } else {
      setSuccess(`Un email de réinitialisation a été envoyé à ${userEmail}.`)
    }
  }

  return (
    <div>
      <div className="settings-section-header">
        <h2 className="settings-section-title">Mon compte</h2>
        <p className="settings-section-desc">Vos informations personnelles et sécurité</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="settings-sub-title">Nom affiché</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            className="dash-field-input"
            value={displayName}
            onChange={e => { setDisplayName(e.target.value); setNameSuccess(null) }}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveName() }}
            placeholder="Votre nom ou prénom"
            maxLength={60}
            style={{ maxWidth: 280 }}
          />
          <button
            className="dash-btn-ghost"
            onClick={handleSaveName}
            disabled={savingName || !displayName.trim() || displayName.trim() === userName}
          >
            {savingName ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        {nameSuccess && <div className="dash-success-msg" style={{ marginTop: 8 }} role="status">{nameSuccess}</div>}
        {nameError   && <div className="dash-error"       style={{ marginTop: 8 }} role="alert">{nameError}</div>}
        <p style={{ fontSize: 12, color: 'var(--pencil)', margin: '6px 0 0', fontFamily: 'Courier Prime,monospace' }}>
          Affiché dans la sidebar et les emails envoyés depuis Compte-Pote.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="settings-sub-title">Adresse email</div>
        <div className="settings-meta-row">
          <User size={13} aria-hidden="true" />
          <strong>{userEmail}</strong>
        </div>
        <p style={{ fontSize: 12, color: 'var(--pencil)', margin: '4px 0 0', fontFamily: 'Courier Prime,monospace' }}>
          L&apos;email est géré par votre fournisseur d&apos;authentification.
        </p>
      </div>

      <div>
        <div className="settings-sub-title">Mot de passe</div>
        <p style={{ fontSize: 13, color: 'var(--pencil)', margin: '0 0 12px' }}>
          Recevez un lien par email pour définir un nouveau mot de passe.
        </p>
        <button
          className="dash-btn-ghost"
          onClick={handlePasswordReset}
          disabled={sending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          {sending ? 'Envoi…' : 'Changer le mot de passe'}
        </button>
        {success && <div className="dash-success-msg" style={{ marginTop: 12 }} role="status">{success}</div>}
        {error   && <div className="dash-error" style={{ marginTop: 12 }} role="alert">{error}</div>}
      </div>
    </div>
  )
}

// ─── DangerSection ────────────────────────────────────────────────────────────

function DangerSection({ workspaceId }: { workspaceId: string }) {
  const [confirm, setConfirm]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('workspaces').delete().eq('id', workspaceId)
    if (err) { setError(err.message); setDeleting(false); return }
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div>
      <div className="settings-section-header">
        <h2 className="settings-section-title" style={{ color: '#dc2626' }}>Zone de danger</h2>
        <p className="settings-section-desc">Actions irréversibles sur votre workspace</p>
      </div>

      <div style={{ border: '1.5px solid #dc2626', padding: 24, boxShadow: '3px 3px 0 #dc2626' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontWeight: 600, margin: '0 0 6px', color: 'var(--ink)', fontSize: 14 }}>Supprimer le workspace</p>
            <p style={{ fontSize: 13, color: 'var(--pencil)', margin: 0, maxWidth: 480, lineHeight: 1.6 }}>
              Cette action supprimera définitivement toutes les données : factures, dépenses, transactions et membres.
              Elle est <strong>irréversible</strong>.
            </p>
          </div>
          <button className="dash-btn-danger" onClick={() => setConfirm(true)} type="button">
            Supprimer
          </button>
        </div>
        {error && !confirm && <div className="dash-error" style={{ marginTop: 12 }} role="alert">{error}</div>}
      </div>

      {confirm && (
        <div className="dash-modal-backdrop" onClick={() => !deleting && setConfirm(false)}>
          <div className="dash-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h2 className="dash-modal-title" style={{ color: '#dc2626' }}>Supprimer le workspace</h2>
              <button className="dash-modal-close" aria-label="Fermer" onClick={() => setConfirm(false)}>×</button>
            </div>
            <div className="dash-modal-body">
              <p style={{ fontSize: 14, color: 'var(--pencil)', margin: 0 }}>
                Cette action est <strong>irréversible</strong>. Toutes les données du workspace seront définitivement supprimées.
              </p>
              {error && <div className="dash-error" role="alert">{error}</div>}
            </div>
            <div className="dash-modal-footer">
              <button className="dash-btn-ghost" onClick={() => setConfirm(false)} disabled={deleting}>Annuler</button>
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
