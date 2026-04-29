export default function IntegrationsPage() {
  const connectors = [
    {
      id: 'qonto', name: 'Qonto', logo: 'Q', color: '#ff5c35',
      description: 'Synchronisation des transactions bancaires vers les comptes PCG',
      available: false,
    },
    {
      id: 'shine', name: 'Shine', logo: 'S', color: '#6c3fc5',
      description: 'Synchronisation des transactions bancaires Shine vers les comptes PCG',
      available: false,
    },
    {
      id: 'pennylane', name: 'Pennylane', logo: 'P', color: '#00c896',
      description: 'Export des données vers Pennylane pour votre expert-comptable',
      available: false,
    },
  ]

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Connexions API</h1>
          <p className="dash-subtitle">Synchronisez vos données avec vos outils bancaires et comptables</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:20 }}>
        {connectors.map(c => (
          <div key={c.id} className="dash-card">
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
              <div style={{
                width:48, height:48, borderRadius:2, background:c.color,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'Special Elite,cursive', fontSize:22, color:'#fff', fontWeight:700,
              }}>{c.logo}</div>
              <div>
                <div style={{ fontFamily:'Special Elite,cursive', fontSize:18, color:'var(--ink)' }}>{c.name}</div>
                <span className="dash-badge dash-badge-gray" style={{ marginTop:4 }}>À venir</span>
              </div>
            </div>
            <p style={{ fontSize:13, color:'var(--pencil)', lineHeight:1.6, margin:'0 0 16px' }}>{c.description}</p>
            <button className="dash-btn" disabled style={{ opacity:0.4, cursor:'not-allowed' }}>
              Connecter
            </button>
          </div>
        ))}
      </div>

      <div className="dash-card" style={{ marginTop:8, background:'var(--offwhite)', borderStyle:'dashed' }}>
        <div style={{ fontFamily:'Courier Prime,monospace', fontSize:12, color:'var(--pencil)', lineHeight:1.7 }}>
          <strong>Note :</strong> Les connexions API vers les banques partenaires (Qonto, Shine) sont en cours de développement.
          En attendant, vous pouvez importer vos transactions manuellement depuis la page <a href="/transactions" style={{ color:'var(--ink)', textDecorationStyle:'dashed' }}>Transactions</a>.
        </div>
      </div>
    </div>
  )
}
