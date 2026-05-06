import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintButton from './PrintButton'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

type TvaLine = { taux_tva: number; montant_ht: number; montant_tva: number }

export default async function ImprimerFacture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: m } = await supabase
    .from('memberships')
    .select('workspace_id, workspaces(name, siret, tva_intra, adresse, code_postal, ville)')
    .eq('user_id', user.id)
    .single()
  if (!m) redirect('/setup')

  const ws = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces

  const factureId = parseInt(id, 10)
  if (isNaN(factureId)) notFound()

  const { data: facture } = await supabase
    .from('factures')
    .select('*')
    .eq('id', factureId)
    .eq('workspace_id', m.workspace_id)
    .single()
  if (!facture) notFound()

  const multiRate = facture.taux_tva === -1 && facture.tva_lines
  let tvaLines: TvaLine[] = []
  if (multiRate) {
    try {
      tvaLines = (typeof facture.tva_lines === 'string'
        ? JSON.parse(facture.tva_lines)
        : facture.tva_lines) as TvaLine[]
    } catch { /* use totals */ }
  }

  return (
    <>
      {/* Action bar — hidden on print */}
      <div className="print-actions no-print">
        <a href="/transactions" className="print-actions-back">← Retour</a>
        <PrintButton />
        <a
          href={`/api/facture/${facture.id}/facturx`}
          download
          className="dash-btn-ghost no-print"
          style={{ fontSize: 13, textDecoration: 'none' }}
        >
          ↓ XML Factur-X
        </a>
      </div>
      <p className="no-print" style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: 'var(--pencil)', marginTop: 4, textAlign: 'center' }}>
        Format Factur-X EN16931 — à transmettre via votre PDP ou le PPF (impots.gouv.fr)
      </p>

      {/* Invoice — A4 layout */}
      <div className="print-invoice">
        {/* Header */}
        <div className="print-inv-header">
          <div className="print-inv-emetteur">
            <p className="print-inv-company">{ws?.name ?? '—'}</p>
            {ws?.adresse && <p>{ws.adresse}</p>}
            {(ws?.code_postal || ws?.ville) && (
              <p>{[ws.code_postal, ws.ville].filter(Boolean).join(' ')}</p>
            )}
            {ws?.siret && <p>SIRET : {ws.siret}</p>}
            {ws?.tva_intra && <p>N° TVA : {ws.tva_intra}</p>}
          </div>
          <div className="print-inv-meta">
            <p className="print-inv-numero">{facture.numero}</p>
            <p>Date : {facture.date}</p>
            <p className={`print-inv-statut ${facture.statut === 'payee' ? 'print-inv-statut-paid' : 'print-inv-statut-pending'}`}>
              {facture.statut === 'payee' ? 'PAYÉE' : 'EN ATTENTE'}
            </p>
          </div>
        </div>

        {/* Client */}
        <div className="print-inv-client">
          <p className="print-inv-section-label">Facturé à</p>
          <p className="print-inv-client-name">{facture.client}</p>
        </div>

        {/* Description */}
        {facture.description && (
          <div className="print-inv-desc">
            <p className="print-inv-section-label">Objet</p>
            <p>{facture.description}</p>
          </div>
        )}

        {/* Amounts table */}
        <table className="print-inv-table">
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="right">Montant HT</th>
              <th className="right">TVA</th>
              <th className="right">Montant TTC</th>
            </tr>
          </thead>
          <tbody>
            {multiRate && tvaLines.length > 0 ? (
              tvaLines.map((line, i) => (
                <tr key={i}>
                  <td>{facture.description || facture.categorie} — TVA {line.taux_tva} %</td>
                  <td className="right">{fmt(line.montant_ht)}</td>
                  <td className="right">{fmt(line.montant_tva)}</td>
                  <td className="right">{fmt(line.montant_ht + line.montant_tva)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>{facture.description || facture.categorie}</td>
                <td className="right">{fmt(facture.montant_ht)}</td>
                <td className="right">{fmt(facture.montant_tva)}</td>
                <td className="right">{fmt(facture.montant_ttc)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} />
              <td className="right print-inv-total-label">Total HT</td>
              <td className="right">{fmt(facture.montant_ht)}</td>
            </tr>
            {facture.taux_tva !== 0 && (
              <tr>
                <td colSpan={2} />
                <td className="right print-inv-total-label">
                  TVA {facture.taux_tva === -1 ? '(multi-taux)' : `${facture.taux_tva} %`}
                </td>
                <td className="right">{fmt(facture.montant_tva)}</td>
              </tr>
            )}
            <tr className="print-inv-total-row">
              <td colSpan={2} />
              <td className="right print-inv-total-label">Total TTC</td>
              <td className="right print-inv-total-value">{fmt(facture.montant_ttc)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Legal footer */}
        <div className="print-inv-footer">
          {facture.taux_tva === 0 && (
            <p>TVA non applicable, art. 293 B du CGI</p>
          )}
          <p>En cas de retard de paiement, une pénalité de 3× le taux légal sera appliquée (art. L441-10 C.com.).</p>
        </div>
      </div>
    </>
  )
}
