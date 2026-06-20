'use server'

/**
 * Firm relationship health brief — Blueprint REL-011
 *
 * Generates (or returns cached) a 5-line AI brief about a firm's
 * relationship health. Cached 24h in ai_extraction.
 *
 * Context assembled per call (when cache miss):
 *   - Firm name / type / city
 *   - Overdue invoices (due < today, not paid/cancelled/written_off)
 *   - Stale sent quotes (status='sent', sent_at < 7 days ago)
 *   - Stuck active projects (updated_at < 14 days ago, stage not terminal)
 *   - Stale leads (updated_at < 3 days ago, not won/lost)
 *   - Last activity timestamp
 */

import { createClient } from '@/lib/supabase/server'
import { extractFromText } from '@/lib/ai/extract'
import {
  FirmBriefSchema,
  FIRM_BRIEF_SYSTEM_PROMPT,
  FIRM_BRIEF_USER_PROMPT,
  FIRM_BRIEF_PROMPT_VERSION,
  type FirmBriefResult,
} from '@/lib/ai/prompts/firm-brief'

export type GetFirmBriefResult =
  | { ok: true; brief: FirmBriefResult; cached: boolean; latency_ms: number }
  | { ok: false; error: string }

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export async function getFirmBrief(firmId: string): Promise<GetFirmBriefResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'Profile not found' }

  const tenantId = profile.tenant_id as string
  const cacheKey = `inline_text:firm_brief:${firmId}`
  const freshSince = new Date(Date.now() - CACHE_TTL_MS).toISOString()

  // 1. Cache check — only return if <24h old
  const { data: cached } = await supabase
    .from('ai_extraction')
    .select('id, raw_output, created_at')
    .eq('tenant_id', tenantId)
    .eq('entity_kind', 'firm_brief')
    .eq('source_storage_path', cacheKey)
    .gte('created_at', freshSince)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached?.raw_output) {
    try {
      const parsed = JSON.parse(cached.raw_output as string)
      const result = FirmBriefSchema.safeParse(parsed)
      if (result.success) {
        return { ok: true, brief: result.data, cached: true, latency_ms: 0 }
      }
    } catch {
      /* fall through to regenerate */
    }
  }

  // 2. Assemble context
  const today = new Date().toISOString().slice(0, 10)
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  const [
    { data: firmRow },
    { data: overdueInvoices },
    { data: staleQuoteRows },
    { data: stuckProjectRows },
    { data: staleLeadRows },
    { data: lastActivity },
  ] = await Promise.all([
    supabase
      .from('firm')
      .select('id, name, type, city, state')
      .eq('id', firmId)
      .maybeSingle(),

    supabase
      .from('invoice')
      .select('id, invoice_number, external_invoice_number, due_date, billed_amount, paid_amount, status')
      .eq('buyer_firm_id', firmId)
      .lt('due_date', today)
      .not('status', 'in', '(paid,cancelled,written_off)')
      .is('deleted_at', null)
      .order('due_date', { ascending: true })
      .limit(10),

    supabase
      .from('quotation')
      .select('id, quotation_number, total, sent_at, project:project_id(id, name, buyer_firm_id, architect_firm_id)')
      .eq('status', 'sent')
      .lt('sent_at', sevenDaysAgo)
      .is('deleted_at', null)
      .order('sent_at', { ascending: true })
      .limit(10),

    supabase
      .from('project')
      .select('id, name, updated_at, buyer_firm_id, architect_firm_id, current_stage:current_stage_id(label, is_terminal)')
      .or(`buyer_firm_id.eq.${firmId},architect_firm_id.eq.${firmId}`)
      .lt('updated_at', fourteenDaysAgo)
      .is('deleted_at', null)
      .limit(10),

    supabase
      .from('lead')
      .select('id, title, updated_at, buyer_firm_id, architect_firm_id')
      .or(`buyer_firm_id.eq.${firmId},architect_firm_id.eq.${firmId}`)
      .lt('updated_at', threeDaysAgo)
      .not('stage', 'in', '(won,lost)')
      .is('deleted_at', null)
      .limit(10),

    supabase
      .from('activity')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .or(
        `(entity_type.eq.firm,entity_id.eq.${firmId}),` +
        `(entity_type.eq.project,entity_id.in.(select id from project where buyer_firm_id='${firmId}' or architect_firm_id='${firmId}'))`
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!firmRow) return { ok: false, error: 'Firm not found' }

  // Shape overdue invoices
  const overdueItems = (overdueInvoices ?? []).map((inv) => {
    const outstanding = (inv.billed_amount as number ?? 0) - (inv.paid_amount as number ?? 0)
    const daysOverdue = Math.floor((Date.now() - new Date(inv.due_date as string).getTime()) / 86400000)
    return {
      invoice_number: (inv.external_invoice_number as string) || (inv.invoice_number as string),
      days_overdue: daysOverdue,
      outstanding_inr: outstanding,
    }
  }).filter((i) => i.outstanding_inr > 0)

  // Shape stale quotes — filter by firm
  type StaleQuoteRaw = {
    id: string
    quotation_number: string
    total: number | null
    sent_at: string | null
    project: { id: string; name: string; buyer_firm_id: string | null; architect_firm_id: string | null } | { id: string; name: string; buyer_firm_id: string | null; architect_firm_id: string | null }[] | null
  }
  const staleQuotes = ((staleQuoteRows ?? []) as unknown as StaleQuoteRaw[])
    .filter((q) => {
      const p = Array.isArray(q.project) ? q.project[0] : q.project
      return p?.buyer_firm_id === firmId || p?.architect_firm_id === firmId
    })
    .map((q) => {
      const p = Array.isArray(q.project) ? q.project[0] : q.project
      const daysSinceSent = q.sent_at
        ? Math.floor((Date.now() - new Date(q.sent_at).getTime()) / 86400000)
        : null
      return {
        quotation_number: q.quotation_number,
        project_name: p?.name ?? null,
        days_since_sent: daysSinceSent,
        total_inr: q.total ?? 0,
      }
    })

  // Shape stuck projects — filter non-terminal stages
  type StuckProjectRaw = {
    id: string
    name: string
    updated_at: string
    buyer_firm_id: string | null
    architect_firm_id: string | null
    current_stage: { label: string; is_terminal: boolean } | { label: string; is_terminal: boolean }[] | null
  }
  const stuckProjects = ((stuckProjectRows ?? []) as unknown as StuckProjectRaw[])
    .filter((p) => {
      const stage = Array.isArray(p.current_stage) ? p.current_stage[0] : p.current_stage
      return !stage?.is_terminal
    })
    .map((p) => {
      const stage = Array.isArray(p.current_stage) ? p.current_stage[0] : p.current_stage
      const daysStuck = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000)
      return {
        name: p.name,
        stage: stage?.label ?? 'Unknown',
        days_no_update: daysStuck,
      }
    })

  // Shape stale leads
  const staleLeads = (staleLeadRows ?? []).map((l) => ({
    title: l.title as string,
    days_no_update: Math.floor((Date.now() - new Date(l.updated_at as string).getTime()) / 86400000),
  }))

  const ctx = {
    firm: {
      name: firmRow.name,
      type: firmRow.type,
      city: firmRow.city,
      state: firmRow.state,
    },
    last_activity_at: (lastActivity as { created_at: string } | null)?.created_at ?? null,
    overdue_invoices: overdueItems,
    stale_sent_quotes: staleQuotes,
    stuck_active_projects: stuckProjects,
    stale_leads: staleLeads,
  }

  // 3. Call AI
  const res = await extractFromText({
    text: JSON.stringify(ctx, null, 2),
    tenantId,
    userId: user.id,
    entityKind: 'firm_brief',
    promptVersion: FIRM_BRIEF_PROMPT_VERSION,
    systemPrompt: FIRM_BRIEF_SYSTEM_PROMPT,
    userPrompt: FIRM_BRIEF_USER_PROMPT,
    schema: FirmBriefSchema,
  })

  if (!res.ok) {
    return { ok: false, error: res.error.message }
  }

  // 4. Tag the extraction row with cache key
  await supabase
    .from('ai_extraction')
    .update({ source_storage_path: cacheKey })
    .eq('id', res.extraction_id)

  return { ok: true, brief: res.data, cached: false, latency_ms: res.latency_ms }
}
