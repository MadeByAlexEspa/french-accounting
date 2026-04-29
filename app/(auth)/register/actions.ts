'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function createWorkspace(name: string, slug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session introuvable — réessayez' }

  const service = createServiceClient()

  const { data: workspace, error: wsError } = await service
    .from('workspaces')
    .insert({ name, slug })
    .select('id')
    .single()

  if (wsError || !workspace) return { error: wsError?.message ?? 'Création du workspace échouée' }

  const { error: memberError } = await service
    .from('memberships')
    .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

  if (memberError) return { error: memberError.message }

  return { success: true }
}
