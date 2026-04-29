import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'
import type { Workspace } from '@/lib/types/database'

type MembershipWithWorkspace = {
  workspace_id: string
  role: string
  workspaces: Pick<Workspace, 'id' | 'name' | 'slug' | 'activite_type' | 'structure_type'> | Pick<Workspace, 'id' | 'name' | 'slug' | 'activite_type' | 'structure_type'>[] | null
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: raw } = await supabase
    .from('memberships')
    .select('workspace_id, role, workspaces(id, name, slug, activite_type, structure_type)')
    .eq('user_id', user.id)
    .single()

  const membership = raw as MembershipWithWorkspace | null
  if (!membership) redirect('/login')

  const workspace = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspace={workspace} userEmail={user.email ?? ''} />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
