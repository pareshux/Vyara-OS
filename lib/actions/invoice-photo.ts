'use server'

/**
 * Invoice photo AI surface — server action.
 *
 * Single action: extractInvoicePhoto(uploadPath). Returns the parsed invoice
 * plus resolved buyer-firm / project / sales-order candidates. The UI pre-
 * fills the existing NewInvoiceForm with these values — the user reviews and
 * submits via createInvoiceManual (existing action). All money math (GST,
 * retention, billed_amount, due_date) is recomputed by the form, not the AI.
 *
 * Note: unlike dispatch_diary, there is no per-row "accept" handler here.
 * The user reviews the whole invoice as one form and clicks Create once.
 * The Accept-vs-Reject telemetry lands on ai_extraction_row at the moment
 * the form is submitted (target_entity_type='invoice', target_entity_id=...)
 * via a small post-create call from the UI wrapper.
 */
import { createClient } from '@/lib/supabase/server'
import { extractFromImage } from '@/lib/ai/extract'
import {
  InvoicePhotoSchema,
  INVOICE_PHOTO_SYSTEM_PROMPT,
  INVOICE_PHOTO_USER_PROMPT,
  INVOICE_PHOTO_PROMPT_VERSION,
  type InvoicePhotoResult,
} from '@/lib/ai/prompts/invoice-photo'
import {
  resolveBuyerFirm,
  resolveProject,
  resolveOrderNumber,
  type BuyerFirmCandidate,
  type ProjectCandidate,
  type OrderCandidate,
} from '@/lib/ai/resolve'

export type ResolvedInvoiceExtraction = InvoicePhotoResult & {
  buyer_candidates: BuyerFirmCandidate[]
  project_candidates: ProjectCandidate[]
  order_candidates: OrderCandidate[]
}

export type ExtractInvoicePhotoResult =
  | {
      ok: true
      extraction_id: string
      data: ResolvedInvoiceExtraction
      usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number }
      latency_ms: number
    }
  | { ok: false; error: string; latency_ms: number }

export async function extractInvoicePhoto(
  uploadPath: string
): Promise<ExtractInvoicePhotoResult> {
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
    entityKind: 'invoice_photo',
    promptVersion: INVOICE_PHOTO_PROMPT_VERSION,
    systemPrompt: INVOICE_PHOTO_SYSTEM_PROMPT,
    userPrompt: INVOICE_PHOTO_USER_PROMPT,
    schema: InvoicePhotoSchema,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message, latency_ms: result.latency_ms }
  }

  // Resolve buyer / project / order references in parallel.
  const [buyer_candidates, project_candidates, order_candidates] = await Promise.all([
    resolveBuyerFirm(supabase, result.data.buyer_firm_name, result.data.buyer_gstin),
    resolveProject(supabase, result.data.project_or_site),
    resolveOrderNumber(supabase, result.data.order_reference),
  ])

  return {
    ok: true,
    extraction_id: result.extraction_id,
    data: {
      ...result.data,
      buyer_candidates,
      project_candidates,
      order_candidates,
    },
    usage: result.usage,
    latency_ms: result.latency_ms,
  }
}

// ─── Decision telemetry (called after form submit / dismiss) ─────────────

export type LogInvoicePhotoDecisionInput = {
  extraction_id: string
  decision: 'accepted' | 'edited' | 'rejected'
  original_values: Record<string, unknown>
  final_values?: Record<string, unknown>
  avg_confidence: number | null
  target_invoice_id?: string | null
}

export async function logInvoicePhotoDecision(
  params: LogInvoicePhotoDecisionInput
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

  // Idempotent — only one decision per (extraction_id, row_index=1).
  const { data: existing } = await supabase
    .from('ai_extraction_row')
    .select('id, decision')
    .eq('extraction_id', params.extraction_id)
    .eq('row_index', 1)
    .maybeSingle()

  const payload = {
    decision: params.decision,
    final_values: (params.final_values as Record<string, unknown>) ?? null,
    target_entity_type: params.target_invoice_id ? 'invoice' : null,
    target_entity_id: params.target_invoice_id ?? null,
    decided_at: new Date().toISOString(),
    decided_by: user.id,
    avg_confidence: params.avg_confidence ?? null,
  }

  if (existing) {
    if (existing.decision === 'accepted' || existing.decision === 'edited') {
      // Already final — don't overwrite the audit record.
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
