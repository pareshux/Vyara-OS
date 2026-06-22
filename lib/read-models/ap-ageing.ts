/**
 * AP ageing read-model — Blueprint DEL-019 + FIN-020.
 *
 * Reads vendor_bill_ageing_v (the DB view from migration 0063) and
 * aggregates into the shape the /procurement/ap-ageing page needs:
 *   - totals (outstanding, overdue, mismatched, MSME at-risk)
 *   - 5-bucket rollup (current / 1-30 / 31-60 / 61-90 / 90+)
 *   - top vendors by outstanding ₹ (capped at 10)
 *   - MSME compliance: per-vendor breach + warning lists
 *   - bills array filtered by the requested bucket (or all)
 *
 * Mirrors the read-model pattern used by /collections + Owner Dashboard.
 * One query → in-memory rollups; no per-vendor sub-queries (avoid N+1).
 */
import { createClient } from '@/lib/supabase/server'

export type AgeingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'
export type MsmeFlag = 'not_applicable' | 'unknown' | 'ok' | 'warning' | 'breach'

export type AgeingBillRow = {
  id: string
  bill_number: string
  vendor_invoice_no: string
  vendor_invoice_date: string
  vendor_id: string
  vendor_name: string
  vendor_gstin: string | null
  vendor_msme_status: string | null
  vendor_payment_terms_days: number | null
  po_id: string | null
  bill_date: string
  received_at: string | null
  due_date: string | null
  total: number
  amount_paid: number
  amount_outstanding: number
  status: string
  match_status: string
  days_overdue: number
  days_since_receipt: number | null
  msme_flag: MsmeFlag
  ageing_bucket: AgeingBucket
}

export type ApAgeingTotals = {
  outstanding: number
  overdue: number
  overdue_count: number
  bill_count: number
  msme_breach_count: number
  msme_breach_value: number
  msme_warning_count: number
  msme_warning_value: number
}

export type AgeingBucketSummary = {
  bucket: AgeingBucket
  count: number
  value: number
  pct: number  // share of outstanding
}

export type TopVendor = {
  vendor_id: string
  vendor_name: string
  msme_status: string | null
  bill_count: number
  outstanding: number
  oldest_bill_number: string
  oldest_days_overdue: number
}

export type MsmeCompliance = {
  breach: Array<{
    bill: AgeingBillRow
  }>
  warning: Array<{
    bill: AgeingBillRow
  }>
}

export type ApAgeingOverview = {
  totals: ApAgeingTotals
  buckets: AgeingBucketSummary[]
  top_vendors: TopVendor[]
  msme: MsmeCompliance
  bills: AgeingBillRow[]
}

const BUCKET_ORDER: AgeingBucket[] = ['current', '1-30', '31-60', '61-90', '90+']

function r2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100 }

