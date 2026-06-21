#!/usr/bin/env tsx
/**
 * scripts/seed-raj-complaints.ts — Raj demo Phase 3 (CS-001).
 *
 * Seeds 3 demo complaints on top of the Phase 2 mock data. Idempotent
 * via fixed UUIDs + delete-then-insert (because complaint has triggers
 * that write history + activity rows; upsert would multiply those).
 *
 * Three deliberate shapes:
 *  1. SURAT — Critical breakdown, IN PROGRESS, assigned to Raj admin
 *  2. ADANI — Billing dispute, LOGGED (unassigned, fresh signal)
 *  3. L&T  — Resolved + CLOSED (proves the full flow has run end-to-end)
 *
 * Run: tsx --env-file=.env.local scripts/seed-raj-complaints.ts
 */

import { createClient } from '@supabase/supabase-js'

const RAJ_TENANT_ID = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'
const RAJ_ADMIN_USER_ID = 'c6ae8540-a65b-4249-84b5-7f410a64e29f'

const SURAT_FIRM     = 'aa020001-0000-0000-0000-000000000001'
const ADANI_FIRM     = 'aa020003-0000-0000-0000-000000000003'
const LT_FIRM        = 'aa020004-0000-0000-0000-000000000004'
const SURAT_CONTACT  = 'aa030001-0000-0000-0000-000000000001'
const ADANI_CONTACT  = 'aa030008-0000-0000-0000-000000000008'
const LT_CONTACT     = 'aa030009-0000-0000-0000-000000000009'
const SURAT_PROJECT  = 'aa040001-0000-0000-0000-000000000001'
const ADANI_PROJECT  = 'aa040002-0000-0000-0000-000000000002'
const LT_PROJECT     = 'aa040004-0000-0000-0000-000000000004'
const ADANI_INVOICE  = null  // billing dispute on RA-INV-2026-0001 but invoice belongs to Surat — for demo, link Adani complaint to their order
const SURAT_ORDER    = 'aa070001-0000-0000-0000-000000000001'

