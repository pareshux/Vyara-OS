import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from './print-button'

function formatINR(n: number) {
  return '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

type CompanyInfo = {
  name: string
  address: string
  city: string | null
  state: string | null
  gstin: string | null
}

export default async function BOQPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Pull current user's tenant to render company header dynamically.
  // Falls back to a generic "Your Company" if tenant lookup fails — the
  // BOQ should still render even on a profile/settings hiccup.
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  let company: CompanyInfo = { name: 'Your Company', address: '', city: null, state: null, gstin: null }
  if (profile?.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenant')
      .select('name, settings')
      .eq('id', profile.tenant_id)
      .single()
    if (tenant) {
      const c = (tenant.settings as { company?: Partial<CompanyInfo> } | null)?.company ?? {}
      company = {
        name: tenant.name as string,
        address: c.address ?? '',
        city: c.city ?? null,
        state: c.state ?? null,
        gstin: c.gstin ?? null,
      }
    }
  }

  const { data: quote } = await supabase
    .from('quotation')
    .select(`
      id, quotation_number, status, total, valid_until, notes, created_at,
      project:project_id(
        name, city,
        buyer_firm:buyer_firm_id(name),
        architect_firm:architect_firm_id(name)
      ),
      lines:quotation_line(
        id, quantity, unit, unit_price, line_total, notes,
        product:product_id(name, sku_code)
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!quote) notFound()

  const project = (quote.project as unknown) as {
    name: string
    city: string | null
    buyer_firm: { name: string } | null
    architect_firm: { name: string } | null
  } | null

  const lines = (quote.lines as unknown) as Array<{
    id: string
    quantity: number
    unit: string | null
    unit_price: number
    line_total: number
    notes: string | null
    product: { name: string; sku_code: string } | null
  }>

  const subtotal = quote.total ?? lines.reduce((s, l) => s + l.line_total, 0)
  const gstPct = 18
  const gstAmount = subtotal * (gstPct / 100)
  const grandTotal = subtotal + gstAmount

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>BOQ — {quote.quotation_number}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1C1B19; background: #fff; }
          .page { max-width: 900px; margin: 0 auto; padding: 40px 48px; }
          .print-btn {
            position: fixed; top: 20px; right: 24px;
            background: #1F5E55; color: #fff;
            border: none; border-radius: 8px;
            padding: 10px 20px; font-size: 14px; font-weight: 500;
            cursor: pointer; z-index: 99;
          }
          .print-btn:hover { background: #18504A; }

          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
          .company-name { font-size: 22px; font-weight: 700; color: #1F5E55; letter-spacing: -0.3px; }
          .company-sub { font-size: 11px; color: #6B6862; margin-top: 2px; }
          .doc-title { text-align: right; }
          .doc-title h1 { font-size: 18px; font-weight: 700; letter-spacing: 1px; color: #1C1B19; }
          .doc-title .ref { font-size: 12px; color: #6B6862; margin-top: 4px; }

          /* Divider */
          .divider { border: none; border-top: 2px solid #1F5E55; margin: 0 0 24px 0; }
          .divider-light { border: none; border-top: 1px solid #E5E2DC; margin: 20px 0; }

          /* Meta grid */
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
          .meta-block dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A968E; margin-bottom: 3px; }
          .meta-block dd { font-size: 13px; color: #1C1B19; font-weight: 500; }
          .meta-block dd.muted { font-weight: 400; color: #6B6862; }

          /* Table */
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12.5px; }
          thead tr { background: #1F5E55; color: #fff; }
          thead th { padding: 9px 12px; text-align: left; font-weight: 600; font-size: 11px; letter-spacing: 0.3px; }
          thead th.right { text-align: right; }
          tbody tr { border-bottom: 1px solid #E5E2DC; }
          tbody tr:last-child { border-bottom: none; }
          tbody tr:nth-child(even) { background: #FAF9F7; }
          td { padding: 9px 12px; vertical-align: top; }
          td.right { text-align: right; font-variant-numeric: tabular-nums; }
          td.center { text-align: center; }
          .sku { font-family: 'Courier New', monospace; font-size: 10px; color: #9A968E; }
          .line-note { font-size: 10px; color: #9A968E; margin-top: 2px; }

          /* Totals */
          .totals { display: flex; justify-content: flex-end; }
          .totals-table { width: 320px; border: 1px solid #E5E2DC; border-radius: 6px; overflow: hidden; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 13px; border-bottom: 1px solid #E5E2DC; }
          .totals-row:last-child { border-bottom: none; }
          .totals-row.grand { background: #1F5E55; color: #fff; font-weight: 700; font-size: 14px; }
          .totals-label { color: inherit; }
          .totals-value { font-variant-numeric: tabular-nums; font-weight: 600; }

          /* Terms */
          .terms { margin-top: 32px; padding: 16px; background: #FAF9F7; border: 1px solid #E5E2DC; border-radius: 6px; }
          .terms h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B6862; margin-bottom: 8px; }
          .terms ul { padding-left: 16px; }
          .terms li { font-size: 11.5px; color: #6B6862; margin-bottom: 4px; line-height: 1.5; }
          .terms .quote-note { font-size: 11.5px; color: #6B6862; margin-top: 6px; }

          /* Signature */
          .signature { display: flex; justify-content: space-between; margin-top: 48px; }
          .sig-block { width: 200px; }
          .sig-line { border-top: 1px solid #1C1B19; padding-top: 6px; font-size: 11px; color: #6B6862; }

          /* Footer */
          .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9A968E; border-top: 1px solid #E5E2DC; padding-top: 12px; }

          @media print {
            .print-btn { display: none !important; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .page { padding: 20px 28px; }
            thead tr { background: #1F5E55 !important; color: #fff !important; }
            .totals-row.grand { background: #1F5E55 !important; color: #fff !important; }
          }
        `}</style>
      </head>
      <body>
        <PrintButton />

        <div className="page">
          {/* Header */}
          <div className="header">
            <div>
              <div className="company-name">{company.name}</div>
              <div className="company-sub">
                {company.address || (company.city && company.state ? `${company.city}, ${company.state}` : '—')}
                {company.gstin ? ` · GST: ${company.gstin}` : ''}
              </div>
            </div>
            <div className="doc-title">
              <h1>BILL OF QUANTITIES</h1>
              <div className="ref">Quotation Ref: {quote.quotation_number}</div>
            </div>
          </div>

          <hr className="divider" />

          {/* Meta */}
          <div className="meta-grid">
            <dl>
              <div className="meta-block" style={{ marginBottom: 14 }}>
                <dt>To</dt>
                <dd>{project?.buyer_firm?.name ?? '—'}</dd>
              </div>
              <div className="meta-block">
                <dt>Project</dt>
                <dd>{project?.name ?? '—'}</dd>
                {project?.city && <dd className="muted">{project.city}</dd>}
              </div>
            </dl>
            <dl style={{ textAlign: 'right' }}>
              <div className="meta-block" style={{ marginBottom: 14 }}>
                <dt>Date</dt>
                <dd>{formatDate(quote.created_at)}</dd>
              </div>
              <div className="meta-block" style={{ marginBottom: 14 }}>
                <dt>Valid Until</dt>
                <dd>{formatDate(quote.valid_until)}</dd>
              </div>
              {project?.architect_firm && (
                <div className="meta-block">
                  <dt>Architect / Specifier</dt>
                  <dd className="muted">{project.architect_firm.name}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Line items table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>Sr.</th>
                <th>Item Description</th>
                <th style={{ width: 110 }}>SKU Code</th>
                <th style={{ width: 60 }} className="right">Unit</th>
                <th style={{ width: 80 }} className="right">Qty</th>
                <th style={{ width: 100 }} className="right">Rate (₹)</th>
                <th style={{ width: 110 }} className="right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={line.id}>
                  <td className="center" style={{ color: '#9A968E' }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{line.product?.name ?? '—'}</div>
                    {line.notes && <div className="line-note">{line.notes}</div>}
                  </td>
                  <td><span className="sku">{line.product?.sku_code ?? '—'}</span></td>
                  <td className="right" style={{ color: '#6B6862' }}>{line.unit ?? 'sqft'}</td>
                  <td className="right">{line.quantity.toLocaleString('en-IN')}</td>
                  <td className="right">{formatINR(line.unit_price)}</td>
                  <td className="right" style={{ fontWeight: 600 }}>{formatINR(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals">
            <div className="totals-table">
              <div className="totals-row">
                <span className="totals-label" style={{ color: '#6B6862' }}>Subtotal (excl. GST)</span>
                <span className="totals-value">{formatINR(subtotal)}</span>
              </div>
              <div className="totals-row">
                <span className="totals-label" style={{ color: '#6B6862' }}>GST @ {gstPct}%</span>
                <span className="totals-value">{formatINR(gstAmount)}</span>
              </div>
              <div className="totals-row grand">
                <span className="totals-label">Grand Total</span>
                <span className="totals-value">{formatINR(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Quote notes */}
          {quote.notes && (
            <>
              <hr className="divider-light" />
              <p style={{ fontSize: 12, color: '#6B6862', fontStyle: 'italic' }}>{quote.notes}</p>
            </>
          )}

          {/* Terms */}
          <div className="terms">
            <h3>Terms &amp; Conditions</h3>
            <ul>
              <li>Prices are exclusive of GST. GST @ 18% will be charged extra as applicable.</li>
              <li>Delivery subject to availability of stock at time of order confirmation.</li>
              <li>Payment terms as per agreed credit terms or 50% advance, balance before dispatch.</li>
              <li>Prices are valid until the date mentioned above, subject to revision thereafter.</li>
              <li>This is a computer-generated document and does not require a physical signature.</li>
            </ul>
            {quote.valid_until && (
              <p className="quote-note">
                This quotation is valid until <strong>{formatDate(quote.valid_until)}</strong>. Please confirm your order before this date to lock in the above rates.
              </p>
            )}
          </div>

          {/* Signature blocks */}
          <div className="signature">
            <div className="sig-block">
              <div className="sig-line">Prepared by · {company.name}</div>
            </div>
            <div className="sig-block">
              <div className="sig-line">Accepted by · {project?.buyer_firm?.name ?? 'Customer'}</div>
            </div>
          </div>

          {/* Footer */}
          <div className="footer">
            {company.name}
            {company.city && company.state ? ` · ${company.city}, ${company.state}` : ''}
            {' · This document was generated by CRMOS'}
          </div>
        </div>
      </body>
    </html>
  )
}
