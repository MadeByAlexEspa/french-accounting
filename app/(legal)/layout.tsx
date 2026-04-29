import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <header className="ln-nav">
        <div className="ln-nav-inner">
          <Link href="/" className="ln-logo">📝 Compte-Pote</Link>
          <nav className="ln-nav-links">
            <Link href="/login" className="ln-nav-login">Se connecter</Link>
            <Link href="/login" className="ln-nav-cta">Commencer</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="ln-footer">
        <div className="ln-footer-legal" style={{ paddingTop: 24, paddingBottom: 24 }}>
          <Link href="/cgu" className="ln-footer-link">CGU</Link>
          <Link href="/mentions-legales" className="ln-footer-link">Mentions légales</Link>
          <Link href="/politique-confidentialite" className="ln-footer-link">Politique de confidentialité</Link>
        </div>
        <div className="ln-footer-bottom">© 2025 — 3 € / mois — TVA non applicable</div>
      </footer>
    </div>
  )
}
