'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workspace } from '@/lib/types/database'

const NAV_MAIN = [
  { href: '/dashboard',      label: 'Accueil' },
  { href: '/transactions',   label: 'Transactions' },
  { href: '/tva',            label: 'TVA' },
  { href: '/exercice',       label: 'Comptes annuels' },
  { href: '/notes-de-frais', label: 'Notes de frais' },
]

const NAV_FOOTER = [
  { href: '/integrations', label: 'Connexions API' },
  { href: '/workspace',    label: 'Paramètres' },
]

interface Props {
  workspace: Pick<Workspace, 'name' | 'slug'> | null
  userEmail: string
  userName?: string
}

export default function Sidebar({ workspace, userEmail, userName }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router   = useRouter()

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const navContent = (
    <>
      <div className="sb-brand">
        <span className="sb-brand-name">✎ Compte-Pote</span>
      </div>

      {workspace && (
        <div className="sb-workspace" title={userEmail}>
          {workspace.name}
          {userName && (
            <div style={{ fontSize: 11, color: 'var(--pencil)', fontFamily: "'Courier Prime', monospace", marginTop: 2, fontWeight: 400 }}>
              {userName}
            </div>
          )}
        </div>
      )}

      <nav className="sb-nav">
        {NAV_MAIN.map(({ href, label }) => (
          <Link key={href} href={href} className={`sb-item ${isActive(href) ? 'sb-item-active' : ''}`}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="sb-footer">
        <div className="sb-footer-section">
          {NAV_FOOTER.map(({ href, label }) => (
            <Link key={href} href={href} className={`sb-item ${isActive(href) ? 'sb-item-active' : ''}`}>
              {label}
            </Link>
          ))}
        </div>
        <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--pencil)', fontFamily: "'Courier Prime', monospace" }}>
          <kbd className="dash-kbd" style={{ fontSize: 10 }}>⌘K</kbd> palette
        </div>
        <button onClick={handleLogout} className="sb-item" style={{ borderLeft: '3px solid transparent' }}>
          Déconnexion
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="sb-topbar">
        <button
          className="sb-hamburger"
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
        <span className="sb-topbar-logo">✎ Compte-Pote</span>
        <div style={{ width: 40 }} />
      </header>

      {/* Backdrop */}
      {mobileOpen && (
        <div className="sb-overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside className={`sb-sidebar${mobileOpen ? ' sb-sidebar-open' : ''}`}>
        {navContent}
      </aside>
    </>
  )
}
