import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import AcceptForm from './AcceptForm'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const service = createServiceClient()

  const { data: inv } = await service
    .from('invitations')
    .select('email, expires_at, used_at, workspace_id')
    .eq('token', token)
    .maybeSingle()

  const { data: ws } = inv
    ? await service.from('workspaces').select('name').eq('id', inv.workspace_id).single()
    : { data: null }

  const isExpired = inv ? new Date(inv.expires_at) < new Date() : false
  const isUsed    = inv ? !!inv.used_at : false
  const isInvalid = !inv || isExpired || isUsed

  return (
    <div className="auth-split">
      <div className="auth-left">
        <Link href="/" className="auth-left-logo">📝 Compte-Pote</Link>
        <div className="auth-left-body">
          <h1 className="auth-left-headline">
            Rejoignez votre équipe.
          </h1>
          <p className="auth-left-sub">
            Créez votre compte pour accéder à l&apos;espace de travail et collaborer sur la comptabilité.
          </p>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">
          {isInvalid ? (
            <>
              <div className="auth-form-header">
                <h2 className="auth-form-title">Invitation invalide</h2>
                <p className="auth-form-sub" style={{ color: '#dc2626' }}>
                  {!inv
                    ? "Ce lien d'invitation n'existe pas."
                    : isUsed
                    ? 'Cette invitation a déjà été utilisée.'
                    : 'Ce lien a expiré (validité 48 h).'}
                </p>
              </div>
              <p className="auth-footer">
                <Link href="/login" className="auth-link">← Retour à la connexion</Link>
              </p>
            </>
          ) : (
            <>
              <div className="auth-form-header">
                <h2 className="auth-form-title">Créer votre compte</h2>
                <p className="auth-form-sub">
                  Vous avez été invité à rejoindre{' '}
                  <strong>{ws?.name ?? 'un espace de travail'}</strong>.
                </p>
              </div>
              <AcceptForm token={token} email={inv.email} />
              <p className="auth-footer" style={{ marginTop: 16 }}>
                Déjà un compte ?{' '}
                <Link href="/login" className="auth-link">Se connecter</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
