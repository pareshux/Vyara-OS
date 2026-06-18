'use server'

/**
 * Voice visit note → structured fields — server action.
 *
 * Client transcribes speech via Web Speech API and sends the
 * transcript text. We extract structured visit-completion fields
 * and return them for the completion form to pre-fill. Plus the
 * outcome_id lookup so the form can set the dropdown value (the
 * AI returns a code; we resolve it to a tenant-master id).
 */
import { createClient } from '@/lib/supabase/server'
import { extractFromText } from '@/lib/ai/extract'
import {
  VoiceVisitNoteSchema,
  VOICE_VISIT_NOTE_SYSTEM_PROMPT,
  VOICE_VISIT_NOTE_USER_PROMPT,
  VOICE_VISIT_NOTE_PROMPT_VERSION,
  type VoiceVisitNoteResult,
} from '@/lib/ai/prompts/voice-visit-note'

const MAX_TRANSCRIPT_CHARS = 4000

export type ExtractedVoiceVisitNote = VoiceVisitNoteResult & {
  /** outcome_id resolved from the AI-suggested code, against this tenant's
   *  visit_outcome master. null if no code suggested or no match. */
  resolved_outcome_id: string | null
}

export type ExtractVoiceVisitNoteResult =
  | {
      ok: true
      extraction_id: string
      data: ExtractedVoiceVisitNote
      usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number }
      latency_ms: number
    }
  | { ok: false; error: string; latency_ms: number }

export async function extractVoiceVisitNote(
  transcript: string,
): Promise<ExtractVoiceVisitNoteResult> {
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

  const cleaned = transcript.trim()
  if (cleaned.length < 5) {
    return { ok: false, error: 'Transcript is too short. Speak a bit longer.', latency_ms: 0 }
  }
  if (cleaned.length > MAX_TRANSCRIPT_CHARS) {
    return {
      ok: false,
      error: `Transcript is ${cleaned.length} chars — please keep voice notes under ${MAX_TRANSCRIPT_CHARS} chars.`,
      latency_ms: 0,
    }
  }

  const result = await extractFromText({
    text: cleaned,
    tenantId: profile.tenant_id,
    userId: user.id,
    entityKind: 'voice_visit_note',
    promptVersion: VOICE_VISIT_NOTE_PROMPT_VERSION,
    systemPrompt: VOICE_VISIT_NOTE_SYSTEM_PROMPT,
    userPrompt: VOICE_VISIT_NOTE_USER_PROMPT,
    schema: VoiceVisitNoteSchema,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message, latency_ms: result.latency_ms }
  }

  // Resolve the suggested outcome code to a master id in this tenant.
  let resolvedOutcomeId: string | null = null
  if (result.data.suggested_outcome_code) {
    const { data: outcome } = await supabase
      .from('visit_outcome')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('code', result.data.suggested_outcome_code)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle()
    resolvedOutcomeId = (outcome?.id as string | undefined) ?? null
  }

  return {
    ok: true,
    extraction_id: result.extraction_id,
    data: { ...result.data, resolved_outcome_id: resolvedOutcomeId },
    usage: result.usage,
    latency_ms: result.latency_ms,
  }
}
