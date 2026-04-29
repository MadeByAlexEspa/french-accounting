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
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) redirect('/login')

  const { data: raw, error: memberError } = await supabase
    .from('memberships')
    .select('workspace_id, role, workspaces(id, name, slug, activite_type, structure_type)')
    .eq('user_id', user.id)
    .single()

  if (memberError || !raw) {
    redirect('/setup')
  }

  const membership = raw as MembershipWithWorkspace
  const workspace = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces

  return (
    <div className="sb-wrapper">
      <Sidebar workspace={workspace} userEmail={user.email ?? ''} />
      <main className="sb-main">
        <div className="sb-content">
          {children}
        </div>
      </main>
    </div>
  )
}
