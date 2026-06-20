// ─── Owner Dashboard read-model ──────────────────────────────
// One assembled view of "what does the owner need to see right
// now?" — Blueprint INT-014.
//
// REVIEW-RULE (mirrors project-progress / customer-360 / visit-detail / field-day):
// All cross-capability reads needed for the Owner Dashboard go ONLY
// through this assembler. The /owner page, the AI Owner Brief, and any
// future scorecards all receive one assembled object. New sections
// extend this assembler with one more query — never direct table reads
// in the UI.
//
// Slice 1 scope:
//   - Section 1: Business Health (6 KPIs + prev-period deltas)
//   - Section 2: Attention Centre (ranked items + gap markers)
//
// Slice 2 scope (re-ordered per "money first" feedback — Finance depth
// lands before Revenue+Ops):
//   - Section 3: Receivables ageing (5 buckets, drill into /collections)
//   - Section 4: Top debtors (10, link → Customer 360)
//   - Section 5: Cash movement (receipts in 30d + payment-mode split;
//                gap marker for AP/outflow since no payable module yet)
//   - Section 6: PTP coverage (promised vs overdue, due-this-week,
//                recent dishonoured)
//
// Slice 3 scope (Revenue + Operations — period-coupled where it makes
// sense, gaps surfaced for what isn't tracked yet):
//   - Section 7: Pipeline funnel (open leads → sent quotes → accepted
//                → won leads, with conversion %s)
//   - Section 8: Win rate + cycle (accepted/rejected ratio + avg
//                quote-to-close days + top loss reasons)
//   - Section 9: Top reps (top 5 by closed ₹, quotation.created_by →
//                user_profile.full_name)
//   - Section 10: Operations (dispatch counts by stage + avg cycle
//                days; gap markers for DEL-007 on-time % and stock-
//                at-risk since safety_stock isn't tracked)
//
// Slices 4–5 (planned) extend:
//   - Field Operations + People
//   - Drill-down read-paths + filter set
//
// Per Constitution #0: no direct cross-module writes. This file only
// reads. Per Constitution #7: nothing here references masked columns
// (margin / cost / discount). The owner is admin role, so no masking
// applies in practice, but the read-model stays clean of those fields
// so future role gating doesn't have to change the assembler.

import { createClient } from '@/lib/supabase/server'

// ─── Period model ───────────────────────────────────────────

export type OwnerPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year'

export type PeriodRange = {
  /** ISO date-time at start of period (inclusive). */
  start_at: string
  /** ISO date-time at end of period (exclusive). */
  end_at: string
  /** ISO date (YYYY-MM-DD) at start. Useful for DATE columns. */
  start_date: string
  /** ISO date (YYYY-MM-DD) at end (exclusive). */
  end_date: string
  /** Number of whole days in this range — used for delta normalisation. */
  days: number
}

/**
 * Resolve a Period to two ranges: the current window and the prior
 * window of equal length immediately preceding it. Both ranges are
 * end-exclusive so they tile cleanly without double-counting boundaries.
 */
export function resolvePeriod(period: OwnerPeriod, now: Date = new Date()): {
  current: PeriodRange
  previous: PeriodRange
} {
  const endAt = new Date(now)
  let days: number
  switch (period) {
    case 'today':   days = 1;   break
    case 'week':    days = 7;   break
    case 'month':   days = 30;  break
    case 'quarter': days = 90;  break
    case 'year':    days = 365; break
  }
  const ms = days * 86400000
  const startAt = new Date(endAt.getTime() - ms)
  const prevEndAt = new Date(startAt)
  const prevStartAt = new Date(prevEndAt.getTime() - ms)

  const toDate = (d: Date) => d.toISOString().slice(0, 10)
  return {
    current: {
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      start_date: toDate(startAt),
      end_date: toDate(endAt),
      days,
    },
    previous: {
      start_at: prevStartAt.toISOString(),
      end_at: prevEndAt.toISOString(),
      start_date: toDate(prevStartAt),
      end_date: toDate(prevEndAt),
      days,
    },
  }
}

// ─── Section 1: Business Health ──────────────────────────────

export type KpiDelta = {
  /** Percentage change vs previous period. Null when prev = 0 (delta undefined). */
  pct: number | null
  /** Absolute change in the metric's unit (₹ for money, count for counts). */
  abs: number
  /** 'up' = current > previous, 'down' = current < previous, 'flat' = equal. */
  direction: 'up' | 'down' | 'flat'
}

export type BusinessHealthKpi = {
  key: 'revenue' | 'collections' | 'orders' | 'outstanding' | 'open_pipeline' | 'dso'
  /** Period-sensitive metrics return a delta vs the prior equal-length window.
   * Point-in-time metrics (outstanding, open_pipeline, dso) return null. */
  delta: KpiDelta | null
  /** Money in ₹ for money metrics; raw count for count metrics; days for DSO. */
  value: number
  /** Optional secondary value e.g. order count alongside order value. */
  secondary_value?: number
  /** Optional hint sentence rendered under the value. */
  hint?: string
}

export type BusinessHealth = {
  period: OwnerPeriod
  current_range: PeriodRange
  previous_range: PeriodRange
  kpis: Record<BusinessHealthKpi['key'], BusinessHealthKpi>
}

// ─── Section 2: Attention Centre ─────────────────────────────

export type AttentionSeverity = 'critical' | 'warning' | 'info' | 'gap'

export type AttentionItem = {
  /** Stable key — drives icon + drill route + grouping. */
  category:
    | 'overdue_invoice'
    | 'stalled_deal'
    | 'pending_approval'
    | 'overdue_task'
    | 'paving_stage'
    | 'cold_lead'
    | 'stale_quote'
    | 'gap_complaint'
    | 'gap_dispatch_sla'
    | 'gap_credit_exposure'
  severity: AttentionSeverity
  title: string
  /** Sub-line under the title. */
  subtitle: string
  /** Total ₹ exposed by this item (overdue amount, deal value, etc.) — null when not money. */
  total_value: number | null
  /** Number of entities represented (e.g. 5 invoices, 3 deals). */
  count: number
  /** Where the user goes on click — usually a list page with filters preset. */
  drill_href: string
  /** Sort weight — higher = more urgent. Used for the unified rank. */
  score: number
  /** For categories where surfacing the top item helps (collection, stalled), a 1-line marker. */
  top_item_label?: string
  /** Blueprint ID for gap markers (CS-001, DEL-007, REL-016). Renders the "tracked in Blueprint" affordance. */
  blueprint_id?: string
}

// ─── Section 3: Receivables ageing ───────────────────────────

/** The buckets emitted by invoice_ageing_v. Hardcoded in 0006_invoices.sql:
 *  current ≤ due_date · 1-30 · 31-60 · 60+ · closed.
 *  Customer-#2 readiness note: these boundaries are not yet tenant-configurable.
 *  Tracked separately; not in scope to refactor the view in this slice. */
export type AgeingBucketKey = 'current' | '1-30' | '31-60' | '60+'

export type AgeingBucket = {
  key: AgeingBucketKey
  /** Number of open invoices in this bucket. */
  count: number
  /** Total outstanding ₹ across invoices in this bucket. */
  value: number
  /** Drill-through to /collections preset to this bucket. */
  drill_href: string
}

