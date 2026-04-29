'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function register(params: {
  email: string
  password: string
  companyName: string
  slug: string
}) {
  const { email, password, companyName, slug } = params

  // Sign up server-side so the SSR client sets the session cookie for the redirect
  const supabase = await createClient()
  const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password })

  if (signUpError) return { error: signUpError.message }
  if (!authData.user) return { error: 'Erreur lors de la création du compte' }

  // Service role bypasses RLS — no chicken-and-egg with memberships
  const service = createServiceClient()

  const { data: workspace, error: wsError } = await service
    .from('workspaces')
    .insert({ name: companyName, slug })
    .select('id')
    .single()

  if (wsError || !workspace) return { error: wsError?.message ?? 'Création du workspace échouée' }

  const { error: memberError } = await service
    .from('memberships')
    .insert({ workspace_id: workspace.id, user_id: authData.user.id, role: 'owner' })

  if (memberError) return { error: memberError.message }

  // If email confirmation is required, session will be null — signal the caller
  if (!authData.session) return { success: true, needsConfirmation: true }

  return { success: true, needsConfirmation: false }
}
