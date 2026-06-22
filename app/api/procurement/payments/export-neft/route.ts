/**
 * NEFT bank-file CSV export.
 *
 * GET /api/procurement/payments/export-neft?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Generic Indian-bank format covering ~80% of bulk-NEFT/RTGS templates.
 * Per-bank dialects (HDFC, ICICI, SBI specific column orderings) are
 * follow-on work — the data captured is the same, only the column
 * order + delimiters differ. A tenant config flag in P3γ will select
 * the dialect at export time.
 *
 * Columns:
 *   Sl No · Beneficiary Name · Bank Name · IFSC · Account No ·
 *   Amount · Mode · Reference · Value Date · Remarks
 *
 * Only posted NEFT/RTGS payments are exported. Reversed payments are
 * excluded.
 */
import { getNeftBatch } from '@/lib/actions/vendor-payments'
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

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from/to date range' }, { status: 400 })
  }
  // Defensive — basic ISO date check (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
  }

  const rows = await getNeftBatch({ from_date: from, to_date: to })

  const header = [
    'Sl No', 'Beneficiary Name', 'Bank Name', 'IFSC', 'Account No',
    'Amount', 'Mode', 'Reference', 'Value Date', 'Remarks',
  ].join(',')

  const lines = rows.map((r, i) => [
    i + 1,
    csvEscape(r.beneficiary_name),
    csvEscape(r.bank_name),
    csvEscape(r.ifsc),
    csvEscape(r.account_no),
    r.amount.toFixed(2),
    'NEFT',
    csvEscape(r.reference_no),
    r.payment_date,
    csvEscape(r.remarks),
  ].join(','))

  const csv = [header, ...lines].join('\n') + '\n'
  const filename = `neft-batch-${from}-to-${to}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
