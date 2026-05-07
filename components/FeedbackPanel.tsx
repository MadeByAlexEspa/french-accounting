'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Feedback } from '@/lib/types/database'

type EnrichedFeedback = Feedback & { voteCount: number; userVoted: boolean }

export default function FeedbackPanel() {
  const [open, setOpen]             = useState(false)
  const [feedbacks, setFeedbacks]   = useState<EnrichedFeedback[]>([])
  const [loading, setLoading]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [userId, setUserId]         = useState<string | null>(null)
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    setImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim() || !userId) return
    setSubmitting(true)
    const supabase = createClient()

    let image_url: string | null = null
    if (imageFile) {
      const ext = imageFile.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('feedback-images')
        .upload(path, imageFile, { upsert: false })
      if (!upErr) {
        const { data } = supabase.storage.from('feedback-images').getPublicUrl(path)
        image_url = data.publicUrl
      }
    }

    await supabase.from('feedbacks').insert({ content: newContent.trim(), user_id: userId, image_url })
    setNewContent('')
    removeImage()
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

            {/* Image picker */}
            <div style={{ marginTop: 8 }}>
              {imagePreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={imagePreview}
                    alt="Aperçu"
                    style={{ maxHeight: 120, maxWidth: '100%', display: 'block', border: '1px solid var(--rule)', borderRadius: 2 }}
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none',
                      borderRadius: 2, cursor: 'pointer', fontSize: 11, padding: '1px 5px', lineHeight: 1.4,
                    }}
                    aria-label="Supprimer l'image"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: 'none', border: '1px dashed var(--rule)', borderRadius: 2,
                    color: 'var(--pencil)', cursor: 'pointer', fontSize: 11,
                    fontFamily: 'Courier Prime,monospace', padding: '5px 10px',
                  }}
                >
                  📷 Ajouter une image
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                aria-label="Choisir une image"
              />
            </div>

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
              {f.image_url && (
                <a href={f.image_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 8 }}>
                  <img
                    src={f.image_url}
                    alt="Capture jointe"
                    style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', border: '1px solid var(--rule)', borderRadius: 2, display: 'block' }}
                  />
                </a>
              )}
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
