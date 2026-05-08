'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

const ACTIONS = [
  { label: 'Nouvelle facture',     href: '/transactions?new=entree' },
  { label: 'Nouvelle dépense',     href: '/transactions?new=sortie' },
  { label: 'Note de frais',        href: '/notes-de-frais?new=1'   },
]

export default function QuickCreate() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={ref} style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 60 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 52, right: 0,
          background: 'var(--paper)', border: '1.5px solid var(--border)',
          boxShadow: '4px 4px 0 var(--rule)', borderRadius: 6,
          minWidth: 200, overflow: 'hidden',
        }}>
          {ACTIONS.map(a => (
            <button
              key={a.href}
              onClick={() => { setOpen(false); router.push(a.href) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', fontSize: 13, fontFamily: 'var(--font-inter), Inter, sans-serif',
                color: 'var(--ink)', background: 'none', border: 'none',
                borderBottom: '1px solid var(--rule)', cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--offwhite)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Fermer le menu création' : 'Créer…'}
        style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--ink)', color: 'var(--paper)',
          border: 'none', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '2px 2px 0 rgba(0,0,0,0.3)',
          transition: 'transform 0.15s ease',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        {open ? <X size={18} /> : <Plus size={18} />}
      </button>
    </div>
  )
}
