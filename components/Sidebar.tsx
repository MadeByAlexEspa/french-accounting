'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workspace } from '@/lib/types/database'

const NAV_MAIN = [
  { href: '/transactions',   label: 'Transactions' },
  { href: '/tva',            label: 'TVA' },
  { href: '/exercice',       label: 'Comptes annuels' },
  { href: '/notes-de-frais', label: 'Notes de frais' },
]

const NAV_FOOTER = [
  { href: '/integrations', label: 'Connexions API' },
  { href: '/workspace',    label: 'Workspace' },
]

interface Props {
  workspace: Pick<Workspace, 'name' | 'slug'> | null
  userEmail: string
}

export default function Sidebar({ workspace, userEmail }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  return (
    <aside className="sb-sidebar">
      <div className="sb-brand">
        <span className="sb-brand-name">✎ Compte-Pote</span>
      </div>

      {workspace && (
        <div className="sb-workspace" title={userEmail}>
          {workspace.name}
        </div>
      )}

      <nav className="sb-nav">
        {NAV_MAIN.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`sb-item ${isActive(href) ? 'sb-item-active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="sb-footer">
        <div className="sb-footer-section">
          {NAV_FOOTER.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`sb-item ${isActive(href) ? 'sb-item-active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <button onClick={handleLogout} className="sb-item" style={{ borderLeft: '3px solid transparent' }}>
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