const cid = (n: number) => `aa0a000${n}-0000-0000-0000-${String(n).padStart(12, '0')}`

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Look up the IDs we need
  const [{ data: types }, { data: severities }, { data: stages }] = await Promise.all([
    sb.from('complaint_type_master').select('id, code').is('tenant_id', null),
    sb.from('severity_master').select('id, code').is('tenant_id', null),
    sb.from('complaint_stage').select('id, stage_key').is('tenant_id', null),
  ])
  const typeId     = (code: string) => types!.find((t) => t.code === code)!.id
  const severityId = (code: string) => severities!.find((s) => s.code === code)!.id
  const stageId    = (key: string)  => stages!.find((s) => s.stage_key === key)!.id

  // Delete existing complaints (cascades to stage_history)
  console.log('Cleaning existing Raj complaints...')
  const existingIds = [cid(1), cid(2), cid(3)]
  await sb.from('complaint').delete().in('id', existingIds)

  // Insert in order: complaint rows, then history rows
  console.log('Inserting 3 complaints...')

  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

  // Complaint 1: Surat — breakdown, IN PROGRESS, assigned
  const complaintRows = [
    {
      id: cid(1),
      tenant_id: RAJ_TENANT_ID,
      complaint_number: 'RA-CMP-2026-0001',
      title: 'HT switchgear tripped repeatedly — production halted',
      description: 'Surat plant HT switchgear has tripped 3 times in 24 hours. Plant manager confirms downstream load is within rating. Initial diagnosis points to faulty trip relay. Customer requests on-site visit within 24h.',
      type_id: typeId('breakdown'),
      severity_id: severityId('critical'),
      current_stage_id: stageId('in_progress'),
      firm_id: SURAT_FIRM,
      reported_by_contact_id: SURAT_CONTACT,
      project_id: SURAT_PROJECT,
      sales_order_id: SURAT_ORDER,
      assignee_id: RAJ_ADMIN_USER_ID,
      assigned_at: daysAgo(1),
      assigned_by: RAJ_ADMIN_USER_ID,
      logged_at: daysAgo(2),
      triaged_at: daysAgo(2),
      created_by: RAJ_ADMIN_USER_ID,
      updated_by: RAJ_ADMIN_USER_ID,
    },
    // Complaint 2: Adani — billing dispute, LOGGED, unassigned
    {
      id: cid(2),
      tenant_id: RAJ_TENANT_ID,
      complaint_number: 'RA-CMP-2026-0002',
      title: 'Invoice RA-INV-2026-0001 — GST calculation queried',
      description: 'Adani finance team disputes the GST treatment on advance invoice. They believe partial reverse-charge applies to the HT transformer line item. Requesting clarification + revised invoice if needed.',
      type_id: typeId('billing_dispute'),
      severity_id: severityId('medium'),
      current_stage_id: stageId('logged'),
      firm_id: ADANI_FIRM,
      reported_by_contact_id: ADANI_CONTACT,
      project_id: ADANI_PROJECT,
      sales_order_id: null,
      assignee_id: null,
      assigned_at: null,
      logged_at: daysAgo(1),
      created_by: RAJ_ADMIN_USER_ID,
      updated_by: RAJ_ADMIN_USER_ID,
    },
    // Complaint 3: L&T — VFD vibration, RESOLVED + CLOSED
    {
      id: cid(3),
      tenant_id: RAJ_TENANT_ID,
      complaint_number: 'RA-CMP-2026-0003',
      title: 'VFD panel #3 — abnormal vibration on startup',
      description: 'L&T Vapi reported one of the six VFD panels (panel #3) exhibits vibration during DOL bypass. Investigated on-site; loose mounting bolt + recalibrated soft-start ramp. Panel running stable since. Customer signed-off.',
      type_id: typeId('installation_issue'),
      severity_id: severityId('medium'),
      current_stage_id: stageId('closed'),
      firm_id: LT_FIRM,
      reported_by_contact_id: LT_CONTACT,
      project_id: LT_PROJECT,
      sales_order_id: null,
      assignee_id: RAJ_ADMIN_USER_ID,
      assigned_at: daysAgo(15),
      assigned_by: RAJ_ADMIN_USER_ID,
      logged_at: daysAgo(18),
      triaged_at: daysAgo(17),
      resolution_notes: 'Found loose mounting bolt on panel #3. Tightened to torque spec and recalibrated soft-start ramp from 5s to 8s. Vibration eliminated. Customer engineer (Mr. Manoj Kale) signed off on-site.',
      root_cause: 'Installation defect — mounting bolt under-torqued during initial install.',
      resolved_at: daysAgo(12),
      resolved_by: RAJ_ADMIN_USER_ID,
      closed_at: daysAgo(10),
      closed_by: RAJ_ADMIN_USER_ID,
      created_by: RAJ_ADMIN_USER_ID,
      updated_by: RAJ_ADMIN_USER_ID,
    },
  ]

  const { error: insErr } = await sb.from('complaint').insert(complaintRows)
  if (insErr) throw new Error(`complaint insert failed: ${insErr.message}`)

  // Stage history per complaint — realistic transitions
  console.log('Inserting stage history...')
  const historyRows = [
    // Complaint 1: logged -> triaged -> assigned -> in_progress
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(1), from_stage_id: null,                  to_stage_id: stageId('logged'),     actor_id: RAJ_ADMIN_USER_ID, remark: 'Logged via phone',           created_at: daysAgo(2) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(1), from_stage_id: stageId('logged'),     to_stage_id: stageId('triaged'),    actor_id: RAJ_ADMIN_USER_ID, remark: 'Critical — escalating',      created_at: daysAgo(2) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(1), from_stage_id: stageId('triaged'),    to_stage_id: stageId('assigned'),   actor_id: RAJ_ADMIN_USER_ID, remark: 'Assigned to senior engineer', created_at: daysAgo(1) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(1), from_stage_id: stageId('assigned'),   to_stage_id: stageId('in_progress'),actor_id: RAJ_ADMIN_USER_ID, remark: 'On-site investigation started', created_at: daysAgo(1) },
    // Complaint 2: logged only
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(2), from_stage_id: null,                  to_stage_id: stageId('logged'),     actor_id: RAJ_ADMIN_USER_ID, remark: 'Logged via email',           created_at: daysAgo(1) },
    // Complaint 3: full flow logged -> triaged -> assigned -> in_progress -> resolved -> closed
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(3), from_stage_id: null,                  to_stage_id: stageId('logged'),     actor_id: RAJ_ADMIN_USER_ID, remark: 'Customer call',              created_at: daysAgo(18) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(3), from_stage_id: stageId('logged'),     to_stage_id: stageId('triaged'),    actor_id: RAJ_ADMIN_USER_ID, remark: 'Initial diagnosis remote',   created_at: daysAgo(17) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(3), from_stage_id: stageId('triaged'),    to_stage_id: stageId('assigned'),   actor_id: RAJ_ADMIN_USER_ID, remark: 'Assigned for on-site visit', created_at: daysAgo(15) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(3), from_stage_id: stageId('assigned'),   to_stage_id: stageId('in_progress'),actor_id: RAJ_ADMIN_USER_ID, remark: 'Engineer on-site',           created_at: daysAgo(14) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(3), from_stage_id: stageId('in_progress'),to_stage_id: stageId('resolved'),   actor_id: RAJ_ADMIN_USER_ID, remark: 'Fix applied + tested',       created_at: daysAgo(12) },
    { tenant_id: RAJ_TENANT_ID, complaint_id: cid(3), from_stage_id: stageId('resolved'),   to_stage_id: stageId('closed'),     actor_id: RAJ_ADMIN_USER_ID, remark: 'Closed after 48h observation', created_at: daysAgo(10) },
  ]
  const { error: hErr } = await sb.from('complaint_stage_history').insert(historyRows)
  if (hErr) throw new Error(`stage history insert failed: ${hErr.message}`)

  console.log(JSON.stringify({
    ok: true,
    complaints: 3,
    history_rows: historyRows.length,
  }, null, 2))
}

main().catch((err) => {
  console.error(`seed-raj-complaints failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
