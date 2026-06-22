/**
 * /procurement/payments/[id]/voucher — printable payment voucher.
 *
 * The receipt that goes to the vendor. Mirrors the PO PDF + quote BOQ
 * print pattern: standalone HTML body, CSS-in-style, "Print / Save PDF"
 * floating button hidden via @media print, A4-friendly width.
 *
 * Voucher includes:
 *   - Header (company info + voucher no + payment date)
 *   - Vendor block (name + GSTIN + PAN + bank if available)
 *   - Allocations table (bills this voucher settles)
 *   - TDS breakdown (section + rate + amount + "deposited by 7th")
 *   - Money summary (gross / tds / net)
 *   - Bank reference (mode + ref no + bank used)
 *   - Signature blocks
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

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PaymentVoucherPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: payment } = await supabase
    .from('vendor_payment')
    .select(`
      id, payment_number, payment_date, payment_mode, bank_account_used, reference_no,
      gross_amount, tds_section, tds_pct, tds_amount, net_amount, status, notes,
      reversed_at, reversal_reason,
      vendor:vendor_id ( name, gstin, pan, address, bank_name, bank_ifsc, bank_account_no, msme_status ),
      allocations:vendor_payment_allocation (
        allocated_amount,
        bill:bill_id ( bill_number, vendor_invoice_no, vendor_invoice_date, total )
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!payment) notFound()

  const vendor = Array.isArray(payment.vendor) ? payment.vendor[0] : payment.vendor as {
    name: string; gstin: string | null; pan: string | null; address: string | null;
    bank_name: string | null; bank_ifsc: string | null; bank_account_no: string | null;
    msme_status: string | null
  } | null

  type RawAlloc = {
    allocated_amount: number
    bill?: unknown
  }
  const allocations = ((payment.allocations as RawAlloc[] | null) ?? []).map((a) => {
    const bill = (Array.isArray(a.bill) ? a.bill[0] : a.bill) as {
      bill_number: string; vendor_invoice_no: string; vendor_invoice_date: string; total: number
    } | null
    return {
      allocated_amount: Number(a.allocated_amount),
      bill_number: bill?.bill_number ?? '—',
      vendor_invoice_no: bill?.vendor_invoice_no ?? '—',
      vendor_invoice_date: bill?.vendor_invoice_date ?? null,
      bill_total: bill?.total ?? 0,
    }
  })

  // Company snapshot (mirrors BOQ pattern)
  const { data: profile } = await supabase
    .from('user_profile').select('tenant_id').eq('id', user.id).single()
  let company = { name: 'Your Company', address: '', city: null as string | null, state: null as string | null, gstin: null as string | null }
  if (profile?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenant').select('name, settings').eq('id', profile.tenant_id).single()
    if (tenant) {
      const c = ((tenant.settings as { company?: Partial<typeof company> } | null)?.company) ?? {}
      company = {
        name: tenant.name as string,
        address: c.address ?? '',
        city: c.city ?? null,
        state: c.state ?? null,
        gstin: c.gstin ?? null,
      }
    }
  }

  const isReversed = payment.status === 'reversed'

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Payment Voucher — {payment.payment_number}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1C1B19; background: #fff; }
          .page { max-width: 880px; margin: 0 auto; padding: 36px 44px; }

          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
          .company-name { font-size: 20px; font-weight: 700; color: #1F5E55; }
          .company-sub { font-size: 11px; color: #6B6862; margin-top: 3px; }
          .doc-title { text-align: right; }
          .doc-title h1 { font-size: 16px; font-weight: 700; color: #1F5E55; letter-spacing: 0.5px; }
          .doc-title .ref { font-size: 13px; color: #6B6862; margin-top: 4px; font-family: 'Courier New', monospace; }
          .doc-title .status { display: inline-block; margin-top: 6px; padding: 3px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 999px; }
          .status-posted { background: #1F5E55; color: #fff; }
          .status-reversed { background: #B91C1C; color: #fff; }

          .reversed-banner { background: #FEE2E2; color: #7F1D1D; padding: 10px 14px; border-radius: 6px; margin-bottom: 20px; font-size: 12px; }

          .divider { border: none; border-top: 2px solid #1F5E55; margin: 0 0 22px 0; }
          .divider-light { border: none; border-top: 1px solid #E5E2DC; margin: 16px 0; }

          .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; }
          .addr-block { border: 1px solid #E5E2DC; border-radius: 6px; padding: 12px 14px; }
          .addr-block .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A968E; margin-bottom: 4px; }
          .addr-block .body { font-size: 12px; color: #1C1B19; line-height: 1.55; white-space: pre-wrap; }
          .addr-block .body strong { font-weight: 600; }

          .meta-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
          .meta-cell .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A968E; }
          .meta-cell .val { font-size: 12.5px; color: #1C1B19; font-weight: 500; margin-top: 2px; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 11.5px; }
          thead tr { background: #1F5E55; color: #fff; }
          thead th { padding: 8px 10px; text-align: left; font-weight: 600; font-size: 10.5px; letter-spacing: 0.3px; }
          thead th.right { text-align: right; }
          tbody tr { border-bottom: 1px solid #E5E2DC; }
          tbody tr:last-child { border-bottom: none; }
          tbody tr:nth-child(even) { background: #FAF9F7; }
          td { padding: 8px 10px; vertical-align: top; }
          td.right { text-align: right; font-variant-numeric: tabular-nums; }
          .mono { font-family: 'Courier New', monospace; font-size: 10.5px; }

          .summary-grid { display: grid; grid-template-columns: 1fr 320px; gap: 24px; margin-bottom: 22px; }
          .tds-block { border: 1px solid #E5E2DC; border-radius: 6px; padding: 14px; background: #FEF2F2; }
          .tds-block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #7F1D1D; margin-bottom: 6px; }
          .tds-block .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; color: #1C1B19; }
          .tds-block .deposit { font-size: 11px; color: #6B6862; margin-top: 8px; padding-top: 6px; border-top: 1px solid #FECACA; }

          .totals-table { border: 1px solid #E5E2DC; border-radius: 6px; overflow: hidden; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 13px; border-bottom: 1px solid #E5E2DC; }
          .totals-row:last-child { border-bottom: none; }
          .totals-row.grand { background: #1F5E55; color: #fff; font-weight: 700; font-size: 14px; }
          .totals-value { font-variant-numeric: tabular-nums; font-weight: 600; }

          .bank-block { background: #FAF9F7; border: 1px solid #E5E2DC; border-radius: 6px; padding: 12px 14px; margin-bottom: 22px; font-size: 11.5px; }
          .bank-block .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A968E; margin-bottom: 4px; }

          .signature { display: flex; justify-content: space-between; margin-top: 36px; }
          .sig-block { width: 220px; }
          .sig-line { border-top: 1px solid #1C1B19; padding-top: 6px; font-size: 11px; color: #6B6862; }

          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #9A968E; border-top: 1px solid #E5E2DC; padding-top: 10px; }

          @media print {
            .print-btn { display: none !important; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .page { padding: 20px 28px; }
            thead tr, .totals-row.grand, .doc-title .status { background: inherit !important; color: inherit !important; }
            thead tr, .totals-row.grand { background: #1F5E55 !important; color: #fff !important; }
            .status-posted { background: #1F5E55 !important; color: #fff !important; }
            .status-reversed { background: #B91C1C !important; color: #fff !important; }
          }
        `}</style>
      </head>
      <body>
        <PrintButton />

        <div className="page">
          <div className="header">
            <div>
              <div className="company-name">{company.name}</div>
              <div className="company-sub">
                {company.address || (company.city && company.state ? `${company.city}, ${company.state}` : '—')}
                {company.gstin ? ` · GSTIN ${company.gstin}` : ''}
              </div>
            </div>
            <div className="doc-title">
              <h1>PAYMENT VOUCHER</h1>
              <div className="ref">{payment.payment_number}</div>
              <div className={`status ${isReversed ? 'status-reversed' : 'status-posted'}`}>
                {isReversed ? 'REVERSED' : payment.status as string}
              </div>
            </div>
          </div>

          {isReversed && (
            <div className="reversed-banner">
              <strong>Payment reversed</strong> on {formatDate(payment.reversed_at as string | null)}.
              {payment.reversal_reason && <> Reason: {payment.reversal_reason as string}.</>}
              {' '}This voucher is retained for audit only — the bills it covered have been reverted to outstanding.
            </div>
          )}

          <hr className="divider" />

          <div className="addr-grid">
            <div className="addr-block">
              <div className="label">Paid to (Vendor)</div>
              <div className="body">
                <strong>{vendor?.name ?? '—'}</strong>
                {vendor?.address && <>{'\n'}{vendor.address}</>}
                {vendor?.gstin && <>{'\n'}GSTIN {vendor.gstin}</>}
                {vendor?.pan && <>{'\n'}PAN {vendor.pan}</>}
                {vendor?.msme_status && vendor.msme_status !== 'not_msme' && <>{'\n'}MSME {vendor.msme_status}</>}
              </div>
            </div>
            <div className="addr-block">
              <div className="label">Beneficiary bank</div>
              <div className="body">
                {vendor?.bank_name ? <strong>{vendor.bank_name}</strong> : <em style={{ color: '#9A968E' }}>Not on file</em>}
                {vendor?.bank_account_no && <>{'\n'}A/c {vendor.bank_account_no}</>}
                {vendor?.bank_ifsc && <>{'\n'}IFSC {vendor.bank_ifsc}</>}
              </div>
            </div>
          </div>

          <div className="meta-row">
            <div className="meta-cell">
              <div className="label">Payment date</div>
              <div className="val">{formatDate(payment.payment_date as string)}</div>
            </div>
            <div className="meta-cell">
              <div className="label">Mode</div>
              <div className="val" style={{ textTransform: 'uppercase' }}>{payment.payment_mode as string}</div>
            </div>
            <div className="meta-cell">
              <div className="label">Reference no.</div>
              <div className="val mono">{(payment.reference_no as string) ?? '—'}</div>
            </div>
            <div className="meta-cell">
              <div className="label">Currency</div>
              <div className="val">INR</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }} className="right">#</th>
                <th style={{ width: 140 }}>Our bill no.</th>
                <th style={{ width: 160 }}>Vendor invoice</th>
                <th style={{ width: 110 }}>Invoice date</th>
                <th className="right">Invoice total</th>
                <th className="right">Allocated</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a, i) => (
                <tr key={i}>
                  <td className="right" style={{ color: '#9A968E' }}>{i + 1}</td>
                  <td className="mono">{a.bill_number}</td>
                  <td className="mono">{a.vendor_invoice_no}</td>
                  <td>{formatDate(a.vendor_invoice_date)}</td>
                  <td className="right">{formatINR(Number(a.bill_total))}</td>
                  <td className="right" style={{ fontWeight: 600 }}>{formatINR(a.allocated_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="summary-grid">
            {/* TDS block (left) */}
            <div>
              {Number(payment.tds_pct) > 0 && payment.tds_section && (
                <div className="tds-block">
                  <h3>Tax deducted at source (TDS)</h3>
                  <div className="row">
                    <span>Section</span>
                    <span style={{ fontWeight: 600 }}>§{payment.tds_section as string}</span>
                  </div>
                  <div className="row">
                    <span>Rate</span>
                    <span style={{ fontWeight: 600 }}>{Number(payment.tds_pct)}%</span>
                  </div>
                  <div className="row">
                    <span>TDS amount</span>
                    <span style={{ fontWeight: 600 }}>{formatINR(Number(payment.tds_amount))}</span>
                  </div>
                  <div className="deposit">
                    To be deposited to the Central Government by the 7th of next month per Income Tax Act.
                    Form 16A certificate will be issued.
                  </div>
                </div>
              )}
            </div>

            {/* Money totals (right) */}
            <div className="totals-table">
              <div className="totals-row">
                <span style={{ color: '#6B6862' }}>Gross amount</span>
                <span className="totals-value">{formatINR(Number(payment.gross_amount))}</span>
              </div>
              {Number(payment.tds_amount) > 0 && (
                <div className="totals-row">
                  <span style={{ color: '#6B6862' }}>Less: TDS</span>
                  <span className="totals-value" style={{ color: '#B91C1C' }}>− {formatINR(Number(payment.tds_amount))}</span>
                </div>
              )}
              <div className="totals-row grand">
                <span>Net paid</span>
                <span className="totals-value">{formatINR(Number(payment.net_amount))}</span>
              </div>
            </div>
          </div>

          {(payment.bank_account_used || payment.reference_no) && (
            <div className="bank-block">
              <div className="label">Paid from</div>
              <div>
                {payment.bank_account_used as string | null}
                {payment.reference_no ? <> · ref <span className="mono">{payment.reference_no as string}</span></> : null}
              </div>
            </div>
          )}

          {payment.notes && (
            <>
              <hr className="divider-light" />
              <p style={{ fontSize: 11.5, color: '#6B6862', fontStyle: 'italic' }}>{payment.notes as string}</p>
            </>
          )}

          <div className="signature">
            <div className="sig-block">
              <div className="sig-line">Prepared by · Accounts</div>
            </div>
            <div className="sig-block">
              <div className="sig-line">Authorised by · {company.name}</div>
            </div>
          </div>

          <div className="footer">
            Payment Voucher {payment.payment_number} · Generated by CRMOS
          </div>
        </div>
      </body>
    </html>
  )
}
