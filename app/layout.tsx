import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Compte-Pote',
    template: '%s — Compte-Pote',
  },
  description: 'La comptabilité sans les complications. Factures, dépenses, TVA et bilan pour indépendants et TPE.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
