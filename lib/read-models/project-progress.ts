// ─── Project progress read-model ─────────────────────────────────────────────
// One assembled view of "what state is this project in" — used by the project
// header, list-view status dot, dashboard, and mobile Today.
//
// REVIEW-RULE (see docs/adr/0001-project-progress-read-model.md):
// All cross-module reads — sales_order, sales_order_line, dispatch,
// dispatch_line, invoice, invoice_line, stock_reservation — go ONLY through
// this assembler. No other component or module reads cross-module on the
// project's behalf. Code reviews should reject new direct reads of those
// tables inside `components/projects/*` or any project-progress consumer.

import { createClient } from '@/lib/supabase/server'

export type Health = 'on_track' | 'needs_attention' | 'blocked'

export type GateState = {
  id: string
  label: string
  is_hard: boolean
  is_satisfied: boolean
  kind: 'document' | 'field'
  required_document_type: string | null
  required_field_name: string | null
}

export type MiniBar = {
  done: number
  total: number
  formatted_done: string
  formatted_total: string
  pct: number
} | null

export type SubstageSignal = {
  // Primary metric shown beneath the substage label
  primary: string
  // Optional muted secondary (e.g. value for Order, breakdown for Quote)
  secondary?: string
  // Coarse status: 'empty' (no activity yet), 'active' (work happening),
  // 'done' (everything we can measure is complete).
  status: 'empty' | 'active' | 'done'
}

export type Substage = {
  id: string
  substage_key: string
  label: string
  order_index: number
  color: string
  is_watch_stage: boolean
  sla_days: number | null
  signal: SubstageSignal | null
}

export type MacroStage = {
  id: string
  stage_key: string
  label: string
  order_index: number
  color: string
  is_terminal: boolean
  sla_days: number | null
}

export type NextAction = {
  task_id: string
  title: string
  due_at: string | null
  assignee_name: string | null
} | null

export type ProjectProgress = {
  project: {
    id: string
    name: string
    segment: string
    current_stage_id: string
    last_stage_change_at: string | null
  }
  macro_stages: MacroStage[]
  current_stage: MacroStage | null
  // Substages of the CURRENT stage, if any (e.g. Paving → 6 substages).
  current_substages: Substage[]
  // Gates declared on the current stage + (optional) on each substage.
  gates: GateState[]
  dispatch: MiniBar
  billing: MiniBar
  reservation: MiniBar
  health: Health
  health_reason: string
  next_action: NextAction
}

// Per-substage signal evaluator. Dispatches on substage_key — adding a new
// sub-stage to a tenant template only requires adding a case here if you want
// it to surface a count. Unknown keys return null (renders as a plain dot).
function buildSubstageSignal(params: {
  key: string
  isWatch: boolean
  quoteCounts: { total: number; draft: number; sent: number; won: number; dead: number }
  orderCount: number
  orderValue: number
  ordersReady: number
  totalLines: number
  reservedLinesCount: number
  totalDispatches: number
  deliveredDispatches: number
}): SubstageSignal | null {
  // Watch-stages are informational only — no signal, no count chip.
  if (params.isWatch) return null

  switch (params.key) {
    case 'quote': {
      const q = params.quoteCounts
      if (q.total === 0) return { primary: 'No quotes yet', status: 'empty' }
      const parts: string[] = []
      if (q.draft > 0) parts.push(`${q.draft} draft`)
      if (q.sent > 0) parts.push(`${q.sent} sent`)
      if (q.won > 0) parts.push(`${q.won} won`)
      if (q.dead > 0) parts.push(`${q.dead} lost`)
      return {
        primary: `${q.total} quote${q.total === 1 ? '' : 's'}`,
        secondary: parts.join(' · '),
        status: q.won > 0 ? 'done' : 'active',
      }
    }
    case 'order': {
      if (params.orderCount === 0) return { primary: 'No orders yet', status: 'empty' }
      return {
        primary: `${params.orderCount} order${params.orderCount === 1 ? '' : 's'}`,
        secondary: params.orderValue > 0 ? formatINRCompact(params.orderValue) : undefined,
        status: 'active',
      }
    }
    case 'reserve_stock': {
      if (params.totalLines === 0) return { primary: 'No lines to reserve', status: 'empty' }
      const allReserved = params.reservedLinesCount >= params.totalLines
      return {
        primary: `${params.reservedLinesCount} of ${params.totalLines}`,
        secondary: allReserved ? 'all reserved' : `${params.totalLines - params.reservedLinesCount} unreserved`,
        status: allReserved ? 'done' : 'active',
      }
    }
    case 'ready': {
      if (params.orderCount === 0) return { primary: '—', status: 'empty' }
      if (params.ordersReady === 0) return { primary: '0 ready', status: 'active' }
      return {
        primary: `${params.ordersReady} ready`,
        secondary: 'awaiting dispatch',
        status: 'active',
      }
    }
    case 'dispatch': {
      if (params.totalDispatches === 0) return { primary: 'No tranches yet', status: 'empty' }
      const allDelivered = params.deliveredDispatches >= params.totalDispatches
      return {
        primary: `${params.deliveredDispatches}/${params.totalDispatches} tranches`,
        secondary: allDelivered
          ? 'all delivered'
          : `${params.totalDispatches - params.deliveredDispatches} in flight`,
        status: allDelivered ? 'done' : 'active',
      }
    }
    default:
      return null
  }
}

function formatINRCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toFixed(0)}`
}

export async function getProjectProgress(projectId: string): Promise<ProjectProgress | null> {
  const supabase = await createClient()

  // 1) Project + current stage
  const { data: project } = await supabase
    .from('project')
    .select('id, name, segment, current_stage_id, order_value, estimated_value')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!project) return null

  // 2) All macro stages for the project's segment (system + tenant)
  const { data: stagesRaw } = await supabase
    .from('pipeline_stage')
    .select('id, stage_key, label, order_index, color, is_terminal, sla_days, segment')
    .eq('segment', project.segment)
    .order('order_index')
  const macroStages: MacroStage[] = (stagesRaw ?? [])
    .filter((s) => s.stage_key !== 'lost') // Lost is off-pipeline terminal
    .map((s) => ({
      id: s.id,
      stage_key: s.stage_key,
      label: s.label,
      order_index: s.order_index,
      color: s.color,
      is_terminal: s.is_terminal,
      sla_days: s.sla_days ?? null,
    }))

  const currentStage = macroStages.find((s) => s.id === project.current_stage_id) ?? null

  // 3) Last stage change — for stalled-too-long check
  const { data: lastChange } = await supabase
    .from('project_stage_history')
    .select('created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastStageChangeAt: string | null = lastChange?.created_at ?? null

  // 4) Substages of the current stage (only fetched if current stage has any)
  let currentSubstages: Substage[] = []
  if (currentStage) {
    const { data: subs } = await supabase
      .from('pipeline_substage')
      .select('id, substage_key, label, order_index, color, is_watch_stage, sla_days')
      .eq('pipeline_stage_id', currentStage.id)
      .order('order_index')
    currentSubstages = (subs ?? []).map((s) => ({
      id: s.id,
      substage_key: s.substage_key,
      label: s.label,
      order_index: s.order_index,
      color: s.color,
      is_watch_stage: s.is_watch_stage,
      sla_days: s.sla_days ?? null,
      signal: null,
    }))
  }

  // 5) Gate requirements on the current stage (substage gates ignored for header v1)
  const gates: GateState[] = []
  if (currentStage) {
    const { data: gateRows } = await supabase
      .from('gate_requirement')
      .select('id, label, is_hard, required_document_type, required_field_name, sort_order')
      .eq('pipeline_stage_id', currentStage.id)
      .order('sort_order')

    // For document gates: check existence in activity feed (documents are
    // light in Slice 1) or a future document table. For Slice 2 demo, the
    // common doc types this project knows about are: pod, final_ra_bill,
    // final_acceptance. We satisfy by looking at the data we have.

    // Pull what we need to evaluate gates (cross-module reads — the boundary)
    const [{ data: dispatches }, { data: invoicesRaw }] = await Promise.all([
      supabase
        .from('dispatch')
        .select('id, delivered_at, pod_url, project_id')
        .eq('project_id', projectId)
        .is('deleted_at', null),
      supabase
        .from('invoice')
        .select('id, is_running_bill, is_final_bill, status, project_id, billed_amount, paid_amount')
        .eq('project_id', projectId)
        .is('deleted_at', null),
    ])
    const projectDispatches = dispatches ?? []

    // Semantic fix: "all PODs" means all DELIVERED dispatches have a POD.
    // Scheduled-not-yet-delivered dispatches don't break this gate.
    const deliveredDispatches = projectDispatches.filter((d) => d.delivered_at != null)
    const allDeliveredHavePod = deliveredDispatches.length > 0
      && deliveredDispatches.every((d) => d.pod_url != null && d.pod_url !== '')
    const finalRaBillIssued = (invoicesRaw ?? []).some((i) => i.is_final_bill === true)
    const allInvoicesPaid = (invoicesRaw ?? []).length > 0
      && (invoicesRaw ?? []).every((i) => i.status === 'paid' || Number(i.billed_amount) - Number(i.paid_amount) <= 0)

    for (const g of gateRows ?? []) {
      let satisfied = false
      let kind: 'document' | 'field' = 'document'
      if (g.required_document_type) {
        kind = 'document'
        // Doc-type evaluator. Types that derive from data we already see in
        // this assembler are auto-satisfied; document-upload types (e.g.
        // 'acceptance_certificate', 'retention_release_letter') default to
        // false until a real document-store check exists.
        if (g.required_document_type === 'pod') satisfied = allDeliveredHavePod
        else if (g.required_document_type === 'final_ra_bill') satisfied = finalRaBillIssued
        else satisfied = false // doc-upload types: blocked until uploaded
      } else if (g.required_field_name) {
        kind = 'field'
        if (g.required_field_name === 'paid_in_full') satisfied = allInvoicesPaid
        // No other field gates remain after 0020.
      }
      gates.push({
        id: g.id,
        label: g.label,
        is_hard: g.is_hard,
        is_satisfied: satisfied,
        kind,
        required_document_type: g.required_document_type ?? null,
        required_field_name: g.required_field_name ?? null,
      })
    }
  }

  // 6) Mini-bars — phased work computed from CHILD records, not flags.
  //    Reservation: lines-reserved vs lines-ordered (read from reservation table if exists)
  //    Dispatch: delivered tranches vs scheduled tranches
  //    Billing: sum(invoiced) vs order_value (or estimated_value as fallback)
  let dispatchBar: MiniBar = null
  let billingBar: MiniBar = null
  let reservationBar: MiniBar = null

  // Load orders + quotations together — both feed the mini-bars AND the
  // per-substage signals (Quote, Order, Ready substages all derive from these).
  const [{ data: ordersForBars }, { data: quotationsForProject }] = await Promise.all([
    supabase
      .from('sales_order')
      .select('id, value, current_stage:current_stage_id(stage_key)')
      .eq('project_id', projectId)
      .is('deleted_at', null),
    supabase
      .from('quotation')
      .select('id, status, total')
      .eq('project_id', projectId)
      .is('deleted_at', null),
  ])
  const orderIds = (ordersForBars ?? []).map((o) => o.id)
  const totalOrderValue = (ordersForBars ?? []).reduce((s, o) => s + Number(o.value ?? 0), 0)
  const fallbackTotal = totalOrderValue > 0
    ? totalOrderValue
    : Number(project.order_value ?? project.estimated_value ?? 0)
  // Orders that have reached the "ready" order_stage — i.e. produced and
  // waiting to dispatch. Used by the Ready substage signal.
  const ordersReady = (ordersForBars ?? []).filter((o) => {
    const s = Array.isArray(o.current_stage) ? o.current_stage[0] : o.current_stage
    return (s as { stage_key?: string } | null)?.stage_key === 'ready'
  }).length

  // These numbers are hoisted because per-substage signals reuse them.
  let totalDispatches = 0
  let deliveredDispatches = 0
  let totalLines = 0
  let reservedLinesCount = 0

  if (orderIds.length > 0) {
    // Dispatch mini-bar: count(delivered dispatches) vs count(all dispatches for these orders)
    const { data: dispatchesForOrders } = await supabase
      .from('dispatch')
      .select('id, delivered_at, sales_order_id')
      .in('sales_order_id', orderIds)
      .is('deleted_at', null)
    totalDispatches = (dispatchesForOrders ?? []).length
    deliveredDispatches = (dispatchesForOrders ?? []).filter((d) => d.delivered_at != null).length
    if (totalDispatches > 0) {
      dispatchBar = {
        done: deliveredDispatches,
        total: totalDispatches,
        formatted_done: String(deliveredDispatches),
        formatted_total: String(totalDispatches),
        pct: Math.round((deliveredDispatches / totalDispatches) * 100),
      }
    }

    // Reservation mini-bar: lines reserved vs lines ordered.
    // stock_reservation is polymorphic (related_entity_type + related_entity_id),
    // so we get the line IDs first, then look up reservations by line ID.
    const { data: lineCountRaw } = await supabase
      .from('sales_order_line')
      .select('id, sales_order_id')
      .in('sales_order_id', orderIds)
    totalLines = (lineCountRaw ?? []).length

    const lineIds = (lineCountRaw ?? []).map((l) => l.id as string)
    const { data: reservationsRaw } = lineIds.length > 0
      ? await supabase
          .from('stock_reservation')
          .select('id, related_entity_id, status')
          .eq('related_entity_type', 'sales_order_line')
          .in('related_entity_id', lineIds)
      : { data: [] as Array<{ id: string; related_entity_id: string; status: string }> }

    const reservedLineIds = new Set(
      (reservationsRaw ?? [])
        .filter((r) => r.status === 'active' || r.status === 'consumed')
        .map((r) => r.related_entity_id)
    )
    reservedLinesCount = reservedLineIds.size
    if (totalLines > 0) {
      reservationBar = {
        done: reservedLineIds.size,
        total: totalLines,
        formatted_done: String(reservedLineIds.size),
        formatted_total: String(totalLines),
        pct: Math.round((reservedLineIds.size / totalLines) * 100),
      }
    }
  }

  // Billing mini-bar: sum(invoice.billed_amount) vs fallbackTotal
  const { data: invoicesForBilling } = await supabase
    .from('invoice')
    .select('id, billed_amount, status')
    .eq('project_id', projectId)
    .is('deleted_at', null)
  const sumBilled = (invoicesForBilling ?? [])
    .filter((i) => i.status !== 'cancelled' && i.status !== 'written_off')
    .reduce((s, i) => s + Number(i.billed_amount ?? 0), 0)
  if (fallbackTotal > 0) {
    billingBar = {
      done: sumBilled,
      total: fallbackTotal,
      formatted_done: formatINRCompact(sumBilled),
      formatted_total: formatINRCompact(fallbackTotal),
      pct: Math.min(100, Math.round((sumBilled / fallbackTotal) * 100)),
    }
  }

  // 6b) Per-substage signals — each sub-stage's own count/status, derived
  //     from the cross-module data we just loaded. Sub-stages don't form a
  //     serial position; they run in parallel. The signal makes that visible
  //     (Quote can be "2 sent, 1 won" at the same time as Dispatch is "3/5").
  //     Dispatch keyed by `substage_key` so customer-#2 templates with
  //     different sub-stage labels still work — just don't use unknown keys
  //     here without adding an evaluator.
  if (currentSubstages.length > 0) {
    const quoteCounts = (quotationsForProject ?? []).reduce(
      (acc, q) => {
        acc.total++
        const s = String(q.status)
        if (s === 'accepted') acc.won++
        else if (s === 'rejected' || s === 'expired') acc.dead++
        else if (s === 'sent' || s === 'revised') acc.sent++
        else acc.draft++
        return acc
      },
      { total: 0, draft: 0, sent: 0, won: 0, dead: 0 }
    )
    const orderCount = (ordersForBars ?? []).length

    currentSubstages = currentSubstages.map((sub): Substage => {
      const signal = buildSubstageSignal({
        key: sub.substage_key,
        isWatch: sub.is_watch_stage,
        quoteCounts,
        orderCount,
        orderValue: totalOrderValue,
        ordersReady,
        totalLines,
        reservedLinesCount,
        totalDispatches,
        deliveredDispatches,
      })
      return { ...sub, signal }
    })
  }

  // 7) Next action — earliest open task on the project
  const { data: nextTask } = await supabase
    .from('task')
    .select('id, title, due_at, assignee:assignee_id(full_name)')
    .eq('project_id', projectId)
    .eq('is_done', false)
    .is('deleted_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const assignee = nextTask?.assignee
    ? (Array.isArray(nextTask.assignee) ? nextTask.assignee[0] : nextTask.assignee)
    : null
  const nextAction: NextAction = nextTask
    ? {
        task_id: nextTask.id,
        title: nextTask.title,
        due_at: nextTask.due_at ?? null,
        assignee_name: (assignee as { full_name?: string } | null)?.full_name ?? null,
      }
    : null

  // 8) Health rule — one rule, computed here, used everywhere.
  //
  //   blocked         : project is past the current stage's SLA AND any HARD
  //                     gate is unsatisfied (you should be exiting + can't)
  //   needs_attention : open task overdue, OR past SLA without unsatisfied
  //                     hard gates (just stalled)
  //   on_track        : else
  //
  // A mid-stage project with end-of-stage gates that are naturally
  // unsatisfied (e.g. final RA bill before the project is done paving)
  // is NOT blocked — those gates show as red chips, but the pill stays
  // green until the stage stalls past its SLA.
  let health: Health = 'on_track'
  let healthReason = 'On track'
  const now = Date.now()
  const daysInStage = (currentStage?.sla_days != null && lastStageChangeAt != null)
    ? (now - new Date(lastStageChangeAt).getTime()) / 86_400_000
    : null
  const pastSla = currentStage?.sla_days != null && daysInStage != null && daysInStage > currentStage.sla_days
  const blockedGate = gates.find((g) => g.is_hard && !g.is_satisfied)
  const taskOverdue = nextAction?.due_at && new Date(nextAction.due_at).getTime() < now
  if (pastSla && blockedGate) {
    health = 'blocked'
    healthReason = `Past ${currentStage!.label} SLA (${Math.floor(daysInStage!)}d / ${currentStage!.sla_days}d) — gate: ${blockedGate.label}`
  } else if (taskOverdue) {
    health = 'needs_attention'
    healthReason = `Overdue task: ${nextAction!.title}`
  } else if (pastSla) {
    health = 'needs_attention'
    healthReason = `Stalled in ${currentStage!.label} for ${Math.floor(daysInStage!)}d (SLA ${currentStage!.sla_days}d)`
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      segment: project.segment,
      current_stage_id: project.current_stage_id,
      last_stage_change_at: lastStageChangeAt,
    },
    macro_stages: macroStages,
    current_stage: currentStage,
    current_substages: currentSubstages,
    gates,
    dispatch: dispatchBar,
    billing: billingBar,
    reservation: reservationBar,
    health,
    health_reason: healthReason,
    next_action: nextAction,
  }
}

// Batch variant for the projects list — returns only the slim subset needed
// for the status dot + tooltip. Pulls a single SQL query per concern instead
// of per-project to keep the list page fast.
export type ProjectProgressSummary = {
  project_id: string
  health: Health
  health_reason: string
  current_stage_label: string | null
  current_stage_color: string | null
}

export async function getProjectProgressBatch(
  projectIds: string[]
): Promise<Map<string, ProjectProgressSummary>> {
  const map = new Map<string, ProjectProgressSummary>()
  if (projectIds.length === 0) return map

  const supabase = await createClient()

  const [
    { data: projects },
    { data: allStages },
    { data: histories },
    { data: tasks },
    { data: invoicesForGates },
    { data: dispatchesForGates },
    { data: gates },
  ] = await Promise.all([
    supabase
      .from('project')
      .select('id, segment, current_stage_id')
      .in('id', projectIds)
      .is('deleted_at', null),
    supabase
      .from('pipeline_stage')
      .select('id, label, color, sla_days, segment'),
    supabase
      .from('project_stage_history')
      .select('project_id, created_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('task')
      .select('project_id, due_at, is_done')
      .in('project_id', projectIds)
      .eq('is_done', false)
      .is('deleted_at', null),
    supabase
      .from('invoice')
      .select('project_id, is_final_bill, billed_amount, paid_amount, status')
      .in('project_id', projectIds)
      .is('deleted_at', null),
    supabase
      .from('dispatch')
      .select('delivered_at, pod_url, project_id')
      .in('project_id', projectIds)
      .is('deleted_at', null),
    supabase
      .from('gate_requirement')
      .select('pipeline_stage_id, is_hard, required_document_type, required_field_name, label'),
  ])

  const stagesById = new Map(
    (allStages ?? []).map((s) => [s.id, s])
  )

  // Last change per project
  const lastChangeByProject: Record<string, string> = {}
  for (const h of histories ?? []) {
    if (!lastChangeByProject[h.project_id]) lastChangeByProject[h.project_id] = h.created_at
  }

  // Overdue tasks per project
  const now = Date.now()
  const overdueByProject = new Set<string>()
  for (const t of tasks ?? []) {
    if (t.due_at && new Date(t.due_at).getTime() < now) overdueByProject.add(t.project_id)
  }

  // For each project, compute simplified gate state
  for (const p of projects ?? []) {
    const stage = stagesById.get(p.current_stage_id) as
      | { label: string; color: string; sla_days: number | null }
      | undefined
    const stageGates = (gates ?? []).filter((g) => g.pipeline_stage_id === p.current_stage_id && g.is_hard)

    const projInvoices = (invoicesForGates ?? []).filter((i) => i.project_id === p.id)
    const projDispatches = (dispatchesForGates ?? []).filter((d) => d.project_id === p.id)
    const projDelivered = projDispatches.filter((d) => d.delivered_at != null)
    const allDeliveredHavePod = projDelivered.length > 0
      && projDelivered.every((d) => d.pod_url != null && d.pod_url !== '')
    const finalRa = projInvoices.some((i) => i.is_final_bill === true)
    const paidInFull = projInvoices.length > 0
      && projInvoices.every((i) => i.status === 'paid' || Number(i.billed_amount) - Number(i.paid_amount) <= 0)

    let blockedGate: { label: string } | null = null
    for (const g of stageGates) {
      let satisfied = false
      if (g.required_document_type === 'pod') satisfied = allDeliveredHavePod
      else if (g.required_document_type === 'final_ra_bill') satisfied = finalRa
      else if (g.required_field_name === 'paid_in_full') satisfied = paidInFull
      // doc-upload types (acceptance_certificate, retention_release_letter) default to false
      if (!satisfied) { blockedGate = { label: g.label }; break }
    }

    // Health rule (mirrors the single-project assembler):
    // blocked only when past SLA AND a hard gate is unsatisfied; mid-stage
    // projects with end-of-stage gates pending stay on_track.
    const daysIn = stage?.sla_days && lastChangeByProject[p.id]
      ? (now - new Date(lastChangeByProject[p.id]).getTime()) / 86_400_000
      : null
    const pastSla = stage?.sla_days != null && daysIn != null && daysIn > stage.sla_days

    let health: Health = 'on_track'
    let reason = 'On track'
    if (pastSla && blockedGate) {
      health = 'blocked'
      reason = `Past ${stage!.label} SLA (${Math.floor(daysIn!)}d) — ${blockedGate.label}`
    } else if (overdueByProject.has(p.id)) {
      health = 'needs_attention'
      reason = 'Overdue task'
    } else if (pastSla) {
      health = 'needs_attention'
      reason = `Stalled (${Math.floor(daysIn!)}d in ${stage!.label})`
    }

    map.set(p.id, {
      project_id: p.id,
      health,
      health_reason: reason,
      current_stage_label: stage?.label ?? null,
      current_stage_color: stage?.color ?? null,
    })
  }

  return map
}
