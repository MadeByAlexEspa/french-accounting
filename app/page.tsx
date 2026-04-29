import Link from 'next/link'

export default function LandingPage() {
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>

      {/* ── Nav ── */}
      <header className="ln-nav">
        <div className="ln-nav-inner">
          <span className="ln-logo">📝 Compte-Pote</span>
          <nav className="ln-nav-links">
            <Link href="/login" className="ln-nav-login">Se connecter</Link>
            <Link href="/login" className="ln-nav-cta">Commencer</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="ln-hero">
        <div className="ln-hero-inner">
          <div className="ln-hero-content">
            <div className="ln-hero-label">[ Pour les indépendants &amp; TPE ]</div>
            <h1 className="ln-hero-headline">
              La comptabilité<br />sans les complications.
            </h1>
            <p className="ln-hero-sub">
              Factures, dépenses, TVA, bilan annuel — tout ce qu'il vous faut si vous n'êtes pas
              obligé de passer par un expert-comptable.
            </p>
            <Link href="/login" className="ln-cta">Essayer gratuitement →</Link>
            <p className="ln-hero-price">3 € / mois — sans engagement</p>
          </div>

          <div className="ln-ledger" aria-hidden="true">
            <div className="ln-ledger-header">GRAND LIVRE</div>
            <div className="ln-ledger-row">
              <span>Factures</span><span>12 450,00 €</span>
            </div>
            <div className="ln-ledger-row">
              <span>Dépenses</span><span>─ 4 230,00 €</span>
            </div>
            <div className="ln-ledger-divider" />
            <div className="ln-ledger-total">
              <span>Résultat</span><span>8 220,00 €</span>
            </div>
            <div className="ln-ledger-row" style={{ opacity: 0.35 }}>
              <span>TVA due</span><span>1 230,00 €</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pour qui ── */}
      <section className="ln-audience">
        <div className="ln-section-inner">
          <p className="ln-section-label">─── POUR QUI ───</p>
          <div className="ln-cards">
            <div className="ln-card">
              <span className="ln-card-index">[ 01 ]</span>
              <h3 className="ln-card-title">Micro-entrepreneur</h3>
              <p className="ln-card-sub">AE / Auto-entrepreneur</p>
              <p className="ln-card-desc">
                Déclaration mensuelle ou trimestrielle, pas d'obligation de bilan.
              </p>
            </div>
            <div className="ln-card">
              <span className="ln-card-index">[ 02 ]</span>
              <h3 className="ln-card-title">Entreprise Individuelle</h3>
              <p className="ln-card-sub">EI / EIRL</p>
              <p className="ln-card-desc">
                Comptabilité de trésorerie simplifiée, régime micro ou réel simplifié.
              </p>
            </div>
            <div className="ln-card">
              <span className="ln-card-index">[ 03 ]</span>
              <h3 className="ln-card-title">Petite société</h3>
              <p className="ln-card-sub">SASU / EURL (micro)</p>
              <p className="ln-card-desc">
                Vous gérez vous-même votre compta jusqu'au seuil imposant un CAC.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="ln-features">
        <div className="ln-section-inner">
          <h2 className="ln-features-title">Ce que vous obtenez</h2>
          <div className="ln-feature-grid">
            {[
              { name: 'Factures & devis',      desc: 'Créez et envoyez vos factures numérotées automatiquement.' },
              { name: 'Suivi des dépenses',    desc: 'Catégorisez chaque sortie selon le Plan Comptable Général.' },
              { name: 'Déclaration TVA',       desc: 'Votre CA3 précalculée, mois par mois ou sur une plage libre.' },
              { name: 'Bilan annuel',          desc: 'Actif, passif, compte de résultat conformes ANC 2025.' },
              { name: 'Agent IA',              desc: 'Posez vos questions comptables en langage naturel.' },
              { name: 'Connexion Qonto',       desc: 'Importez vos transactions bancaires en un clic.' },
            ].map(f => (
              <div key={f.name}>
                <div className="ln-feature-inner">
                  <p className="ln-feature-name">
                    <span className="ln-feature-prefix">→</span> {f.name}
                  </p>
                  <p className="ln-feature-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="ln-pricing">
        <div className="ln-section-inner">
          <p className="ln-section-label">─── TARIF ───</p>
          <div className="ln-pricing-card">
            <p className="ln-pricing-plan">FORMULE UNIQUE</p>
            <div className="ln-pricing-amount">
              <span className="ln-pricing-number">3 €</span>
              <span className="ln-pricing-per">/mois</span>
            </div>
            <div className="ln-pricing-divider" />
            <ul className="ln-pricing-list">
              {[
                'Accès à toutes les fonctionnalités',
                'Historique illimité',
                'Agent comptable IA inclus',
                'Mises à jour incluses',
                'Sans engagement, résiliable à tout moment',
              ].map(item => (
                <li key={item}><span className="ln-check">✓</span> {item}</li>
              ))}
            </ul>
            <Link href="/login" className="ln-cta">Commencer maintenant →</Link>
            <p className="ln-pricing-note"><em>Moins qu'un café par mois.</em></p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="ln-footer">
        <div className="ln-footer-inner">
          <span className="ln-footer-logo">📝 Compte-Pote</span>
          <p className="ln-footer-tagline">
            Fait pour les indépendants français. Pas pour les grandes entreprises.
          </p>
          <nav className="ln-footer-links">
            <Link href="/login" className="ln-footer-link">Connexion</Link>
          </nav>
        </div>
        <div className="ln-footer-legal">
          <Link href="/cgu" className="ln-footer-link">CGU</Link>
          <Link href="/mentions-legales" className="ln-footer-link">Mentions légales</Link>
          <Link href="/politique-confidentialite" className="ln-footer-link">Politique de confidentialité</Link>
        </div>
        <div className="ln-footer-bottom">
          © 2025 — 3 € / mois — TVA non applicable
        </div>
      </footer>

    </div>
  )
}
