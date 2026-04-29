'use client'

import { useState } from 'react'
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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'Courier Prime,monospace', padding:24 }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ fontSize:24, fontFamily:'Special Elite,cursive', marginBottom:8, color:'#1a1a1a' }}>
          ✎ Compte-Pote
        </div>
        <h1 style={{ fontFamily:'Special Elite,cursive', fontSize:22, color:'#1a1a1a', margin:'0 0 8px' }}>
          Créer votre espace de travail
        </h1>
        <p style={{ fontSize:13, color:'#666', margin:'0 0 24px' }}>
          Votre compte existe mais n&apos;a pas encore d&apos;espace de travail.
        </p>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#1a1a1a', textTransform:'uppercase', letterSpacing:1 }}>
              Nom de l&apos;entreprise
            </label>
            <input
              type="text"
              required
              autoFocus
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Acme SAS"
              style={{ padding:'10px 12px', border:'1px solid #ccc', borderRadius:2, fontFamily:'Courier Prime,monospace', fontSize:14, outline:'none' }}
            />
          </div>
          {error && (
            <div style={{ background:'#fff5f5', border:'1px solid #fca5a5', color:'#dc2626', padding:'10px 12px', borderRadius:2, fontSize:13 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{ background:'#1a1a1a', color:'#fff', border:'none', padding:'12px 20px', fontFamily:'Courier Prime,monospace', fontSize:14, cursor:loading?'not-allowed':'pointer', opacity:loading?0.7:1, borderRadius:2 }}
          >
            {loading ? 'Création…' : 'Créer mon espace →'}
          </button>
        </form>
        <p style={{ fontSize:12, color:'#999', marginTop:20, textAlign:'center' }}>
          <a href="/login" style={{ color:'#666', textDecoration:'underline' }}>Se déconnecter</a>
        </p>
      </div>
    </div>
  )
}
