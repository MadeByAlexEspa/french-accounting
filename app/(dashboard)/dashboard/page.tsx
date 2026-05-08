import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function round2(n: number) { return Math.round(n * 100) / 100 }

function YearNav({ year, currentYear }: { year: number; currentYear: number }) {
  const prevYear = year - 1
  const nextYear = year + 1
  const canGoBack = prevYear >= 2020
  const canGoForward = nextYear <= currentYear
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontFamily: "'Courier Prime', monospace", fontSize: 13 }}>
      {canGoBack ? (
        <a href={`/dashboard?year=${prevYear}`} style={{ padding: '4px 10px', border: '1.5px solid var(--ink)', borderRight: 'none', color: 'var(--ink)', textDecoration: 'none', background: 'var(--paper)' }}>←</a>
      ) : (
        <span style={{ padding: '4px 10px', border: '1.5px solid var(--rule)', borderRight: 'none', color: 'var(--rule)', background: 'var(--paper)' }}>←</span>
      )}
      <span style={{ padding: '4px 16px', border: '1.5px solid var(--ink)', fontWeight: 700, background: year === currentYear ? 'var(--ink)' : 'var(--paper)', color: year === currentYear ? 'var(--paper)' : 'var(--ink)' }}>
        {year}
      </span>
      {canGoForward ? (
        <a href={`/dashboard?year=${nextYear}`} style={{ padding: '4px 10px', border: '1.5px solid var(--ink)', borderLeft: 'none', color: 'var(--ink)', textDecoration: 'none', background: 'var(--paper)' }}>→</a>
      ) : (
        <span style={{ padding: '4px 10px', border: '1.5px solid var(--rule)', borderLeft: 'none', color: 'var(--rule)', background: 'var(--paper)' }}>→</span>
      )}
    </div>
  )
}

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year: yearParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: m } = await supabase
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!m) redirect('/setup')

  const currentYear = new Date().getFullYear()
  const year = (() => {
    const y = parseInt(yearParam ?? '', 10)
    if (!isNaN(y) && y >= 2020 && y <= currentYear) return y
    return currentYear
  })()
  const debut = `${year}-01-01`
  const fin   = `${year}-12-31`

  const [{ data: factures }, { data: depenses }, { data: wsData }] = await Promise.all([
    supabase
      .from('factures')
      .select('montant_ht, montant_tva, montant_ttc, statut, taux_tva, tva_lines, date')
      .eq('workspace_id', m.workspace_id)
      .gte('date', debut)
      .lte('date', fin),
    supabase
      .from('depenses')
      .select('montant_ht, montant_tva, montant_ttc, statut, date')
      .eq('workspace_id', m.workspace_id)
      .gte('date', debut)
      .lte('date', fin),
    supabase
      .from('workspaces')
      .select('structure_type, activite_type')
      .eq('id', m.workspace_id)
      .single(),
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

  // Alert: overdue invoices (en_attente + date > 30 days ago)
  const today = new Date()
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30)
  const overdueRows = f.filter(r =>
    r.statut === 'en_attente' && r.date < thirtyDaysAgo.toISOString().slice(0, 10)
  )
  const overdueTotal = round2(overdueRows.reduce((s, r) => s + r.montant_ttc, 0))

  // Ratios de gestion
  const margeNette   = ca > 0 ? Math.round(resultat / ca * 1000) / 10 : null
  const chargesSurCA = ca > 0 ? Math.round(charges / ca * 1000) / 10 : null
  const dettesF      = round2(d.filter(r => r.statut === 'en_attente').reduce((s, r) => s + r.montant_ttc, 0))
  const bfr          = round2(impayees - dettesF)

  // Micro-entrepreneur
  const isMicro = wsData?.structure_type === 'micro'
  const activiteMicro = wsData?.activite_type ?? ''
  const seuilMajore    = activiteMicro === 'micro_bic_marchandises' ? 93500 : 41250
  const cotisationRate = activiteMicro === 'micro_bic_marchandises' ? 0.123 : 0.212
  const anneeEnCours = new Date().getFullYear()
  const caAnnuel = (factures ?? [])
    .filter(r => new Date(r.date).getFullYear() === anneeEnCours)
    .reduce((s, r) => s + r.montant_ht, 0)
  const cotisationsEstimees = round2(caAnnuel * cotisationRate)
  const tauxRemplissage = Math.min(100, Math.round(caAnnuel / seuilMajore * 100))

  // Alert: TVA declaration deadline (within 15 days of end of quarter)
  const m0 = today.getMonth() // 0-based
  const currentQuarter = Math.floor(m0 / 3) // 0-3
  const quarterEndMonth = (currentQuarter + 1) * 3 // 3, 6, 9, 12
  const quarterEndDate = new Date(currentYear, quarterEndMonth, 0) // last day of quarter
  const daysToQuarterEnd = Math.ceil((quarterEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const showTvaAlert = daysToQuarterEnd >= 0 && daysToQuarterEnd <= 15

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
          <p className="dash-subtitle">
            Exercice {year}{year === currentYear ? ' — données en temps réel' : ' — données historiques'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <YearNav year={year} currentYear={currentYear} />
          {year === currentYear && (
            <Link href="/transactions" className="dash-btn">+ Nouvelle entrée</Link>
          )}
        </div>
      </div>

      {/* Alerts */}
      {overdueRows.length > 0 && (
        <div className="dash-alert dash-alert-danger">
          <span className="dash-alert-glyph">!</span>
          <div className="dash-alert-body">
            <p className="dash-alert-title">
              {overdueRows.length} facture{overdueRows.length > 1 ? 's' : ''} en retard de paiement
            </p>
            <p className="dash-alert-desc">
              {fmt(overdueTotal)} TTC impayé{overdueRows.length > 1 ? 's' : ''} depuis plus de 30 jours — relancez vos clients.
            </p>
          </div>
          <Link href="/transactions?tab=entrees" className="dash-alert-action">
            Voir →
          </Link>
        </div>
      )}

      {showTvaAlert && (
        <div className="dash-alert dash-alert-warning">
          <span className="dash-alert-glyph">%</span>
          <div className="dash-alert-body">
            <p className="dash-alert-title">Déclaration TVA à préparer</p>
            <p className="dash-alert-desc">
              Fin de trimestre dans {daysToQuarterEnd} jour{daysToQuarterEnd > 1 ? 's' : ''} — vérifiez votre TVA collectée et déductible.
            </p>
          </div>
          <Link href="/tva" className="dash-alert-action">
            Déclarer →
          </Link>
        </div>
      )}

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

      {/* Micro-entrepreneur */}
      {isMicro && (
        <div className="dash-card" style={{ marginBottom: 24 }}>
          <div className="dash-card-title">Micro-entrepreneur</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 12 }}>
            {/* CA vs seuil franchise TVA */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                CA {anneeEnCours} vs seuil franchise TVA
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Courier Prime,monospace' }}>
                {fmt(caAnnuel)}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--pencil)', marginLeft: 6 }}>
                  / {fmt(seuilMajore)}
                </span>
              </div>
              {/* Barre de progression */}
              <div style={{ height: 4, background: 'var(--rule)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${tauxRemplissage}%`,
                  background: tauxRemplissage >= 90 ? '#dc2626' : tauxRemplissage >= 70 ? '#f59e0b' : '#16a34a',
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace', marginTop: 4 }}>
                {tauxRemplissage < 70
                  ? `Franchise TVA active — seuil majoré : ${fmt(seuilMajore)}`
                  : tauxRemplissage < 90
                  ? `Attention : ${tauxRemplissage}% du seuil majoré atteint`
                  : `Seuil majoré bientôt atteint — vérifiez votre obligation TVA`}
              </div>
            </div>

            {/* Cotisations URSSAF estimées */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Cotisations URSSAF estimées
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Courier Prime,monospace' }}>
                {fmt(cotisationsEstimees)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace', marginTop: 4 }}>
                {Math.round(cotisationRate * 100 * 10) / 10}% du CA HT — estimation sur {anneeEnCours}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ratios de gestion */}
      <div className="dash-card" style={{ marginTop: 8 }}>
        <p className="dash-card-title" style={{ marginBottom: 16 }}>Ratios de gestion</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div className="dash-ratio-card">
            <div className="dash-ratio-label">Marge nette</div>
            <div className="dash-ratio-value" style={{
              color: margeNette === null ? 'var(--pencil)'
                : margeNette < 0 ? '#dc2626'
                : margeNette < 15 ? '#d97706'
                : '#15803d'
            }}>
              {margeNette === null ? '—' : `${margeNette} %`}
            </div>
            <div className="dash-ratio-desc">Résultat / CA HT</div>
          </div>

          <div className="dash-ratio-card">
            <div className="dash-ratio-label">Charges / CA</div>
            <div className="dash-ratio-value" style={{
              color: chargesSurCA === null ? 'var(--pencil)'
                : chargesSurCA > 90 ? '#dc2626'
                : chargesSurCA > 75 ? '#d97706'
                : '#15803d'
            }}>
              {chargesSurCA === null ? '—' : `${chargesSurCA} %`}
            </div>
            <div className="dash-ratio-desc">Charges HT / CA HT</div>
          </div>

          <div className="dash-ratio-card">
            <div className="dash-ratio-label">BFR simplifié</div>
            <div className="dash-ratio-value" style={{ color: bfr > 0 ? '#d97706' : '#15803d' }}>
              {fmt(bfr)}
            </div>
            <div className="dash-ratio-desc">Créances – Dettes fournisseurs</div>
          </div>
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
