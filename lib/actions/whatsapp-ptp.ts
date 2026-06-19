'use server'

/**
 * WhatsApp message → Promise-to-Pay server action.
 *
 * Text-only extraction (no Storage, no image). Caller passes pasted message
 * text + invoice context; we return structured intent + fields for the UI
 * to pre-fill the existing PTP dialog.
 */
import { createClient } from '@/lib/supabase/server'
import { extractFromText } from '@/lib/ai/extract'
import {
  WhatsappPTPSchema,
  WHATSAPP_PTP_SYSTEM_PROMPT,
  WHATSAPP_PTP_USER_PROMPT,
  WHATSAPP_PTP_PROMPT_VERSION,
  type WhatsappPTPResult,
} from '@/lib/ai/prompts/whatsapp-ptp'

const MAX_MESSAGE_CHARS = 4000

export type ExtractWhatsappPTPResult =
  | {
      ok: true
      extraction_id: string
      data: WhatsappPTPResult
      usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number }
      latency_ms: number
    }
  | { ok: false; error: string; latency_ms: number }

export async function extractWhatsappPTP(
  text: string
): Promise<ExtractWhatsappPTPResult> {
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

  const cleaned = text.trim()
  if (cleaned.length < 5) {
    return { ok: false, error: 'Message too short to parse', latency_ms: 0 }
  }
  if (cleaned.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      error: `Message is ${cleaned.length} chars — please trim to under ${MAX_MESSAGE_CHARS}.`,
      latency_ms: 0,
    }
  }

  const result = await extractFromText({
    text: cleaned,
    tenantId: profile.tenant_id,
    userId: user.id,
    entityKind: 'whatsapp_ptp',
    promptVersion: WHATSAPP_PTP_PROMPT_VERSION,
    systemPrompt: WHATSAPP_PTP_SYSTEM_PROMPT,
    userPrompt: WHATSAPP_PTP_USER_PROMPT,
    schema: WhatsappPTPSchema,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message, latency_ms: result.latency_ms }
  }

  return {
    ok: true,
    extraction_id: result.extraction_id,
    data: result.data,
    usage: result.usage,
    latency_ms: result.latency_ms,
  }
}
