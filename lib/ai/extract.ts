/**
 * Generic AI extraction helper.
 *
 * Every AI surface in Vyara (dispatch diary, invoice photo, voice → quote, …)
 * calls this with a Zod schema and a prompt. The helper:
 *   1. Signs a private URL for the uploaded file in ai-uploads
 *   2. Calls Claude vision with structured-output mode bound to the schema
 *   3. Logs the call + result to ai_extraction (status, raw, parsed, usage)
 *   4. Returns the typed payload + extraction_id for downstream UI
 *
 * Per Principle #6: this function never writes business data. It only
 * extracts and logs. The Accept/Edit/Reject flow on the suggestion card
 * decides what happens with the parsed rows.
 */
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getAIClient, getModel, mapAnthropicError, type AIErrorDetail } from './client'
import { captureError, captureMessage } from '@/lib/observability/capture'

const AI_UPLOADS_BUCKET = 'ai-uploads'
const SIGNED_URL_TTL_SECONDS = 600 // 10 minutes — enough for Claude to fetch
const MAX_OUTPUT_TOKENS = 4096

export type ExtractionEntityKind =
  | 'dispatch_diary'
  | 'invoice_photo'
  | 'voice_quote'
  | 'voice_sample_outcome'
  | 'whatsapp_ptp'
  | 'business_card'
  | 'playground'
  | 'odometer_photo'
  | 'voice_visit_note'

function getServiceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type ExtractUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
}

export type ExtractResult<T> =
  | {
      ok: true
      extraction_id: string
      data: T
      raw_text: string
      usage: ExtractUsage
      latency_ms: number
    }
  | {
      ok: false
      // extraction_id is null only if the failure happened before we could log
      // (e.g. signed-URL generation failed); otherwise we always log.
      extraction_id: string | null
      error: AIErrorDetail
      latency_ms: number
    }

export type ExtractParams<TSchema extends z.ZodTypeAny> = {
  /** Path inside the ai-uploads bucket, e.g. "tenantA/dispatch_diary/2026/06/abc.jpg". */
  uploadPath: string
  /** Tenant the upload + extraction belong to. */
  tenantId: string
  /** User who initiated (null when called from a system handler). */
  userId: string | null
  /** Discriminator for analytics + the ai_extraction.entity_kind CHECK. */
  entityKind: ExtractionEntityKind
  /** Bump when the prompt is changed so accuracy can be tracked per version. */
  promptVersion: string
  /** System prompt — the "how to extract" instructions. */
  systemPrompt: string
  /** User-turn prompt — typically "Extract every entry in this image as JSON." */
  userPrompt: string
  /** The Zod schema for the expected response shape. */
  schema: TSchema
  /**
   * MIME type of the upload, used for the activity-log record and for the
   * upcoming PDF support. Defaults to image/jpeg.
   */
  sourceMimeType?: string
  /** Size in bytes, recorded on ai_extraction for analytics. */
  sourceSizeBytes?: number
}

