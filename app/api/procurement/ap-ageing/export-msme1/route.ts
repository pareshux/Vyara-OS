/**
 * MSME-1 half-yearly CSV export.
 *
 * GET /api/procurement/ap-ageing/export-msme1
 *
 * Per MSMED Act 2006 + MCA Form MSME-1, companies must file
 * half-yearly returns of any payments pending > 45 days to MSME
 * vendors. This export drops the required data in a CSV format that
 * an accountant can use as the source for the MSME-1 PDF/portal
 * submission.
 *
 * Columns (matching the MSME-1 form column intent):
 *   Vendor Name · PAN · MSME UDYAM No · Our Bill No ·
 *   Vendor Invoice No · Invoice Date · Goods Received Date ·
 *   Due Date · Amount Outstanding (₹) · Days Since Receipt ·
 *   Reason for Delay (TODO — manual entry by accountant)
 *
 * Returns only breach bills (days_since_receipt > 45 with
 * amount_outstanding > 0). The reason-for-delay column is intentionally
 * blank — that's the accountant's input on the filing.
 */
import { getMsme1Batch } from '@/lib/actions/vendor-payments'
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
  void request
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const rows = await getMsme1Batch()

  const header = [
    'Vendor Name', 'PAN', 'MSME UDYAM No', 'Our Bill No',
    'Vendor Invoice No', 'Invoice Date', 'Goods Received Date',
    'Due Date', 'Amount Outstanding (INR)', 'Days Since Receipt',
    'Reason for Delay',
  ].join(',')

  const lines = rows.map((r) => [
    csvEscape(r.vendor_name),
    csvEscape(r.vendor_pan),
    csvEscape(r.msme_udyam_no),
    csvEscape(r.bill_number),
    csvEscape(r.vendor_invoice_no),
    r.vendor_invoice_date,
    csvEscape(r.received_at),
    csvEscape(r.due_date),
    r.amount_outstanding.toFixed(2),
    r.days_since_receipt,
    '',  // accountant fills the reason at filing time
  ].join(','))

  const today = new Date().toISOString().slice(0, 10)
  const csv = [
    `# MSME-1 half-yearly export · generated ${today}`,
    `# Only bills with days_since_receipt > 45 and amount_outstanding > 0 included.`,
    `# Reason-for-delay column left blank for accountant entry.`,
    '',
    header,
    ...lines,
  ].join('\n') + '\n'

  const filename = `msme-1-export-${today}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
