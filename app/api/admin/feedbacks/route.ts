import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  const svc = createServiceClient()

  const [{ data: feedbacks }, { data: votes }] = await Promise.all([
    svc.from('feedbacks').select('*').order('created_at', { ascending: false }),
    svc.from('feedback_votes').select('feedback_id'),
  ])

  const voteCounts: Record<number, number> = {}
  for (const v of votes ?? []) {
    voteCounts[v.feedback_id] = (voteCounts[v.feedback_id] ?? 0) + 1
  }

  const result = (feedbacks ?? [])
    .map((f) => ({
      ...f,
      vote_count: voteCounts[f.id] ?? 0,
    }))
    .sort((a, b) => b.vote_count - a.vote_count)

  return NextResponse.json(result)
}
