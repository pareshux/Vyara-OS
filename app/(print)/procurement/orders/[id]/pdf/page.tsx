/**
 * /procurement/orders/[id]/pdf — print-friendly Purchase Order.
 *
 * Mirrors the quote BOQ pattern: standalone HTML body (under the
 * (print) route group's auth layout), CSS-in-style, "Print / Save PDF"
 * floating button hidden via @media print, A4-friendly width.
 *
 * Lines render with HSN, qty, rate, discount, taxable, and the GST
 * split column header is computed from the PO (IGST or CGST+SGST).
 * Address snapshots (bill-to / ship-to / vendor) come straight off
 * the PO header so the rendered document is stable regardless of
 * later master mutations.
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

export default async function PurchaseOrderPdfPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: po } = await supabase
    .from('purchase_order')
    .select(`
      id, po_number, po_date, expected_delivery_at, status, currency,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, warranty_terms,
      liquidated_damages_terms, retention_pct, other_terms, notes,
      vendor:vendor_id ( name, gstin ),
      warehouse:ship_to_warehouse_id ( name, state ),
      lines:purchase_order_line (
        id, line_no, description, hsn_code, unit, quantity, rate,
        discount_pct, taxable_value, is_interstate, gst_rate_pct,
        igst_amount, cgst_amount, sgst_amount, amount_total
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!po) notFound()

  const lines = ((po.lines as Array<{
    id: string
    line_no: number
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    rate: number
    discount_pct: number
    taxable_value: number
    is_interstate: boolean
    gst_rate_pct: number
    igst_amount: number
    cgst_amount: number
    sgst_amount: number
    amount_total: number
  }> | null) ?? []).sort((a, b) => a.line_no - b.line_no)

  const interstate = lines.some((l) => l.is_interstate)
  const igstTotal = lines.reduce((s, l) => s + Number(l.igst_amount || 0), 0)
  const cgstTotal = lines.reduce((s, l) => s + Number(l.cgst_amount || 0), 0)
  const sgstTotal = lines.reduce((s, l) => s + Number(l.sgst_amount || 0), 0)

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PO — {po.po_number}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1C1B19; background: #fff; }
          .page { max-width: 900px; margin: 0 auto; padding: 40px 48px; }

          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
          .header-left { max-width: 60%; }
          .doc-title { text-align: right; }
          .doc-title h1 { font-size: 18px; font-weight: 700; color: #1F5E55; letter-spacing: 0.5px; }
          .doc-title .ref { font-size: 13px; color: #6B6862; margin-top: 4px; font-family: 'Courier New', monospace; }
          .doc-title .status { display: inline-block; margin-top: 6px; padding: 3px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; background: #1F5E55; color: #fff; border-radius: 999px; }

          /* Address blocks */
          .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
          .addr-block { border: 1px solid #E5E2DC; border-radius: 6px; padding: 12px 14px; }
          .addr-block .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A968E; margin-bottom: 4px; }
          .addr-block .body { font-size: 12px; color: #1C1B19; line-height: 1.5; white-space: pre-wrap; }

          /* Meta row */
          .meta-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
          .meta-cell .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A968E; }
          .meta-cell .val { font-size: 12.5px; color: #1C1B19; font-weight: 500; margin-top: 2px; }

          .divider { border: none; border-top: 2px solid #1F5E55; margin: 0 0 20px 0; }
          .divider-light { border: none; border-top: 1px solid #E5E2DC; margin: 18px 0; }

          /* Lines table */
          table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 11.5px; }
          thead tr { background: #1F5E55; color: #fff; }
          thead th { padding: 8px 8px; text-align: left; font-weight: 600; font-size: 10.5px; letter-spacing: 0.3px; }
          thead th.right { text-align: right; }
          thead th.center { text-align: center; }
          tbody tr { border-bottom: 1px solid #E5E2DC; }
          tbody tr:last-child { border-bottom: none; }
          tbody tr:nth-child(even) { background: #FAF9F7; }
          td { padding: 8px 8px; vertical-align: top; }
          td.right { text-align: right; font-variant-numeric: tabular-nums; }
          td.center { text-align: center; }
          .hsn { font-family: 'Courier New', monospace; font-size: 10px; color: #9A968E; }
          .desc-name { font-weight: 500; }

          /* Totals */
          .totals { display: flex; justify-content: flex-end; }
          .totals-table { width: 340px; border: 1px solid #E5E2DC; border-radius: 6px; overflow: hidden; }
          .totals-row { display: flex; justify-content: space-between; padding: 7px 14px; font-size: 12.5px; border-bottom: 1px solid #E5E2DC; }
          .totals-row:last-child { border-bottom: none; }
          .totals-row.grand { background: #1F5E55; color: #fff; font-weight: 700; font-size: 14px; }
          .totals-label { color: inherit; }
          .totals-value { font-variant-numeric: tabular-nums; font-weight: 600; }

          /* Terms */
          .terms { margin-top: 28px; padding: 14px 16px; background: #FAF9F7; border: 1px solid #E5E2DC; border-radius: 6px; }
          .terms h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B6862; margin-bottom: 8px; }
          .terms ul { padding-left: 16px; }
          .terms li { font-size: 11.5px; color: #6B6862; margin-bottom: 4px; line-height: 1.5; }
          .terms li strong { color: #1C1B19; }

          /* Signature */
          .signature { display: flex; justify-content: space-between; margin-top: 40px; }
          .sig-block { width: 220px; }
          .sig-line { border-top: 1px solid #1C1B19; padding-top: 6px; font-size: 11px; color: #6B6862; }

          /* Footer */
          .footer { margin-top: 36px; text-align: center; font-size: 10px; color: #9A968E; border-top: 1px solid #E5E2DC; padding-top: 12px; }

          @media print {
            .print-btn { display: none !important; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .page { padding: 20px 28px; }
            thead tr { background: #1F5E55 !important; color: #fff !important; }
            .totals-row.grand { background: #1F5E55 !important; color: #fff !important; }
            .doc-title .status { background: #1F5E55 !important; color: #fff !important; }
          }
        `}</style>
      </head>
      <body>
        <PrintButton />

        <div className="page">
          {/* Header */}
          <div className="header">
            <div className="header-left">
              <div className="addr-block" style={{ borderColor: 'transparent', padding: 0 }}>
                <div className="label">Bill to (buyer)</div>
                <div className="body">{po.bill_to_snapshot ?? '—'}</div>
              </div>
            </div>
            <div className="doc-title">
              <h1>PURCHASE ORDER</h1>
              <div className="ref">{po.po_number}</div>
              <div className="status">{po.status.replace(/_/g, ' ')}</div>
            </div>
          </div>

          <hr className="divider" />

          {/* Vendor + Ship-to address blocks */}
          <div className="addr-grid">
            <div className="addr-block">
              <div className="label">Vendor</div>
              <div className="body">{po.vendor_address_snapshot ?? '—'}</div>
            </div>
            <div className="addr-block">
              <div className="label">Ship to</div>
              <div className="body">{po.ship_to_snapshot ?? '—'}</div>
            </div>
          </div>

          {/* Meta strip */}
          <div className="meta-row">
            <div className="meta-cell">
              <div className="label">PO Date</div>
              <div className="val">{formatDate(po.po_date as string)}</div>
            </div>
            <div className="meta-cell">
              <div className="label">Expected Delivery</div>
              <div className="val">{formatDate(po.expected_delivery_at as string | null)}</div>
            </div>
            <div className="meta-cell">
              <div className="label">Payment Terms</div>
              <div className="val">{po.payment_terms_days} days</div>
            </div>
            <div className="meta-cell">
              <div className="label">Currency</div>
              <div className="val">{po.currency ?? 'INR'}</div>
            </div>
          </div>

          {/* Lines table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }} className="center">#</th>
                <th>Description</th>
                <th style={{ width: 80 }}>HSN/SAC</th>
                <th style={{ width: 50 }} className="right">Unit</th>
                <th style={{ width: 60 }} className="right">Qty</th>
                <th style={{ width: 80 }} className="right">Rate (₹)</th>
                <th style={{ width: 50 }} className="right">Disc%</th>
                <th style={{ width: 88 }} className="right">Taxable (₹)</th>
                <th style={{ width: 50 }} className="right">GST%</th>
                <th style={{ width: 96 }} className="right">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="center" style={{ color: '#9A968E' }}>{l.line_no}</td>
                  <td>
                    <div className="desc-name">{l.description}</div>
                  </td>
                  <td><span className="hsn">{l.hsn_code ?? '—'}</span></td>
                  <td className="right" style={{ color: '#6B6862' }}>{l.unit}</td>
                  <td className="right">{Number(l.quantity).toLocaleString('en-IN')}</td>
                  <td className="right">{formatINR(Number(l.rate))}</td>
                  <td className="right">{l.discount_pct > 0 ? `${l.discount_pct}%` : '—'}</td>
                  <td className="right">{formatINR(Number(l.taxable_value))}</td>
                  <td className="right">{l.gst_rate_pct}%</td>
                  <td className="right" style={{ fontWeight: 600 }}>{formatINR(Number(l.amount_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals">
            <div className="totals-table">
              <div className="totals-row">
                <span className="totals-label" style={{ color: '#6B6862' }}>Subtotal (taxable)</span>
                <span className="totals-value">{formatINR(Number(po.subtotal))}</span>
              </div>
              {Number(po.discount_amount) > 0 && (
                <div className="totals-row">
                  <span className="totals-label" style={{ color: '#6B6862' }}>Discount</span>
                  <span className="totals-value">− {formatINR(Number(po.discount_amount))}</span>
                </div>
              )}
              {interstate ? (
                <div className="totals-row">
                  <span className="totals-label" style={{ color: '#6B6862' }}>IGST</span>
                  <span className="totals-value">{formatINR(igstTotal)}</span>
                </div>
              ) : (
                <>
                  <div className="totals-row">
                    <span className="totals-label" style={{ color: '#6B6862' }}>CGST</span>
                    <span className="totals-value">{formatINR(cgstTotal)}</span>
                  </div>
                  <div className="totals-row">
                    <span className="totals-label" style={{ color: '#6B6862' }}>SGST</span>
                    <span className="totals-value">{formatINR(sgstTotal)}</span>
                  </div>
                </>
              )}
              <div className="totals-row grand">
                <span className="totals-label">Grand Total</span>
                <span className="totals-value">{formatINR(Number(po.total))}</span>
              </div>
            </div>
          </div>

          {/* PO Notes */}
          {po.notes && (
            <>
              <hr className="divider-light" />
              <p style={{ fontSize: 12, color: '#6B6862', fontStyle: 'italic' }}>{po.notes}</p>
            </>
          )}

          {/* Terms */}
          <div className="terms">
            <h3>Terms &amp; Conditions</h3>
            <ul>
              <li><strong>Payment</strong> · {po.payment_terms_days} days from receipt of goods + valid tax invoice.</li>
              {po.delivery_terms && <li><strong>Delivery</strong> · {po.delivery_terms}.</li>}
              {po.warranty_terms && <li><strong>Warranty</strong> · {po.warranty_terms}.</li>}
              {po.liquidated_damages_terms && <li><strong>Liquidated damages</strong> · {po.liquidated_damages_terms}.</li>}
              {po.retention_pct != null && <li><strong>Retention</strong> · {po.retention_pct}% withheld until satisfactory completion.</li>}
              {po.other_terms && <li><strong>Other</strong> · {po.other_terms}.</li>}
              <li>Vendor to mention this PO number on invoice, e-way bill, and all correspondence.</li>
              <li>Goods will be inspected on arrival; rejected goods to be picked up within 7 days at vendor&apos;s cost.</li>
              <li>This is a computer-generated document and does not require a physical signature.</li>
            </ul>
          </div>

          {/* Signature */}
          <div className="signature">
            <div className="sig-block">
              <div className="sig-line">Authorised by · Buyer</div>
            </div>
            <div className="sig-block">
              <div className="sig-line">Acknowledged by · Vendor</div>
            </div>
          </div>

          {/* Footer */}
          <div className="footer">
            Purchase Order {po.po_number} · Generated by CRMOS
          </div>
        </div>
      </body>
    </html>
  )
}
