// Capability: Relationship (vendor performance) + Delivery (procurement)
// P6 lite vendor scorecard read-model. Reads the security_invoker view
// vendor_scorecard_v (one row per vendor × FY); aggregates a per-tenant
// snapshot for the /procurement/vendors/scorecards page.

import { createClient } from '@/lib/supabase/server'

export type VendorScorecardRow = {
  vendor_id: string
  vendor_name: string
  msme_status: string | null
  gstin: string | null
  payment_terms_days: number | null
  fy_start_year: number
  po_count: number
  po_value: number
  po_fulfilled: number
  po_cancelled: number
  grn_count: number
  grn_on_time: number
  grn_with_eta: number
  on_time_pct: number | null
  qty_received_total: number
  qty_accepted_total: number
  qty_rejected_total: number
  acceptance_pct: number | null
  bill_count: number
  bill_value: number
  approved_bill_count: number
  approved_bill_value: number
  mismatched_count: number
  outstanding_total: number
  grade: 'A' | 'B' | 'C' | 'unrated'
}

export type VendorScorecardSnapshot = {
  fy_start_year: number
  rows: VendorScorecardRow[]
  totals: {
    vendor_count: number
    total_spend: number
    avg_on_time_pct: number | null
    avg_acceptance_pct: number | null
    grade_a_count: number
    grade_b_count: number
    grade_c_count: number
    msme_vendor_count: number
    msme_vendor_spend: number
  }
}

// Indian FY: Apr-Mar. Today 2026-06-23 lives in FY 2026-27 (fy_start_year=2026).
export function currentFyStartYear(now = new Date()): number {
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  return m >= 4 ? y : y - 1
}

// Grade A = on-time ≥ 90% AND acceptance ≥ 98% AND mismatched 0
// Grade B = on-time ≥ 70% AND acceptance ≥ 95%
// Grade C = anything else (with at least one GRN or bill)
// unrated = no GRN with ETA tracking yet — metric not measurable
function gradeOf(r: Omit<VendorScorecardRow, 'grade'>): VendorScorecardRow['grade'] {
  if (r.grn_with_eta === 0 && r.qty_received_total === 0) return 'unrated'
  const onTime = r.on_time_pct ?? 0
  const accept = r.acceptance_pct ?? 0
  if (onTime >= 90 && accept >= 98 && r.mismatched_count === 0) return 'A'
  if (onTime >= 70 && accept >= 95) return 'B'
  return 'C'
}

export async function getVendorScorecards(
  fyStartYear: number = currentFyStartYear()
): Promise<VendorScorecardSnapshot> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vendor_scorecard_v')
    .select('*')
    .eq('fy_start_year', fyStartYear)
    .order('po_value', { ascending: false })

  if (error) {
    console.error('[vendor-scorecard] view query failed', error)
    return emptySnapshot(fyStartYear)
  }

  const raw = (data ?? []) as Omit<VendorScorecardRow, 'grade'>[]
  const rows: VendorScorecardRow[] = raw.map((r) => ({ ...r, grade: gradeOf(r) }))

  // Aggregates
  let totalSpend = 0
  let onTimeSum = 0
  let onTimeCount = 0
  let acceptSum = 0
  let acceptCount = 0
  let gradeA = 0
  let gradeB = 0
  let gradeC = 0
  let msmeCount = 0
  let msmeSpend = 0

  for (const r of rows) {
    totalSpend += Number(r.approved_bill_value || 0)
    if (r.on_time_pct !== null) {
      onTimeSum += Number(r.on_time_pct)
      onTimeCount += 1
    }
    if (r.acceptance_pct !== null) {
      acceptSum += Number(r.acceptance_pct)
      acceptCount += 1
    }
    if (r.grade === 'A') gradeA += 1
    if (r.grade === 'B') gradeB += 1
    if (r.grade === 'C') gradeC += 1
    if (r.msme_status && r.msme_status !== 'not_msme') {
      msmeCount += 1
      msmeSpend += Number(r.approved_bill_value || 0)
    }
  }

  return {
    fy_start_year: fyStartYear,
    rows,
    totals: {
      vendor_count: rows.length,
      total_spend: totalSpend,
      avg_on_time_pct: onTimeCount > 0 ? Math.round((onTimeSum / onTimeCount) * 10) / 10 : null,
      avg_acceptance_pct: acceptCount > 0 ? Math.round((acceptSum / acceptCount) * 10) / 10 : null,
      grade_a_count: gradeA,
      grade_b_count: gradeB,
      grade_c_count: gradeC,
      msme_vendor_count: msmeCount,
      msme_vendor_spend: msmeSpend,
    },
  }
}

function emptySnapshot(fy: number): VendorScorecardSnapshot {
  return {
    fy_start_year: fy,
    rows: [],
    totals: {
      vendor_count: 0,
      total_spend: 0,
      avg_on_time_pct: null,
      avg_acceptance_pct: null,
      grade_a_count: 0,
      grade_b_count: 0,
      grade_c_count: 0,
      msme_vendor_count: 0,
      msme_vendor_spend: 0,
    },
  }
}
