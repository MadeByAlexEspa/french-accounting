import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import AdminLoginForm from './AdminLoginForm'

export default async function AdminPage() {
  const authenticated = await getAdminSession()
  if (authenticated) redirect('/admin/dashboard')
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <AdminLoginForm />
    </div>
  )
}
