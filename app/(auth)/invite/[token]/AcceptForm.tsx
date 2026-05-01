'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInvitation } from './actions'

export default function AcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    setLoading(true)
    const result = await acceptInvitation(token, password)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    router.push('/login?invited=1')
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="dash-field">
        <label className="dash-field-label">Email</label>
        <input type="email" className="dash-field-input" value={email} disabled />
      </div>
      <div className="dash-field">
        <label className="dash-field-label">Mot de passe</label>
        <input
          type="password"
          className="dash-field-input"
          placeholder="Minimum 8 caractères"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div className="dash-field">
        <label className="dash-field-label">Confirmer le mot de passe</label>
        <input
          type="password"
          className="dash-field-input"
          placeholder="Répétez le mot de passe"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </div>
      {error && <div className="dash-error">{error}</div>}
      <button type="submit" className="dash-btn" disabled={loading}>
        {loading ? 'Création du compte…' : 'Créer mon compte'}
      </button>
    </form>
  )
}
