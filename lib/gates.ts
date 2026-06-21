/**
 * lib/gates.ts — gate-requirement evaluation helper (Raj demo Phase 5a).
 *
 * Read-only utility. Given a pipeline_stage_id, returns the list of
 * gate_requirements + which ones are satisfied by the project's data
 * (attachments / fields).
 *
 * Caller pattern:
 *   const { ok, data } = await evaluateGatesForProject(supabase, projectId)
 *   if (ok) data.forEach(g => console.log(g.label, g.satisfied))
 *
 * Used to surface gate state on:
 *   - Project detail page (scannable-project-tracking pattern per design.md §5)
 *   - Pre-advance form (show what's missing before the user tries)
 *   - Owner dashboard attention centre (block-advance signals)
 *
 * Blocking enforcement (rejecting an advanceProjectStage call when a
 * hard gate is unmet) is wired in the action layer separately — this
 * helper is read-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type GateEvaluation = {
  id: string
  label: string
  is_hard: boolean
  /** Either 'document' (required_document_type set) or 'field' (required_field_name set). */
  kind: 'document' | 'field'
  /** The thing required — document type code OR field name. */
  required: string
  /** Whether this gate's requirement is currently satisfied. */
  satisfied: boolean
}

export type GateEvaluationResult =
  | { ok: true; data: GateEvaluation[] }
  | { ok: false; error: string }

/**
 * Evaluate every gate on a project's current stage. Project's stage is
 * fetched, then gate_requirements are read for that stage, then each is
 * evaluated against the project's attachments / fields.
 */
export async function evaluateGatesForProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<GateEvaluationResult> {
  // 1. Load the project's current stage + linked attachments + minimal field set
  const { data: project, error: pErr } = await supabase
    .from('project')
    .select('id, current_stage_id, order_value, estimated_value, won_quote_id, custom_fields')
    .eq('id', projectId)
    .single()
  if (pErr || !project) return { ok: false, error: pErr?.message ?? 'project not found' }

  return evaluateGatesForStage(supabase, project.current_stage_id, {
    project_id: projectId,
    fields: {
      order_value: project.order_value,
      estimated_value: project.estimated_value,
      won_quote_id: project.won_quote_id,
      ...(project.custom_fields ?? {}),
    },
  })
}

/**
 * Lower-level variant — caller already knows the stage id + the field set.
 * Used by tests + by callers that want to evaluate a hypothetical stage.
 */
export async function evaluateGatesForStage(
  supabase: SupabaseClient,
  stageId: string,
  context: {
    project_id: string
    fields: Record<string, unknown>
  },
): Promise<GateEvaluationResult> {
  // 1. Load requirements on this stage
  const { data: reqs, error: rErr } = await supabase
    .from('gate_requirement')
    .select('id, label, is_hard, required_document_type, required_field_name')
    .eq('pipeline_stage_id', stageId)
    .order('sort_order')
  if (rErr) return { ok: false, error: rErr.message }
  if (!reqs || reqs.length === 0) return { ok: true, data: [] }

  // 2. For each document-type requirement, check attachments
  const docTypes = reqs.filter((r) => r.required_document_type).map((r) => r.required_document_type as string)
  let attachedTypes = new Set<string>()
  if (docTypes.length > 0) {
    const { data: atts } = await supabase
      .from('attachment')
      .select('kind, metadata')
      .eq('entity_type', 'project')
      .eq('entity_id', context.project_id)
      .in('kind', ['document', ...docTypes])  // 'document' is a generic kind; metadata.type_key narrows
    attachedTypes = new Set(
      (atts ?? []).flatMap((a) => {
        const out: string[] = [a.kind as string]
        const tk = (a.metadata as Record<string, unknown> | null)?.type_key
        if (typeof tk === 'string') out.push(tk)
        return out
      }),
    )
  }

  // 3. Build the result
  const evals: GateEvaluation[] = reqs.map((r) => {
    if (r.required_document_type) {
      return {
        id: r.id as string,
        label: r.label as string,
        is_hard: r.is_hard as boolean,
        kind: 'document',
        required: r.required_document_type as string,
        satisfied: attachedTypes.has(r.required_document_type as string),
      }
    }
    // field requirement
    const fname = r.required_field_name as string
    const val = context.fields[fname]
    const satisfied = val !== undefined && val !== null && val !== ''
    return {
      id: r.id as string,
      label: r.label as string,
      is_hard: r.is_hard as boolean,
      kind: 'field',
      required: fname,
      satisfied,
    }
  })

  return { ok: true, data: evals }
}
