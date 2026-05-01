'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { register } from './actions'

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export default function RegisterPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    if (password.length < 8)  { setError('Le mot de passe doit contenir au moins 8 caractères'); return }

    setLoading(true)
    setError(null)

    const baseSlug = slugify(companyName) || 'workspace'
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`

    const result = await register({ email, password, companyName, slug })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push('/transactions')
    router.refresh()
  }

  return (
    <div className="auth-split">

      <div className="auth-left">
        <Link href="/" className="auth-left-logo">📝 Compte-Pote</Link>

        <div className="auth-left-body">
          <h1 className="auth-left-headline">
            Votre espace de travail,<br />en 30 secondes.
          </h1>
          <p className="auth-left-sub">
            Créez votre compte, nommez votre entreprise, et commencez à gérer
            votre comptabilité immédiatement.
          </p>
          <ul className="auth-left-features">
            {[
              'Espace isolé multi-tenant sécurisé',
              'Accès à toutes les fonctionnalités',
              'Historique et données illimités',
              'Résiliable à tout moment',
              "3 € / mois — moins qu'un café",
            ].map(f => (
              <li key={f}><span className="alf-check">✓</span> {f}</li>
            ))}
          </ul>
        </div>

        <p className="auth-left-price">Sans carte de crédit pour commencer</p>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">

          <div className="auth-form-header">
            <h2 className="auth-form-title">Créer votre espace</h2>
            <p className="auth-form-sub">Votre entreprise, vos données, isolées et sécurisées.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="company" className="auth-label">{"Nom de l'entreprise"}</label>
              <input
                id="company"
                type="text"
                required
                autoFocus
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="auth-input"
                placeholder="Acme SAS"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="email" className="auth-label">Email professionnel</label>
              <input
                id="email"
                type="email"
                required
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
                placeholder="8 caractères minimum"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="confirm" className="auth-label">Confirmer le mot de passe</label>
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
              {loading ? 'Création en cours…' : 'Créer mon espace de travail →'}
            </button>
          </form>

          <p className="auth-footer">
            Déjà un compte ?{' '}
            <Link href="/login" className="auth-link">Se connecter</Link>
          </p>

        </div>
      </div>
    </div>
  )
}
