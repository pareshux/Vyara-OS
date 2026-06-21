#!/usr/bin/env tsx
/**
 * scripts/seed-raj-gates.ts — Raj demo Phase 5a.
 *
 * Seeds the drawing-approval gate_requirement rows for Raj's two
 * pipeline templates. Demonstrates that the gate-requirement
 * infrastructure (migration 0018) works for cross-industry tenants.
 *
 * Two gates seeded (both tenant-scoped to Raj):
 *   - EPC stage 'drawings_approved' (stage 9 of 16) requires a
 *     `drawing_approval_pack` document on file.
 *   - Panel order stage 'drawings_approved' (stage 5 of 10) requires
 *     the same document.
 *
 * NOTE: this is DATA only. The advance-stage UI flow already reads
 * gate_requirement (per Slice 1 spec; see scannable-project-tracking
 * pattern in design.md §5). Blocking enforcement on advance is wired
 * differently across the code base — surveying + hardening is a
 * Phase 6 (Vyara-isms hunt) task. For Phase 5a we light up the data
 * + the read-only helper (lib/gates.ts) so consumers can list unmet
 * gates without re-implementing the query.
 *
 * Run: tsx --env-file=.env.local scripts/seed-raj-gates.ts
 */

import { createClient } from '@supabase/supabase-js'

const RAJ_TENANT_ID = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Look up the two drawings_approved stage IDs
  const { data: stages, error: sErr } = await sb
    .from('pipeline_stage')
    .select('id, segment')
    .eq('tenant_id', RAJ_TENANT_ID)
    .eq('stage_key', 'drawings_approved')
  if (sErr) throw new Error(`stage lookup failed: ${sErr.message}`)
  const epcStage   = stages?.find((s) => s.segment === 'epc_project')
  const panelStage = stages?.find((s) => s.segment === 'panel_order')
  if (!epcStage || !panelStage) throw new Error('Raj drawings_approved stages not found — re-run seed-raj-pipeline.ts')

  // Idempotency: delete existing gate_requirements on these stages, then insert
  await sb.from('gate_requirement')
    .delete()
    .in('pipeline_stage_id', [epcStage.id, panelStage.id])

  const { error: gErr } = await sb.from('gate_requirement').insert([
    {
      tenant_id: RAJ_TENANT_ID,
      pipeline_stage_id: epcStage.id,
      required_document_type: 'drawing_approval_pack',
      required_field_name: null,
      label: 'Customer-approved drawing pack on file',
      is_hard: true,
      sort_order: 10,
    },
    {
      tenant_id: RAJ_TENANT_ID,
      pipeline_stage_id: panelStage.id,
      required_document_type: 'drawing_approval_pack',
      required_field_name: null,
      label: 'Customer-approved drawing pack on file',
      is_hard: true,
      sort_order: 10,
    },
  ])
  if (gErr) throw new Error(`gate_requirement insert failed: ${gErr.message}`)

  console.log(JSON.stringify({
    ok: true,
    gates_inserted: 2,
    epc_stage_id: epcStage.id,
    panel_stage_id: panelStage.id,
  }, null, 2))
}

main().catch((err) => {
  console.error(`seed-raj-gates failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
