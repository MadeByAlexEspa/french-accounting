'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function register(params: {
  email: string
  password: string
  companyName: string
  slug: string
}) {
  const { email, password, companyName, slug } = params
  const service = createServiceClient()

  // Admin API creates the user synchronously — no phantom IDs, no race condition
  const { data: adminData, error: adminError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm so the user can sign in immediately
  })

  if (adminError) return { error: adminError.message }
  if (!adminData.user) return { error: 'Erreur lors de la création du compte' }

  const { data: workspace, error: wsError } = await service
    .from('workspaces')
    .insert({ name: companyName, slug })
    .select('id')
    .single()

  if (wsError || !workspace) return { error: wsError?.message ?? 'Création du workspace échouée' }

  const { error: memberError } = await service
    .from('memberships')
    .insert({ workspace_id: workspace.id, user_id: adminData.user.id, role: 'owner' })

  if (memberError) return { error: memberError.message }

  // Establish session server-side so the redirect to /transactions works
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({ email, password })

  return { success: true }
}
