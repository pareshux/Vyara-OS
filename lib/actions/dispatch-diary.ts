'use server'

/**
 * Dispatch-diary AI surface — server actions.
 *
 * Three actions:
 *   - extractDispatchDiary(uploadPath) → calls extractFromImage with the
 *     dispatch-diary prompt + schema, then resolves order_number_raw and
 *     sku_raw against the live DB so the UI can render pre-matched chips.
 *
 *   - acceptDispatchDiaryRow({...}) → the caller has resolved the matched
 *     order_id + product_id + quantity + unit + other fields. This calls
 *     the existing scheduleDispatch (so all guards apply uniformly) and
 *     logs the decision to ai_extraction_row.
 *
 *   - rejectDispatchDiaryRow({...}) → logs decision='rejected'.
 *
 * Principle #6 enforcement: this file NEVER inserts into the dispatch table
 * directly. It always routes through scheduleDispatch.
 */
import { createClient } from '@/lib/supabase/server'
import { extractFromImage } from '@/lib/ai/extract'
import { scheduleDispatch } from './dispatches'
import {
  DispatchDiarySchema,
  DISPATCH_DIARY_SYSTEM_PROMPT,
  DISPATCH_DIARY_USER_PROMPT,
  DISPATCH_DIARY_PROMPT_VERSION,
  type DispatchDiaryEntry,
} from '@/lib/ai/prompts/dispatch-diary'
import { resolveOrderNumber, resolveSKU, type OrderCandidate, type SKUCandidate } from '@/lib/ai/resolve'

export type ResolvedDiaryEntry = DispatchDiaryEntry & {
  order_candidates: OrderCandidate[]
  sku_candidates: SKUCandidate[]
  // Average per-field confidence (used by AISuggestionCard for amber banner)
  avg_confidence: number
}

export type ExtractDispatchDiaryResult =
  | {
      ok: true
      extraction_id: string
      page_quality: 'clear' | 'partial' | 'unreadable'
      entries: ResolvedDiaryEntry[]
      warnings: string[]
      usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number }
      latency_ms: number
    }
  | { ok: false; error: string; latency_ms: number }

export async function extractDispatchDiary(
  uploadPath: string
): Promise<ExtractDispatchDiaryResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated', latency_ms: 0 }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'No profile', latency_ms: 0 }

  // Role gate: warehouse_manager isn't an existing role in the seed, so we
  // allow admin / manager / sales_engineer. Tighten later if needed.
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
    entityKind: 'dispatch_diary',
    promptVersion: DISPATCH_DIARY_PROMPT_VERSION,
    systemPrompt: DISPATCH_DIARY_SYSTEM_PROMPT,
    userPrompt: DISPATCH_DIARY_USER_PROMPT,
    schema: DispatchDiarySchema,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message, latency_ms: result.latency_ms }
  }

  const data = result.data
  if (!data.entries.length) {
    return {
      ok: true,
      extraction_id: result.extraction_id,
      page_quality: data.page_quality,
      entries: [],
      warnings: data.warnings.length
        ? data.warnings
        : ['No dispatch rows detected. Is this the right page of the diary?'],
      usage: result.usage,
      latency_ms: result.latency_ms,
    }
  }

  // Resolve each entry's order + SKU candidates in parallel (3 calls max each).
  const resolved: ResolvedDiaryEntry[] = await Promise.all(
    data.entries.map(async (entry) => {
      const [orderCandidates, skuCandidates] = await Promise.all([
        resolveOrderNumber(supabase, entry.order_number_raw),
        resolveSKU(supabase, entry.sku_raw),
      ])

      const confidences = [
        entry.order_confidence,
        entry.sku_confidence,
        entry.quantity_confidence,
      ].filter((c) => typeof c === 'number')
      const avg_confidence =
        confidences.length > 0
          ? confidences.reduce((s, c) => s + c, 0) / confidences.length
          : 0

      return {
        ...entry,
        order_candidates: orderCandidates,
        sku_candidates: skuCandidates,
        avg_confidence,
      }
    })
  )

  return {
    ok: true,
    extraction_id: result.extraction_id,
    page_quality: data.page_quality,
    entries: resolved,
    warnings: data.warnings,
    usage: result.usage,
    latency_ms: result.latency_ms,
  }
}

// ─── Accept / Reject ────────────────────────────────────────────────────────

export type AcceptDispatchDiaryRowInput = {
  extraction_id: string
  row_index: number
  original_values: Record<string, unknown> // what the AI returned (for audit)
  avg_confidence: number | null
  // Final, user-confirmed values to dispatch
  sales_order_id: string
  product_id: string
  product_name: string
  sku_code: string
  unit: string
  quantity: number
  vehicle_number: string | null
  lr_number: string | null
  transporter_id: string | null
  driver_phone: string | null
  scheduled_at: string // ISO datetime
  notes: string | null
}

export type AcceptDispatchDiaryRowResult =
  | { ok: true; dispatch_id: string; dispatch_number: string }
  | { ok: false; error: string }

