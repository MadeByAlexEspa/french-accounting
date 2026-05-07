'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'

type Item = {
  id: string
  label: string
  sub?: string
  href?: string
  action?: () => void
  glyph: React.ReactNode
}

const NAV_ITEMS: Item[] = [
  { id: 'dashboard',    label: 'Accueil',          sub: "Vue d'ensemble",       href: '/dashboard',                glyph: '⌂' },
  { id: 'transactions', label: 'Transactions',      sub: 'Factures & dépenses',  href: '/transactions',             glyph: '⇄' },
  { id: 'tva',          label: 'Déclaration TVA',   sub: 'TVA collectée / due',  href: '/tva',                      glyph: '%' },
  { id: 'exercice',     label: 'Comptes annuels',   sub: 'Bilan, résultat',      href: '/exercice',                 glyph: '§' },
  { id: 'notes-frais',  label: 'Notes de frais',    sub: 'Remboursements',       href: '/notes-de-frais',           glyph: '✉' },
  { id: 'integrations', label: 'Connexions API',    sub: 'Qonto, Shine…',        href: '/integrations',             glyph: '⟳' },
  { id: 'workspace',    label: 'Paramètres',        sub: 'Workspace, équipe',    href: '/workspace',                glyph: <Settings size={14} /> },
  { id: 'new-entry',    label: 'Nouvelle entrée',   sub: 'Raccourci: N',         href: '/transactions?tab=entrees', glyph: '+' },
  { id: 'feedback',     label: 'Feedback',           sub: 'Suggestions & votes',  glyph: '💬',
    action: () => { setTimeout(() => window.dispatchEvent(new CustomEvent('open-feedback')), 50) } },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const filtered = query.trim()
    ? NAV_ITEMS.filter(it =>
        it.label.toLowerCase().includes(query.toLowerCase()) ||
        (it.sub ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : NAV_ITEMS

  const close = useCallback(() => { setOpen(false); setQuery(''); setIdx(0) }, [])

  const execute = useCallback((item: Item) => {
    close()
    if (item.href) router.push(item.href)
    else item.action?.()
  }, [close, router])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
        return
      }
      if (!open) return
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[idx]) { e.preventDefault(); execute(filtered[idx]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, execute, filtered, idx])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 10) }, [open])
  useEffect(() => { setIdx(0) }, [query])

  if (!open) return null

  return (
    <div className="cp-overlay" onClick={close} aria-hidden="true">
      <div
        className="cp-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
      >
        <div className="cp-search-row">
          <span className="cp-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="cp-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher une page ou une action…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Rechercher"
          />
          <kbd className="dash-kbd">Esc</kbd>
        </div>

        <div className="cp-list" role="listbox" aria-label="Résultats">
          {filtered.length === 0 && (
            <div className="cp-empty" role="status">
              Aucun résultat pour « {query} »
            </div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={`cp-item${i === idx ? ' cp-item-active' : ''}`}
              onClick={() => execute(item)}
              onMouseEnter={() => setIdx(i)}
              role="option"
              aria-selected={i === idx}
            >
              <span className="cp-item-glyph" aria-hidden="true">{item.glyph}</span>
              <span className="cp-item-body">
                <span className="cp-item-label">{item.label}</span>
                {item.sub && <span className="cp-item-sub">{item.sub}</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="cp-footer" aria-hidden="true">
          <span><kbd className="dash-kbd">↑↓</kbd> naviguer</span>
          <span><kbd className="dash-kbd">↵</kbd> ouvrir</span>
          <span><kbd className="dash-kbd">⌘K</kbd> fermer</span>
        </div>
      </div>
    </div>
  )
}
