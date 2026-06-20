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
// Slices 2–5 (planned) extend:
//   - Revenue + Operations rollups
//   - Finance + Relationships rollups
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

// ─── Top-level read-model ────────────────────────────────────

export type OwnerOverview = {
  tenant_id: string
  tenant_name: string
  generated_at: string
  health: BusinessHealth
  attention: AttentionItem[]
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

  // Resolve buyer names in one fast query (no N+1)
  const buyerIds = Array.from(
    new Set(topOverdue.map((r) => r.buyer_firm_id).filter(Boolean) as string[])
  )
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
  }

  return {
    tenant_id: tenantId,
    tenant_name: (tenantRow as { name?: string } | null)?.name ?? 'Your tenant',
    generated_at: nowIso,
    health,
    attention,
    facts,
  }
}