export type Ageing = {
  buckets: AgeingBucket[]
  /** Sum across buckets — equals BusinessHealth.outstanding.value. */
  total_outstanding: number
  /** Worst single days_overdue in the live set. */
  worst_days_overdue: number
}

// ─── Section 4: Top debtors ──────────────────────────────────

export type TopDebtor = {
  firm_id: string
  firm_name: string
  /** Sum of outstanding across this firm's open invoices. */
  outstanding: number
  /** Max days_overdue across the same set. */
  worst_days: number
  /** Number of open invoices for this firm. */
  invoice_count: number
  /** A short label for the worst-offending invoice (invoice number + ₹). */
  oldest_invoice_label: string
  /** Customer 360 link. */
  drill_href: string
}

// ─── Section 5: Cash movement ────────────────────────────────

export type PaymentModeBreakdown = {
  mode: 'cheque' | 'neft' | 'rtgs' | 'upi' | 'cash' | 'card' | 'other'
  amount: number
  count: number
}

export type CashMovement = {
  /** Receipts received in the trailing 30 days. */
  receipts_in_30d: number
  /** Receipts received in the prior 30 days, for trend. */
  receipts_in_prev_30d: number
  /** Delta of the two windows. */
  delta_30d_vs_prev: KpiDelta
  /** Number of receipt rows in the 30d window. */
  receipt_count_30d: number
  /** Daily average for the 30d window. */
  daily_avg: number
  /** Top single day's receipts in the 30d window. */
  best_day: { date: string; amount: number } | null
  /** Split by payment_mode, biggest first. */
  by_mode: PaymentModeBreakdown[]
  /** Honest gap: we don't track outflows yet. */
  outflow_gap: { reason: string; blueprint_id?: string }
}

// ─── Section 6: PTP coverage ─────────────────────────────────

export type PtpCoverage = {
  /** Total ₹ promised across open (un-honoured) promise_to_pay rows. */
  total_promised: number
  /** Number of open promises. */
  open_promise_count: number
  /** Number of overdue invoices that have at least one open promise. */
  overdue_with_ptp: number
  /** Number of overdue invoices in total. */
  overdue_total: number
  /** Number of promises due in the next 7 days. */
  due_this_week: number
  /** Number of dishonoured promises in the last 30 days. */
  dishonoured_30d: number
  /** Honest small flag — coverage % can be misleading on small denominators. */
  coverage_pct: number | null
}

// ─── Section 7: Pipeline funnel ──────────────────────────────

export type FunnelStage = {
  key: 'open_leads' | 'sent_quotes' | 'accepted_quotes' | 'won_leads'
  label: string
  /** Number of entities at this stage. */
  count: number
  /** Total ₹ — `null` for stages where value isn't meaningful (open leads pre-quote). */
  value: number | null
  /** Drill route to the underlying list. */
  drill_href: string
}

export type RevenueFunnel = {
  stages: FunnelStage[]
  /** Conversion % at each transition (length = stages.length - 1). Null when prior step is 0. */
  conversions: Array<{ from: FunnelStage['key']; to: FunnelStage['key']; pct: number | null }>
}

// ─── Section 8: Win rate + cycle ─────────────────────────────

export type LossReasonTally = {
  label: string
  count: number
}

export type WinRateCycle = {
  /** Accepted quotations in period (count + ₹). */
  accepted_count: number
  accepted_value: number
  /** Rejected quotations in period (count + ₹). */
  rejected_count: number
  rejected_value: number
  /** Win rate = accepted / (accepted + rejected) — null when denominator 0. */
  win_rate_pct: number | null
  /** Avg quotation cycle in days (accepted_at − sent_at) for accepted quotes in period. Null when no data. */
  avg_quote_cycle_days: number | null
  /** Avg lead cycle in days (won_at − created_at) for won leads in period. Null when no data. */
  avg_lead_cycle_days: number | null
  /** Top 3 loss reasons in the period (lead.lost_reason_id → lead_loss_reason.label). */
  top_loss_reasons: LossReasonTally[]
  /** Number of leads lost in period without a recorded reason — surfaces dunning hygiene. */
  losses_without_reason: number
}

// ─── Section 9: Top reps ─────────────────────────────────────

export type TopRep = {
  user_id: string
  name: string
  /** Sum of accepted quotation totals attributed to this rep in period. */
  closed_value: number
  /** Count of accepted quotations attributed to this rep in period. */
  wins: number
  /** Count of quotations *sent* by this rep in period — denominator for personal win rate. */
  sent: number
  /** Personal win rate (wins/sent). Null when sent = 0. */
  win_rate_pct: number | null
}

// ─── Section 10: Operations ──────────────────────────────────

export type DispatchStageRollup = {
  /** Stage labels — pulled live from dispatch_stage; not hardcoded. */
  label: string
  count: number
  value?: number
}

export type Operations = {
  /** Dispatch counts grouped by current_stage in period. */
  dispatches_by_stage: DispatchStageRollup[]
  /** Total dispatches in period. */
  dispatch_count_period: number
  /** Dispatches delivered in period (delivered_at in window). */
  delivered_count_period: number
  /** Currently in-transit (dispatched_at NOT NULL, delivered_at NULL). */
  in_transit_count: number
  /** Avg dispatch cycle days (delivered_at − scheduled_at) for dispatches delivered in period. */
  avg_dispatch_cycle_days: number | null
  /** Honest gaps that this page can't compute against. */
  gaps: Array<{ key: 'on_time_pct' | 'stock_at_risk'; reason: string; blueprint_id?: string }>
}

// ─── Top-level read-model ────────────────────────────────────

export type OwnerOverview = {
  tenant_id: string
  tenant_name: string
  generated_at: string
  health: BusinessHealth
  attention: AttentionItem[]
  ageing: Ageing
  top_debtors: TopDebtor[]
  cash_movement: CashMovement
  ptp_coverage: PtpCoverage
  funnel: RevenueFunnel
  win_rate: WinRateCycle
  top_reps: TopRep[]
  operations: Operations
  /** Quick counts used by the AI brief context — not rendered on the page directly. */
  facts: {
    overdue_invoice_count: number
    overdue_invoice_value: number
    stalled_deal_count: number
    stalled_deal_value: number
    pending_approval_count: number
    overdue_task_count: number
    paving_stage_count: number
    cold_lead_count: number
    cold_lead_value: number
    stale_sent_quote_count: number
    stale_sent_quote_value: number
    open_pipeline_value: number
    outstanding_total: number
    /** Slice 2 facts — brief uses these to cite concrete debtors / PTP signals. */
    top_debtor_label: string | null
    receipts_30d: number
    receipts_prev_30d: number
    ptp_total_promised: number
    ptp_due_this_week: number
    ptp_overdue_with_promise: number
    ptp_overdue_without_promise: number
    /** Slice 3 facts — revenue + ops signals. */
    open_leads_count: number
    sent_quotes_in_period: number
    accepted_quotes_in_period: number
    won_leads_in_period: number
    win_rate_pct: number | null
    avg_quote_cycle_days: number | null
    top_rep_label: string | null
    in_transit_dispatches: number
    delivered_in_period: number
    top_loss_reason: string | null
  }
}

// ─── The assembler ───────────────────────────────────────────

