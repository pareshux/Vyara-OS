/**
 * /procurement/payments/[id]/form-16a — Per-payment Form 16A certificate.
 *
 * Per-payment certificate (chosen at session start). Quarterly
 * aggregated Form 16A per vendor per FY could be a separate route
 * if asked later — schema captures all the needed fields already.
 *
 * Per Income Tax Act, this is the TDS certificate the buyer issues
 * to the vendor. In the prescribed format the certificate carries:
 *   - Deductor + deductee details (PAN, TAN, address)
 *   - Section under which TDS was deducted
 *   - Amount paid + TDS deducted + Rate
 *   - Date of deposit (P3γ doesn't yet track the actual deposit
 *     receipt — that's bank-statement reconciliation territory)
 *
 * V1 renders an unofficial cert: legally accountants generate the
 * "official" Form 16A from the Income Tax Department's TRACES portal
 * after filing 26Q. This cert is a working copy for the vendor /
 * accountant. Marked accordingly in the document footer.
 */
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from '@/app/(print)/quotes/[id]/boq/print-button'

function formatINR(n: number) {
  return '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fiscalYear(dateIso: string): string {
  const d = new Date(dateIso)
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  // Indian FY: April–March. Payment in Apr-Dec belongs to FY ending next year; Jan-Mar to FY ending current year.
  const startYear = m >= 4 ? y : y - 1
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}
function fiscalQuarter(dateIso: string): string {
  const m = new Date(dateIso).getMonth() + 1
  if (m >= 4 && m <= 6)  return 'Q1'
  if (m >= 7 && m <= 9)  return 'Q2'
  if (m >= 10 && m <= 12) return 'Q3'
  return 'Q4'
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function Form16APage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: payment } = await supabase
    .from('vendor_payment')
    .select(`
      id, payment_number, payment_date, payment_mode, reference_no,
      gross_amount, tds_section, tds_pct, tds_amount, net_amount, status,
      vendor:vendor_id ( name, gstin, pan, address )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!payment) notFound()
  if (Number(payment.tds_amount) === 0 || !payment.tds_section) {
    // No TDS on this payment; nothing to certify
    redirect(`/procurement/payments/${id}`)
  }

  const vendor = Array.isArray(payment.vendor) ? payment.vendor[0] : payment.vendor as {
    name: string; gstin: string | null; pan: string | null; address: string | null
  } | null

  // Buyer info from tenant
  const { data: profile } = await supabase
    .from('user_profile').select('tenant_id').eq('id', user.id).single()
  let buyer = { name: 'Your Company', address: '', gstin: null as string | null, pan: null as string | null }
  if (profile?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenant').select('name, settings').eq('id', profile.tenant_id).single()
    if (tenant) {
      const c = ((tenant.settings as { company?: { address?: string; gstin?: string; pan?: string } } | null)?.company) ?? {}
      buyer = {
        name: tenant.name as string,
        address: c.address ?? '',
        gstin: c.gstin ?? null,
        pan: c.pan ?? null,
      }
    }
  }

  const fy = fiscalYear(payment.payment_date as string)
  const q = fiscalQuarter(payment.payment_date as string)
  const tdsSection = payment.tds_section as string

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Form 16A — {payment.payment_number}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12.5px; color: #1C1B19; background: #fff; }
          .page { max-width: 800px; margin: 0 auto; padding: 36px 44px; }

          .doc-header { text-align: center; padding-bottom: 14px; border-bottom: 2px solid #1F5E55; margin-bottom: 22px; }
          .doc-header h1 { font-size: 16px; font-weight: 700; color: #1F5E55; letter-spacing: 1px; }
          .doc-header .sub { font-size: 11px; color: #6B6862; margin-top: 4px; }
          .doc-header .meta { font-size: 11px; margin-top: 8px; }

          .info-block { margin-bottom: 18px; }
          .info-block .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A968E; margin-bottom: 3px; }
          .info-block .body { font-size: 12px; color: #1C1B19; line-height: 1.5; }
          .info-block .body .name { font-weight: 600; }

          .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px; }
          .col { border: 1px solid #E5E2DC; border-radius: 6px; padding: 12px 14px; }

          .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px; border: 1px solid #1F5E55; }
          .detail-table th { background: #1F5E55; color: #fff; padding: 8px 12px; text-align: left; font-weight: 600; font-size: 11px; }
          .detail-table td { padding: 8px 12px; border-top: 1px solid #E5E2DC; }
          .detail-table td.right { text-align: right; font-variant-numeric: tabular-nums; }
          .detail-table tr.total td { background: #FAF9F7; font-weight: 700; border-top: 2px solid #1F5E55; font-size: 13px; }
          .detail-table .mono { font-family: 'Courier New', monospace; }

          .declaration { background: #FAF9F7; border: 1px solid #E5E2DC; border-radius: 6px; padding: 14px; margin-bottom: 18px; font-size: 11.5px; line-height: 1.5; }
          .declaration strong { color: #1F5E55; }

          .signature { display: flex; justify-content: space-between; margin-top: 36px; }
          .sig-block { width: 220px; }
          .sig-line { border-top: 1px solid #1C1B19; padding-top: 6px; font-size: 11px; color: #6B6862; }

          .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #E5E2DC; text-align: center; font-size: 10px; color: #9A968E; }

          @media print {
            .print-btn { display: none !important; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .page { padding: 20px 28px; }
            .detail-table th { background: #1F5E55 !important; color: #fff !important; }
          }
        `}</style>
      </head>
      <body>
        <PrintButton />

        <div className="page">
          <div className="doc-header">
            <h1>FORM 16A · CERTIFICATE OF TAX DEDUCTED AT SOURCE</h1>
            <div className="sub">[Issued under Section 203 of the Income Tax Act, 1961]</div>
            <div className="meta">FY {fy} · {q} · Certificate Ref: {payment.payment_number as string}</div>
          </div>

          {/* Deductor + Deductee */}
          <div className="two-col">
            <div className="col">
              <div className="label">Name and Address of the Deductor</div>
              <div className="body">
                <div className="name">{buyer.name}</div>
                {buyer.address && <div>{buyer.address}</div>}
                {buyer.gstin && <div>GSTIN: <span style={{ fontFamily: 'Courier New, monospace' }}>{buyer.gstin}</span></div>}
                {buyer.pan && <div>PAN: <span style={{ fontFamily: 'Courier New, monospace' }}>{buyer.pan}</span></div>}
              </div>
            </div>
            <div className="col">
              <div className="label">Name and Address of the Deductee</div>
              <div className="body">
                <div className="name">{vendor?.name ?? '—'}</div>
                {vendor?.address && <div>{vendor.address}</div>}
                {vendor?.gstin && <div>GSTIN: <span style={{ fontFamily: 'Courier New, monospace' }}>{vendor.gstin}</span></div>}
                {vendor?.pan ? (
                  <div>PAN: <span style={{ fontFamily: 'Courier New, monospace' }}>{vendor.pan}</span></div>
                ) : (
                  <div style={{ color: '#B91C1C' }}>PAN: Not on file (§206AA fallback rate applied)</div>
                )}
              </div>
            </div>
          </div>

          <table className="detail-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Nature of Payment</th>
                <th>Date of Payment</th>
                <th className="right">Amount Paid (₹)</th>
                <th className="right">Rate (%)</th>
                <th className="right">TDS (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">§{tdsSection}</td>
                <td>
                  {tdsSection === '194Q' && 'Purchase of goods'}
                  {tdsSection === '194C' && 'Payment to contractor / works contract'}
                  {tdsSection === '194J' && 'Professional / technical services'}
                  {tdsSection === '194I' && 'Rent'}
                </td>
                <td>{formatDate(payment.payment_date as string)}</td>
                <td className="right">{formatINR(Number(payment.gross_amount))}</td>
                <td className="right">{Number(payment.tds_pct)}%</td>
                <td className="right">{formatINR(Number(payment.tds_amount))}</td>
              </tr>
              <tr className="total">
                <td colSpan={3}>Total TDS deducted under §{tdsSection}</td>
                <td className="right">{formatINR(Number(payment.gross_amount))}</td>
                <td></td>
                <td className="right">{formatINR(Number(payment.tds_amount))}</td>
              </tr>
            </tbody>
          </table>

          <div className="info-block">
            <div className="label">Reference of the Payment</div>
            <div className="body">
              Voucher: <span className="mono">{payment.payment_number as string}</span>
              {' · '}Mode: <span style={{ textTransform: 'uppercase' }}>{payment.payment_mode as string}</span>
              {payment.reference_no ? <> · Ref: <span className="mono">{payment.reference_no as string}</span></> : null}
              {' · '}Net paid to deductee: <strong>{formatINR(Number(payment.net_amount))}</strong>
            </div>
          </div>

          <div className="declaration">
            <strong>Declaration:</strong> I, the deductor, certify that the above particulars are correct
            and that the tax deducted at source has been (or will be) deposited to the credit of
            the Central Government per Income Tax Act, 1961. The actual Form 16A from the
            TRACES portal will be issued post quarterly 26Q filing for {fy} {q}.
          </div>

          <div className="signature">
            <div className="sig-block">
              <div className="sig-line">For {buyer.name}</div>
            </div>
            <div className="sig-block">
              <div className="sig-line">Authorised Signatory · Place &amp; Date</div>
            </div>
          </div>

          <div className="footer">
            Working Form 16A · Generated by CRMOS · Official certificate available from TRACES (incometax.gov.in)
            after quarterly 26Q filing.
          </div>
        </div>
      </body>
    </html>
  )
}
