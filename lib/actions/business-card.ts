'use server'

/**
 * Business card → lead capture server actions.
 *
 * extractBusinessCard(uploadPath) extracts the printed fields and resolves
 * candidates against the live database — both existing contacts (to avoid
 * duplicates) and existing firms (to link the lead to the right buyer).
 *
 * logBusinessCardDecision lands the accept/edit/reject signal on
 * ai_extraction_row for the future /admin/ai-quality dashboard.
 */
import { createClient } from '@/lib/supabase/server'
import { extractFromImage } from '@/lib/ai/extract'
import {
  BusinessCardSchema,
  BUSINESS_CARD_SYSTEM_PROMPT,
  BUSINESS_CARD_USER_PROMPT,
  BUSINESS_CARD_PROMPT_VERSION,
  type BusinessCardResult,
} from '@/lib/ai/prompts/business-card'
import {
  resolveBuyerFirm,
  resolveContact,
  type BuyerFirmCandidate,
  type ContactCandidate,
} from '@/lib/ai/resolve'

export type ResolvedBusinessCard = BusinessCardResult & {
  contact_candidates: ContactCandidate[]
  firm_candidates: BuyerFirmCandidate[]
}

export type ExtractBusinessCardResult =
  | {
      ok: true
      extraction_id: string
      data: ResolvedBusinessCard
      usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number }
      latency_ms: number
    }
  | { ok: false; error: string; latency_ms: number }

export async function extractBusinessCard(
  uploadPath: string
): Promise<ExtractBusinessCardResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated', latency_ms: 0 }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'No profile', latency_ms: 0 }

  if (!['admin', 'manager', 'sales_engineer'].includes(profile.role)) {
    return { ok: false, error: 'Permission denied', latency_ms: 0 }
  }
  if (!uploadPath.startsWith(`${profile.tenant_id}/`)) {
    return { ok: false, error: 'Upload path does not belong to your tenant', latency_ms: 0 }
  }

  const result = await extractFromImage({
    uploadPath,
    tenantId: profile.tenant_id,
    userId: user.id,
    entityKind: 'business_card',
    promptVersion: BUSINESS_CARD_PROMPT_VERSION,
    systemPrompt: BUSINESS_CARD_SYSTEM_PROMPT,
    userPrompt: BUSINESS_CARD_USER_PROMPT,
    schema: BusinessCardSchema,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message, latency_ms: result.latency_ms }
  }

  // Resolve contact + firm in parallel.
  const [contact_candidates, firm_candidates] = await Promise.all([
    resolveContact(supabase, result.data.full_name, result.data.phone, result.data.email),
    resolveBuyerFirm(supabase, result.data.firm_name, result.data.gstin),
  ])

  return {
    ok: true,
    extraction_id: result.extraction_id,
    data: {
      ...result.data,
      contact_candidates,
      firm_candidates,
    },
    usage: result.usage,
    latency_ms: result.latency_ms,
  }
}

// ─── Decision telemetry ─────────────────────────────────────────────────────

export type LogBusinessCardDecisionInput = {
  extraction_id: string
  decision: 'accepted' | 'edited' | 'rejected'
  original_values: Record<string, unknown>
  final_values?: Record<string, unknown>
  avg_confidence: number | null
  target_lead_id?: string | null
}

export async function logBusinessCardDecision(
  params: LogBusinessCardDecisionInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'No profile' }

  const { data: existing } = await supabase
    .from('ai_extraction_row')
    .select('id, decision')
    .eq('extraction_id', params.extraction_id)
    .eq('row_index', 1)
    .maybeSingle()

  const payload = {
    decision: params.decision,
    final_values: (params.final_values as Record<string, unknown>) ?? null,
    target_entity_type: params.target_lead_id ? 'lead' : null,
    target_entity_id: params.target_lead_id ?? null,
    decided_at: new Date().toISOString(),
    decided_by: user.id,
    avg_confidence: params.avg_confidence ?? null,
  }

  if (existing) {
    if (existing.decision === 'accepted' || existing.decision === 'edited') {
      return { ok: true }
    }
    await supabase.from('ai_extraction_row').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('ai_extraction_row').insert({
      tenant_id: profile.tenant_id,
      extraction_id: params.extraction_id,
      row_index: 1,
      original_values: params.original_values,
      ...payload,
    })
  }

  return { ok: true }
}
