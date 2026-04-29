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
    // Do NOT redirect to /login (causes infinite loop for authenticated users).
    // Show an error screen so the user can diagnose or contact support.
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'Courier Prime,monospace', flexDirection:'column', gap:16, padding:24 }}>
        <div style={{ fontSize:32 }}>⚠️</div>
        <p style={{ fontSize:15, color:'#1a1a1a', maxWidth:480, textAlign:'center' }}>
          Espace de travail introuvable pour ce compte.
        </p>
        {memberError && (
          <pre style={{ fontSize:11, color:'#666', background:'#f5f5f5', padding:'8px 12px', borderRadius:4, maxWidth:480, overflowX:'auto' }}>
            {memberError.message}
          </pre>
        )}
        <p style={{ fontSize:13, color:'#666' }}>
          <a href="/login" style={{ color:'#1a1a1a', textDecoration:'underline' }}>Se déconnecter</a>
        </p>
      </div>
    )
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