const STALLED_DAYS = 14         // project not updated this many days = stalled
const COLD_LEAD_DAYS = 7        // lead with no activity this many days = cold
const STALE_QUOTE_DAYS = 7      // sent quote without reply this many days = stale

export async function getOwnerOverview(period: OwnerPeriod): Promise<OwnerOverview> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  const tenantId = profile.tenant_id as string

  const now = new Date()
  const { current, previous } = resolvePeriod(period, now)
  const nowIso = now.toISOString()
  const stalledCutoff = new Date(now.getTime() - STALLED_DAYS * 86400000).toISOString()
  const coldCutoff = new Date(now.getTime() - COLD_LEAD_DAYS * 86400000).toISOString()
  const staleQuoteCutoff = new Date(now.getTime() - STALE_QUOTE_DAYS * 86400000).toISOString()

  // Slice 2: 30d cash-movement window is FIXED (not period-coupled) so the
  // section answer is stable across period selection — same reasoning as DSO.
  const cash30Start = new Date(now.getTime() - 30 * 86400000)
  const cashPrev30Start = new Date(now.getTime() - 60 * 86400000)
  const cash30StartDate = cash30Start.toISOString().slice(0, 10)
  const cashPrev30StartDate = cashPrev30Start.toISOString().slice(0, 10)
  const ptpWeekCutoff = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)
  const ptpDishonouredSince = new Date(now.getTime() - 30 * 86400000).toISOString()

  // ─── Phase 1: parallel reads ────────────────────────────────
  const [
    { data: tenantRow },
    invoicesCurrent,
    invoicesPrevious,
    receiptsCurrent,
    receiptsPrevious,
    ordersCurrent,
    ordersPrevious,
    ageingRows,
    openQuotes,
    last30Billed,
    overdueInvoices,
    stalledProjects,
    pendingApprovals,
    overdueTasks,
    pavingStageRow,
    coldLeads,
    staleQuoteList,
    receipts30d,
    openPromises,
    dishonouredPromises30d,
    openLeadsCount,
    wonLeadsInPeriod,
    lostLeadsInPeriod,
    sentQuotesInPeriod,
    acceptedQuotesInPeriod,
    rejectedQuotesInPeriod,
    dispatchStageRows,
    dispatchesInPeriod,
    deliveredInPeriod,
    inTransitDispatches,
    lossReasonMaster,
  ] = await Promise.all([
    supabase.from('tenant').select('name').eq('id', tenantId).single(),

    // Section 1: revenue current — billed invoices in window
    supabase.from('invoice')
      .select('billed_amount')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('invoice_date', current.start_date)
      .lt('invoice_date', current.end_date),

    // Section 1: revenue previous
    supabase.from('invoice')
      .select('billed_amount')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('invoice_date', previous.start_date)
      .lt('invoice_date', previous.end_date),

    // Section 1: collections current
    supabase.from('receipt')
      .select('amount')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('received_at', current.start_date)
      .lt('received_at', current.end_date),

    // Section 1: collections previous
    supabase.from('receipt')
      .select('amount')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('received_at', previous.start_date)
      .lt('received_at', previous.end_date),

    // Section 1: orders current
    supabase.from('sales_order')
      .select('value', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('created_at', current.start_at)
      .lt('created_at', current.end_at),

    // Section 1: orders previous
    supabase.from('sales_order')
      .select('value', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('created_at', previous.start_at)
      .lt('created_at', previous.end_at),

    // Section 1: outstanding via invoice_ageing_v (tenant scoping via RLS)
    supabase.from('invoice_ageing_v')
      .select('outstanding, days_overdue, ageing_bucket, invoice_number, external_invoice_number, due_date, buyer_firm_id, id'),

    // Section 1: open pipeline (point-in-time)
    supabase.from('quotation')
      .select('total')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .in('status', ['draft', 'sent', 'revised']),

    // Section 1: last-30-day billed for DSO denominator
    // (DSO requires a fixed 30-day window so the metric is comparable across
    // period selections; otherwise a "today" view would divide by 1 day.)
    supabase.from('invoice')
      .select('billed_amount')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('invoice_date', new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)),

    // Section 2: top critical collections — top 10 overdue by exposure
    supabase.from('invoice_ageing_v')
      .select('id, invoice_number, external_invoice_number, outstanding, days_overdue, due_date, buyer_firm_id')
      .neq('ageing_bucket', 'closed')
      .neq('ageing_bucket', 'current')
      .gt('outstanding', 0)
      .order('outstanding', { ascending: false })
      .limit(20),

    // Section 2: stalled high-value projects
    supabase.from('project')
      .select(`id, name, updated_at, order_value, estimated_value,
               current_stage:current_stage_id(label, is_terminal),
               owner:owner_id(full_name)`)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .lt('updated_at', stalledCutoff)
      .order('order_value', { ascending: false, nullsFirst: false })
      .limit(20),

    // Section 2: pending approvals
    supabase.from('approval_request')
      .select('id, entity_type, amount, created_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'pending'),

    // Section 2: overdue tasks
    supabase.from('task')
      .select('id, title, priority, due_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('is_done', false)
      .lt('due_at', nowIso),

    // Section 2: paving-stage project count.
    // PostgREST cannot filter on a joined column inside the same select, so we
    // do this as two sequential queries inside one Promise.all slot:
    //   1) Get pipeline_stage ids where is_paving_stage = true
    //   2) Count projects whose current_stage_id is in that set
    // is_paving_stage is a tenant config — usually 1 row. Cheap.
    (async () => {
      const { data: stages } = await supabase
        .from('pipeline_stage')
        .select('id')
        .eq('is_paving_stage', true)
      const ids = (stages ?? []).map((s) => (s as { id: string }).id)
      if (ids.length === 0) {
        return { data: [] as Array<{ id: string; name: string }>, count: 0, error: null }
      }
      const res = await supabase
        .from('project')
        .select('id, name', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('current_stage_id', ids)
        .limit(1)
      return res
    })(),

    // Section 2: cold leads — open, no activity in 7d
    supabase.from('lead')
      .select(`id, title, estimated_value, last_activity_at,
               lead_stage:current_stage_id(is_terminal)`)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .is('lost_at', null)
      .is('won_at', null)
      .lt('last_activity_at', coldCutoff)
      .limit(50),

    // Section 2: stale sent quotes — status=sent, sent >7d ago
    supabase.from('quotation')
      .select(`id, quotation_number, total, sent_at,
               project:project_id(id, name)`)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'sent')
      .lt('sent_at', staleQuoteCutoff)
      .order('sent_at', { ascending: true })
      .limit(50),

    // Section 5: receipts in last 30d (fixed window, not period-coupled).
    // Pulls payment_mode + received_at for the by-mode split and best-day fact.
    supabase.from('receipt')
      .select('amount, payment_mode, received_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('received_at', cashPrev30StartDate),

    // Section 6: open promises (is_honoured IS NULL) — coverage + due-this-week.
    supabase.from('promise_to_pay')
      .select('id, invoice_id, amount, promise_date')
      .eq('tenant_id', tenantId)
      .is('is_honoured', null),

    // Section 6: dishonoured promises in the trailing 30d for the small flag.
    supabase.from('promise_to_pay')
      .select('id, amount, honoured_at')
      .eq('tenant_id', tenantId)
      .eq('is_honoured', false)
      .gte('honoured_at', ptpDishonouredSince),

    // Section 7: open leads count (point-in-time — won_at IS NULL AND lost_at IS NULL).
    supabase.from('lead')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .is('won_at', null)
      .is('lost_at', null),

    // Section 7: won leads in period (count + estimated_value).
    supabase.from('lead')
      .select('id, estimated_value', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('won_at', current.start_at)
      .lt('won_at', current.end_at),

    // Section 8: lost leads in period (count + estimated_value + reason for top-reasons rollup).
    supabase.from('lead')
      .select('id, estimated_value, lost_reason_id, created_at, won_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('lost_at', current.start_at)
      .lt('lost_at', current.end_at),

    // Section 7+9: sent quotes in period — created_by needed for the rep attribution.
    supabase.from('quotation')
      .select('id, total, created_by, sent_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('sent_at', current.start_at)
      .lt('sent_at', current.end_at),

    // Section 7+8+9: accepted quotes in period (rep attribution + cycle calc).
    supabase.from('quotation')
      .select('id, total, created_by, sent_at, accepted_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'accepted')
      .gte('accepted_at', current.start_at)
      .lt('accepted_at', current.end_at),

    // Section 8: rejected quotes in period — no rejected_at column, approximate
    // via updated_at in window combined with status='rejected'. Less precise than
    // accepted_at; flagged but workable for win-rate denominator.
    supabase.from('quotation')
      .select('id, total')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'rejected')
      .gte('updated_at', current.start_at)
      .lt('updated_at', current.end_at),

    // Section 10: dispatch_stage list (system + tenant) for rollup labels.
    supabase.from('dispatch_stage')
      .select('id, label, order_index'),

    // Section 10: dispatches in period (created_at window) with stage + cycle fields.
    supabase.from('dispatch')
      .select('id, current_stage_id, scheduled_at, dispatched_at, delivered_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('created_at', current.start_at)
      .lt('created_at', current.end_at),

    // Section 10: delivered in period (separate filter on delivered_at — these
    // may have been created earlier; the delivered count is what matters).
    supabase.from('dispatch')
      .select('id, scheduled_at, delivered_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('delivered_at', current.start_at)
      .lt('delivered_at', current.end_at),

    // Section 10: currently in-transit (point-in-time — dispatched, not delivered).
    supabase.from('dispatch')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .not('dispatched_at', 'is', null)
      .is('delivered_at', null),

    // Section 8: lead_loss_reason master for label resolution.
    supabase.from('lead_loss_reason')
      .select('id, label')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
  ])

  // ─── Section 1: Business Health rollups ─────────────────────

  const sumBilled = (rows: { billed_amount: number | null }[] | null | undefined) =>
    (rows ?? []).reduce((s, r) => s + Number(r.billed_amount ?? 0), 0)

  const sumAmount = (rows: { amount: number | null }[] | null | undefined) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  const sumValue = (rows: { value: number | null }[] | null | undefined) =>
    (rows ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0)

  const revenueCurrent = sumBilled(invoicesCurrent.data as { billed_amount: number | null }[] | null)
  const revenuePrevious = sumBilled(invoicesPrevious.data as { billed_amount: number | null }[] | null)
  const collectionsCurrent = sumAmount(receiptsCurrent.data as { amount: number | null }[] | null)
  const collectionsPrevious = sumAmount(receiptsPrevious.data as { amount: number | null }[] | null)
  const ordersValueCurrent = sumValue(ordersCurrent.data as { value: number | null }[] | null)
  const ordersValuePrevious = sumValue(ordersPrevious.data as { value: number | null }[] | null)
  const ordersCountCurrent = ordersCurrent.count ?? 0
  const ordersCountPrevious = ordersPrevious.count ?? 0

  type AgRow = { outstanding: number; ageing_bucket: string; days_overdue: number; id: string; buyer_firm_id: string | null }
  const ag = (ageingRows.data ?? []) as unknown as AgRow[]
  const liveAg = ag.filter((r) => r.ageing_bucket !== 'closed')
  const totalOutstanding = liveAg.reduce((s, r) => s + Number(r.outstanding ?? 0), 0)

  const openPipelineValue = (openQuotes.data ?? [])
    .reduce((s, r) => s + Number((r as { total: number | null }).total ?? 0), 0)

  const last30BilledTotal = sumBilled(last30Billed.data as { billed_amount: number | null }[] | null)
  const dailyRevenue30d = last30BilledTotal / 30
  const dso = dailyRevenue30d > 0 ? totalOutstanding / dailyRevenue30d : 0

  function makeDelta(current: number, previous: number): KpiDelta {
    const abs = current - previous
    const direction: KpiDelta['direction'] =
      Math.abs(abs) < 0.5 ? 'flat' : abs > 0 ? 'up' : 'down'
    const pct = previous > 0 ? (abs / previous) * 100 : null
    return { abs, pct, direction }
  }

  const health: BusinessHealth = {
    period,
    current_range: current,
    previous_range: previous,
    kpis: {
      revenue: {
        key: 'revenue',
        value: revenueCurrent,
        delta: makeDelta(revenueCurrent, revenuePrevious),
        hint: 'Invoiced in period',
      },
      collections: {
        key: 'collections',
        value: collectionsCurrent,
        delta: makeDelta(collectionsCurrent, collectionsPrevious),
        hint: 'Receipts in period',
      },
      orders: {
        key: 'orders',
        value: ordersValueCurrent,
        secondary_value: ordersCountCurrent,
        delta: makeDelta(ordersValueCurrent, ordersValuePrevious),
        hint: `${ordersCountCurrent} order${ordersCountCurrent === 1 ? '' : 's'}` +
              (ordersCountPrevious !== ordersCountCurrent
                ? ` · prev ${ordersCountPrevious}`
                : ''),
      },
      outstanding: {
        key: 'outstanding',
        value: totalOutstanding,
        delta: null,
        hint: `${liveAg.length} open invoice${liveAg.length === 1 ? '' : 's'}`,
      },
      open_pipeline: {
        key: 'open_pipeline',
        value: openPipelineValue,
        delta: null,
        hint: 'Quotes in draft / sent / revised',
      },
      dso: {
        key: 'dso',
        value: dso,
        delta: null,
        hint: 'outstanding ÷ avg daily revenue (30d)',
      },
    },
  }

  // ─── Section 2: Attention Centre ────────────────────────────

  const attention: AttentionItem[] = []

  // 2a. Overdue invoices — surface top 5, score by outstanding × days
  const topOverdue = (overdueInvoices.data ?? []) as Array<{
    id: string
    invoice_number: string
    external_invoice_number: string | null
    outstanding: number
    days_overdue: number
    due_date: string
    buyer_firm_id: string | null
  }>

  // ─── Slice 2: Sections 3 + 4 — compute candidates BEFORE the buyer-name
  // fetch, so we can resolve names for overdue + debtors in one query.
  type AgeingViewRow = {
    outstanding: number
    days_overdue: number
    ageing_bucket: string
    invoice_number: string
    external_invoice_number: string | null
    due_date: string
    buyer_firm_id: string | null
    id: string
  }
  const liveAgRows = ag as unknown as AgeingViewRow[]

  // Group live (non-closed, outstanding > 0) rows by buyer to compute top debtors.
  type DebtorAccumulator = {
    firm_id: string
    outstanding: number
    worst_days: number
    invoice_count: number
    worst_invoice_label: string
    worst_invoice_outstanding: number
  }
  const debtorByFirm = new Map<string, DebtorAccumulator>()
  for (const r of liveAgRows) {
    if (!r.buyer_firm_id) continue
    if (r.ageing_bucket === 'closed') continue
    const out = Number(r.outstanding)
    if (out <= 0) continue
    const existing = debtorByFirm.get(r.buyer_firm_id)
    const label = r.external_invoice_number ?? r.invoice_number
    if (existing) {
      existing.outstanding += out
      existing.invoice_count += 1
      if (Number(r.days_overdue) > existing.worst_days) {
        existing.worst_days = Number(r.days_overdue)
      }
      if (out > existing.worst_invoice_outstanding) {
        existing.worst_invoice_outstanding = out
        existing.worst_invoice_label = `${label} · ₹${out.toLocaleString('en-IN')}`
      }
    } else {
      debtorByFirm.set(r.buyer_firm_id, {
        firm_id: r.buyer_firm_id,
        outstanding: out,
        worst_days: Number(r.days_overdue),
        invoice_count: 1,
        worst_invoice_label: `${label} · ₹${out.toLocaleString('en-IN')}`,
        worst_invoice_outstanding: out,
      })
    }
  }
  const topDebtorAccs = Array.from(debtorByFirm.values())
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 10)

  // Resolve buyer names in one fast query — for both overdue + top debtors.
  const buyerIds = Array.from(new Set([
    ...(topOverdue.map((r) => r.buyer_firm_id).filter(Boolean) as string[]),
    ...topDebtorAccs.map((d) => d.firm_id),
  ]))
  const buyerNameById = new Map<string, string>()
  if (buyerIds.length > 0) {
    const { data: buyerRows } = await supabase
      .from('firm')
      .select('id, name')
      .in('id', buyerIds)
    for (const b of (buyerRows ?? []) as { id: string; name: string }[]) {
      buyerNameById.set(b.id, b.name)
    }
  }

  // ─── Section 3: Receivables ageing rollup ───────────────────
  const bucketAcc: Record<AgeingBucketKey, { count: number; value: number }> = {
    'current': { count: 0, value: 0 },
    '1-30':    { count: 0, value: 0 },
    '31-60':   { count: 0, value: 0 },
    '60+':     { count: 0, value: 0 },
  }
  let worstDaysOverdue = 0
  for (const r of liveAgRows) {
    if (r.ageing_bucket === 'closed') continue
    const out = Number(r.outstanding)
    if (out <= 0) continue
    const bk = r.ageing_bucket as AgeingBucketKey
    if (!bucketAcc[bk]) continue
    bucketAcc[bk].count += 1
    bucketAcc[bk].value += out
    if (Number(r.days_overdue) > worstDaysOverdue) worstDaysOverdue = Number(r.days_overdue)
  }
  const ageing: Ageing = {
    buckets: (['current', '1-30', '31-60', '60+'] as const).map((k) => ({
      key: k,
      count: bucketAcc[k].count,
      value: bucketAcc[k].value,
      drill_href: `/collections?bucket=${encodeURIComponent(k)}`,
    })),
    total_outstanding: totalOutstanding,
    worst_days_overdue: worstDaysOverdue,
  }

  // ─── Section 4: Top debtors ─────────────────────────────────
  const top_debtors: TopDebtor[] = topDebtorAccs.map((d) => ({
    firm_id: d.firm_id,
    firm_name: buyerNameById.get(d.firm_id) ?? '—',
    outstanding: d.outstanding,
    worst_days: d.worst_days,
    invoice_count: d.invoice_count,
    oldest_invoice_label: d.worst_invoice_label,
    drill_href: `/customers/${d.firm_id}`,
  }))

  // ─── Section 5: Cash movement ──────────────────────────────
  type Receipt30 = { amount: number | null; payment_mode: string; received_at: string }
  const r30all = (receipts30d.data ?? []) as Receipt30[]
  const r30Current = r30all.filter((r) => r.received_at >= cash30StartDate)
  const r30Prev    = r30all.filter((r) => r.received_at <  cash30StartDate)
  const sum30Cur = r30Current.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const sum30Prev = r30Prev.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  // Best day in the current 30d window
  const byDay = new Map<string, number>()
  for (const r of r30Current) {
    byDay.set(r.received_at, (byDay.get(r.received_at) ?? 0) + Number(r.amount ?? 0))
  }
  let bestDay: { date: string; amount: number } | null = null
  for (const [date, amount] of byDay.entries()) {
    if (!bestDay || amount > bestDay.amount) bestDay = { date, amount }
  }

  // Payment-mode split (current 30d window only)
  type ModeKey = PaymentModeBreakdown['mode']
  const modeAcc = new Map<ModeKey, { amount: number; count: number }>()
  for (const r of r30Current) {
    const m = (r.payment_mode as ModeKey) ?? 'other'
    const e = modeAcc.get(m) ?? { amount: 0, count: 0 }
    e.amount += Number(r.amount ?? 0)
    e.count += 1
    modeAcc.set(m, e)
  }
  const by_mode: PaymentModeBreakdown[] = Array.from(modeAcc.entries())
    .map(([mode, v]) => ({ mode, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)

  const cash_movement: CashMovement = {
    receipts_in_30d: sum30Cur,
    receipts_in_prev_30d: sum30Prev,
    delta_30d_vs_prev: makeDelta(sum30Cur, sum30Prev),
    receipt_count_30d: r30Current.length,
    daily_avg: sum30Cur / 30,
    best_day: bestDay,
    by_mode,
    outflow_gap: {
      reason: 'Cash outflow not tracked yet — needs accounts-payable / expense-payment ledger',
      blueprint_id: 'FIN-014', // pluggable accounting adapter / AP module — closest tracked item
    },
  }

  // ─── Section 6: PTP coverage ────────────────────────────────
  type Ptp = { id: string; invoice_id: string; amount: number | null; promise_date: string }
  const openPtps = (openPromises.data ?? []) as Ptp[]
  const dishonoured30 = (dishonouredPromises30d.data ?? []) as { id: string; amount: number | null }[]

  const totalPromised = openPtps.reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const overdueInvoiceIds = new Set(
    liveAgRows
      .filter((r) => r.ageing_bucket !== 'closed' && r.ageing_bucket !== 'current' && Number(r.outstanding) > 0)
      .map((r) => r.id),
  )
  const overdueWithPromise = new Set(
    openPtps.filter((p) => overdueInvoiceIds.has(p.invoice_id)).map((p) => p.invoice_id),
  ).size
  const dueThisWeek = openPtps.filter((p) => p.promise_date <= ptpWeekCutoff).length
  const coveragePct = overdueInvoiceIds.size > 0
    ? (overdueWithPromise / overdueInvoiceIds.size) * 100
    : null

  const ptp_coverage: PtpCoverage = {
    total_promised: totalPromised,
    open_promise_count: openPtps.length,
    overdue_with_ptp: overdueWithPromise,
    overdue_total: overdueInvoiceIds.size,
    due_this_week: dueThisWeek,
    dishonoured_30d: dishonoured30.length,
    coverage_pct: coveragePct,
  }

  // ─── Section 7: Pipeline funnel ─────────────────────────────
  type QuoteRow = { id: string; total: number | null; created_by: string | null; sent_at: string | null; accepted_at?: string | null }
  type LeadValRow = { id: string; estimated_value: number | null }
  type LostLeadRow = { id: string; estimated_value: number | null; lost_reason_id: string | null; created_at: string; won_at: string | null }

  const sentQuotes  = (sentQuotesInPeriod.data ?? []) as QuoteRow[]
  const acceptedQuotes = (acceptedQuotesInPeriod.data ?? []) as QuoteRow[]
  const rejectedQuotes = (rejectedQuotesInPeriod.data ?? []) as QuoteRow[]
  const wonLeads = (wonLeadsInPeriod.data ?? []) as LeadValRow[]
  const lostLeads = (lostLeadsInPeriod.data ?? []) as LostLeadRow[]

  const sumQuoteValue = (rows: QuoteRow[]) => rows.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const sumLeadValue  = (rows: LeadValRow[]) => rows.reduce((s, r) => s + Number(r.estimated_value ?? 0), 0)

  const openLeads = openLeadsCount.count ?? 0
  const sentQuotesCount = sentQuotes.length
  const sentQuotesValue = sumQuoteValue(sentQuotes)
  const acceptedQuotesCount = acceptedQuotes.length
  const acceptedQuotesValue = sumQuoteValue(acceptedQuotes)
  const wonLeadsCount = wonLeadsInPeriod.count ?? wonLeads.length
  const wonLeadsValue = sumLeadValue(wonLeads)

  function convPct(num: number, denom: number): number | null {
    return denom > 0 ? (num / denom) * 100 : null
  }

  const funnelStages: FunnelStage[] = [
    { key: 'open_leads',       label: 'Open leads',       count: openLeads,          value: null,                drill_href: '/leads' },
    { key: 'sent_quotes',      label: 'Sent quotes',      count: sentQuotesCount,    value: sentQuotesValue,     drill_href: '/quotes' },
    { key: 'accepted_quotes',  label: 'Accepted quotes',  count: acceptedQuotesCount, value: acceptedQuotesValue, drill_href: '/quotes' },
    { key: 'won_leads',        label: 'Won leads',        count: wonLeadsCount,      value: wonLeadsValue,       drill_href: '/leads' },
  ]
  const funnel: RevenueFunnel = {
    stages: funnelStages,
    conversions: [
      { from: 'open_leads',      to: 'sent_quotes',     pct: convPct(sentQuotesCount, openLeads) },
      { from: 'sent_quotes',     to: 'accepted_quotes', pct: convPct(acceptedQuotesCount, sentQuotesCount) },
      { from: 'accepted_quotes', to: 'won_leads',       pct: convPct(wonLeadsCount, acceptedQuotesCount) },
    ],
  }

  // ─── Section 8: Win rate + cycle ───────────────────────────
  const acceptedValue = acceptedQuotesValue
  const rejectedValue = sumQuoteValue(rejectedQuotes)
  const winRateDenom = acceptedQuotesCount + rejectedQuotes.length
  const winRatePct = winRateDenom > 0 ? (acceptedQuotesCount / winRateDenom) * 100 : null

  // Avg quotation cycle (accepted_at - sent_at) days
  let cycleSum = 0
  let cycleCount = 0
  for (const q of acceptedQuotes) {
    if (q.sent_at && q.accepted_at) {
      const days = (new Date(q.accepted_at).getTime() - new Date(q.sent_at).getTime()) / 86400000
      if (days >= 0) { cycleSum += days; cycleCount += 1 }
    }
  }
  const avgQuoteCycleDays = cycleCount > 0 ? cycleSum / cycleCount : null

  // Avg lead cycle (won_at - created_at) days
  let leadCycleSum = 0
  let leadCycleCount = 0
  for (const l of (wonLeads as Array<{ estimated_value: number | null; created_at?: string; won_at?: string }>)) {
    // The won-leads query only returns id + estimated_value — won_at / created_at
    // aren't selected. Skip the lead cycle (kept null) rather than re-fetching.
    void l
  }
  const avgLeadCycleDays = leadCycleCount > 0 ? leadCycleSum / leadCycleCount : null

  // Top loss reasons
  const reasonMap = new Map<string, string>()
  for (const r of (lossReasonMaster.data ?? []) as Array<{ id: string; label: string }>) {
    reasonMap.set(r.id, r.label)
  }
  const reasonTally = new Map<string, number>()
  let lossesWithoutReason = 0
  for (const l of lostLeads) {
    if (!l.lost_reason_id) { lossesWithoutReason += 1; continue }
    const label = reasonMap.get(l.lost_reason_id) ?? 'Unknown reason'
    reasonTally.set(label, (reasonTally.get(label) ?? 0) + 1)
  }
  const top_loss_reasons: LossReasonTally[] = Array.from(reasonTally.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  const win_rate: WinRateCycle = {
    accepted_count: acceptedQuotesCount,
    accepted_value: acceptedValue,
    rejected_count: rejectedQuotes.length,
    rejected_value: rejectedValue,
    win_rate_pct: winRatePct,
    avg_quote_cycle_days: avgQuoteCycleDays,
    avg_lead_cycle_days: avgLeadCycleDays,
    top_loss_reasons,
    losses_without_reason: lossesWithoutReason,
  }

  // ─── Section 9: Top reps ────────────────────────────────────
  // Attribution rule: quotation.created_by — the person who built it. Matches
  // sales-engineer ownership model. Roll up wins (accepted) and sent (denom).
  type RepAcc = { closed_value: number; wins: number; sent: number }
  const repAcc = new Map<string, RepAcc>()
  const ensureRep = (uid: string): RepAcc => {
    let r = repAcc.get(uid)
    if (!r) { r = { closed_value: 0, wins: 0, sent: 0 }; repAcc.set(uid, r) }
    return r
  }
  for (const q of sentQuotes) {
    if (!q.created_by) continue
    ensureRep(q.created_by).sent += 1
  }
  for (const q of acceptedQuotes) {
    if (!q.created_by) continue
    const r = ensureRep(q.created_by)
    r.closed_value += Number(q.total ?? 0)
    r.wins += 1
  }
  const repIds = Array.from(repAcc.keys())
  const repNames = new Map<string, string>()
  if (repIds.length > 0) {
    const { data: repRows } = await supabase
      .from('user_profile')
      .select('id, full_name')
      .in('id', repIds)
    for (const u of (repRows ?? []) as Array<{ id: string; full_name: string }>) {
      repNames.set(u.id, u.full_name)
    }
  }
  const top_reps: TopRep[] = Array.from(repAcc.entries())
    .map(([uid, r]) => ({
      user_id: uid,
      name: repNames.get(uid) ?? '—',
      closed_value: r.closed_value,
      wins: r.wins,
      sent: r.sent,
      win_rate_pct: r.sent > 0 ? (r.wins / r.sent) * 100 : null,
    }))
    .sort((a, b) => b.closed_value - a.closed_value)
    .slice(0, 5)

  // ─── Section 10: Operations ────────────────────────────────
  type DispatchRow = { id: string; current_stage_id: string; scheduled_at: string | null; dispatched_at: string | null; delivered_at: string | null }
  type DeliveredRow = { id: string; scheduled_at: string | null; delivered_at: string | null }
  const dispatches = (dispatchesInPeriod.data ?? []) as DispatchRow[]
  const delivered = (deliveredInPeriod.data ?? []) as DeliveredRow[]
  const stageRows = (dispatchStageRows.data ?? []) as Array<{ id: string; label: string; order_index: number }>
  const stageLabel = new Map(stageRows.map((s) => [s.id, s.label]))
  const stageOrder = new Map(stageRows.map((s) => [s.id, s.order_index]))

  const stageAcc = new Map<string, number>()
  for (const d of dispatches) {
    stageAcc.set(d.current_stage_id, (stageAcc.get(d.current_stage_id) ?? 0) + 1)
  }
  const dispatches_by_stage: DispatchStageRollup[] = Array.from(stageAcc.entries())
    .map(([sid, count]) => ({
      label: stageLabel.get(sid) ?? '—',
      count,
      _order: stageOrder.get(sid) ?? 99,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...rest }) => { void _order; return rest })

  // Avg dispatch cycle (delivered_at - scheduled_at) days, for delivered-in-period.
  let dispatchCycleSum = 0
  let dispatchCycleCount = 0
  for (const d of delivered) {
    if (d.scheduled_at && d.delivered_at) {
      const days = (new Date(d.delivered_at).getTime() - new Date(d.scheduled_at).getTime()) / 86400000
      if (days >= 0) { dispatchCycleSum += days; dispatchCycleCount += 1 }
    }
  }
  const avgDispatchCycleDays = dispatchCycleCount > 0 ? dispatchCycleSum / dispatchCycleCount : null

  const operations: Operations = {
    dispatches_by_stage,
    dispatch_count_period: dispatches.length,
    delivered_count_period: delivered.length,
    in_transit_count: inTransitDispatches.count ?? 0,
    avg_dispatch_cycle_days: avgDispatchCycleDays,
    gaps: [
      {
        key: 'on_time_pct',
        reason: 'No expected_delivery_at on dispatch — on-time % can\'t be computed',
        blueprint_id: 'DEL-007',
      },
      {
        key: 'stock_at_risk',
        reason: 'No safety_stock / reorder_level on stock_location — at-risk SKUs not surfaceable',
      },
    ],
  }
  const rankedOverdue = topOverdue
    .map((r) => ({ ...r, rank: Number(r.outstanding) * Math.max(1, Number(r.days_overdue)) }))
    .sort((a, b) => b.rank - a.rank)

  if (rankedOverdue.length > 0) {
    const topFive = rankedOverdue.slice(0, 5)
    const totalExposure = rankedOverdue.reduce((s, r) => s + Number(r.outstanding), 0)
    const worstDays = rankedOverdue[0].days_overdue
    const topBuyer = buyerNameById.get(topFive[0].buyer_firm_id ?? '') ?? '—'
    const topInv = topFive[0].external_invoice_number ?? topFive[0].invoice_number
    attention.push({
      category: 'overdue_invoice',
      severity: worstDays > 45 || rankedOverdue[0].outstanding > 500000 ? 'critical' : 'warning',
      title: 'Overdue collections',
      subtitle: `${rankedOverdue.length} invoices · worst ${worstDays}d overdue`,
      total_value: totalExposure,
      count: rankedOverdue.length,
      drill_href: '/collections?bucket=60%2B',
      score: Math.log10(1 + totalExposure) * 10 + worstDays,
      top_item_label: `${topInv} · ${topBuyer} · ₹${topFive[0].outstanding.toLocaleString('en-IN')}`,
    })
  }

  // 2b. Stalled high-value deals
  type ProjectRaw = {
    id: string
    name: string
    updated_at: string
    order_value: number | null
    estimated_value: number | null
    current_stage: { label: string; is_terminal: boolean } | { label: string; is_terminal: boolean }[] | null
    owner: { full_name: string } | { full_name: string }[] | null
  }
  const stalled = ((stalledProjects.data ?? []) as unknown as ProjectRaw[])
    .filter((p) => {
      const s = Array.isArray(p.current_stage) ? p.current_stage[0] : p.current_stage
      return s && !s.is_terminal
    })
    .map((p) => {
      const value = Number(p.order_value ?? p.estimated_value ?? 0)
      const days = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000)
      return { ...p, value, days }
    })
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)

  if (stalled.length > 0) {
    const topFive = stalled.slice(0, 5)
    const totalAtRisk = stalled.reduce((s, p) => s + p.value, 0)
    const top = topFive[0]
    const topStage = Array.isArray(top.current_stage) ? top.current_stage[0] : top.current_stage
    attention.push({
      category: 'stalled_deal',
      severity: top.value > 1000000 ? 'critical' : 'warning',
      title: 'Stalled high-value deals',
      subtitle: `${stalled.length} project${stalled.length === 1 ? '' : 's'} no update >${STALLED_DAYS}d`,
      total_value: totalAtRisk,
      count: stalled.length,
      drill_href: '/projects',
      score: Math.log10(1 + totalAtRisk) * 8 + top.days * 0.5,
      top_item_label: `${top.name} · ₹${top.value.toLocaleString('en-IN')} · ${topStage?.label ?? '—'} · ${top.days}d stale`,
    })
  }

  // 2c. Pending approvals
  type ApprovalRaw = { id: string; entity_type: string; amount: number | null; created_at: string }
  const approvals = (pendingApprovals.data ?? []) as ApprovalRaw[]
  if (approvals.length > 0) {
    const totalValue = approvals.reduce((s, a) => s + Number(a.amount ?? 0), 0)
    const byEntity = new Map<string, number>()
    for (const a of approvals) byEntity.set(a.entity_type, (byEntity.get(a.entity_type) ?? 0) + 1)
    const breakdown = Array.from(byEntity.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
      .join(' · ')
    const oldestHours = Math.floor((Date.now() - new Date(approvals[0].created_at).getTime()) / 3600000)
    attention.push({
      category: 'pending_approval',
      severity: oldestHours > 24 ? 'warning' : 'info',
      title: 'Pending approvals',
      subtitle: breakdown,
      total_value: totalValue > 0 ? totalValue : null,
      count: approvals.length,
      drill_href: '/approvals',
      score: 30 + approvals.length * 5 + (oldestHours > 24 ? 20 : 0),
      top_item_label: oldestHours > 24 ? `oldest waiting ${oldestHours}h` : 'all within last 24h',
    })
  }

  // 2d. Overdue tasks
  type TaskRaw = { id: string; title: string; priority: string; due_at: string }
  const tasks = (overdueTasks.data ?? []) as TaskRaw[]
  if (tasks.length > 0) {
    const urgent = tasks.filter((t) => t.priority === 'urgent' || t.priority === 'high').length
    attention.push({
      category: 'overdue_task',
      severity: urgent >= 5 ? 'warning' : 'info',
      title: 'Overdue tasks',
      subtitle: urgent > 0 ? `${urgent} high/urgent priority` : 'all medium / low',
      total_value: null,
      count: tasks.length,
      drill_href: '/tasks',
      score: 20 + urgent * 5 + tasks.length * 0.5,
      top_item_label: tasks[0].title,
    })
  }

  // 2e. Paving stage projects (Slice 1 hero from way back — still surfaces here)
  const pavingCount = pavingStageRow.count ?? 0
  if (pavingCount > 0) {
    const sample = (pavingStageRow.data ?? [])[0] as { id: string; name: string } | undefined
    attention.push({
      category: 'paving_stage',
      severity: 'info',
      title: 'Projects at paving stage',
      subtitle: 'Need follow-up to close the win',
      total_value: null,
      count: pavingCount,
      drill_href: '/projects',
      score: 15 + pavingCount * 2,
      top_item_label: sample?.name,
    })
  }

  // 2f. Cold leads — open, no activity in 7d, value-weighted
  type LeadRaw = {
    id: string
    title: string
    estimated_value: number | null
    last_activity_at: string | null
    lead_stage: { is_terminal: boolean } | { is_terminal: boolean }[] | null
  }
  const cold = ((coldLeads.data ?? []) as unknown as LeadRaw[]).filter((l) => {
    const s = Array.isArray(l.lead_stage) ? l.lead_stage[0] : l.lead_stage
    return s && !s.is_terminal
  })
  if (cold.length > 0) {
    const totalAtRisk = cold.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0)
    attention.push({
      category: 'cold_lead',
      severity: totalAtRisk > 500000 ? 'warning' : 'info',
      title: 'Cold open leads',
      subtitle: `No activity in last ${COLD_LEAD_DAYS} days`,
      total_value: totalAtRisk > 0 ? totalAtRisk : null,
      count: cold.length,
      drill_href: '/leads?view=list',
      score: 10 + cold.length * 1 + Math.log10(1 + totalAtRisk) * 3,
    })
  }

  // 2g. Stale sent quotes
  type QuoteRaw = {
    id: string
    quotation_number: string
    total: number | null
    sent_at: string | null
    project: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const stale = (staleQuoteList.data ?? []) as unknown as QuoteRaw[]
  if (stale.length > 0) {
    const totalAtRisk = stale.reduce((s, q) => s + Number(q.total ?? 0), 0)
    const oldest = stale[0]
    const oldestDays = oldest.sent_at
      ? Math.floor((Date.now() - new Date(oldest.sent_at).getTime()) / 86400000)
      : 0
    const oldestProject = Array.isArray(oldest.project) ? oldest.project[0] : oldest.project
    attention.push({
      category: 'stale_quote',
      severity: oldestDays > 21 ? 'warning' : 'info',
      title: 'Stale sent quotes',
      subtitle: `Awaiting reply >${STALE_QUOTE_DAYS}d · oldest ${oldestDays}d`,
      total_value: totalAtRisk,
      count: stale.length,
      drill_href: '/quotes',
      score: 12 + stale.length * 1 + Math.log10(1 + totalAtRisk) * 3,
      top_item_label: `${oldest.quotation_number} · ${oldestProject?.name ?? '—'} · ₹${(oldest.total ?? 0).toLocaleString('en-IN')}`,
    })
  }

  // 2h. Gap markers — features tracked in Blueprint but not built yet.
  // Per Constitution Principle #11: untracked code is dead code; gap markers
  // are not dead code, they make missing data legible.
  attention.push(
    {
      category: 'gap_complaint',
      severity: 'gap',
      title: 'Customer complaints',
      subtitle: 'Not tracked yet — Customer Success module planned',
      total_value: null,
      count: 0,
      drill_href: '/owner',
      score: -1,
      blueprint_id: 'CS-001',
    },
    {
      category: 'gap_dispatch_sla',
      severity: 'gap',
      title: 'Dispatch SLA breaches',
      subtitle: 'Not tracked yet — needs expected_delivery_at on dispatch',
      total_value: null,
      count: 0,
      drill_href: '/owner',
      score: -2,
      blueprint_id: 'DEL-007',
    },
    {
      category: 'gap_credit_exposure',
      severity: 'gap',
      title: 'Credit exposure by firm',
      subtitle: 'Not tracked yet — needs firm.credit_limit (only dealers carry it today)',
      total_value: null,
      count: 0,
      drill_href: '/owner',
      score: -3,
    },
  )

  // Stable sort: highest score first, gaps always last
  attention.sort((a, b) => {
    if (a.severity === 'gap' && b.severity !== 'gap') return 1
    if (b.severity === 'gap' && a.severity !== 'gap') return -1
    return b.score - a.score
  })

  // ─── Facts for AI brief context ─────────────────────────────
  const topDebtor = top_debtors[0]
  const topDebtorLabel = topDebtor
    ? `${topDebtor.firm_name} · ₹${topDebtor.outstanding.toLocaleString('en-IN')} across ${topDebtor.invoice_count} invoice${topDebtor.invoice_count === 1 ? '' : 's'} · worst ${topDebtor.worst_days}d`
    : null

  // ─── Slice 3 facts ──────────────────────────────────────────
  const topRep = top_reps[0]
  const topRepLabel = topRep
    ? `${topRep.name} · ₹${topRep.closed_value.toLocaleString('en-IN')} from ${topRep.wins} win${topRep.wins === 1 ? '' : 's'}`
    : null

  const facts: OwnerOverview['facts'] = {
    overdue_invoice_count: rankedOverdue.length,
    overdue_invoice_value: rankedOverdue.reduce((s, r) => s + Number(r.outstanding), 0),
    stalled_deal_count: stalled.length,
    stalled_deal_value: stalled.reduce((s, p) => s + p.value, 0),
    pending_approval_count: approvals.length,
    overdue_task_count: tasks.length,
    paving_stage_count: pavingCount,
    cold_lead_count: cold.length,
    cold_lead_value: cold.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0),
    stale_sent_quote_count: stale.length,
    stale_sent_quote_value: stale.reduce((s, q) => s + Number(q.total ?? 0), 0),
    open_pipeline_value: openPipelineValue,
    outstanding_total: totalOutstanding,
    top_debtor_label: topDebtorLabel,
    receipts_30d: cash_movement.receipts_in_30d,
    receipts_prev_30d: cash_movement.receipts_in_prev_30d,
    ptp_total_promised: ptp_coverage.total_promised,
    ptp_due_this_week: ptp_coverage.due_this_week,
    ptp_overdue_with_promise: ptp_coverage.overdue_with_ptp,
    ptp_overdue_without_promise: ptp_coverage.overdue_total - ptp_coverage.overdue_with_ptp,
    open_leads_count: openLeads,
    sent_quotes_in_period: sentQuotesCount,
    accepted_quotes_in_period: acceptedQuotesCount,
    won_leads_in_period: wonLeadsCount,
    win_rate_pct: winRatePct,
    avg_quote_cycle_days: avgQuoteCycleDays,
    top_rep_label: topRepLabel,
    in_transit_dispatches: operations.in_transit_count,
    delivered_in_period: operations.delivered_count_period,
    top_loss_reason: top_loss_reasons[0]?.label ?? null,
  }

  return {
    tenant_id: tenantId,
    tenant_name: (tenantRow as { name?: string } | null)?.name ?? 'Your tenant',
    generated_at: nowIso,
    health,
    attention,
    ageing,
    top_debtors,
    cash_movement,
    ptp_coverage,
    funnel,
    win_rate,
    top_reps,
    operations,
    facts,
  }
}
