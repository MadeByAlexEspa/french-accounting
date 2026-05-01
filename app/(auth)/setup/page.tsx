'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setupWorkspace } from './actions'

export default function SetupPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const result = await setupWorkspace({ companyName })
    if (result.error) { setError(result.error); setLoading(false); return }
    router.push('/transactions')
    router.refresh()
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-name">✎ Compte-Pote</span>
        </div>

        <div className="auth-form-header">
          <h1 className="auth-title">Créer votre espace de travail</h1>
          <p className="auth-subtitle">Votre compte existe mais n&apos;a pas encore d&apos;espace de travail.</p>
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

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? 'Création…' : 'Créer mon espace →'}
          </button>
        </form>

        <p className="auth-footer">
          <Link href="/login" className="auth-link">Se déconnecter</Link>
        </p>
      </div>
    </div>
  )
}
