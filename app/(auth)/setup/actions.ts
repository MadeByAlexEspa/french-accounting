'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export async function setupWorkspace(params: { companyName: string }) {
  const { companyName } = params
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) return { error: 'Session expirée — rechargez la page.' }

  // Check if membership already exists
  const { data: existing } = await supabase
    .from('memberships').select('workspace_id').eq('user_id', user.id).single()
  if (existing) return { error: 'Ce compte a déjà un espace de travail.' }

  const service = createServiceClient()
  const baseSlug = slugify(companyName) || 'workspace'
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`

  const { data: workspace, error: wsError } = await service
    .from('workspaces').insert({ name: companyName, slug }).select('id').single()

  if (wsError || !workspace) return { error: wsError?.message ?? 'Création du workspace échouée' }

  const { error: memberError } = await service
    .from('memberships').insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

  if (memberError) return { error: memberError.message }

  return { success: true }
}
