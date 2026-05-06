export async function sendInvitationEmail(
  to: string,
  workspaceName: string,
  inviteUrl: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[INVITE] RESEND_API_KEY absent — email non envoyé')
    return
  }

  const from = process.env.RESEND_FROM ?? 'Compte-Pote <noreply@resend.dev>'
  const safeName = workspaceName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#1a1a1a;color:#fff;padding:32px;border-radius:8px">
      <h2 style="margin:0 0 16px;font-size:20px">Invitation à rejoindre ${safeName}</h2>
      <p style="color:#a3a3a3;margin:0 0 24px;line-height:1.6">
        Vous avez été invité à rejoindre l'espace de travail <strong style="color:#fff">${safeName}</strong> sur Compte-Pote.
      </p>
      <p style="margin:0 0 24px">
        <a href="${inviteUrl}" style="display:inline-block;background:#fff;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">
          Accepter l'invitation →
        </a>
      </p>
      <p style="color:#6b7280;font-size:12px;margin:0">Ce lien expire dans 48 heures.</p>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to,
      subject: `Vous avez été invité à rejoindre ${workspaceName} sur Compte-Pote`,
      html,
    }),
  })
}

export async function sendFactureEmail(params: {
  to: string
  facture: {
    numero: string
    date: string
    client: string
    description: string | null
    montant_ht: number
    taux_tva: number
    montant_tva: number
    montant_ttc: number
    statut: string
  }
  workspace: {
    name: string
    siret: string | null
    tva_intra: string | null
    adresse: string | null
    code_postal: string | null
    ville: string | null
  }
  appUrl: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY absent' }

  const from = process.env.RESEND_FROM ?? 'Compte-Pote <noreply@resend.dev>'
  const { to, facture, workspace, appUrl } = params

  function fmt(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }
  function esc(s: string | null | undefined) {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  const statutLabel = facture.statut === 'payee' ? 'PAYÉE' : 'EN ATTENTE DE PAIEMENT'
  const statutColor = facture.statut === 'payee' ? '#16a34a' : '#d97706'

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Georgia,serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border:1.5px solid #1a1a1a;padding:40px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <div>
      <p style="font-family:'Courier New',monospace;font-size:22px;font-weight:bold;margin:0 0 8px">${esc(workspace.name)}</p>
      ${workspace.adresse ? `<p style="margin:0;font-size:13px;color:#555">${esc(workspace.adresse)}</p>` : ''}
      ${(workspace.code_postal || workspace.ville) ? `<p style="margin:0;font-size:13px;color:#555">${esc([workspace.code_postal, workspace.ville].filter(Boolean).join(' '))}</p>` : ''}
      ${workspace.siret ? `<p style="margin:0;font-size:12px;color:#888">SIRET : ${esc(workspace.siret)}</p>` : ''}
      ${workspace.tva_intra ? `<p style="margin:0;font-size:12px;color:#888">N° TVA : ${esc(workspace.tva_intra)}</p>` : ''}
    </div>
    <div style="text-align:right">
      <p style="font-family:'Courier New',monospace;font-size:18px;font-weight:bold;margin:0 0 4px">${esc(facture.numero)}</p>
      <p style="font-size:13px;color:#555;margin:0 0 8px">Date : ${esc(facture.date)}</p>
      <span style="display:inline-block;border:1.5px solid ${statutColor};color:${statutColor};font-family:'Courier New',monospace;font-size:11px;padding:2px 8px;letter-spacing:0.05em">${statutLabel}</span>
    </div>
  </div>

  <div style="margin-bottom:24px">
    <p style="font-family:'Courier New',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin:0 0 4px">Facturé à</p>
    <p style="font-size:16px;font-weight:600;margin:0">${esc(facture.client)}</p>
  </div>

  ${facture.description ? `<div style="margin-bottom:24px"><p style="font-family:'Courier New',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin:0 0 4px">Objet</p><p style="font-size:14px;margin:0">${esc(facture.description)}</p></div>` : ''}

  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr style="border-bottom:2px solid #1a1a1a">
      <th style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#888;padding:8px 0;text-align:left">Désignation</th>
      <th style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#888;padding:8px 0;text-align:right">HT</th>
      <th style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#888;padding:8px 0;text-align:right">TVA</th>
      <th style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#888;padding:8px 0;text-align:right">TTC</th>
    </tr>
    <tr style="border-bottom:1px solid #e5e5e5">
      <td style="padding:10px 0;font-size:13px">${esc(facture.description ?? facture.client)}</td>
      <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:13px;text-align:right">${fmt(facture.montant_ht)}</td>
      <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:13px;text-align:right">${fmt(facture.montant_tva)}</td>
      <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:13px;text-align:right">${fmt(facture.montant_ttc)}</td>
    </tr>
    <tr>
      <td colspan="2"></td>
      <td style="padding:12px 0 4px;font-family:'Courier New',monospace;font-size:11px;color:#888;text-align:right">Total HT</td>
      <td style="padding:12px 0 4px;font-family:'Courier New',monospace;text-align:right">${fmt(facture.montant_ht)}</td>
    </tr>
    <tr>
      <td colspan="2"></td>
      <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:11px;color:#888;text-align:right">TVA ${facture.taux_tva === -1 ? '(multi-taux)' : `${facture.taux_tva} %`}</td>
      <td style="padding:4px 0;font-family:'Courier New',monospace;text-align:right">${fmt(facture.montant_tva)}</td>
    </tr>
    <tr style="border-top:2px solid #1a1a1a">
      <td colspan="2"></td>
      <td style="padding:8px 0;font-family:'Courier New',monospace;font-size:12px;color:#888;text-align:right">Total TTC</td>
      <td style="padding:8px 0;font-family:'Courier New',monospace;font-size:20px;font-weight:bold;text-align:right">${fmt(facture.montant_ttc)}</td>
    </tr>
  </table>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:11px;color:#888;line-height:1.7">
    ${facture.taux_tva === 0 ? '<p style="margin:0">TVA non applicable, art. 293 B du CGI</p>' : ''}
    <p style="margin:0">En cas de retard de paiement, une pénalité de 3× le taux légal sera appliquée (art. L441-10 C.com.).</p>
  </div>

  <div style="margin-top:24px;text-align:center">
    <a href="${appUrl}/transactions" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 20px;text-decoration:none;font-family:'Courier New',monospace;font-size:13px">Voir dans Compte-Pote →</a>
  </div>
</div>
</body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to,
      subject: `Facture ${facture.numero} — ${fmt(facture.montant_ttc)} TTC`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return { ok: false, error: body }
  }
  return { ok: true }
}
