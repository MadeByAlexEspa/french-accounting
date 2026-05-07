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
    if (result.error) { setError(result.error); setLoading(false); return }
    // Auto sign-in so the user lands directly in the app
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    router.push(signInError ? '/login?invited=1' : '/transactions')
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <div className="auth-field">
        <label className="auth-label">Email</label>
        <input type="email" className="auth-input" value={email} disabled />
      </div>
      <div className="auth-field">
        <label className="auth-label">Mot de passe</label>
        <input
          type="password"
          className="auth-input"
          placeholder="Minimum 8 caractères"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div className="auth-field">
        <label className="auth-label">Confirmer le mot de passe</label>
        <input
          type="password"
          className="auth-input"
          placeholder="Répétez le mot de passe"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button type="submit" className="auth-btn" disabled={loading}>
        {loading ? 'Création du compte…' : 'Créer mon compte'}
      </button>
    </form>
  )
}
