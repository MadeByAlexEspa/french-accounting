import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Facture, Depense } from '@/lib/types/database'

const FEC_HEADER =
  'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise'

function toFecDate(iso: string): string {
  return iso.replace(/-/g, '')
}

function toFecAmount(n: number): string {
  return Math.abs(n).toFixed(2).replace('.', ',')
}

function extractCompteNum(categorie: string): string {
  const m = (categorie ?? '').match(/^(\d+)/)
  return m ? m[1].padEnd(6, '0').slice(0, 6) : '700000'
}

function extractCompteLib(categorie: string): string {
  const parts = (categorie ?? '').split(' – ')
  return (parts.length > 1 ? parts.slice(1).join(' – ') : categorie).slice(0, 99)
}

function sanitize(s: string): string {
  return (s ?? '').replace(/[|\r\n]/g, ' ').slice(0, 99)
}

function clientCode(name: string, idx: number): string {
  return (name ?? '').replace(/\s/g, '').toUpperCase().slice(0, 3) + String(idx + 1).padStart(3, '0')
}

function fecRow(fields: string[]): string {
  return fields.join('|')
}

function factureToFecLines(f: Facture, idx: number): string[] {
  const ecritureNum = `VT-${f.date.slice(0, 4)}-${String(idx + 1).padStart(4, '0')}`
  const ecritureDate = toFecDate(f.date)
  const pieceRef = sanitize(f.numero)
  const ecritureLib = sanitize(`Facture ${f.client} - ${(f.description ?? '').slice(0, 40)}`)
  const compAuxNum = clientCode(f.client, idx)
  const compAuxLib = sanitize(f.client)
  const compteNum = extractCompteNum(f.categorie)
  const compteLib = sanitize(extractCompteLib(f.categorie))

  const lines: string[] = []

  lines.push(fecRow([
    'VT', 'Ventes', ecritureNum, ecritureDate,
    '411000', 'Clients', compAuxNum, compAuxLib,
    pieceRef, ecritureDate, ecritureLib,
    toFecAmount(f.montant_ttc), '0,00',
    '', '', ecritureDate, '', '',
  ]))

  lines.push(fecRow([
    'VT', 'Ventes', ecritureNum, ecritureDate,
    compteNum, compteLib, '', '',
    pieceRef, ecritureDate, ecritureLib,
    '0,00', toFecAmount(f.montant_ht),
    '', '', ecritureDate, '', '',
  ]))

  if (f.montant_tva > 0) {
    lines.push(fecRow([
      'VT', 'Ventes', ecritureNum, ecritureDate,
      '445710', 'TVA collectée', '', '',
      pieceRef, ecritureDate, ecritureLib,
      '0,00', toFecAmount(f.montant_tva),
      '', '', ecritureDate, '', '',
    ]))
  }

  return lines
}

function depenseToFecLines(d: Depense, idx: number): string[] {
  const ecritureNum = `AC-${d.date.slice(0, 4)}-${String(idx + 1).padStart(4, '0')}`
  const ecritureDate = toFecDate(d.date)
  const pieceRef = sanitize(String(d.id))
  const ecritureLib = sanitize(`Achat ${d.fournisseur} - ${(d.description ?? '').slice(0, 40)}`)
  const compAuxNum = clientCode(d.fournisseur, idx)
  const compAuxLib = sanitize(d.fournisseur)
  const compteNum = extractCompteNum(d.categorie)
  const compteLib = sanitize(extractCompteLib(d.categorie))

  const lines: string[] = []

  lines.push(fecRow([
    'AC', 'Achats', ecritureNum, ecritureDate,
    '401000', 'Fournisseurs', compAuxNum, compAuxLib,
    pieceRef, ecritureDate, ecritureLib,
    '0,00', toFecAmount(d.montant_ttc),
    '', '', ecritureDate, '', '',
  ]))

  lines.push(fecRow([
    'AC', 'Achats', ecritureNum, ecritureDate,
    compteNum, compteLib, '', '',
    pieceRef, ecritureDate, ecritureLib,
    toFecAmount(d.montant_ht), '0,00',
    '', '', ecritureDate, '', '',
  ]))

  if (d.montant_tva > 0) {
    lines.push(fecRow([
      'AC', 'Achats', ecritureNum, ecritureDate,
      '445660', 'TVA déductible', '', '',
      pieceRef, ecritureDate, ecritureLib,
      toFecAmount(d.montant_tva), '0,00',
      '', '', ecritureDate, '', '',
    ]))
  }

  return lines
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  const { year } = await params
  const yearNum = parseInt(year, 10)
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return NextResponse.json({ error: 'Année invalide' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: m } = await supabase
    .from('memberships')
    .select('workspace_id, workspaces(siret)')
    .eq('user_id', user.id)
    .single()
  if (!m) return NextResponse.json({ error: 'Workspace introuvable' }, { status: 403 })

  const startDate = `${yearNum}-01-01`
  const endDate = `${yearNum}-12-31`

  const [facturesResult, depensesResult] = await Promise.all([
    supabase
      .from('factures')
      .select('*')
      .eq('workspace_id', m.workspace_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
    supabase
      .from('depenses')
      .select('*')
      .eq('workspace_id', m.workspace_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
  ])

  const factures: Facture[] = facturesResult.data ?? []
  const depenses: Depense[] = depensesResult.data ?? []

  const fecLines: string[] = [FEC_HEADER]

  factures.forEach((f, idx) => {
    factureToFecLines(f, idx).forEach(line => fecLines.push(line))
  })

  depenses.forEach((d, idx) => {
    depenseToFecLines(d, idx).forEach(line => fecLines.push(line))
  })

  const fecContent = fecLines.join('\r\n')

  const ws = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces
  const siret = ((ws as { siret?: string | null } | null)?.siret ?? 'XXXXXXXXXX').replace(/\s/g, '')
  const filename = `FEC_${siret}_${yearNum}.txt`

  return new NextResponse(fecContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
