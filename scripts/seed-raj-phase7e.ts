#!/usr/bin/env tsx
/**
 * scripts/seed-raj-phase7e.ts — Closes 8 gaps from the persona audit.
 *
 * 1. Mark L&T lead (RA-LD-2026-0004) as won + link to L&T project
 *    → lead → project conversion arc is now demoable
 * 2. Add overdue invoice for Adani Mundra project (partial paid,
 *    due 45 days ago, in '31-60' ageing bucket) → drives collections
 * 3. Add receipt for the new partial-paid invoice + receipt for
 *    the previously-paid one → DSO + cash movement gets data
 * 4. Add collection row + PTP for the new overdue → WhatsApp dunning
 *    demo arc gets data
 * 5. Add 4 field_visits — installation (Surat), commissioning (L&T),
 *    site_survey for Bhavesh (so team activity > 1 user), AMC visit
 *    by Bhavesh
 * 6. Add a NEW historical project "Anand Pharma — Tablet Block A
 *    Distribution" at handed_over stage with completed lifecycle
 *    → full EPC arc end-to-end now demoable
 * 7. (Investigated separately — Nikhil's site_survey visit IS in DB;
 *    the audit-script's join shape was buggy. Fixed in script bug.)
 * 8. Fix audit script: .eq('id', user.id) on user_profile lookup.
 *
 * Run: tsx --env-file=.env.local scripts/seed-raj-phase7e.ts
 */

import { createClient } from '@supabase/supabase-js'

const RAJ_TENANT_ID = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'
const RAJ_ADMIN_USER_ID = 'c6ae8540-a65b-4249-84b5-7f410a64e29f'
const RAJ_MANAGER_ID    = '433065a3-7c53-458e-89b2-04222cd88dc6'  // Bhavesh
const RAJ_SE_ID         = 'a8456bb6-3961-43bb-ad83-3084ac2546e4'  // Nikhil

// Existing refs
const SURAT_FIRM = 'aa020001-0000-0000-0000-000000000001'
const ANAND_FIRM = 'aa020002-0000-0000-0000-000000000002'
const ADANI_FIRM = 'aa020003-0000-0000-0000-000000000003'
const LT_FIRM    = 'aa020004-0000-0000-0000-000000000004'
const SURAT_PROJECT = 'aa040001-0000-0000-0000-000000000001'
const ADANI_PROJECT = 'aa040002-0000-0000-0000-000000000002'
const LT_PROJECT    = 'aa040004-0000-0000-0000-000000000004'
const ADANI_ORDER   = 'aa070002-0000-0000-0000-000000000002'
const ANAND_CONTACT_1 = 'aa030004-0000-0000-0000-000000000004'  // Dr. Anjali Pandya

