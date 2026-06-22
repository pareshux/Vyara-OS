/**
 * Quarterly ITC-04 job-work return CSV export.
 *
 * GET /api/procurement/job-work/export-itc04?fy=2026&q=1
 *
 * ITC-04 is filed by the principal manufacturer to report goods sent on
 * job-work + goods received back during a quarter. As of CBIC notification
 * 11/2021-CT, ITC-04 frequency is:
 *   - half-yearly (Apr-Sep, Oct-Mar) for taxpayers with turnover > ₹5 cr
 *   - annual for turnover ≤ ₹5 cr
 * This export gives a quarterly slice; accountant aggregates if half-yearly.
 *
 * Columns (per ITC-04 form intent — Table 4 + Table 5A/B):
 *   Sr · GSTIN of Job Worker · Job Worker Name · Challan No · Challan Date ·
 *   Process Nature · HSN · Description · UQC · Qty Sent · Rate · Value ·
 *   Qty Returned · Qty Scrap · Return Date · Status · Days Since Challan
 *
 * Cancelled challans excluded.
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

function quarterRange(fy: number, q: number): { from: string; to: string } | null {
  switch (q) {
    case 1: return { from: `${fy}-04-01`, to: `${fy}-06-30` }
    case 2: return { from: `${fy}-07-01`, to: `${fy}-09-30` }
    case 3: return { from: `${fy}-10-01`, to: `${fy}-12-31` }
    case 4: return { from: `${fy + 1}-01-01`, to: `${fy + 1}-03-31` }
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
  const fy = parseInt(url.searchParams.get('fy') ?? `${new Date().getFullYear()}`, 10)
  const q = parseInt(url.searchParams.get('q') ?? '1', 10)
  const range = quarterRange(fy, q)
  if (!range) {
    return NextResponse.json({ error: `Invalid quarter "${q}" or FY "${fy}"` }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('user_profile').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 401 })
  }

  // We want challans issued in the period OR returns recorded in the period
  // (a challan sent in Q1 with a Q2 return shows in BOTH quarters' ITC-04 —
  // GSTN expects sends + returns reported on their respective dates).
  // For simplicity, this v1 reports challans by challan_date; accountant
  // can manually pull returns separately for now.
  const { data: rows } = await supabase
    .from('job_work_challan')
    .select(`
      challan_number, challan_date, process_nature, hsn_code, description,
      unit, qty_sent, rate, qty_received_back, qty_scrap, received_back_at,
      status, job_worker_gstin,
      job_worker:job_worker_id ( name )
    `)
    .eq('tenant_id', profile.tenant_id)
    .neq('status', 'cancelled')
    .gte('challan_date', range.from)
    .lte('challan_date', range.to)
    .order('challan_date', { ascending: true })

  const header = [
    'Sr', 'GSTIN of Job Worker', 'Job Worker Name', 'Challan No', 'Challan Date',
    'Process Nature', 'HSN', 'Description', 'UQC', 'Qty Sent', 'Rate (INR)',
    'Value (INR)', 'Qty Returned', 'Qty Scrap', 'Return Date', 'Status', 'Days Since Challan',
  ].join(',')

  type Row = {
    challan_number: string; challan_date: string; process_nature: string
    hsn_code: string | null; description: string; unit: string
    qty_sent: number; rate: number | null
    qty_received_back: number; qty_scrap: number
    received_back_at: string | null; status: string
    job_worker_gstin: string | null; job_worker?: unknown
  }
  function pickName(v: unknown): string {
    if (!v) return ''
    return Array.isArray(v) ? ((v[0] as { name: string })?.name ?? '') : ((v as { name: string }).name ?? '')
  }

  const today = new Date()
  const lines = ((rows as Row[] | null) ?? []).map((r, i) => {
    const value = (Number(r.qty_sent) * Number(r.rate ?? 0)).toFixed(2)
    const days = Math.max(0, Math.floor((today.getTime() - new Date(r.challan_date).getTime()) / (1000 * 60 * 60 * 24)))
    return [
      i + 1,
      csvEscape(r.job_worker_gstin ?? 'URP'),  // Unregistered Person if no GSTIN
      csvEscape(pickName(r.job_worker)),
      csvEscape(r.challan_number),
      r.challan_date,
      csvEscape(r.process_nature),
      csvEscape(r.hsn_code ?? ''),
      csvEscape(r.description),
      csvEscape(r.unit),
      Number(r.qty_sent),
      Number(r.rate ?? 0).toFixed(2),
      value,
      Number(r.qty_received_back),
      Number(r.qty_scrap),
      r.received_back_at ?? '',
      r.status,
      days,
    ].join(',')
  })

  const totalSent = ((rows as Row[] | null) ?? []).reduce((s, r) => s + Number(r.qty_sent), 0)
  const totalRecvd = ((rows as Row[] | null) ?? []).reduce((s, r) => s + Number(r.qty_received_back), 0)
  const totalScrap = ((rows as Row[] | null) ?? []).reduce((s, r) => s + Number(r.qty_scrap), 0)

  const csv = [
    `# ITC-04 job-work return — FY ${fy}-${String(fy + 1).slice(-2)} Q${q}`,
    `# Period: ${range.from} to ${range.to}`,
    `# Challans issued in period; cancelled excluded; URP = Unregistered Person`,
    `# Totals: sent ${totalSent} · received ${totalRecvd} · scrap ${totalScrap} (${lines.length} challans)`,
    `# Submit via GSTN portal (Returns → ITC Forms → ITC-04)`,
    '',
    header,
    ...lines,
  ].join('\n') + '\n'

  const filename = `itc04-fy${fy}-q${q}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