export async function getApAgeingOverview(filter?: {
  bucket?: AgeingBucket | 'all'
  vendor_id?: string
  msme_flag?: MsmeFlag
}): Promise<ApAgeingOverview> {
  const supabase = await createClient()

  let q = supabase
    .from('vendor_bill_ageing_v')
    .select('*')
    .order('days_overdue', { ascending: false })
    .order('amount_outstanding', { ascending: false })

  if (filter?.bucket && filter.bucket !== 'all') q = q.eq('ageing_bucket', filter.bucket)
  if (filter?.vendor_id) q = q.eq('vendor_id', filter.vendor_id)
  if (filter?.msme_flag) q = q.eq('msme_flag', filter.msme_flag)

  const { data, error } = await q
  if (error || !data) {
    return {
      totals: { outstanding: 0, overdue: 0, overdue_count: 0, bill_count: 0, msme_breach_count: 0, msme_breach_value: 0, msme_warning_count: 0, msme_warning_value: 0 },
      buckets: BUCKET_ORDER.map((b) => ({ bucket: b, count: 0, value: 0, pct: 0 })),
      top_vendors: [],
      msme: { breach: [], warning: [] },
      bills: [],
    }
  }

  const bills = data as AgeingBillRow[]

  // Totals
  const totals: ApAgeingTotals = {
    outstanding: r2(bills.reduce((s, b) => s + Number(b.amount_outstanding || 0), 0)),
    overdue: r2(bills.filter((b) => b.ageing_bucket !== 'current').reduce((s, b) => s + Number(b.amount_outstanding || 0), 0)),
    overdue_count: bills.filter((b) => b.ageing_bucket !== 'current').length,
    bill_count: bills.length,
    msme_breach_count: bills.filter((b) => b.msme_flag === 'breach').length,
    msme_breach_value: r2(bills.filter((b) => b.msme_flag === 'breach').reduce((s, b) => s + Number(b.amount_outstanding || 0), 0)),
    msme_warning_count: bills.filter((b) => b.msme_flag === 'warning').length,
    msme_warning_value: r2(bills.filter((b) => b.msme_flag === 'warning').reduce((s, b) => s + Number(b.amount_outstanding || 0), 0)),
  }

  // Buckets — always compute over the unfiltered universe so the
  // bucket bar shows the full picture (i.e. clicking 1-30 doesn't
  // hide the other 4 buckets from the strip). When a bucket filter
  // is active we re-query just the bills array, but the bucket
  // strip uses the all-buckets aggregate.
  let bucketAggBills: AgeingBillRow[] = bills
  if (filter?.bucket && filter.bucket !== 'all') {
    // Re-query without the bucket filter for the aggregate
    const { data: allData } = await supabase
      .from('vendor_bill_ageing_v')
      .select('id, ageing_bucket, amount_outstanding, vendor_id, vendor_name, msme_status:vendor_msme_status, msme_flag, bill_number, days_overdue')
      .match(
        filter?.vendor_id ? { vendor_id: filter.vendor_id } : {},
      )
    if (allData) bucketAggBills = allData as unknown as AgeingBillRow[]
  }

  const bucketTotalOut = bucketAggBills.reduce((s, b) => s + Number(b.amount_outstanding || 0), 0)
  const buckets: AgeingBucketSummary[] = BUCKET_ORDER.map((bucket) => {
    const rows = bucketAggBills.filter((b) => b.ageing_bucket === bucket)
    const value = r2(rows.reduce((s, b) => s + Number(b.amount_outstanding || 0), 0))
    const count = rows.length
    const pct = bucketTotalOut > 0 ? Math.round((value / bucketTotalOut) * 100) : 0
    return { bucket, count, value, pct }
  })

  // Top vendors (always over the all-buckets aggregate so the user
  // can see who they owe most regardless of which bucket is filtered)
  const byVendor = new Map<string, {
    vendor_id: string
    vendor_name: string
    msme_status: string | null
    bill_count: number
    outstanding: number
    oldest_bill_number: string
    oldest_days_overdue: number
  }>()
  for (const b of bucketAggBills) {
    const key = b.vendor_id
    const cur = byVendor.get(key)
    const out = Number(b.amount_outstanding || 0)
    const dOver = Number(b.days_overdue || 0)
    if (!cur) {
      byVendor.set(key, {
        vendor_id: b.vendor_id,
        vendor_name: b.vendor_name,
        msme_status: b.vendor_msme_status,
        bill_count: 1,
        outstanding: out,
        oldest_bill_number: b.bill_number,
        oldest_days_overdue: dOver,
      })
    } else {
      cur.bill_count += 1
      cur.outstanding += out
      if (dOver > cur.oldest_days_overdue) {
        cur.oldest_days_overdue = dOver
        cur.oldest_bill_number = b.bill_number
      }
    }
  }
  const top_vendors: TopVendor[] = Array.from(byVendor.values())
    .map((v) => ({ ...v, outstanding: r2(v.outstanding) }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 10)

  // MSME compliance — separate breach + warning lists.
  // Sort within each by days_since_receipt DESC so the worst surfaces first.
  // We use the FULL universe (bucketAggBills) so MSME stays visible even
  // when the user filters to a non-MSME bucket.
  const msme: MsmeCompliance = {
    breach: bucketAggBills
      .filter((b) => b.msme_flag === 'breach')
      .sort((a, b) => (b.days_since_receipt ?? 0) - (a.days_since_receipt ?? 0))
      .map((bill) => ({ bill })),
    warning: bucketAggBills
      .filter((b) => b.msme_flag === 'warning')
      .sort((a, b) => (b.days_since_receipt ?? 0) - (a.days_since_receipt ?? 0))
      .map((bill) => ({ bill })),
  }

  return { totals, buckets, top_vendors, msme, bills }
}
