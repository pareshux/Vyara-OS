'use server'

/**
 * Owner Dashboard executive brief — Blueprint INT-014.
 *
 * Generates (or returns cached) an executive summary about the tenant's
 * current business state. Cached 6h in ai_extraction (more frequent than
 * firm_brief's 24h since business state shifts faster at the owner level).
 *
 * Context is sourced from the owner-overview read-model — same source
 * the page renders — so the brief is provably consistent with what the
 * MD sees on screen.
 */

import { createClient } from '@/lib/supabase/server'
import { extractFromText } from '@/lib/ai/extract'
import { getOwnerOverview } from '@/lib/read-models/owner-overview'
import {
  OwnerBriefSchema,
  OWNER_BRIEF_SYSTEM_PROMPT,
  OWNER_BRIEF_USER_PROMPT,
  OWNER_BRIEF_PROMPT_VERSION,
  type OwnerBriefResult,
} from '@/lib/ai/prompts/owner-brief'

export type GetOwnerBriefResult =
  | { ok: true; brief: OwnerBriefResult; cached: boolean; generated_at: string; latency_ms: number }
  | { ok: false; error: string }

// 6h cache. Shorter than firm_brief (24h) because the owner reads this
// twice a day and business state shifts faster at this level.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export async function getOwnerBrief(): Promise<GetOwnerBriefResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'Profile not found' }

  // Admin-only — the brief is the executive read-out.
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Owner Brief is for admin role only' }
  }

  const tenantId = profile.tenant_id as string
  // Cache key includes prompt version — bumping OWNER_BRIEF_PROMPT_VERSION
  // (e.g. v1 → v2 when we added receivables_depth) automatically invalidates
  // older cached briefs without touching the DB.
  const cacheKey = `inline_text:owner_brief:${tenantId}:${OWNER_BRIEF_PROMPT_VERSION}`
  const freshSince = new Date(Date.now() - CACHE_TTL_MS).toISOString()

  // 1. Cache lookup
  const { data: cached } = await supabase
    .from('ai_extraction')
    .select('id, raw_output, created_at')
    .eq('tenant_id', tenantId)
    .eq('entity_kind', 'owner_brief')
    .eq('source_storage_path', cacheKey)
    .gte('created_at', freshSince)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached?.raw_output) {
    try {
      // raw_output is the full Anthropic response object; the parsed brief
      // lives in parsed_output, but extractFromText also writes raw text.
      // We re-fetch parsed_output to keep the cache path symmetric.
      const { data: cachedParsed } = await supabase
        .from('ai_extraction')
        .select('parsed_output, created_at')
        .eq('id', cached.id as string)
        .single()

      if (cachedParsed?.parsed_output) {
        const result = OwnerBriefSchema.safeParse(cachedParsed.parsed_output)
        if (result.success) {
          return {
            ok: true,
            brief: result.data,
            cached: true,
            generated_at: (cachedParsed.created_at as string),
            latency_ms: 0,
          }
        }
      }
    } catch {
      /* fall through to regenerate */
    }
  }

  // 2. Assemble context. Use the same period the page defaults to (week) so the
  // facts in the brief context match what the MD's likely looking at.
  // Period choice is mostly aesthetic for the brief — the attention items and
  // point-in-time facts dominate the actual brief output.
  const overview = await getOwnerOverview('week')

  // Resolve buyer names for the worst overdue invoices, so the brief can cite
  // real customers rather than UUIDs. Bound to top 5 to keep the prompt tight.
  const overdueAttention = overview.attention.find((a) => a.category === 'overdue_invoice')
  const stalledAttention = overview.attention.find((a) => a.category === 'stalled_deal')
  const staleQuoteAttention = overview.attention.find((a) => a.category === 'stale_quote')
  const coldLeadAttention = overview.attention.find((a) => a.category === 'cold_lead')

  const ctx = {
    tenant: { name: overview.tenant_name },
    period_window: {
      label: overview.health.period,
      start: overview.health.current_range.start_date,
      end: overview.health.current_range.end_date,
    },
    business_health: {
      revenue_inr: overview.health.kpis.revenue.value,
      revenue_prev_inr: overview.health.kpis.revenue.value - overview.health.kpis.revenue.delta!.abs,
      collections_inr: overview.health.kpis.collections.value,
      collections_prev_inr: overview.health.kpis.collections.value - overview.health.kpis.collections.delta!.abs,
      orders_value_inr: overview.health.kpis.orders.value,
      orders_count: overview.health.kpis.orders.secondary_value ?? 0,
      outstanding_total_inr: overview.health.kpis.outstanding.value,
      open_pipeline_inr: overview.health.kpis.open_pipeline.value,
      dso_days: Math.round(overview.health.kpis.dso.value),
    },
    attention_summary: {
      overdue_invoice: overdueAttention
        ? {
            count: overdueAttention.count,
            total_inr: overdueAttention.total_value,
            top_item: overdueAttention.top_item_label,
            severity: overdueAttention.severity,
          }
        : null,
      stalled_high_value_deals: stalledAttention
        ? {
            count: stalledAttention.count,
            total_inr: stalledAttention.total_value,
            top_item: stalledAttention.top_item_label,
            severity: stalledAttention.severity,
          }
        : null,
      stale_sent_quotes: staleQuoteAttention
        ? {
            count: staleQuoteAttention.count,
            total_inr: staleQuoteAttention.total_value,
            top_item: staleQuoteAttention.top_item_label,
            severity: staleQuoteAttention.severity,
          }
        : null,
      cold_leads: coldLeadAttention
        ? {
            count: coldLeadAttention.count,
            total_inr: coldLeadAttention.total_value,
            severity: coldLeadAttention.severity,
          }
        : null,
      pending_approvals: overview.facts.pending_approval_count,
      overdue_tasks: overview.facts.overdue_task_count,
      paving_stage_projects: overview.facts.paving_stage_count,
    },
    // Slice 2: receivables depth — so the brief can cite concrete debtors
    // and PTP signals instead of generic "improve collections".
    receivables_depth: {
      ageing_buckets: overview.ageing.buckets.map((b) => ({
        bucket: b.key,
        invoice_count: b.count,
        outstanding_inr: b.value,
      })),
      worst_days_overdue: overview.ageing.worst_days_overdue,
      top_debtors_3: overview.top_debtors.slice(0, 3).map((d) => ({
        firm: d.firm_name,
        outstanding_inr: d.outstanding,
        worst_days: d.worst_days,
        invoice_count: d.invoice_count,
      })),
      ptp: {
        coverage_pct: overview.ptp_coverage.coverage_pct,
        overdue_with_promise: overview.ptp_coverage.overdue_with_ptp,
        overdue_without_promise: overview.ptp_coverage.overdue_total - overview.ptp_coverage.overdue_with_ptp,
        total_promised_inr: overview.ptp_coverage.total_promised,
        due_this_week: overview.ptp_coverage.due_this_week,
        dishonoured_last_30d: overview.ptp_coverage.dishonoured_30d,
      },
      cash_in_30d: {
        amount_inr: overview.cash_movement.receipts_in_30d,
        prev_30d_inr: overview.cash_movement.receipts_in_prev_30d,
        delta_pct: overview.cash_movement.delta_30d_vs_prev.pct,
        receipt_count: overview.cash_movement.receipt_count_30d,
      },
    },
    // Slice 3: revenue + ops depth — so the brief can cite concrete reps,
    // funnel conversion %, win rate, and live dispatch state.
    revenue_depth: {
      funnel: overview.funnel.stages.map((s) => ({
        stage: s.key,
        count: s.count,
        value_inr: s.value,
      })),
      conversions: overview.funnel.conversions.map((c) => ({
        from: c.from,
        to: c.to,
        pct: c.pct,
      })),
      win_rate_pct: overview.win_rate.win_rate_pct,
      avg_quote_cycle_days: overview.win_rate.avg_quote_cycle_days,
      accepted_value_inr: overview.win_rate.accepted_value,
      rejected_value_inr: overview.win_rate.rejected_value,
      top_loss_reasons: overview.win_rate.top_loss_reasons.map((r) => ({
        reason: r.label,
        count: r.count,
      })),
      losses_without_reason: overview.win_rate.losses_without_reason,
      top_reps_3: overview.top_reps.slice(0, 3).map((r) => ({
        name: r.name,
        closed_value_inr: r.closed_value,
        wins: r.wins,
        win_rate_pct: r.win_rate_pct,
      })),
      operations: {
        dispatches_in_period: overview.operations.dispatch_count_period,
        delivered_in_period: overview.operations.delivered_count_period,
        in_transit_now: overview.operations.in_transit_count,
        avg_dispatch_cycle_days: overview.operations.avg_dispatch_cycle_days,
      },
    },
  }

  // 3. Call AI
  const res = await extractFromText({
    text: JSON.stringify(ctx, null, 2),
    tenantId,
    userId: user.id,
    entityKind: 'owner_brief',
    promptVersion: OWNER_BRIEF_PROMPT_VERSION,
    systemPrompt: OWNER_BRIEF_SYSTEM_PROMPT,
    userPrompt: OWNER_BRIEF_USER_PROMPT,
    schema: OwnerBriefSchema,
  })

  if (!res.ok) {
    return { ok: false, error: res.error.message }
  }

  // 4. Tag the extraction row with our cache key so the next call finds it
  await supabase
    .from('ai_extraction')
    .update({ source_storage_path: cacheKey })
    .eq('id', res.extraction_id)

  return {
    ok: true,
    brief: res.data,
    cached: false,
    generated_at: new Date().toISOString(),
    latency_ms: res.latency_ms,
  }
}
