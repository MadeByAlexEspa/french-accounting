'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine } from 'lucide-react'

export default function AdminLoginForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (res.ok) {
      router.push('/admin/dashboard')
    } else {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Code incorrect')
      setLoading(false)
    }
  }

  return (
    <div className="adm-login-card">
      <div className="adm-login-brand">
        <PenLine size={16} />
        <span>Compte-Pote</span>
      </div>
      <h1 className="adm-login-title">Back-office</h1>
      {error && <div className="adm-login-error">{error}</div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="dash-field-label" htmlFor="adm-code">Code d&apos;accès</label>
          <input
            id="adm-code"
            type="password"
            className="dash-field-input"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="••••••••"
            required
            autoFocus
          />
        </div>
        <button type="submit" className="dash-btn" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Vérification…' : 'Accéder au back-office'}
        </button>
      </form>
    </div>
  )
}
