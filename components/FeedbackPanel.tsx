'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Feedback } from '@/lib/types/database'

type EnrichedFeedback = Feedback & { voteCount: number; userVoted: boolean }

export default function FeedbackPanel() {
  const [open, setOpen]           = useState(false)
  const [feedbacks, setFeedbacks] = useState<EnrichedFeedback[]>([])
  const [loading, setLoading]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [userId, setUserId]       = useState<string | null>(null)

  useEffect(() => {
    function handler() { setOpen(true) }
    window.addEventListener('open-feedback', handler)
    return () => window.removeEventListener('open-feedback', handler)
  }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [{ data: fbs }, { data: votes }] = await Promise.all([
      supabase.from('feedbacks').select('*').order('created_at', { ascending: false }),
      supabase.from('feedback_votes').select('feedback_id, user_id'),
    ])

    const voteCounts: Record<number, number> = {}
    const userVotes = new Set<number>()
    for (const v of (votes ?? [])) {
      voteCounts[v.feedback_id] = (voteCounts[v.feedback_id] ?? 0) + 1
      if (v.user_id === user.id) userVotes.add(v.feedback_id)
    }

    const enriched = (fbs ?? []).map(f => ({
      ...f,
      voteCount: voteCounts[f.id] ?? 0,
      userVoted: userVotes.has(f.id),
    })).sort((a, b) => b.voteCount - a.voteCount)

    setFeedbacks(enriched)
    setLoading(false)
  }

  useEffect(() => {
    if (open) load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim() || !userId) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from('feedbacks').insert({ content: newContent.trim(), user_id: userId })
    setNewContent('')
    await load()
    setSubmitting(false)
  }

  async function handleVote(feedbackId: number, userVoted: boolean) {
    if (!userId) return
    const supabase = createClient()
    if (userVoted) {
      await supabase.from('feedback_votes').delete().eq('feedback_id', feedbackId).eq('user_id', userId)
    } else {
      await supabase.from('feedback_votes').insert({ feedback_id: feedbackId, user_id: userId })
    }
    // Optimistic update
    setFeedbacks(prev =>
      prev.map(f =>
        f.id === feedbackId
          ? { ...f, voteCount: f.voteCount + (userVoted ? -1 : 1), userVoted: !userVoted }
          : f
      ).sort((a, b) => b.voteCount - a.voteCount)
    )
  }

  if (!open) return null

  return (
    <>
      {/* Drawer */}
      <aside className="fp-panel" role="dialog" aria-label="Feedback">
        <div className="fp-header">
          <span className="fp-title">💬 Feedback</span>
          <button className="fp-close" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
        </div>

        <div className="fp-body">
          {/* Form */}
          <form onSubmit={handleSubmit} className="fp-form">
            <textarea
              className="fp-textarea"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Suggérer une amélioration, signaler un bug…"
              rows={3}
              maxLength={500}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--pencil)', alignSelf: 'center', fontFamily: 'Courier Prime,monospace' }}>
                {newContent.length}/500
              </span>
              <button
                type="submit"
                className="dash-btn"
                style={{ fontSize: 12 }}
                disabled={submitting || newContent.trim().length < 5}
              >
                {submitting ? '…' : 'Publier'}
              </button>
            </div>
          </form>

          <div className="fp-divider" />

          {/* List */}
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--pencil)', padding: 24, fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
              Chargement…
            </div>
          )}
          {!loading && feedbacks.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--pencil)', padding: 24, fontFamily: 'Courier Prime,monospace', fontSize: 13 }}>
              Aucun feedback pour l&apos;instant.<br />Soyez le premier !
            </div>
          )}
          {!loading && feedbacks.map(f => (
            <div key={f.id} className="fp-item">
              <p className="fp-item-content">{f.content}</p>
              <div className="fp-item-meta">
                <span style={{ fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}>
                  {new Date(f.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <button
                  className={`fp-vote-btn${f.userVoted ? ' fp-vote-btn-active' : ''}`}
                  onClick={() => handleVote(f.id, f.userVoted)}
                  aria-label={f.userVoted ? 'Retirer mon vote' : 'Voter pour ce feedback'}
                >
                  ▲ {f.voteCount}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="fp-footer">
          <span style={{ fontSize: 11, color: 'var(--pencil)', fontFamily: 'Courier Prime,monospace' }}>
            Les feedbacks sont anonymes et visibles par tous les utilisateurs.
          </span>
        </div>
      </aside>
    </>
  )
}
