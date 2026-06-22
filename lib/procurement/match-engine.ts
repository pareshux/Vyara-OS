/**
 * 3-way match engine — pure logic, no DB writes.
 *
 * Lives outside lib/actions/* because Next.js requires every export
 * from a 'use server' module to be an async function. These two helpers
 * are pure functions used by both server actions (createVendorBill,
 * server-side match runs) and potentially by future UI components that
 * want to preview a match outcome before submit.
 */

export type LineMatchStatus =
  | 'pending'
  | 'matched'
  | 'qty_over'
  | 'rate_mismatch'
  | 'hsn_mismatch'
  | 'gst_mismatch'
  | 'unlinked'

export type BillMatchStatus = 'pending' | 'matched' | 'under_review' | 'mismatched'

export type LineMatchResult = {
  status: LineMatchStatus
  notes: string | null
}

export type MatchContext = {
  po_line: {
    id: string
    quantity: number
    qty_received: number
    qty_billed: number
    rate: number
    hsn_code: string | null
    gst_rate_pct: number
  } | null
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function r3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/**
 * Match a single vendor bill line against its corresponding PO line.
 *
 * Worst-wins precedence: qty_over → rate_mismatch → gst_mismatch
 * → hsn_mismatch → unlinked → matched.
 */
export function matchBillLine(
  bill: { quantity: number; rate: number; hsn_code: string | null; gst_rate_pct: number },
  ctx: MatchContext,
): LineMatchResult {
  if (!ctx.po_line) {
    return { status: 'unlinked', notes: 'Bill line is not linked to a PO line — bill against a PO for 3-way match.' }
  }
  const po = ctx.po_line

  // 1. Qty over (most severe — caps invoicing at received-minus-billed)
  const billable = r3(Number(po.qty_received) - Number(po.qty_billed))
  if (bill.quantity > billable + 1e-6) {
    return {
      status: 'qty_over',
      notes: `Bill qty ${bill.quantity} exceeds billable headroom ${billable} (received ${po.qty_received} − previously billed ${po.qty_billed}).`,
    }
  }
  // 2. Rate mismatch (strict equality v1; PO amendment is the right path if rate changed)
  if (r2(bill.rate) !== r2(po.rate)) {
    return {
      status: 'rate_mismatch',
      notes: `Bill rate ₹${bill.rate.toFixed(2)} differs from PO rate ₹${po.rate.toFixed(2)} (diff ₹${(bill.rate - po.rate).toFixed(2)}/unit).`,
    }
  }
  // 3. GST rate mismatch
  if (Number(bill.gst_rate_pct) !== Number(po.gst_rate_pct)) {
    return {
      status: 'gst_mismatch',
      notes: `Bill GST ${bill.gst_rate_pct}% differs from PO GST ${po.gst_rate_pct}%.`,
    }
  }
  // 4. HSN mismatch (only when both sides have a value — either-side missing = warn-not-fail)
  if (po.hsn_code && bill.hsn_code && po.hsn_code.trim() !== bill.hsn_code.trim()) {
    return {
      status: 'hsn_mismatch',
      notes: `Bill HSN '${bill.hsn_code}' differs from PO HSN '${po.hsn_code}'.`,
    }
  }
  return { status: 'matched', notes: null }
}

/**
 * Aggregate per-line match outcomes into a bill-level status.
 *   - any hard mismatch (qty/rate/gst/hsn) → 'mismatched'
 *   - else any 'unlinked' → 'under_review'
 *   - else all 'matched' → 'matched'
 *   - else 'pending'
 */
export function aggregateBillMatch(lineStatuses: LineMatchStatus[]): BillMatchStatus {
  if (lineStatuses.length === 0) return 'pending'
  const hard = ['qty_over', 'rate_mismatch', 'gst_mismatch', 'hsn_mismatch']
  if (lineStatuses.some((s) => hard.includes(s))) return 'mismatched'
  if (lineStatuses.some((s) => s === 'unlinked')) return 'under_review'
  if (lineStatuses.every((s) => s === 'matched')) return 'matched'
  return 'pending'
}
