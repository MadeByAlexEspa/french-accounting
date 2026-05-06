import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function round2(n: number) { return Math.round(n * 100) / 100 }

export default async function DashboardHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: m } = await supabase
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!m) redirect('/setup')

  const year = new Date().getFullYear()
  const debut = `${year}-01-01`
  const fin   = `${year}-12-31`

  const [{ data: factures }, { data: depenses }] = await Promise.all([
    supabase
      .from('factures')
      .select('montant_ht, montant_tva, montant_ttc, statut, taux_tva, tva_lines, date')
      .eq('workspace_id', m.workspace_id)
      .gte('date', debut)
      .lte('date', fin),
    supabase
      .from('depenses')
      .select('montant_ht, montant_tva, montant_ttc, date')
      .eq('workspace_id', m.workspace_id)
      .gte('date', debut)
      .lte('date', fin),
  ])

  const f = factures ?? []
  const d = depenses ?? []

  const ca       = round2(f.reduce((s, r) => s + r.montant_ht, 0))
  const charges  = round2(d.reduce((s, r) => s + r.montant_ht, 0))
  const resultat = round2(ca - charges)

  const tvaCollectee = round2(f.reduce((s, r) => {
    if (r.taux_tva === -1 && r.tva_lines) {
      try {
        const lines = (typeof r.tva_lines === 'string' ? JSON.parse(r.tva_lines) : r.tva_lines) as { montant_tva: number }[]
        return s + lines.reduce((t, l) => t + l.montant_tva, 0)
      } catch { return s + r.montant_tva }
    }
    return s + r.montant_tva
  }, 0))
  const tvaDeductible = round2(d.reduce((s, r) => s + r.montant_tva, 0))
  const tvaDue        = round2(tvaCollectee - tvaDeductible)

  const impayeesRows = f.filter(r => r.statut === 'en_attente')
  const impayees     = round2(impayeesRows.reduce((s, r) => s + r.montant_ttc, 0))

  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jui','Jul','Aoû','Sep','Oct','Nov','Déc']
  const monthlyCA = Array(12).fill(0)
  const monthlyCharges = Array(12).fill(0)
  f.forEach(r => { const mo = new Date(r.date).getMonth(); monthlyCA[mo] = round2(monthlyCA[mo] + r.montant_ht) })
  d.forEach(r => { const mo = new Date(r.date).getMonth(); monthlyCharges[mo] = round2(monthlyCharges[mo] + r.montant_ht) })
  const chartMax = Math.max(...monthlyCA, ...monthlyCharges, 1)

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Vue d'ensemble</h1>
          <p className="dash-subtitle">Exercice {year} — données en temps réel</p>
        </div>
        <Link href="/transactions" className="dash-btn">+ Nouvelle entrée</Link>
      </div>

      {/* Row 1 — P&L */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card">
          <p className="dash-kpi-label">Chiffre d'affaires HT</p>
          <p className="dash-kpi-value">{fmt(ca)}</p>
          <p className="dash-kpi-sub">{f.length} facture{f.length !== 1 ? 's' : ''} émise{f.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="dash-kpi-card">
          <p className="dash-kpi-label">Charges HT</p>
          <p className="dash-kpi-value">{fmt(charges)}</p>
          <p className="dash-kpi-sub">{d.length} dépense{d.length !== 1 ? 's' : ''} enregistrée{d.length !== 1 ? 's' : ''}</p>
        </div>

        <div className={`dash-kpi-card ${resultat >= 0 ? 'dash-kpi-card-credit' : 'dash-kpi-card-due'}`}>
          <p className="dash-kpi-label">Résultat net HT</p>
          <p className={`dash-kpi-value ${resultat >= 0 ? 'dash-kpi-value-success' : 'dash-kpi-value-danger'}`}>
            {fmt(resultat)}
          </p>
          <p className="dash-kpi-sub">
            {resultat >= 0 ? 'Bénéfice' : 'Déficit'} — marge {ca > 0 ? Math.round(resultat / ca * 100) : 0} %
          </p>
        </div>
      </div>

      {/* Row 2 — TVA + impayées */}
      <div className="dash-kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className={`dash-kpi-card ${tvaDue > 0 ? 'dash-kpi-card-due' : tvaDue < 0 ? 'dash-kpi-card-credit' : ''}`}>
          <p className="dash-kpi-label">TVA due</p>
          <p className={`dash-kpi-value ${tvaDue > 0 ? 'dash-kpi-value-danger' : tvaDue < 0 ? 'dash-kpi-value-success' : ''}`}>
            {fmt(tvaDue)}
          </p>
          <p className="dash-kpi-sub">
            Collectée {fmt(tvaCollectee)} · Déductible {fmt(tvaDeductible)}
          </p>
        </div>

        <div className={`dash-kpi-card ${impayees > 0 ? 'dash-kpi-card-due' : ''}`}>
          <p className="dash-kpi-label">Factures impayées</p>
          <p className={`dash-kpi-value ${impayees > 0 ? 'dash-kpi-value-danger' : ''}`}>
            {fmt(impayees)}
          </p>
          <p className="dash-kpi-sub">
            {impayeesRows.length === 0
              ? 'Aucune facture en attente'
              : `${impayeesRows.length} facture${impayeesRows.length !== 1 ? 's' : ''} en attente de paiement`}
          </p>
        </div>
      </div>

      {/* Chart — CA vs Charges */}
      <div className="dash-card" style={{ marginTop: 8, padding: '20px 24px 16px' }}>
        <p className="dash-card-title" style={{ marginBottom: 16 }}>Évolution mensuelle {year}</p>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: 'var(--pencil)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: 'var(--ink)', display: 'inline-block' }} />
            CA HT
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: 'var(--rule)', display: 'inline-block' }} />
            Charges HT
          </span>
        </div>
        <svg width="100%" viewBox="0 0 600 140" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
          {monthlyCA.map((caVal, i) => {
            const chargesVal = monthlyCharges[i]
            const BAR_W = 18
            const GAP = 32
            const x = i * (BAR_W * 2 + GAP) + 10
            const chartH = 100
            const caH = Math.round((caVal / chartMax) * chartH)
            const chH = Math.round((chargesVal / chartMax) * chartH)
            return (
              <g key={i}>
                {/* CA bar */}
                <rect x={x} y={chartH - caH} width={BAR_W} height={caH} fill="var(--ink)" />
                {/* Charges bar */}
                <rect x={x + BAR_W + 2} y={chartH - chH} width={BAR_W} height={chH} fill="var(--rule)" />
                {/* Month label */}
                <text x={x + BAR_W} y={118} textAnchor="middle" fontSize="10" fill="var(--pencil)" fontFamily="'Courier Prime', monospace">
                  {MONTHS[i]}
                </text>
              </g>
            )
          })}
          {/* Baseline */}
          <line x1="0" y1="100" x2="600" y2="100" stroke="var(--rule)" strokeWidth="1" />
        </svg>
      </div>

      {/* Shortcuts */}
      <div className="dash-card" style={{ marginTop: 8 }}>
        <p className="dash-card-title">Accès rapide</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/transactions" className="dash-btn-ghost">Transactions</Link>
          <Link href="/tva" className="dash-btn-ghost">Déclaration TVA</Link>
          <Link href="/exercice" className="dash-btn-ghost">Comptes annuels</Link>
          <Link href="/notes-de-frais" className="dash-btn-ghost">Notes de frais</Link>
          <Link href="/integrations" className="dash-btn-ghost">Connexions API</Link>
        </div>
      </div>
    </div>
  )
}
