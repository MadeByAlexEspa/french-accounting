'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine } from 'lucide-react'

type Analytics = {
  total_workspaces: number
  total_users: number
  new_workspaces_30d: number
  new_users_30d: number
  total_feedbacks: number
}

type Workspace = {
  id: string
  name: string
  slug: string
  created_at: string
  member_count: number
}

type User = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  workspace_name: string
  role: string
}

type Feedback = {
  id: number
  content: string
  created_at: string
  vote_count: number
}

type Tab = 'overview' | 'workspaces' | 'users' | 'feedbacks'

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Aperçu',
  workspaces: 'Workspaces',
  users: 'Utilisateurs',
  feedbacks: 'Feedbacks',
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "À l'instant"
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

export default function AdminDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])

  function handleUnauth() {
    router.push('/admin')
  }

  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      const [a, w, u, f] = await Promise.all([
        fetch('/api/admin/analytics').then(r => r.json()) as Promise<Analytics & { error?: string }>,
        fetch('/api/admin/workspaces').then(r => r.json()) as Promise<Workspace[]>,
        fetch('/api/admin/users').then(r => r.json()) as Promise<User[]>,
        fetch('/api/admin/feedbacks').then(r => r.json()) as Promise<Feedback[]>,
      ])
      if ((a as { error?: string }).error) {
        handleUnauth()
        return
      }
      setAnalytics(a)
      setWorkspaces(w)
      setUsers(u)
      setFeedbacks(f)
      setLoading(false)
    }
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin')
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Courier Prime, monospace' }}>
        Chargement…
      </div>
    )
  }

  const tabs: Tab[] = ['overview', 'workspaces', 'users', 'feedbacks']

  return (
    <>
      <div className="adm-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PenLine size={16} />
          <span className="adm-header-title">Back-office</span>
        </div>
        <button className="dash-btn-ghost" style={{ fontSize: 12 }} onClick={handleLogout}>
          ↩ Déconnexion
        </button>
      </div>

      <div className="adm-page">
        <div className="dash-tabs">
          {tabs.map(t => (
            <button
              key={t}
              className={`dash-tab${tab === t ? ' dash-tab-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'overview' && analytics && (
          <div className="dash-kpi-grid">
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Workspaces</p>
              <p className="dash-kpi-value">{analytics.total_workspaces}</p>
            </div>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Utilisateurs</p>
              <p className="dash-kpi-value">{analytics.total_users}</p>
            </div>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Nouveaux workspaces 30j</p>
              <p className="dash-kpi-value">{analytics.new_workspaces_30d}</p>
            </div>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Nouveaux users 30j</p>
              <p className="dash-kpi-value">{analytics.new_users_30d}</p>
            </div>
            <div className="dash-kpi-card">
              <p className="dash-kpi-label">Feedbacks</p>
              <p className="dash-kpi-value">{analytics.total_feedbacks}</p>
            </div>
          </div>
        )}

        {tab === 'workspaces' && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Slug</th>
                  <th>Membres</th>
                  <th>Créé le</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="dash-empty">Aucun workspace</td>
                  </tr>
                ) : (
                  workspaces.map(ws => (
                    <tr key={ws.id}>
                      <td>{ws.name}</td>
                      <td>{ws.slug}</td>
                      <td>{ws.member_count}</td>
                      <td>{new Date(ws.created_at).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'users' && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Workspace</th>
                  <th>Rôle</th>
                  <th>Dernière connexion</th>
                  <th>Créé le</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="dash-empty">Aucun utilisateur</td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.workspace_name}</td>
                      <td>{u.role}</td>
                      <td>{relativeTime(u.last_sign_in_at)}</td>
                      <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'feedbacks' && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Votes</th>
                  <th>Contenu</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {feedbacks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="dash-empty">Aucun feedback</td>
                  </tr>
                ) : (
                  feedbacks.map(f => (
                    <tr key={f.id}>
                      <td>▲ {f.vote_count}</td>
                      <td>
                        {f.content.length > 100
                          ? f.content.slice(0, 100) + '…'
                          : f.content}
                      </td>
                      <td>{new Date(f.created_at).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