// New refs
const LT_LEAD          = 'aa0e0004-0000-0000-0000-000000000004'  // existing lead to mark won
const ANAND_HANDOVER_PROJECT = 'aa040005-0000-0000-0000-000000000005'
const ADANI_OVERDUE_INVOICE  = 'aa090002-0000-0000-0000-000000000002'
const ANAND_FINAL_INVOICE    = 'aa090003-0000-0000-0000-000000000003'
const ADANI_COLLECTION       = 'aa130001-0000-0000-0000-000000000001'
const ADANI_PTP              = 'aa140001-0000-0000-0000-000000000001'
const ADANI_RECEIPT          = 'aa150001-0000-0000-0000-000000000001'
const SURAT_RECEIPT          = 'aa150002-0000-0000-0000-000000000002'
const VISIT_INSTALL_SURAT    = 'aa120005-0000-0000-0000-000000000005'
const VISIT_COMMISSION_LT    = 'aa120006-0000-0000-0000-000000000006'
const VISIT_SURVEY_BHAVESH   = 'aa120007-0000-0000-0000-000000000007'
const VISIT_AMC_BHAVESH      = 'aa120008-0000-0000-0000-000000000008'

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Look up stage IDs we need
  const { data: leadWonStage } = await sb.from('lead_stage').select('id').eq('stage_key', 'won').is('tenant_id', null).single()
  const { data: handedOverStage } = await sb.from('pipeline_stage').select('id').eq('tenant_id', RAJ_TENANT_ID).eq('segment', 'epc_project').eq('stage_key', 'handed_over').single()
  const { data: collOverdueStage } = await sb.from('collection_stage').select('id').eq('stage_key', 'overdue').is('tenant_id', null).single()
  const { data: dispatchedStage } = await sb.from('pipeline_stage').select('id').eq('tenant_id', RAJ_TENANT_ID).eq('segment', 'epc_project').eq('stage_key', 'dispatched').single()
  const { data: vps } = await sb.from('visit_purpose').select('id, code').is('tenant_id', null)
  const vpId = (code: string) => vps?.find((v) => v.code === code)?.id ?? null

  if (!leadWonStage || !handedOverStage || !collOverdueStage) {
    throw new Error('one or more required stages not found in DB')
  }

  // ─── 1. Mark L&T lead as won, link to L&T project ─────────────────
  console.log('1. Marking L&T lead as won → project link')
  {
    const { error } = await sb.from('lead').update({
      current_stage_id: leadWonStage.id,
      won_at: new Date('2026-05-12T11:00:00Z').toISOString(),
      won_project_id: LT_PROJECT,
    }).eq('id', LT_LEAD)
    if (error) throw new Error(`lead won update failed: ${error.message}`)
  }

  // ─── 2. Add an overdue invoice for Adani ─────────────────────────
  console.log('2. Inserting overdue invoice for Adani')
  {
    // 45 days overdue → '31-60' bucket. Tranche 2 of the Adani project.
    // billed_amount > paid_amount → 'partial_paid' status, outstanding > 0
    const subtotal = 12_600_000  // 30% milestone of the ₹4.2cr project
    const gstAmount = subtotal * 0.18
    const total = subtotal + gstAmount
    const billedAmount = total  // bill the full 30% tranche
    const paidAmount = total * 0.4  // 40% partial received

    const { error } = await sb.from('invoice').upsert({
      id: ADANI_OVERDUE_INVOICE,
      tenant_id: RAJ_TENANT_ID,
      invoice_number: 'RA-INV-2026-0002',
      project_id: ADANI_PROJECT,
      sales_order_id: ADANI_ORDER,
      buyer_firm_id: ADANI_FIRM,
      invoice_date: '2026-04-15',
      due_date: '2026-05-08',  // ~45 days before "today" 2026-06-23
      payment_terms_days: 23,
      subtotal,
      gst_pct: 18,
      gst_amount: gstAmount,
      total,
      retention_pct: 0,
      retention_amount: 0,
      billed_amount: billedAmount,
      paid_amount: paidAmount,
      is_running_bill: true,
      running_bill_seq: 2,
      is_final_bill: false,
      status: 'partial_paid',
      notes: 'RA Bill 2 of 5 · 30% on drawings approved',
    }, { onConflict: 'id' })
    if (error) throw new Error(`overdue invoice failed: ${error.message}`)
  }

  // ─── 3. Receipts ─────────────────────────────────────────────────
  console.log('3. Inserting receipts')
  {
    // Receipt for the Surat advance invoice (already shown as paid in stock view)
    await sb.from('receipt').upsert({
      id: SURAT_RECEIPT, tenant_id: RAJ_TENANT_ID,
      invoice_id: 'aa090001-0000-0000-0000-000000000001',
      amount: 2_183_000,
      payment_mode: 'neft',
      payment_reference: 'NEFT-SBI-20260502-0042',
      received_at: '2026-05-02',
      bank_account: 'SBI 1234567890',
      notes: 'Surat Chemicals advance — 10% on PO',
    }, { onConflict: 'id' })
    // Receipt for the Adani partial — 40% paid
    const adaniPaid = 12_600_000 * 1.18 * 0.4
    await sb.from('receipt').upsert({
      id: ADANI_RECEIPT, tenant_id: RAJ_TENANT_ID,
      invoice_id: ADANI_OVERDUE_INVOICE,
      amount: adaniPaid,
      payment_mode: 'rtgs',
      payment_reference: 'RTGS-AXIS-20260520-0017',
      received_at: '2026-05-20',
      notes: 'Adani — partial settlement (40%)',
    }, { onConflict: 'id' })
  }

  // ─── 4. Collection + PTP for the overdue ─────────────────────────
  console.log('4. Collection + PTP for Adani overdue')
  {
    await sb.from('collection').upsert({
      id: ADANI_COLLECTION, tenant_id: RAJ_TENANT_ID,
      invoice_id: ADANI_OVERDUE_INVOICE,
      current_stage_id: collOverdueStage.id,
      escalation_level: 1,
      last_dunning_at: new Date('2026-06-15T10:00:00Z').toISOString(),
      next_action_at: new Date('2026-06-28T10:00:00Z').toISOString(),
    }, { onConflict: 'id' })

    const ptpAmount = (12_600_000 * 1.18) - (12_600_000 * 1.18 * 0.4)  // remaining balance
    await sb.from('promise_to_pay').upsert({
      id: ADANI_PTP, tenant_id: RAJ_TENANT_ID,
      collection_id: ADANI_COLLECTION,
      invoice_id: ADANI_OVERDUE_INVOICE,
      amount: ptpAmount,
      promise_date: '2026-07-05',
      contact_id: 'aa030006-0000-0000-0000-000000000006',  // Vikas Agarwal (Adani EPC Director)
      notes: 'Promised on call with Mr. Vikas Agarwal; awaiting PO release from corporate finance.',
      is_honoured: null,  // pending
    }, { onConflict: 'id' })
  }

  // ─── 5. Field visits — install/commission + Bhavesh visits ───────
  // CRITICAL: field_visit has CHECK num_nonnulls(project_id, lead_id,
  // firm_id, dealer_id) = 1. Original Phase 7a seed silently failed
  // because it set BOTH project_id AND firm_id. This re-seeds all 8
  // visits (4 original + 4 new) with exactly-one-subject discipline.
  console.log('5. Field visits — re-seed all (Phase 7a silently failed CHECK)')
  {
    // Wipe + re-insert for both users
    await sb.from('field_visit').delete().in('user_id', [RAJ_SE_ID, RAJ_MANAGER_ID])

    const visits = [
      // ── Phase 7a re-do — 4 visits for Nikhil ──
      {
        id: 'aa120001-0000-0000-0000-000000000001', tenant_id: RAJ_TENANT_ID, user_id: RAJ_SE_ID,
        visited_at: new Date(Date.now() - 1 * 86400000).toISOString().slice(0,10) + 'T11:00:00+05:30',
        duration_minutes: 90,
        visit_purpose_id: vpId('site_survey'),
        // Site survey is pre-PO → use firm_id, project doesn't exist yet
        firm_id: SURAT_FIRM,
        lat: 21.1702, lng: 72.8311,
        location_label: 'Surat Chemicals — Plant 3 yard (pre-bid site survey)',
        state: 'completed',
      },
      {
        id: 'aa120002-0000-0000-0000-000000000002', tenant_id: RAJ_TENANT_ID, user_id: RAJ_SE_ID,
        visited_at: new Date(Date.now() - 2 * 86400000).toISOString().slice(0,10) + 'T14:00:00+05:30',
        duration_minutes: 120,
        visit_purpose_id: vpId('amc_visit'),
        firm_id: SURAT_FIRM,
        lat: 21.1702, lng: 72.8311,
        location_label: 'Surat Chemicals — AMC monthly visit',
        state: 'completed',
      },
      {
        id: 'aa120003-0000-0000-0000-000000000003', tenant_id: RAJ_TENANT_ID, user_id: RAJ_SE_ID,
        visited_at: new Date(Date.now() - 4 * 86400000).toISOString().slice(0,10) + 'T10:30:00+05:30',
        duration_minutes: 75,
        visit_purpose_id: vpId('sales_visit'),
        lead_id: 'aa0e0001-0000-0000-0000-000000000001',  // Reliance lead
        lat: 20.3754, lng: 72.9047,
        location_label: 'Reliance Polymers GIDC, Vapi',
        state: 'completed',
      },
      {
        id: 'aa120004-0000-0000-0000-000000000004', tenant_id: RAJ_TENANT_ID, user_id: RAJ_SE_ID,
        visited_at: new Date().toISOString().slice(0,10) + 'T10:00:00+05:30',
        visit_purpose_id: vpId('breakdown_response'),
        project_id: SURAT_PROJECT,  // post-handover breakdown on the Surat project
        lat: 21.1702, lng: 72.8311,
        location_label: 'Surat Chemicals — HT panel breakdown (Surat project)',
        state: 'in_progress',
      },
      // ── Phase 7e — 4 new visits ──
      {
        id: VISIT_INSTALL_SURAT, tenant_id: RAJ_TENANT_ID, user_id: RAJ_SE_ID,
        visited_at: new Date('2026-06-18T10:00:00+05:30').toISOString(),
        duration_minutes: 240,
        visit_purpose_id: vpId('installation'),
        project_id: SURAT_PROJECT,  // install for Surat project
        lat: 21.1702, lng: 72.8311,
        location_label: 'Surat Chemicals — Plant 3 install site',
        state: 'completed',
      },
      {
        id: VISIT_COMMISSION_LT, tenant_id: RAJ_TENANT_ID, user_id: RAJ_SE_ID,
        visited_at: new Date('2026-06-20T11:30:00+05:30').toISOString(),
        duration_minutes: 180,
        visit_purpose_id: vpId('commissioning'),
        project_id: LT_PROJECT,  // commissioning for L&T project
        lat: 20.3754, lng: 72.9047,
        location_label: 'L&T Vapi raw-water pumping station — VFD panel commissioning',
        state: 'completed',
      },
      {
        id: VISIT_SURVEY_BHAVESH, tenant_id: RAJ_TENANT_ID, user_id: RAJ_MANAGER_ID,
        visited_at: new Date('2026-06-19T14:00:00+05:30').toISOString(),
        duration_minutes: 90,
        visit_purpose_id: vpId('site_survey'),
        lead_id: 'aa0e0002-0000-0000-0000-000000000002',  // Surat expansion lead only
        lat: 21.1702, lng: 72.8311,
        location_label: 'Surat Chemicals — Plant 4 site walk-through',
        state: 'completed',
      },
      {
        id: VISIT_AMC_BHAVESH, tenant_id: RAJ_TENANT_ID, user_id: RAJ_MANAGER_ID,
        visited_at: new Date('2026-06-22T09:30:00+05:30').toISOString(),
        duration_minutes: 60,
        visit_purpose_id: vpId('amc_visit'),
        firm_id: SURAT_FIRM,  // AMC = firm-level only
        lat: 21.1702, lng: 72.8311,
        location_label: 'Surat Chemicals AMC monthly — manager review',
        state: 'completed',
      },
    ]
    const { error: vErr, data: vRows } = await sb.from('field_visit').insert(visits).select('id')
    if (vErr) throw new Error(`field_visit insert failed: ${vErr.message}`)
    console.log(`   inserted ${vRows?.length ?? 0} field_visit rows`)
  }

  // ─── 6. New historical handed-over project for Anand Pharma ──────
  console.log('6. Anand Pharma handed-over historical project')
  {
    await sb.from('project').upsert({
      id: ANAND_HANDOVER_PROJECT,
      tenant_id: RAJ_TENANT_ID,
      name: 'Anand Pharma — Tablet Block A · LV Distribution',
      segment: 'epc_project',
      current_stage_id: handedOverStage.id,
      buyer_firm_id: ANAND_FIRM,
      owner_id: RAJ_ADMIN_USER_ID,
      city: 'Anand', state: 'Gujarat',
      estimated_value: 6_400_000,
      order_value: 6_400_000,
      custom_fields: {
        description: 'Historical project completed Q1 2026. LV distribution panel-set for Tablet Block A. Handed over 2026-03-18; DLP runs through 2027-03-18; AMC due Q4 2026.',
      },
    }, { onConflict: 'id' })
  }

  // ─── 7+8. Final audit, dump counts to confirm ────────────────────
  console.log('\n--- counts after seed ---')
  for (const t of ['lead', 'invoice', 'receipt', 'collection', 'promise_to_pay', 'field_visit', 'project']) {
    const { count } = await sb.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', RAJ_TENANT_ID)
    console.log(` ${t}: ${count}`)
  }

  console.log('\nok')
}

main().catch((err) => {
  console.error(`phase 7e seed failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
