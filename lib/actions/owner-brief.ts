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
  const cacheKey = `inline_text:owner_brief:${tenantId}`
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
