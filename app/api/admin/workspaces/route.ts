import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  const svc = createServiceClient()

  const { data: workspaces } = await svc
    .from('workspaces')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })

  const { data: memberships } = await svc
    .from('memberships')
    .select('workspace_id')

  const countByWs: Record<string, number> = {}
  for (const m of memberships ?? []) {
    countByWs[m.workspace_id] = (countByWs[m.workspace_id] ?? 0) + 1
  }

  const result = (workspaces ?? []).map((ws) => ({
    ...ws,
    member_count: countByWs[ws.id] ?? 0,
  }))

  return NextResponse.json(result)
}
