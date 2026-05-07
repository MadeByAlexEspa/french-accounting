import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import AdminDashboard from './AdminDashboard'

export default async function AdminDashboardPage() {
  const authenticated = await getAdminSession()
  if (!authenticated) redirect('/admin')
  return <AdminDashboard />
}
