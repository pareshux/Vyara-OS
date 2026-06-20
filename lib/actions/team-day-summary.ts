'use server'

/** ─────────────────────────────────────────────────────────────
 *  Team day summary — sales-head digest at /field/team.
 *
 *  Mirrors visit_prep_brief: pulls a structured snapshot of the
 *  day's per-rep metrics, sends to Claude with a JSON schema,
 *  caches at the ai_extraction layer keyed on `(tenant, date)`.
 *
 *  The cache TTL is "the day is over." A summary computed at
 *  10:00 AM might say "Slow start" but by 5 PM that's stale.
 *  So we cache only for ~30 min — long enough that the page
 *  doesn't re-call on every refresh, short enough that the
 *  digest stays current through the day.
 *  ───────────────────────────────────────────────────────────── */

import { createClient } from '@/lib/supabase/server'
import { extractFromText } from '@/lib/ai/extract'
import { getTeamSnapshot, listPendingClaims } from './field-team'
import {
  TeamDaySummarySchema,
  TEAM_DAY_SUMMARY_SYSTEM_PROMPT,
  TEAM_DAY_SUMMARY_USER_PROMPT,
  TEAM_DAY_SUMMARY_PROMPT_VERSION,
  type TeamDaySummaryResult,
} from '@/lib/ai/prompts/team-day-summary'

export type GetTeamDaySummaryResult =
  | { ok: true; summary: TeamDaySummaryResult; cached: boolean }
  | { ok: false; error: string }

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

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

function todayInIST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
}

export async function getTeamDaySummary(
  date?: string,
): Promise<GetTeamDaySummaryResult> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (actor.role !== 'admin' && actor.role !== 'manager') {
    return { ok: false, error: 'Permission denied' }
  }

  const targetDate = date ?? todayInIST()
  const sourcePath = `inline_text:team_day_summary:${targetDate}`

  // 1. Cache lookup — only honor cache for today's summary AND when
  //    fresh enough. Yesterday's digest is fine to keep forever.
  const isToday = targetDate === todayInIST()
  const { data: cached } = await actor.supabase
    .from('ai_extraction')
    .select('id, raw_output, created_at')
    .eq('tenant_id', actor.tenantId)
    .eq('entity_kind', 'team_day_summary')
    .eq('source_storage_path', sourcePath)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached?.raw_output) {
    const ageMs = Date.now() - new Date(cached.created_at as string).getTime()
    if (!isToday || ageMs < CACHE_TTL_MS) {
      try {
        const parsed = JSON.parse(cached.raw_output as string)
        const result = TeamDaySummarySchema.safeParse(parsed)
        if (result.success) return { ok: true, summary: result.data, cached: true }
      } catch {
        /* fall through */
      }
    }
  }

  // 2. Build the snapshot. Re-uses getTeamSnapshot + listPendingClaims
  //    so we don't duplicate the rollup logic.
  const snap = await getTeamSnapshot(targetDate)
  if ('error' in snap) return { ok: false, error: snap.error }
  const claims = await listPendingClaims()
  const pendingClaims = 'error' in claims ? [] : claims.claims

  // Trim to the fields the model cares about; raw uuids waste tokens.
  const reps = snap.reps.map((r) => ({
    name: r.full_name,
    role: r.role,
    on_duty: !!r.attendance?.check_in_at && !r.attendance?.check_out_at,
    checked_in_at: r.attendance?.check_in_at ?? null,
    checked_out_at: r.attendance?.check_out_at ?? null,
    status_for_day: r.attendance?.status_for_day ?? 'no_record',
    visits_done: r.visits_today,
    visits_planned_open: r.planned_count,
    visits_live: r.in_progress_count,
    km_today: r.attendance?.total_km ?? r.attendance?.running_km ?? null,
    reimbursement_amount: r.attendance?.reimbursement_amount ?? null,
    claim_status: r.attendance?.claim_status ?? null,
    last_activity_at: r.last_activity_at,
  }))

  const pendingTotal = pendingClaims.reduce(
    (acc, c) => acc + (c.reimbursement_amount ?? 0),
    0,
  )

  const ctx = {
    date: targetDate,
    now: new Date().toISOString(),
    reps,
    pending_claims: {
      count: pendingClaims.length,
      total_amount: pendingTotal,
    },
  }

  // 3. Call AI.
  const text = JSON.stringify(ctx, null, 2)
  const res = await extractFromText({
    text,
    tenantId: actor.tenantId,
    userId: actor.userId,
    entityKind: 'team_day_summary',
    promptVersion: TEAM_DAY_SUMMARY_PROMPT_VERSION,
    systemPrompt: TEAM_DAY_SUMMARY_SYSTEM_PROMPT,
    userPrompt: TEAM_DAY_SUMMARY_USER_PROMPT,
    schema: TeamDaySummarySchema,
  })
  if (!res.ok) return { ok: false, error: res.error.message }

  // Tag with cache key.
  await actor.supabase
    .from('ai_extraction')
    .update({ source_storage_path: sourcePath })
    .eq('id', res.extraction_id)

  return { ok: true, summary: res.data, cached: false }
}
