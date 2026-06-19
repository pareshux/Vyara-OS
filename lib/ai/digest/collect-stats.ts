/**
 * Collect cross-module facts for the daily digest.
 *
 * Reads "what happened yesterday" across the modules Vyara owns: leads,
 * quotes, orders, dispatches, invoices, receipts, PTPs. Also surfaces
 * the standing risks (stalled leads, overdue receivables) since those
 * are part of "what should Mehul focus on today".
 *
 * Pure read-only. Service-role caller so cron can read across tenants.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any>

export interface DailyStats {
  date: string  // ISO YYYY-MM-DD — the day being summarised (usually yesterday)

  // ─── Yesterday's activity ──────────────────────────────────────────
  leads_captured: number
  leads_captured_value: number
  leads_won: number
  leads_won_value: number
  leads_lost: number
  leads_lost_value: number
  quotes_sent: number
  quotes_sent_value: number
  quotes_accepted: number
  quotes_accepted_value: number
  orders_created: number
  orders_created_value: number
  dispatches_scheduled: number
  dispatches_delivered: number
  invoices_created: number
  invoices_created_value: number
  receipts_received: number
  receipts_received_value: number
  ptps_recorded: number
  ptps_recorded_value: number

  // ─── Standing risks (point-in-time as of now) ──────────────────────
  stalled_leads: number          // open leads with no activity in 7+ days
  stalled_leads_value: number
  overdue_invoices: number       // due_date < today, not paid
  overdue_invoices_value: number
  broken_ptps_today: number      // PTPs where promise_date <= today but unpaid

  // ─── Forward-looking ───────────────────────────────────────────────
  open_pipeline_value: number    // leads in non-terminal stages
  hot_quotes: number             // quotes in 'sent' status, age < 14d

  // ─── Context ──────────────────────────────────────────────────────
  tenant_name: string
}

export async function collectDailyStats(
  svc: SB,
  tenantId: string,
  digestDate: string  // ISO YYYY-MM-DD — the day being summarised
): Promise<DailyStats> {
  // Day boundaries
  const dayStart = `${digestDate}T00:00:00.000+05:30`
  const nextDay = new Date(`${digestDate}T00:00:00.000+05:30`)
  nextDay.setDate(nextDay.getDate() + 1)
  const dayEnd = nextDay.toISOString()
  const today = new Date().toISOString().slice(0, 10)

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoIso = sevenDaysAgo.toISOString()

  const [
    { data: tenant },
    leadsCapturedRes,
    leadsWonRes,
    leadsLostRes,
    quotesSentRes,
    quotesAcceptedRes,
    ordersCreatedRes,
    dispatchesScheduledRes,
    dispatchesDeliveredRes,
    invoicesCreatedRes,
    receiptsRes,
    ptpsRes,
    stalledLeadsRes,
    overdueInvoicesRes,
    brokenPtpsRes,
    openPipelineRes,
    hotQuotesRes,
  ] = await Promise.all([
    svc.from('tenant').select('name').eq('id', tenantId).single(),

    // Leads captured yesterday
    svc.from('lead')
      .select('id, estimated_value', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd),

    // Leads won yesterday (won_at fell in the window)
    svc.from('lead')
      .select('id, estimated_value', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('won_at', dayStart)
      .lt('won_at', dayEnd),

    // Leads lost yesterday
    svc.from('lead')
      .select('id, estimated_value', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('lost_at', dayStart)
      .lt('lost_at', dayEnd),

    // Quotes sent yesterday
    svc.from('quotation')
      .select('id, total', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('sent_at', dayStart)
      .lt('sent_at', dayEnd),

    // Quotes accepted (won) yesterday
    svc.from('quotation')
      .select('id, total', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('accepted_at', dayStart)
      .lt('accepted_at', dayEnd),

    // Orders created yesterday
    svc.from('sales_order')
      .select('id, value', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd),

    // Dispatches scheduled yesterday
    svc.from('dispatch')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('scheduled_at', dayStart)
      .lt('scheduled_at', dayEnd),

    // Dispatches delivered yesterday
    svc.from('dispatch')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('delivered_at', dayStart)
      .lt('delivered_at', dayEnd),

    // Invoices created yesterday
    svc.from('invoice')
      .select('id, total', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd),

    // Receipts received yesterday
    svc.from('receipt')
      .select('id, amount', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('received_at', digestDate)
      .lte('received_at', digestDate),

    // PTPs recorded yesterday
    svc.from('promise_to_pay')
      .select('id, amount', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd),

    // Stalled leads — open, no activity in 7+ days
    svc.from('lead')
      .select('id, estimated_value, current_stage_id, lead_stage:current_stage_id(is_terminal)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .lt('last_activity_at', sevenDaysAgoIso),

    // Overdue invoices (status not paid + due_date in past)
    svc.from('invoice')
      .select('id, billed_amount, paid_amount', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .lt('due_date', today)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .neq('status', 'written_off'),

    // Broken PTPs — promise_date <= today AND not paid (is_honoured is NULL or false)
    svc.from('promise_to_pay')
      .select('id, amount, invoice:invoice_id(status)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .lte('promise_date', today)
      .or('is_honoured.is.null,is_honoured.eq.false'),

    // Open pipeline value (non-terminal leads)
    svc.from('lead')
      .select('estimated_value, lead_stage:current_stage_id(is_terminal)')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),

    // Hot quotes (status sent, age < 14d)
    svc.from('quotation')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'sent')
      .gte('sent_at', sevenDaysAgoIso),
  ])

  function sumValue<T extends { estimated_value?: number | null; total?: number | null; value?: number | null; amount?: number | null }>(rows: T[] | null | undefined): number {
    return (rows ?? []).reduce((s, r) => {
      const v = Number(r.estimated_value ?? r.total ?? r.value ?? r.amount ?? 0)
      return s + (Number.isFinite(v) ? v : 0)
    }, 0)
  }

  // Filter stalled leads to non-terminal only
  type StalledLead = { estimated_value: number | null; lead_stage: { is_terminal: boolean } | { is_terminal: boolean }[] | null }
  const stalledRows = (stalledLeadsRes.data ?? []) as unknown as StalledLead[]
  const stalledOpen = stalledRows.filter((l) => {
    const s = Array.isArray(l.lead_stage) ? l.lead_stage[0] : l.lead_stage
    return s && !s.is_terminal
  })

  const overdueRows = (overdueInvoicesRes.data ?? []) as Array<{ billed_amount: number; paid_amount: number | null }>
  const overdueValue = overdueRows.reduce((s, r) => s + Math.max(0, Number(r.billed_amount) - Number(r.paid_amount ?? 0)), 0)

  // Broken PTP — exclude ones where the invoice has since been paid
  type BrokenPTP = { amount: number; invoice: { status: string } | { status: string }[] | null }
  const brokenRows = (brokenPtpsRes.data ?? []) as unknown as BrokenPTP[]
  const brokenOpen = brokenRows.filter((p) => {
    const inv = Array.isArray(p.invoice) ? p.invoice[0] : p.invoice
    return !inv || inv.status !== 'paid'
  })

  // Open pipeline
  type PipelineLead = { estimated_value: number | null; lead_stage: { is_terminal: boolean } | { is_terminal: boolean }[] | null }
  const pipelineRows = (openPipelineRes.data ?? []) as unknown as PipelineLead[]
  const openPipelineValue = pipelineRows.reduce((s, l) => {
    const stage = Array.isArray(l.lead_stage) ? l.lead_stage[0] : l.lead_stage
    if (!stage || stage.is_terminal) return s
    return s + Number(l.estimated_value ?? 0)
  }, 0)

  return {
    date: digestDate,
    tenant_name: ((tenant as { name?: string } | null)?.name) ?? 'Your tenant',

    leads_captured: leadsCapturedRes.count ?? 0,
    leads_captured_value: sumValue(leadsCapturedRes.data),
    leads_won: leadsWonRes.count ?? 0,
    leads_won_value: sumValue(leadsWonRes.data),
    leads_lost: leadsLostRes.count ?? 0,
    leads_lost_value: sumValue(leadsLostRes.data),

    quotes_sent: quotesSentRes.count ?? 0,
    quotes_sent_value: sumValue(quotesSentRes.data),
    quotes_accepted: quotesAcceptedRes.count ?? 0,
    quotes_accepted_value: sumValue(quotesAcceptedRes.data),

    orders_created: ordersCreatedRes.count ?? 0,
    orders_created_value: sumValue(ordersCreatedRes.data),

    dispatches_scheduled: dispatchesScheduledRes.count ?? 0,
    dispatches_delivered: dispatchesDeliveredRes.count ?? 0,

    invoices_created: invoicesCreatedRes.count ?? 0,
    invoices_created_value: sumValue(invoicesCreatedRes.data),
    receipts_received: receiptsRes.count ?? 0,
    receipts_received_value: sumValue(receiptsRes.data),
    ptps_recorded: ptpsRes.count ?? 0,
    ptps_recorded_value: sumValue(ptpsRes.data),

    stalled_leads: stalledOpen.length,
    stalled_leads_value: stalledOpen.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0),
    overdue_invoices: overdueRows.length,
    overdue_invoices_value: overdueValue,
    broken_ptps_today: brokenOpen.length,

    open_pipeline_value: openPipelineValue,
    hot_quotes: hotQuotesRes.count ?? 0,
  }
}
