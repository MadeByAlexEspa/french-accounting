'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PenLine, ChevronLeft } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas')
      return
    }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => router.push('/transactions'), 2000)
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <span className="auth-logo-name"><PenLine size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Compte-Pote</span>
      </div>

      <h1 className="auth-title">Nouveau mot de passe</h1>

      {done ? (
        <>
          <div className="auth-success">
            Mot de passe mis à jour. Redirection en cours…
          </div>
        </>
      ) : (
        <>
          <p className="auth-subtitle">Choisissez un nouveau mot de passe.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="password" className="auth-label">Nouveau mot de passe</label>
              <input
                id="password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="auth-input"
                placeholder="8 caractères minimum"
                minLength={8}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="confirm" className="auth-label">Confirmer</label>
              <input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="auth-input"
                placeholder="••••••••"
              />
            </div>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Enregistrement…' : 'Changer le mot de passe'}
            </button>
          </form>
          <p className="auth-footer">
            <Link href="/login" className="auth-link"><ChevronLeft size={14} style={{ verticalAlign: 'middle' }} /> Retour à la connexion</Link>
          </p>
        </>
      )}
    </div>
  )
}
