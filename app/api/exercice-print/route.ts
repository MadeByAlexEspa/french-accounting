import { createClient } from '@/lib/supabase/server'
import type { Facture, Depense } from '@/lib/types/database'

function isBilanCat(cat: string): boolean {
  const c = (cat ?? '').split(' ')[0]
  return /^[12]/.test(c) || c.startsWith('455') || c.startsWith('58')
}

function isImmobi(cat: string): boolean {
  return /^2/.test((cat ?? '').split(' ')[0])
}

function eur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function formatPeriod(debut: string, fin: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  return `${fmt(debut)} — ${fmt(fin)}`
}

function buildHtml(
  debut: string,
  fin: string,
  factures: Facture[],
  depenses: Depense[]
): string {
  const produits: Record<string, number> = {}
  const charges: Record<string, number> = {}

  for (const f of factures) {
    if (!isBilanCat(f.categorie)) {
      produits[f.categorie] = (produits[f.categorie] ?? 0) + f.montant_ht
    }
  }
  for (const d of depenses) {
    if (!isBilanCat(d.categorie) && !isImmobi(d.categorie)) {
      charges[d.categorie] = (charges[d.categorie] ?? 0) + d.montant_ht
    }
  }

  const totalProduits = Object.values(produits).reduce((s, v) => s + v, 0)
  const totalCharges = Object.values(charges).reduce((s, v) => s + v, 0)
  const resultat = totalProduits - totalCharges
  const marge =
    totalProduits > 0 ? Math.round((resultat / totalProduits) * 1000) / 10 : null

  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const resultatColor = resultat >= 0 ? '#15803d' : '#dc2626'

  function produitsRows(): string {
    if (Object.keys(produits).length === 0) {
      return `<tr><td colspan="2" style="color:#4a4a4a;font-style:italic;padding:6px 0;">Aucun produit sur la période</td></tr>`
    }
    return Object.entries(produits)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([cat, amount]) =>
          `<tr>
            <td style="padding:6px 0;color:#1a1a1a;">${escHtml(cat)}</td>
            <td style="padding:6px 0;text-align:right;font-family:'Courier Prime',monospace;">${eur(amount)}</td>
          </tr>`
      )
      .join('')
  }

  function chargesRows(): string {
    if (Object.keys(charges).length === 0) {
      return `<tr><td colspan="2" style="color:#4a4a4a;font-style:italic;padding:6px 0;">Aucune charge sur la période</td></tr>`
    }
    return Object.entries(charges)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([cat, amount]) =>
          `<tr>
            <td style="padding:6px 0;color:#1a1a1a;">${escHtml(cat)}</td>
            <td style="padding:6px 0;text-align:right;font-family:'Courier Prime',monospace;">${eur(amount)}</td>
          </tr>`
      )
      .join('')
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Compte-Pote — Comptes Annuels</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Courier+Prime:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      background: #fff;
      padding: 24px 32px;
      max-width: 860px;
      margin: 0 auto;
    }

    h1 {
      font-family: 'Special Elite', serif;
      font-size: 26px;
      color: #1a1a1a;
      margin-bottom: 4px;
    }

    .period {
      font-family: 'Courier Prime', monospace;
      font-size: 13px;
      color: #4a4a4a;
      margin-bottom: 32px;
    }

    .section-title {
      font-family: 'Special Elite', serif;
      font-size: 16px;
      color: #1a1a1a;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 6px;
      margin-bottom: 16px;
      margin-top: 32px;
    }

    .sub-title {
      font-family: 'Courier Prime', monospace;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #4a4a4a;
      margin-bottom: 8px;
      margin-top: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    tr + tr {
      border-top: 1px solid #e8e8e4;
    }

    .total-row td {
      font-weight: 600;
      border-top: 2px solid #1a1a1a !important;
      padding-top: 10px !important;
    }

    .resultat-row td {
      font-family: 'Special Elite', serif;
      font-size: 15px;
      padding: 10px 0;
      border-top: 2px solid #1a1a1a !important;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-top: 16px;
    }

    .kpi-card {
      border: 1px solid #e8e8e4;
      border-radius: 6px;
      padding: 14px 16px;
    }

    .kpi-label {
      font-family: 'Courier Prime', monospace;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #4a4a4a;
      margin-bottom: 6px;
    }

    .kpi-value {
      font-family: 'Courier Prime', monospace;
      font-size: 17px;
      font-weight: 700;
      color: #1a1a1a;
    }

    footer {
      margin-top: 48px;
      padding-top: 12px;
      border-top: 1px solid #e8e8e4;
      font-family: 'Courier Prime', monospace;
      font-size: 10px;
      color: #4a4a4a;
      text-align: center;
    }

    @media print {
      @page { size: A4; margin: 20mm; }
      body { padding: 0; max-width: none; }
      .kpi-grid { grid-template-columns: repeat(4, 1fr); }
    }
  </style>
</head>
<body>
  <h1>Compte-Pote — Comptes Annuels</h1>
  <p class="period">${escHtml(formatPeriod(debut, fin))}</p>

  <div class="section-title">Section 1 — Compte de résultat</div>

  <p class="sub-title">Produits</p>
  <table>
    ${produitsRows()}
    <tr class="total-row">
      <td style="padding:6px 0;">Total produits</td>
      <td style="text-align:right;font-family:'Courier Prime',monospace;color:#15803d;">${eur(totalProduits)}</td>
    </tr>
  </table>

  <p class="sub-title">Charges</p>
  <table>
    ${chargesRows()}
    <tr class="total-row">
      <td style="padding:6px 0;">Total charges</td>
      <td style="text-align:right;font-family:'Courier Prime',monospace;color:#dc2626;">${eur(totalCharges)}</td>
    </tr>
  </table>

  <table style="margin-top:24px;">
    <tr class="resultat-row">
      <td>Résultat net</td>
      <td style="text-align:right;font-family:'Courier Prime',monospace;color:${resultatColor};">${eur(resultat)}</td>
    </tr>
  </table>

  <div class="section-title">Section 2 — Indicateurs clés</div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Chiffre d'affaires</div>
      <div class="kpi-value">${eur(totalProduits)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Charges</div>
      <div class="kpi-value" style="color:#dc2626;">${eur(totalCharges)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Résultat</div>
      <div class="kpi-value" style="color:${resultatColor};">${eur(resultat)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Taux de marge</div>
      <div class="kpi-value" style="color:${resultatColor};">${marge !== null ? `${marge} %` : '—'}</div>
    </div>
  </div>

  <footer>
    Généré le ${escHtml(now)} · Données calculées depuis Compte-Pote
  </footer>

  <script>window.print()</script>
</body>
</html>`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const debut = url.searchParams.get('debut')
  const fin = url.searchParams.get('fin')

  if (!debut || !fin) {
    return new Response(
      `<!DOCTYPE html><html><body><p>Paramètres debut et fin requis (YYYY-MM-DD).</p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(debut) || !dateRe.test(fin)) {
    return new Response(
      `<!DOCTYPE html><html><body><p>Format de date invalide. Utilisez YYYY-MM-DD.</p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(
      `<!DOCTYPE html><html><body><p>Non authentifié. Veuillez vous connecter.</p></body></html>`,
      { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return new Response(
      `<!DOCTYPE html><html><body><p>Workspace introuvable.</p></body></html>`,
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const workspaceId = membership.workspace_id

  const [facturesResult, depensesResult] = await Promise.all([
    supabase
      .from('factures')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gte('date', debut)
      .lte('date', fin)
      .order('date', { ascending: true }),
    supabase
      .from('depenses')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gte('date', debut)
      .lte('date', fin)
      .order('date', { ascending: true }),
  ])

  const factures: Facture[] = facturesResult.data ?? []
  const depenses: Depense[] = depensesResult.data ?? []

  const html = buildHtml(debut, fin, factures, depenses)

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
