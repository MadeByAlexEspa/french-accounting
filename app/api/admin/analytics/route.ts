import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  const svc = createServiceClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalWorkspaces },
    { count: newWorkspaces30d },
    { count: totalFeedbacks },
    { data: usersData },
  ] = await Promise.all([
    svc.from('workspaces').select('*', { count: 'exact', head: true }),
    svc
      .from('workspaces')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo),
    svc.from('feedbacks').select('*', { count: 'exact', head: true }),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const authUsers = usersData?.users ?? []
  const newUsers30d = authUsers.filter(
    (u) => new Date(u.created_at) >= new Date(thirtyDaysAgo)
  ).length

  return NextResponse.json({
    total_workspaces: totalWorkspaces ?? 0,
    total_users: authUsers.length,
    new_workspaces_30d: newWorkspaces30d ?? 0,
    new_users_30d: newUsers30d,
    total_feedbacks: totalFeedbacks ?? 0,
  })
}
