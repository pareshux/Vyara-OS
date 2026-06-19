'use server'

/** ─────────────────────────────────────────────────────────────
 *  Visit prep brief — FO-8 / Blueprint FLD-013
 *
 *  Returns (or generates) a 2-second context blob for a visit.
 *  Cached at the ai_extraction layer: if a brief already exists
 *  for this (tenant, visit_id), it's returned without a fresh
 *  AI call. The visit is in-progress for ~30–60 min so re-fetching
 *  is a waste; the rep wants the latest context as of "right before
 *  I walked in," not "while I'm walking out."
 *
 *  Inputs assembled:
 *    - subject (project / lead / firm / dealer) summary
 *    - last 8 activity rows on that subject
 *    - open tasks against that subject
 *    - open quotes (for project subjects)
 *    - last 3 prior visits to that subject by anyone
 *  Output: { headline, bullets[], caution? }
 *  ───────────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server'
import { extractFromText } from '@/lib/ai/extract'
import {
  VisitPrepBriefSchema,
  VISIT_PREP_BRIEF_SYSTEM_PROMPT,
  VISIT_PREP_BRIEF_USER_PROMPT,
  VISIT_PREP_BRIEF_PROMPT_VERSION,
  type VisitPrepBriefResult,
} from '@/lib/ai/prompts/visit-prep-brief'

export type GetVisitPrepBriefResult =
  | { ok: true; brief: VisitPrepBriefResult; cached: boolean; latency_ms: number }
  | { ok: false; error: string }

async function getActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id as string, role: profile.role as string }
}

export async function getVisitPrepBrief(visitId: string): Promise<GetVisitPrepBriefResult> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  // 1. Resolve the visit + its subject.
  const { data: v } = await actor.supabase
    .from('field_visit')
    .select(
      'id, project_id, lead_id, firm_id, dealer_id, contact_id, started_at, visit_purpose_id',
    )
    .eq('id', visitId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!v) return { ok: false, error: 'Visit not found' }

  // 2. Cache: have we already generated a brief for this visit?
  // The ai_extraction.raw_output column holds the JSON we parsed; if a
  // row exists, just rehydrate from there.
  const { data: cached } = await actor.supabase
    .from('ai_extraction')
    .select('id, raw_output, created_at')
    .eq('tenant_id', actor.tenantId)
    .eq('entity_kind', 'visit_prep_brief')
    .eq('source_storage_path', `inline_text:visit_prep_brief:${visitId}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached?.raw_output) {
    try {
      const parsed = JSON.parse(cached.raw_output as string)
      const result = VisitPrepBriefSchema.safeParse(parsed)
      if (result.success) {
        return { ok: true, brief: result.data, cached: true, latency_ms: 0 }
      }
    } catch {
      /* fall through and regenerate */
    }
  }

  // 3. Build the context payload. One bounded query per source — total
  // is small enough that we just send the JSON. No Storage call needed.
  let subjectType: 'project' | 'lead' | 'firm' | 'dealer' | null = null
  let subjectId: string | null = null
  if (v.project_id) { subjectType = 'project'; subjectId = v.project_id }
  else if (v.lead_id) { subjectType = 'lead'; subjectId = v.lead_id }
  else if (v.firm_id) { subjectType = 'firm'; subjectId = v.firm_id }
  else if (v.dealer_id) { subjectType = 'dealer'; subjectId = v.dealer_id }

  if (!subjectType || !subjectId) {
    return {
      ok: true,
      brief: {
        headline: 'No subject linked to this visit — fresh conversation.',
        bullets: [],
        caution: null,
      },
      cached: false,
      latency_ms: 0,
    }
  }

  const ctx: Record<string, unknown> = { subject_type: subjectType }

  if (subjectType === 'project') {
    const { data: p } = await actor.supabase
      .from('project')
      .select('id, name, segment, order_value, last_stage_change_at')
      .eq('id', subjectId)
      .maybeSingle()
    ctx.project = p

    const { data: quotes } = await actor.supabase
      .from('quotation')
      .select('quotation_number, total, status, sent_at, created_at')
      .eq('project_id', subjectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5)
    ctx.recent_quotes = quotes
  }
  if (subjectType === 'lead') {
    const { data: l } = await actor.supabase
      .from('lead')
      .select('id, title, stage, value_estimate, last_activity_at, source_label')
      .eq('id', subjectId)
      .maybeSingle()
    ctx.lead = l
  }
  if (subjectType === 'firm') {
    const { data: f } = await actor.supabase
      .from('firm')
      .select('id, name, type, primary_phone')
      .eq('id', subjectId)
      .maybeSingle()
    ctx.firm = f
  }
  if (subjectType === 'dealer') {
    const { data: d } = await actor.supabase
      .from('dealer')
      .select('id, name, tier_label:dealer_tier(label)')
      .eq('id', subjectId)
      .maybeSingle()
    ctx.dealer = d
  }

  // Activities on the subject (last 8).
  const { data: activities } = await actor.supabase
    .from('activity')
    .select('kind, payload, created_at')
    .eq('entity_type', subjectType)
    .eq('entity_id', subjectId)
    .order('created_at', { ascending: false })
    .limit(8)
  ctx.recent_activities = activities ?? []

  // Open tasks (subject-scoped).
  const { data: tasks } = await actor.supabase
    .from('task')
    .select('title, type, priority, due_at')
    .eq('source_entity_type', subjectType)
    .eq('source_entity_id', subjectId)
    .eq('is_done', false)
    .is('deleted_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(5)
  ctx.open_tasks = tasks ?? []

  // Last 3 prior visits.
  const subjectColumn =
    subjectType === 'project'
      ? 'project_id'
      : subjectType === 'lead'
        ? 'lead_id'
        : subjectType === 'firm'
          ? 'firm_id'
          : 'dealer_id'
  const { data: priorVisits } = await actor.supabase
    .from('field_visit')
    .select('visited_at, notes_text, is_interested')
    .eq(subjectColumn, subjectId)
    .eq('state', 'completed')
    .neq('id', visitId)
    .is('deleted_at', null)
    .order('visited_at', { ascending: false })
    .limit(3)
  ctx.prior_visits = priorVisits ?? []

  // 4. Call the AI.
  const text = JSON.stringify(ctx, null, 2)
  const res = await extractFromText({
    text,
    tenantId: actor.tenantId,
    userId: actor.userId,
    entityKind: 'visit_prep_brief',
    promptVersion: VISIT_PREP_BRIEF_PROMPT_VERSION,
    systemPrompt: VISIT_PREP_BRIEF_SYSTEM_PROMPT,
    userPrompt: VISIT_PREP_BRIEF_USER_PROMPT,
    schema: VisitPrepBriefSchema,
  })

  if (!res.ok) {
    return { ok: false, error: res.error.message }
  }

  // 5. Tag the extraction row with our cache key so a second call
  // hits the cache. We update via the service-role pattern is overkill
  // for one row — a plain update with the same RLS context works.
  await actor.supabase
    .from('ai_extraction')
    .update({ source_storage_path: `inline_text:visit_prep_brief:${visitId}` })
    .eq('id', res.extraction_id)

  return { ok: true, brief: res.data, cached: false, latency_ms: res.latency_ms }
}
