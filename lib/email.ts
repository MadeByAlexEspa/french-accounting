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