export async function acceptDispatchDiaryRow(
  params: AcceptDispatchDiaryRowInput
): Promise<AcceptDispatchDiaryRowResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'No profile' }

  // Verify extraction belongs to this tenant (defence in depth — RLS already gates this)
  const { data: extraction } = await supabase
    .from('ai_extraction')
    .select('id, entity_kind, tenant_id')
    .eq('id', params.extraction_id)
    .eq('tenant_id', profile.tenant_id)
    .eq('entity_kind', 'dispatch_diary')
    .maybeSingle()
  if (!extraction) return { ok: false, error: 'Extraction not found' }

  // Did the user already act on this row? Idempotency.
  const { data: existing } = await supabase
    .from('ai_extraction_row')
    .select('id, decision, target_entity_id')
    .eq('extraction_id', params.extraction_id)
    .eq('row_index', params.row_index)
    .maybeSingle()

  if (existing?.decision === 'accepted') {
    const { data: dispatch } = await supabase
      .from('dispatch')
      .select('id, dispatch_number')
      .eq('id', existing.target_entity_id)
      .maybeSingle()
    if (dispatch) {
      return {
        ok: true,
        dispatch_id: dispatch.id,
        dispatch_number: dispatch.dispatch_number,
      }
    }
  }

  // Create the dispatch via the existing server action — guards apply for free
  // (over-dispatch, stage seeding, project denormalisation, etc.)
  const dispatchResult = await scheduleDispatch({
    sales_order_id: params.sales_order_id,
    scheduled_at: params.scheduled_at,
    transporter_id: params.transporter_id ?? undefined,
    lr_number: params.lr_number ?? undefined,
    vehicle_number: params.vehicle_number ?? undefined,
    driver_phone: params.driver_phone ?? undefined,
    notes: params.notes ?? undefined,
    lines: [
      {
        product_name: params.product_name,
        sku_code: params.sku_code,
        unit: params.unit,
        quantity: params.quantity,
      },
    ],
  })

  if ('error' in dispatchResult) {
    return { ok: false, error: dispatchResult.error }
  }

  // Log the per-row decision. Upsert via select-then-insert-or-update because
  // the row_index UNIQUE makes a plain insert idempotent-friendly but doesn't
  // give us update semantics in one query.
  const finalValues = {
    sales_order_id: params.sales_order_id,
    product_id: params.product_id,
    product_name: params.product_name,
    sku_code: params.sku_code,
    quantity: params.quantity,
    unit: params.unit,
    vehicle_number: params.vehicle_number,
    lr_number: params.lr_number,
    transporter_id: params.transporter_id,
    driver_phone: params.driver_phone,
    scheduled_at: params.scheduled_at,
    notes: params.notes,
  }

  // Detect whether the user edited the AI output (anything different ⇒ 'edited')
  const decision = wasEdited(params.original_values, finalValues) ? 'edited' : 'accepted'

  if (existing) {
    await supabase
      .from('ai_extraction_row')
      .update({
        decision,
        final_values: finalValues,
        target_entity_type: 'dispatch',
        target_entity_id: dispatchResult.id,
        decided_at: new Date().toISOString(),
        decided_by: user.id,
        avg_confidence: params.avg_confidence ?? null,
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('ai_extraction_row').insert({
      tenant_id: profile.tenant_id,
      extraction_id: params.extraction_id,
      row_index: params.row_index,
      decision,
      original_values: params.original_values,
      final_values: finalValues,
      target_entity_type: 'dispatch',
      target_entity_id: dispatchResult.id,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      avg_confidence: params.avg_confidence ?? null,
    })
  }

  return {
    ok: true,
    dispatch_id: dispatchResult.id,
    dispatch_number: dispatchResult.dispatch_number,
  }
}

export type RejectDispatchDiaryRowInput = {
  extraction_id: string
  row_index: number
  original_values: Record<string, unknown>
  avg_confidence: number | null
  reason?: string
}

export async function rejectDispatchDiaryRow(
  params: RejectDispatchDiaryRowInput
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
    .eq('row_index', params.row_index)
    .maybeSingle()

  if (existing) {
    if (existing.decision === 'accepted' || existing.decision === 'edited') {
      return { ok: false, error: 'This row was already accepted — cannot reject after accept.' }
    }
    await supabase
      .from('ai_extraction_row')
      .update({
        decision: 'rejected',
        final_values: params.reason ? { reason: params.reason } : null,
        decided_at: new Date().toISOString(),
        decided_by: user.id,
        avg_confidence: params.avg_confidence ?? null,
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('ai_extraction_row').insert({
      tenant_id: profile.tenant_id,
      extraction_id: params.extraction_id,
      row_index: params.row_index,
      decision: 'rejected',
      original_values: params.original_values,
      final_values: params.reason ? { reason: params.reason } : null,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      avg_confidence: params.avg_confidence ?? null,
    })
  }

  return { ok: true }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function wasEdited(
  original: Record<string, unknown>,
  finalValues: Record<string, unknown>
): boolean {
  // Compare overlapping keys. We don't strictly require keys to match — the
  // original has raw fields (sku_raw, order_number_raw) and the final has
  // resolved IDs. The minimal "did user edit" test: did they change the
  // numeric / labelled fields the AI also returned?
  const compared = ['quantity', 'unit', 'vehicle_number', 'lr_number', 'driver_phone', 'notes']
  for (const k of compared) {
    if (k in original && original[k] != null && original[k] !== finalValues[k]) return true
  }
  return false
}