export async function extractFromImage<TSchema extends z.ZodTypeAny>(
  params: ExtractParams<TSchema>
): Promise<ExtractResult<z.infer<TSchema>>> {
  const startedAt = Date.now()
  const supabase = getServiceClient()

  // 1) Sign a URL for Claude to fetch. The ai-uploads bucket is private.
  const { data: signed, error: signErr } = await supabase.storage
    .from(AI_UPLOADS_BUCKET)
    .createSignedUrl(params.uploadPath, SIGNED_URL_TTL_SECONDS)

  if (signErr || !signed?.signedUrl) {
    const latency_ms = Date.now() - startedAt
    return {
      ok: false,
      extraction_id: null,
      error: {
        reason: 'unsupported_input',
        message: 'Could not sign the upload URL. Please try uploading again.',
      },
      latency_ms,
    }
  }

  // 2) Call Claude with vision + structured output.
  const client = getAIClient()
  const model = getModel()

  let usage: ExtractUsage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }
  let rawText = ''
  let parsed: z.infer<TSchema> | null = null
  let errorDetail: AIErrorDetail | null = null
  let claudeRaw: unknown = null

  try {
    const response = await client.messages.parse({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: params.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: signed.signedUrl },
            },
            { type: 'text', text: params.userPrompt },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(params.schema as z.ZodType) },
    })

    claudeRaw = response
    usage = {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    }

    const textBlock = response.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined
    rawText = textBlock?.text ?? ''

    // parse() populates parsed_output when format binding succeeded
    parsed = (response.parsed_output as z.infer<TSchema> | null) ?? null

    if (response.stop_reason === 'refusal') {
      errorDetail = {
        reason: 'refusal',
        message: 'AI refused to read this content. Try a different photo or use manual entry.',
      }
      parsed = null
    } else if (!parsed) {
      // Parse-format binding failed silently — try a raw zod parse against text
      try {
        const decoded = JSON.parse(rawText)
        const result = params.schema.safeParse(decoded)
        if (result.success) {
          parsed = result.data
        } else {
          errorDetail = {
            reason: 'parse_error',
            message: 'AI returned content that did not match the expected shape.',
          }
        }
      } catch {
        errorDetail = {
          reason: 'parse_error',
          message: 'AI returned malformed JSON. Try a clearer photo or use manual entry.',
        }
      }
    }
  } catch (err) {
    errorDetail = mapAnthropicError(err)
    // Capture unexpected (non-mapped) AI call failures so we see them
    // in observability — not just buried in the ai_extraction row.
    if (errorDetail.reason !== 'rate_limited' && errorDetail.reason !== 'timeout') {
      captureError(err, {
        tenant_id: params.tenantId,
        user_id: params.userId,
        action_name: 'ai.extractFromImage',
        entity_type: 'ai_extraction',
        extra: {
          entity_kind: params.entityKind,
          prompt_version: params.promptVersion,
          reason: errorDetail.reason,
        },
      })
    }
  }

  const latency_ms = Date.now() - startedAt

  // 3) Log to ai_extraction — even on failure, so /admin/ai-quality has the data.
  const status: string = errorDetail
    ? errorDetail.reason === 'timeout'
      ? 'timeout'
      : errorDetail.reason === 'rate_limited'
      ? 'rate_limited'
      : errorDetail.reason === 'parse_error'
      ? 'parse_failed'
      : 'api_error'
    : 'extracted'

  // Parse failures are common enough to deserve their own signal
  // separate from the catch block above (which only fires on
  // unhandled throws). Signal-level, not error-level.
  if (status === 'parse_failed') {
    captureMessage('AI extraction parse_failed', {
      tenant_id: params.tenantId,
      user_id: params.userId,
      action_name: 'ai.extractFromImage',
      entity_type: 'ai_extraction',
      extra: {
        entity_kind: params.entityKind,
        prompt_version: params.promptVersion,
        latency_ms,
      },
    })
  }

  const { data: logRow, error: logErr } = await supabase
    .from('ai_extraction')
    .insert({
      tenant_id: params.tenantId,
      entity_kind: params.entityKind,
      source_storage_path: params.uploadPath,
      source_mime_type: params.sourceMimeType ?? 'image/jpeg',
      source_size_bytes: params.sourceSizeBytes ?? null,
      model,
      prompt_version: params.promptVersion,
      status,
      raw_output: claudeRaw as Record<string, unknown> | null,
      parsed_output: parsed as Record<string, unknown> | null,
      error_detail: errorDetail?.message ?? null,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_tokens: usage.cache_read_tokens,
      latency_ms,
      created_by: params.userId,
    })
    .select('id')
    .single()

  const extractionId = logErr ? null : (logRow?.id as string | undefined) ?? null

  if (errorDetail) {
    return { ok: false, extraction_id: extractionId, error: errorDetail, latency_ms }
  }
  if (!parsed) {
    // Defensive: we set errorDetail above when parsed is null; this is just for the type checker.
    return {
      ok: false,
      extraction_id: extractionId,
      error: { reason: 'parse_error', message: 'No structured output returned.' },
      latency_ms,
    }
  }
  if (!extractionId) {
    // Logging failed but extraction succeeded — return success without an id.
    // Downstream Accept/Edit/Reject won't be able to write decisions, but the
    // data is still usable.
    return {
      ok: true,
      extraction_id: '',
      data: parsed,
      raw_text: rawText,
      usage,
      latency_ms,
    }
  }

  return {
    ok: true,
    extraction_id: extractionId,
    data: parsed,
    raw_text: rawText,
    usage,
    latency_ms,
  }
}

// ─── extractFromText — text-only extraction (no Storage, no image) ─────────
//
// Used by surfaces where the input is already textual: WhatsApp message paste,
// email body parsing, free-text invoice import notes, etc. Same logging contract
// as extractFromImage — every call writes to ai_extraction so the future
// /admin/ai-quality dashboard sees it.

