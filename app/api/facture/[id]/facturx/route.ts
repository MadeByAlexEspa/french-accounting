import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/types/database'

interface TvaLine {
  taux_tva: number
  montant_ht: number
  montant_tva: number
}

function xmlEscape(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toXmlDate(iso: string): string {
  return iso.replace(/-/g, '')
}

function toXmlAmount(n: number): string {
  return n.toFixed(2)
}

function parseTvaLines(raw: Json | null): TvaLine[] | null {
  if (!raw) return null
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr as TvaLine[]
}

function buildTaxBlocks(tvaLines: TvaLine[]): string {
  return tvaLines
    .map(line => {
      const categoryCode = line.taux_tva === 0 ? 'E' : 'S'
      return `    <ram:ApplicableTradeTax>
      <ram:CalculatedAmount>${toXmlAmount(line.montant_tva)}</ram:CalculatedAmount>
      <ram:TypeCode>VAT</ram:TypeCode>
      <ram:BasisAmount>${toXmlAmount(line.montant_ht)}</ram:BasisAmount>
      <ram:CategoryCode>${categoryCode}</ram:CategoryCode>
      <ram:RateApplicablePercent>${toXmlAmount(line.taux_tva)}</ram:RateApplicablePercent>
    </ram:ApplicableTradeTax>`
    })
    .join('\n')
}

function buildSellerParty(ws: {
  name: string
  siret?: string | null
  tva_intra?: string | null
  adresse?: string | null
  code_postal?: string | null
  ville?: string | null
}): string {
  const parts: string[] = []
  parts.push(`      <ram:Name>${xmlEscape(ws.name)}</ram:Name>`)

  if (ws.siret) {
    parts.push(
      `      <ram:SpecifiedLegalOrganization>`,
      `        <ram:ID schemeID="0002">${xmlEscape(ws.siret.replace(/\s/g, ''))}</ram:ID>`,
      `      </ram:SpecifiedLegalOrganization>`
    )
  }

  if (ws.tva_intra) {
    parts.push(
      `      <ram:SpecifiedTaxRegistration>`,
      `        <ram:ID schemeID="VA">${xmlEscape(ws.tva_intra)}</ram:ID>`,
      `      </ram:SpecifiedTaxRegistration>`
    )
  }

  const hasAddress = ws.adresse || ws.code_postal || ws.ville
  if (hasAddress) {
    const addrParts: string[] = []
    if (ws.adresse) addrParts.push(`          <ram:LineOne>${xmlEscape(ws.adresse)}</ram:LineOne>`)
    if (ws.code_postal) addrParts.push(`          <ram:PostcodeCode>${xmlEscape(ws.code_postal)}</ram:PostcodeCode>`)
    if (ws.ville) addrParts.push(`          <ram:CityName>${xmlEscape(ws.ville)}</ram:CityName>`)
    addrParts.push(`          <ram:CountryID>FR</ram:CountryID>`)
    parts.push(
      `      <ram:PostalTradeAddress>`,
      ...addrParts,
      `      </ram:PostalTradeAddress>`
    )
  }

  return `    <ram:SellerTradeParty>\n${parts.join('\n')}\n    </ram:SellerTradeParty>`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const factureId = parseInt(id, 10)
  if (isNaN(factureId) || factureId <= 0) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: m } = await supabase
    .from('memberships')
    .select('workspace_id, workspaces(name, siret, tva_intra, adresse, code_postal, ville)')
    .eq('user_id', user.id)
    .single()
  if (!m) return NextResponse.json({ error: 'Workspace introuvable' }, { status: 403 })

  const { data: facture, error: factureErr } = await supabase
    .from('factures')
    .select('*')
    .eq('id', factureId)
    .eq('workspace_id', m.workspace_id)
    .single()

  if (factureErr || !facture) {
    return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
  }

  const wsRaw = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces
  const ws = wsRaw as {
    name: string
    siret?: string | null
    tva_intra?: string | null
    adresse?: string | null
    code_postal?: string | null
    ville?: string | null
  } | null

  const wsName = ws?.name ?? ''

  const multiTaux = facture.taux_tva === -1
  const tvaLines = multiTaux ? parseTvaLines(facture.tva_lines) : null

  let taxBlocks: string
  if (multiTaux && tvaLines && tvaLines.length > 0) {
    taxBlocks = buildTaxBlocks(tvaLines)
  } else {
    const categoryCode = facture.taux_tva === 0 ? 'E' : 'S'
    taxBlocks = `    <ram:ApplicableTradeTax>
      <ram:CalculatedAmount>${toXmlAmount(facture.montant_tva)}</ram:CalculatedAmount>
      <ram:TypeCode>VAT</ram:TypeCode>
      <ram:BasisAmount>${toXmlAmount(facture.montant_ht)}</ram:BasisAmount>
      <ram:CategoryCode>${categoryCode}</ram:CategoryCode>
      <ram:RateApplicablePercent>${toXmlAmount(facture.taux_tva)}</ram:RateApplicablePercent>
    </ram:ApplicableTradeTax>`
  }

  const sellerParty = buildSellerParty({
    name: wsName,
    siret: ws?.siret,
    tva_intra: ws?.tva_intra,
    adresse: ws?.adresse,
    code_postal: ws?.code_postal,
    ville: ws?.ville,
  })

  const typeCode = '380'
  const issueDate = toXmlDate(facture.date)

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${xmlEscape(facture.numero)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
${sellerParty}
      <ram:BuyerTradeParty>
        <ram:Name>${xmlEscape(facture.client)}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${taxBlocks}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${toXmlAmount(facture.montant_ht)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${toXmlAmount(facture.montant_ht)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${toXmlAmount(facture.montant_tva)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${toXmlAmount(facture.montant_ttc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${toXmlAmount(facture.montant_ttc)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>

</rsm:CrossIndustryInvoice>`

  const filename = `facture-${facture.numero.replace(/[^a-zA-Z0-9_-]/g, '-')}.xml`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
