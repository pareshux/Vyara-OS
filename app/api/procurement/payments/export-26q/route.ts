/**
 * Quarterly 26Q TDS return CSV export.
 *
 * GET /api/procurement/payments/export-26q?quarter=Q1&fy=2026-27
 *
 * 26Q is the quarterly statement of TDS deducted under sections other
 * than salary. Filed via the Income Tax e-filing portal. This export
 * gives the accountant the source data to either upload directly (after
 * format-conversion at NSDL's e-utility) or to reconcile against the
 * portal's expected entries.
 *
 * Columns (per 26Q form intent):
 *   Sr · Deductee PAN · Deductee Name · Section · Date of Payment ·
 *   Amount Paid · TDS Rate · TDS Amount · Voucher Ref · Payment Mode ·
 *   Bank Reference
 *
 * Quarter encoding: Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
 * (Indian FY).
 *
 * Reversed payments are EXCLUDED — they're handled separately as
 * "TDS to be reclaimed" (out of scope for v1).
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function quarterDateRange(quarter: string, fy: string): { from: string; to: string } | null {
  // fy like "2026-27" → startYear = 2026; quarters:
  //   Q1: Apr-Jun startYear
  //   Q2: Jul-Sep startYear
  //   Q3: Oct-Dec startYear
  //   Q4: Jan-Mar (startYear + 1)
  const startYear = parseInt(fy.split('-')[0], 10)
  if (Number.isNaN(startYear)) return null

  switch (quarter) {
    case 'Q1': return { from: `${startYear}-04-01`, to: `${startYear}-06-30` }
    case 'Q2': return { from: `${startYear}-07-01`, to: `${startYear}-09-30` }
    case 'Q3': return { from: `${startYear}-10-01`, to: `${startYear}-12-31` }
    case 'Q4': return { from: `${startYear + 1}-01-01`, to: `${startYear + 1}-03-31` }
    default: return null
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(request.url)
  const quarter = url.searchParams.get('quarter') ?? 'Q1'
  const fy = url.searchParams.get('fy') ?? `${new Date().getFullYear()}-${String((new Date().getFullYear() + 1)).slice(-2)}`

  const range = quarterDateRange(quarter, fy)
  if (!range) {
    return NextResponse.json({ error: `Invalid quarter "${quarter}" or FY "${fy}"` }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('user_profile').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 401 })
  }

  const { data: payments } = await supabase
    .from('vendor_payment')
    .select(`
      payment_number, payment_date, payment_mode, reference_no,
      gross_amount, tds_section, tds_pct, tds_amount, status,
      vendor:vendor_id ( name, pan )
    `)
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'posted')
    .not('tds_section', 'is', null)
    .gt('tds_amount', 0)
    .gte('payment_date', range.from)
    .lte('payment_date', range.to)
    .order('payment_date', { ascending: true })

  const header = [
    'Sr', 'Deductee PAN', 'Deductee Name', 'Section', 'Date of Payment',
    'Amount Paid (INR)', 'TDS Rate (%)', 'TDS Amount (INR)',
    'Voucher Ref', 'Payment Mode', 'Bank Reference',
  ].join(',')

  type Row = {
    payment_number: string; payment_date: string; payment_mode: string; reference_no: string | null
    gross_amount: number; tds_section: string; tds_pct: number; tds_amount: number; vendor?: unknown
  }
  function pickVendor(v: unknown): { name: string; pan: string | null } | null {
    if (!v) return null
    return Array.isArray(v) ? (v[0] as { name: string; pan: string | null }) : (v as { name: string; pan: string | null })
  }

  const lines = ((payments as Row[] | null) ?? []).map((p, i) => {
    const v = pickVendor(p.vendor)
    return [
      i + 1,
      csvEscape(v?.pan ?? 'PANNOTAVBL'),
      csvEscape(v?.name ?? ''),
      `§${p.tds_section}`,
      p.payment_date,
      Number(p.gross_amount).toFixed(2),
      Number(p.tds_pct),
      Number(p.tds_amount).toFixed(2),
      csvEscape(p.payment_number),
      p.payment_mode.toUpperCase(),
      csvEscape(p.reference_no),
    ].join(',')
  })

  const totalTds = ((payments as Row[] | null) ?? []).reduce((s, p) => s + Number(p.tds_amount), 0)
  const totalGross = ((payments as Row[] | null) ?? []).reduce((s, p) => s + Number(p.gross_amount), 0)

  const csv = [
    `# 26Q quarterly TDS return — FY ${fy} ${quarter}`,
    `# Period: ${range.from} to ${range.to}`,
    `# Posted payments with TDS > 0; reversed payments excluded`,
    `# Total gross: ${totalGross.toFixed(2)} · Total TDS: ${totalTds.toFixed(2)} (${lines.length} payments)`,
    `# Submit via Income Tax e-filing portal (after NSDL format conversion if needed)`,
    '',
    header,
    ...lines,
  ].join('\n') + '\n'

  const filename = `26q-${fy}-${quarter}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