export type ExtractTextParams<TSchema extends z.ZodTypeAny> = {
  /** The text payload — caller has already pasted / fetched it. */
  text: string
  tenantId: string
  userId: string | null
  entityKind: ExtractionEntityKind
  promptVersion: string
  systemPrompt: string
  userPrompt: string
  schema: TSchema
}

export async function extractFromText<TSchema extends z.ZodTypeAny>(
  params: ExtractTextParams<TSchema>
): Promise<ExtractResult<z.infer<TSchema>>> {
  const startedAt = Date.now()
  const supabase = getServiceClient()

  // No upload — source_storage_path gets a synthetic marker so the ai_extraction
  // row is well-formed (the column is NOT NULL). Text doesn't have a physical
  // file backing it; the raw input lives in raw_output for auditability.
  const sourcePath = `inline_text:${params.entityKind}:${startedAt}`

  const client = getAIClient()
  const model = getModel()

  let usage: ExtractUsage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }
  let parsed: z.infer<TSchema> | null = null
  let errorDetail: AIErrorDetail | null = null
  let claudeRaw: unknown = null
  let rawText = ''

  try {
    const response = await client.messages.parse({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: params.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${params.userPrompt}\n\n---\n${params.text}` },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(params.schema as z.ZodType) },
    })

    claudeRaw = response
    usage = {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    }

    const textBlock = response.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined
    rawText = textBlock?.text ?? ''
    parsed = (response.parsed_output as z.infer<TSchema> | null) ?? null

    if (response.stop_reason === 'refusal') {
      errorDetail = {
        reason: 'refusal',
        message: 'AI refused to read this content.',
      }
      parsed = null
    } else if (!parsed) {
      try {
        const decoded = JSON.parse(rawText)
        const result = params.schema.safeParse(decoded)
        if (result.success) {
          parsed = result.data
        } else {
          errorDetail = { reason: 'parse_error', message: 'AI returned content that did not match the expected shape.' }
        }
      } catch {
        errorDetail = { reason: 'parse_error', message: 'AI returned malformed JSON.' }
      }
    }
  } catch (err) {
    errorDetail = mapAnthropicError(err)
    if (errorDetail.reason !== 'rate_limited' && errorDetail.reason !== 'timeout') {
      captureError(err, {
        tenant_id: params.tenantId,
        user_id: params.userId,
        action_name: 'ai.extractFromText',
        entity_type: 'ai_extraction',
        extra: {
          entity_kind: params.entityKind,
          prompt_version: params.promptVersion,
          reason: errorDetail.reason,
        },
      })
    }
  }

  const latency_ms = Date.now() - startedAt

  const status: string = errorDetail
    ? errorDetail.reason === 'timeout' ? 'timeout'
    : errorDetail.reason === 'rate_limited' ? 'rate_limited'
    : errorDetail.reason === 'parse_error' ? 'parse_failed'
    : 'api_error'
    : 'extracted'

  if (status === 'parse_failed') {
    captureMessage('AI extraction parse_failed', {
      tenant_id: params.tenantId,
      user_id: params.userId,
      action_name: 'ai.extractFromText',
      entity_type: 'ai_extraction',
      extra: {
        entity_kind: params.entityKind,
        prompt_version: params.promptVersion,
        latency_ms,
      },
    })
  }

  const { data: logRow, error: logErr } = await supabase
    .from('ai_extraction')
    .insert({
      tenant_id: params.tenantId,
      entity_kind: params.entityKind,
      source_storage_path: sourcePath,
      source_mime_type: 'text/plain',
      source_size_bytes: params.text.length,
      model,
      prompt_version: params.promptVersion,
      status,
      raw_output: claudeRaw as Record<string, unknown> | null,
      parsed_output: parsed as Record<string, unknown> | null,
      error_detail: errorDetail?.message ?? null,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_tokens: usage.cache_read_tokens,
      latency_ms,
      created_by: params.userId,
    })
    .select('id')
    .single()

  const extractionId = logErr ? null : (logRow?.id as string | undefined) ?? null

  if (errorDetail) {
    return { ok: false, extraction_id: extractionId, error: errorDetail, latency_ms }
  }
  if (!parsed) {
    return {
      ok: false,
      extraction_id: extractionId,
      error: { reason: 'parse_error', message: 'No structured output returned.' },
      latency_ms,
    }
  }

  return {
    ok: true,
    extraction_id: extractionId ?? '',
    data: parsed,
    raw_text: rawText,
    usage,
    latency_ms,
  }
}
