import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createServiceClient } from '@/lib/supabase/server'

type MembershipRow = {
  user_id: string
  workspace_id: string
  role: string
  workspaces: { name: string } | { name: string }[] | null
}

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  const svc = createServiceClient()

  const [{ data: usersData }, { data: memberships }] = await Promise.all([
    svc.auth.admin.listUsers({ perPage: 1000 }),
    svc
      .from('memberships')
      .select('user_id, workspace_id, role, workspaces(name)'),
  ])

  const authUsers = usersData?.users ?? []

  const memberMap = new Map<string, { workspace_name: string; role: string }>()
  for (const m of (memberships ?? []) as MembershipRow[]) {
    const wsName = Array.isArray(m.workspaces)
      ? m.workspaces[0]?.name
      : m.workspaces?.name
    memberMap.set(m.user_id, { workspace_name: wsName ?? '—', role: m.role })
  }

  const result = authUsers
    .map((u) => ({
      id: u.id,
      email: u.email ?? '—',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      workspace_name: memberMap.get(u.id)?.workspace_name ?? '—',
      role: memberMap.get(u.id)?.role ?? '—',
    }))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

  return NextResponse.json(result)
}
