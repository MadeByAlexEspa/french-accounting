'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const invited = searchParams.get('invited') === '1'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/transactions')
      router.refresh()
    }
  }

  return (
    <div className="auth-split">

      {/* ── Left — branding ── */}
      <div className="auth-left">
        <Link href="/" className="auth-left-logo">📝 Compte-Pote</Link>

        <div className="auth-left-body">
          <h1 className="auth-left-headline">
            La comptabilité<br />sans les complications.
          </h1>
          <p className="auth-left-sub">
            Factures, dépenses, TVA, bilan annuel — tout ce dont vous avez besoin
            si vous gérez vous-même votre compta.
          </p>
          <ul className="auth-left-features">
            {[
              'Facturation numérotée automatiquement',
              'Déclaration TVA précalculée (CA3)',
              'Compte de résultat conforme ANC',
              'Agent comptable IA inclus',
              'Connexion Qonto & Shine',
            ].map(f => (
              <li key={f}><span className="alf-check">✓</span> {f}</li>
            ))}
          </ul>
        </div>

        <p className="auth-left-price">3 € / mois — sans engagement</p>
      </div>

      {/* ── Right — form ── */}
      <div className="auth-right">
        <div className="auth-form-wrap">

          {invited && (
            <div className="auth-success" style={{ marginBottom: 16 }}>
              Votre compte a été créé. Connectez-vous pour accéder à votre espace.
            </div>
          )}

          <div className="auth-form-header">
            <h2 className="auth-form-title">Se connecter</h2>
            <p className="auth-form-sub">Accédez à votre espace de travail.</p>
          </div>

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

            <div className="auth-field">
              <label htmlFor="password" className="auth-label">Mot de passe</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="auth-input"
                placeholder="••••••••"
              />
            </div>

            <p className="auth-forgot">
              <Link href="/mot-de-passe-oublie" className="auth-link">
                Mot de passe oublié ?
              </Link>
            </p>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Connexion…' : 'Se connecter →'}
            </button>
          </form>

          <p className="auth-footer">
            Pas encore de compte ?{' '}
            <Link href="/register" className="auth-link">
              Créer un espace de travail
            </Link>
          </p>

        </div>
      </div>
    </div>
  )
}
