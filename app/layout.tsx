import type { Metadata } from 'next'
import { Special_Elite, Courier_Prime, Inter } from 'next/font/google'
import './globals.css'

const specialElite = Special_Elite({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-special-elite',
  display: 'swap',
})

const courierPrime = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-courier-prime',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Compte-Pote', template: '%s — Compte-Pote' },
  description: 'La comptabilité sans les complications. Factures, dépenses, TVA et bilan pour indépendants et TPE.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${specialElite.variable} ${courierPrime.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
