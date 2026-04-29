'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <span className="auth-logo-name">✎ Compte-Pote</span>
      </div>

      <h1 className="auth-title">Mot de passe oublié</h1>

      {sent ? (
        <>
          <div className="auth-success">
            Un lien de réinitialisation a été envoyé à <strong>{email}</strong> si cet email
            est associé à un compte. Vérifiez aussi vos spams.
          </div>
          <p className="auth-footer">
            <Link href="/login" className="auth-link">← Retour à la connexion</Link>
          </p>
        </>
      ) : (
        <>
          <p className="auth-subtitle">
            Saisissez votre email — nous vous enverrons un lien valable 1 heure.
          </p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="email" className="auth-label">Email</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="auth-input"
                placeholder="vous@entreprise.com"
              />
            </div>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
          <p className="auth-footer">
            <Link href="/login" className="auth-link">← Retour à la connexion</Link>
          </p>
        </>
      )}
    </div>
  )
}
