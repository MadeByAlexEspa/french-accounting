export type TvaRow = {
  taux_tva: number | null
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  tva_lines?: unknown
}

function round2(n: number) { return Math.round(n * 100) / 100 }

export function isTvaErronnee(row: TvaRow): boolean {
  const taux = row.taux_tva

  // Multi-rate declared but no breakdown lines → à ventiler
  if (taux === -1 && !row.tva_lines) return true

  // No rate or valid multi-rate → skip
  if (taux === null || taux === undefined || taux === -1) return false

  const ht = Math.abs(row.montant_ht)
  const tva = Math.abs(row.montant_tva)
  const ttc = Math.abs(row.montant_ttc)

  // Rate 0% but non-zero TVA amount
  if (taux === 0 && tva > 0.01) return true

  // Expected TVA vs stored TVA (tolerance ±0.10€)
  const expectedTva = round2(ht * taux / 100)
  if (Math.abs(expectedTva - tva) > 0.10) return true

  // TTC coherence (tolerance ±0.10€)
  const expectedTtc = round2(ht + tva)
  if (Math.abs(expectedTtc - ttc) > 0.10) return true

  return false
}

export function getTvaAlertLabel(row: TvaRow): string {
  const taux = row.taux_tva
  if (taux === -1 && !row.tva_lines) return 'TVA à ventiler'
  if (taux === 0 && Math.abs(row.montant_tva) > 0.01) return 'Taux 0% incohérent'
  return 'TVA à corriger'
}
