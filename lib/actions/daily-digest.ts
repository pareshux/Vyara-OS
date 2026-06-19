'use server'

/**
 * Daily digest server actions.
 *
 *   generateDailyDigest(date?) — admin/manager triggers this from the
 *     dashboard. Date defaults to yesterday. Idempotent: if a digest exists
 *     for (tenant, date), returns the existing one unless force=true.
 *
 *   The cron handler (lib/inngest/daily-digest-cron.ts) calls the same
 *     core path via the service-role client across all tenants.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSupabase = SupabaseClient<any, any, any>
import { getAIClient, getModel, mapAnthropicError } from '@/lib/ai/client'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  DailyDigestSchema,
  DAILY_DIGEST_SYSTEM_PROMPT,
  DAILY_DIGEST_USER_PROMPT,
  DAILY_DIGEST_PROMPT_VERSION,
  type DailyDigestResult,
} from '@/lib/ai/prompts/daily-digest'
import { collectDailyStats, type DailyStats } from '@/lib/ai/digest/collect-stats'

export type DigestRecord = {
  id: string
  digest_date: string
  narrative_text: string
  focus_items: Array<{ type: 'urgent' | 'momentum' | 'risk' | 'win'; title: string; detail: string }>
  health_signal: 'on_track' | 'attention' | 'concerning'
  stats: DailyStats
  generated_at: string
  generated_by: string | null
}

function getServiceClient(): LooseSupabase {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function yesterdayISO(): string {
  // Yesterday in IST (treating the IST date as the digest date even when run from UTC).
  const now = new Date()
  // Convert current UTC to IST by adding 5.5 hours then take YYYY-MM-DD and back off 1 day.
  const istNowMs = now.getTime() + 5.5 * 3600 * 1000
  const istNow = new Date(istNowMs)
  istNow.setUTCDate(istNow.getUTCDate() - 1)
  return istNow.toISOString().slice(0, 10)
}

export type GenerateDigestResult =
  | { ok: true; digest: DigestRecord; cached: boolean }
  | { ok: false; error: string }

export async function generateDailyDigest(params?: {
  digest_date?: string
  force?: boolean
}): Promise<GenerateDigestResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'No profile' }
  if (!['admin', 'manager'].includes(profile.role)) {
    return { ok: false, error: 'Admin or manager role required' }
  }

  const date = params?.digest_date ?? yesterdayISO()
  const svc = getServiceClient()

  // Check for existing digest
  if (!params?.force) {
    const { data: existing } = await svc
      .from('daily_digest')
      .select('id, digest_date, narrative_text, focus_items, health_signal, stats, generated_at, generated_by')
      .eq('tenant_id', profile.tenant_id)
      .eq('digest_date', date)
      .maybeSingle()
    if (existing) {
      return { ok: true, digest: existing as unknown as DigestRecord, cached: true }
    }
  }

  // Force-regenerate: delete the old row first (the table revokes UPDATE)
  if (params?.force) {
    await svc.from('daily_digest').delete().eq('tenant_id', profile.tenant_id).eq('digest_date', date)
  }

  const generated = await runDigestGeneration(svc, profile.tenant_id, date, user.id)
  return generated
}

/**
 * Service-callable digest generation. Used by both the user-triggered action
 * above and the Inngest cron. Returns the inserted digest row.
 */
export async function runDigestGeneration(
  svc: LooseSupabase,
  tenantId: string,
  date: string,
  generatedBy: string | null
): Promise<GenerateDigestResult> {
  const startedAt = Date.now()

  // 1) Collect stats
  let stats: DailyStats
  try {
    stats = await collectDailyStats(svc, tenantId, date)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Failed to collect stats: ${msg}` }
  }

  // 2) Call Claude
  const client = getAIClient()
  const model = getModel()

  let parsed: DailyDigestResult | null = null
  let input_tokens = 0
  let output_tokens = 0

  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 1500,
      system: DAILY_DIGEST_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${DAILY_DIGEST_USER_PROMPT}\n\n${JSON.stringify(stats, null, 2)}` },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(DailyDigestSchema) },
    })
    parsed = (response.parsed_output as DailyDigestResult | null) ?? null
    input_tokens = response.usage?.input_tokens ?? 0
    output_tokens = response.usage?.output_tokens ?? 0

    if (!parsed) {
      const textBlock = response.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined
      if (textBlock) {
        try {
          parsed = DailyDigestSchema.parse(JSON.parse(textBlock.text))
        } catch { /* fall through */ }
      }
    }
  } catch (e) {
    const mapped = mapAnthropicError(e)
    return { ok: false, error: mapped.message }
  }

  if (!parsed) return { ok: false, error: 'AI returned no structured output.' }

  const latency_ms = Date.now() - startedAt

  // 3) Insert (or upsert) the digest row
  const { data: row, error: insErr } = await svc
    .from('daily_digest')
    .insert({
      tenant_id: tenantId,
      digest_date: date,
      narrative_text: parsed.narrative,
      focus_items: parsed.focus_items,
      health_signal: parsed.health_signal,
      stats,
      model,
      prompt_version: DAILY_DIGEST_PROMPT_VERSION,
      input_tokens,
      output_tokens,
      latency_ms,
      generated_by: generatedBy,
    })
    .select('id, digest_date, narrative_text, focus_items, health_signal, stats, generated_at, generated_by')
    .single()

  if (insErr) return { ok: false, error: insErr.message }

  return {
    ok: true,
    digest: row as unknown as DigestRecord,
    cached: false,
  }
}

/**
 * Read the latest digest for the current user's tenant. Used by the dashboard
 * card. Returns null if no digest yet (the UI shows a generate-now button in
 * that case for admin/manager).
 */
export async function getLatestDigest(): Promise<DigestRecord | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile) return null

  const svc = getServiceClient()
  const { data } = await svc
    .from('daily_digest')
    .select('id, digest_date, narrative_text, focus_items, health_signal, stats, generated_at, generated_by')
    .eq('tenant_id', profile.tenant_id)
    .order('digest_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as unknown as DigestRecord | null) ?? null
}
