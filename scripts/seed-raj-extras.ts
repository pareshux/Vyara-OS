#!/usr/bin/env tsx
/**
 * scripts/seed-raj-extras.ts — Phase 7a: fill gaps in Raj's mock data.
 *
 * Browse-walk surfaced 5 empty modules + 2 missing UX dropdowns. Seeds:
 *  - 2 new Raj users (manager + sales_engineer) for assignee dropdowns
 *  - 4 leads at different stages
 *  - 1 warehouse + 4 stock_location rows + a few stock_movement rows
 *  - 2 dispatch records for the 2 in-flight EPC orders
 *  - field_attendance + field_visit rows for the 2 new field users (last week)
 *
 * Idempotent via fixed UUIDs + upsert / delete-then-insert.
 *
 * Run: tsx --env-file=.env.local scripts/seed-raj-extras.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const RAJ_TENANT_ID     = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'
const RAJ_ADMIN_USER_ID = 'c6ae8540-a65b-4249-84b5-7f410a64e29f'

// Existing Raj refs (from Phase 2)
const SURAT_FIRM  = 'aa020001-0000-0000-0000-000000000001'
const ANAND_FIRM  = 'aa020002-0000-0000-0000-000000000002'
const ADANI_FIRM  = 'aa020003-0000-0000-0000-000000000003'
const LT_FIRM     = 'aa020004-0000-0000-0000-000000000004'
const RELIANCE_FIRM = 'aa020005-0000-0000-0000-000000000005'
const PROD_HT_CABLE = 'aa010001-0000-0000-0000-000000000001'
const PROD_LT_CABLE = 'aa010002-0000-0000-0000-000000000002'
const PROD_TRANSFORMER = 'aa010003-0000-0000-0000-000000000003'
const PROD_MCC = 'aa010004-0000-0000-0000-000000000004'
const PROD_VFD = 'aa010006-0000-0000-0000-000000000006'
const PROD_HT_SWG = 'aa010007-0000-0000-0000-000000000007'
const SURAT_PROJECT = 'aa040001-0000-0000-0000-000000000001'
const ADANI_PROJECT = 'aa040002-0000-0000-0000-000000000002'
const SURAT_ORDER = 'aa070001-0000-0000-0000-000000000001'
const ADANI_ORDER = 'aa070002-0000-0000-0000-000000000002'

// New refs for Phase 7a (predictable user UUIDs are auth-generated;
// we capture them at runtime and write user_profile rows with those ids).
const WAREHOUSE_ID = 'aa0c0001-0000-0000-0000-000000000001'
const sl = (n: number) => `aa0d000${n}-0000-0000-0000-${String(n).padStart(12, '0')}`
const ld = (n: number) => `aa0e000${n}-0000-0000-0000-${String(n).padStart(12, '0')}`
const dp = (n: number) => `aa0f000${n}-0000-0000-0000-${String(n).padStart(12, '0')}`
const dpl = (n: number) => `aa100001-0000-0000-0000-${String(n).padStart(12, '0')}`
const at = (n: number) => `aa110001-0000-0000-0000-${String(n).padStart(12, '0')}`
const fv = (n: number) => `aa120001-0000-0000-0000-${String(n).padStart(12, '0')}`

const RAJ_MANAGER_EMAIL = 'manager@rajavinsys.example'
const RAJ_MANAGER_PWD   = 'RajDemo@1234'
const RAJ_SE_EMAIL      = 'engineer@rajavinsys.example'
const RAJ_SE_PWD        = 'RajDemo@1234'

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('env vars missing')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─── Auth user + profile provisioner ──────────────────────────────

async function ensureUser(client: SupabaseClient, email: string, password: string, profile: { full_name: string; role: 'manager' | 'sales_engineer'; phone?: string | null; territory?: string | null }): Promise<string> {
  let userId: string | null = null
  const { data: created, error: cErr } = await client.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: profile.full_name },
  })
  if (cErr) {
    if (/already.*registered|already.*exists/i.test(cErr.message)) {
      const { data: list } = await client.auth.admin.listUsers({ perPage: 200 })
      const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
      if (!found) throw new Error(`auth user lookup failed for ${email}`)
      userId = found.id
    } else {
      throw new Error(`auth.createUser failed for ${email}: ${cErr.message}`)
    }
  } else {
    userId = created.user.id
  }
  if (!userId) throw new Error('userId not resolved')

  await client.from('user_profile').upsert({
    id: userId, tenant_id: RAJ_TENANT_ID, role: profile.role,
    full_name: profile.full_name, phone: profile.phone ?? null,
    territory: profile.territory ?? null, is_active: true,
  }, { onConflict: 'id' })

  return userId
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const client = sb()
  const summary: Record<string, number> = {}

  // 1. Provision 2 Raj users
  console.log('Provisioning Raj users...')
  const mgrId = await ensureUser(client, RAJ_MANAGER_EMAIL, RAJ_MANAGER_PWD, {
    full_name: 'Bhavesh Patel', role: 'manager', phone: '+91-98253-11111', territory: 'Gujarat South',
  })
  const seId = await ensureUser(client, RAJ_SE_EMAIL, RAJ_SE_PWD, {
    full_name: 'Nikhil Shah', role: 'sales_engineer', phone: '+91-98253-22222', territory: 'Gujarat South',
  })
  summary.users_provisioned = 2

  // 2. Leads — 4 across stages
  console.log('Seeding leads...')
  // First confirm lead_stage system rows exist + pick ids
  const { data: stages } = await client.from('lead_stage').select('id, stage_key').is('tenant_id', null)
  const stageId = (k: string) => stages?.find((s) => s.stage_key === k)?.id
  const stNew = stageId('new')        ?? stageId('contacted')
  const stQual = stageId('qualified') ?? stageId('contacted') ?? stNew
  const stProp = stageId('proposal')  ?? stageId('proposing') ?? stageId('quoted') ?? stQual
  const stNeg = stageId('negotiating')?? stageId('negotiation') ?? stProp
  if (!stNew || !stQual || !stProp || !stNeg) {
    throw new Error('lead_stage system rows missing (need at least new/qualified/proposal/negotiating)')
  }

  await client.from('lead').delete().in('id', [ld(1), ld(2), ld(3), ld(4)])
  await client.from('lead').insert([
    {
      id: ld(1), tenant_id: RAJ_TENANT_ID, lead_number: 'RA-LD-2026-0001',
      title: 'Reliance Polymers — APFC retrofit (Block 7)',
      segment: 'corporate', current_stage_id: stNew,
      buyer_firm_id: RELIANCE_FIRM, city: 'Vapi', state: 'Gujarat',
      estimated_value: 1_800_000, expected_close_at: '2026-08-15',
      owner_id: seId, contact_name_raw: 'Mr. Hardik Modi',
    },
    {
      id: ld(2), tenant_id: RAJ_TENANT_ID, lead_number: 'RA-LD-2026-0002',
      title: 'Surat Chemicals — Expansion Plant 4 HT infra',
      segment: 'corporate', current_stage_id: stQual,
      buyer_firm_id: SURAT_FIRM, city: 'Surat', state: 'Gujarat',
      estimated_value: 32_000_000, expected_close_at: '2026-10-30',
      owner_id: mgrId,
    },
    {
      id: ld(3), tenant_id: RAJ_TENANT_ID, lead_number: 'RA-LD-2026-0003',
      title: 'Anand Pharma — DG-set switchboard replacement',
      segment: 'corporate', current_stage_id: stProp,
      buyer_firm_id: ANAND_FIRM, city: 'Anand', state: 'Gujarat',
      estimated_value: 8_500_000, expected_close_at: '2026-07-30',
      owner_id: seId,
    },
    {
      id: ld(4), tenant_id: RAJ_TENANT_ID, lead_number: 'RA-LD-2026-0004',
      title: 'L&T Infra Vapi — Phase 2 HT cable + panels',
      segment: 'corporate', current_stage_id: stNeg,
      buyer_firm_id: LT_FIRM, city: 'Vapi', state: 'Gujarat',
      estimated_value: 12_500_000, expected_close_at: '2026-07-10',
      owner_id: mgrId,
    },
  ])
  summary.leads = 4

  // 3. Warehouse + stock_location
  console.log('Seeding warehouse + stock_locations...')
  await client.from('warehouse').upsert([{
    id: WAREHOUSE_ID, tenant_id: RAJ_TENANT_ID,
    code: 'RA-WH-VAPI-01', name: 'Vapi Workshop & Stores',
    type: 'own_plant', city: 'Vapi', state: 'Gujarat',
    manager_id: mgrId, is_active: true,
    notes: 'Main panel-assembly workshop. Stocks components for in-flight EPC + Panel jobs + AMC spares.',
  }], { onConflict: 'id' })

  await client.from('stock_location').delete().eq('warehouse_id', WAREHOUSE_ID)
  await client.from('stock_location').insert([
    { id: sl(1), tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_HT_CABLE, available_qty:  600, reserved_qty: 800 },
    { id: sl(2), tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_LT_CABLE, available_qty: 1400, reserved_qty: 600 },
    { id: sl(3), tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_TRANSFORMER, available_qty: 1, reserved_qty: 2 },
    { id: sl(4), tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_MCC, available_qty: 3, reserved_qty: 2 },
    { id: sl(5), tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_VFD, available_qty: 0, reserved_qty: 6 },
    { id: sl(6), tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_HT_SWG, available_qty: 0, reserved_qty: 2 },
  ])
  summary.stock_locations = 6

  // Stock movements — a small set showing recent activity
  await client.from('stock_movement').delete().eq('warehouse_id', WAREHOUSE_ID)
  await client.from('stock_movement').insert([
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_HT_CABLE, movement_type: 'receipt',         quantity:  800, reason_code: 'Production receipt', created_by: mgrId },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_TRANSFORMER, movement_type: 'receipt',      quantity:    2, reason_code: 'Vendor delivery (Schneider)', created_by: mgrId },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_HT_CABLE, movement_type: 'reservation_in',  quantity:  800, reason_code: 'Reserved for RA-SO-2026-0001 (Surat)', created_by: mgrId },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_VFD, movement_type: 'reservation_in',       quantity:    6, reason_code: 'Reserved for RA-SO-2026-0003 (L&T)', created_by: mgrId },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_MCC, movement_type: 'adjustment_minus',     quantity:    1, reason_code: 'Damaged in storage', created_by: mgrId },
  ])
  summary.stock_movements = 5

  // 4. Dispatch — 2 for in-flight orders (Surat in_production, Adani in_production)
  console.log('Seeding dispatches...')
  // Find dispatch_stage system rows
  const { data: dStages } = await client.from('dispatch_stage').select('id, stage_key').is('tenant_id', null)
  const dsScheduled = dStages?.find((s) => s.stage_key === 'scheduled')?.id
                   ?? dStages?.find((s) => s.stage_key === 'loaded')?.id
                   ?? dStages?.[0]?.id
  const dsInTransit = dStages?.find((s) => s.stage_key === 'in_transit')?.id
                   ?? dStages?.find((s) => s.stage_key === 'dispatched')?.id
                   ?? dsScheduled
  if (!dsScheduled || !dsInTransit) throw new Error('dispatch_stage system rows missing')

  await client.from('dispatch').delete().in('id', [dp(1), dp(2)])
  await client.from('dispatch').insert([
    {
      id: dp(1), tenant_id: RAJ_TENANT_ID, dispatch_number: 'RA-DC-2026-0001',
      sales_order_id: SURAT_ORDER, project_id: SURAT_PROJECT,
      current_stage_id: dsScheduled,
      lr_number: 'GJP/2026/0042', vehicle_number: 'GJ-05-AC-1234',
      driver_phone: '+91-98253-77777',
      scheduled_at: new Date('2026-07-05T08:00:00Z').toISOString(),
      notes: 'First tranche of HT panels — Surat Plant 3.',
      owner_id: mgrId,
    },
    {
      id: dp(2), tenant_id: RAJ_TENANT_ID, dispatch_number: 'RA-DC-2026-0002',
      sales_order_id: ADANI_ORDER, project_id: ADANI_PROJECT,
      current_stage_id: dsInTransit,
      lr_number: 'GJP/2026/0044', vehicle_number: 'GJ-01-BD-5678',
      driver_phone: '+91-98253-88888',
      scheduled_at: new Date('2026-06-20T07:00:00Z').toISOString(),
      dispatched_at: new Date('2026-06-21T09:30:00Z').toISOString(),
      notes: 'Tranche 1 of 4 — transformers + HT cable.',
      owner_id: mgrId,
    },
  ])
  await client.from('dispatch_line').delete().in('dispatch_id', [dp(1), dp(2)])
  await client.from('dispatch_line').insert([
    { id: dpl(1), tenant_id: RAJ_TENANT_ID, dispatch_id: dp(1), product_name: 'MCC Panel 200A · IP54',           sku_code: 'PNL-MCC-200', unit: 'nos', quantity: 2, sort_order: 1 },
    { id: dpl(2), tenant_id: RAJ_TENANT_ID, dispatch_id: dp(1), product_name: 'HT Indoor Switchgear 12kV · VCB', sku_code: 'SWG-HT-IDR', unit: 'nos', quantity: 1, sort_order: 2 },
    { id: dpl(3), tenant_id: RAJ_TENANT_ID, dispatch_id: dp(2), product_name: '500 kVA · 11kV / 433V Transformer ONAN', sku_code: 'TX-500-11', unit: 'nos', quantity: 2, sort_order: 1 },
    { id: dpl(4), tenant_id: RAJ_TENANT_ID, dispatch_id: dp(2), product_name: '11kV HT XLPE Cable 3C × 95 sq.mm',       sku_code: 'CBL-HT-95', unit: 'rmt', quantity: 2500, sort_order: 2 },
  ])
  summary.dispatches = 2
  summary.dispatch_lines = 4

  // 5. Field attendance + visits for the 2 new users — last 5 working days
  console.log('Seeding field activity...')
  await client.from('field_attendance').delete().in('user_id', [mgrId, seId])

  const today = new Date()
  const day = (offset: number) => new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10)

  // Find visit_purpose system rows (site_survey, installation, amc_visit, etc.)
  const { data: vps } = await client.from('visit_purpose').select('id, code').is('tenant_id', null)
  const vpId = (code: string) => vps?.find((v) => v.code === code)?.id

  // 5a. 5 attendance rows for SE (today + last 4)
  await client.from('field_attendance').insert([
    { tenant_id: RAJ_TENANT_ID, user_id: seId,  attendance_date: day(0), status_for_day: 'on_duty', check_in_at: new Date(`${day(0)}T09:15:00+05:30`).toISOString(), check_in_lat: 21.1702, check_in_lng: 72.8311, check_in_odometer_km: 24512 },
    { tenant_id: RAJ_TENANT_ID, user_id: seId,  attendance_date: day(1), status_for_day: 'on_duty', check_in_at: new Date(`${day(1)}T08:45:00+05:30`).toISOString(), check_out_at: new Date(`${day(1)}T18:30:00+05:30`).toISOString(), check_in_odometer_km: 24398, check_out_odometer_km: 24512 },
    { tenant_id: RAJ_TENANT_ID, user_id: seId,  attendance_date: day(2), status_for_day: 'on_duty', check_in_at: new Date(`${day(2)}T09:00:00+05:30`).toISOString(), check_out_at: new Date(`${day(2)}T19:00:00+05:30`).toISOString(), check_in_odometer_km: 24210, check_out_odometer_km: 24398 },
    { tenant_id: RAJ_TENANT_ID, user_id: seId,  attendance_date: day(3), status_for_day: 'wfh' },
    { tenant_id: RAJ_TENANT_ID, user_id: seId,  attendance_date: day(4), status_for_day: 'on_duty', check_in_at: new Date(`${day(4)}T08:30:00+05:30`).toISOString(), check_out_at: new Date(`${day(4)}T17:45:00+05:30`).toISOString(), check_in_odometer_km: 24105, check_out_odometer_km: 24210 },
    // Manager
    { tenant_id: RAJ_TENANT_ID, user_id: mgrId, attendance_date: day(0), status_for_day: 'on_duty', check_in_at: new Date(`${day(0)}T09:30:00+05:30`).toISOString() },
    { tenant_id: RAJ_TENANT_ID, user_id: mgrId, attendance_date: day(1), status_for_day: 'on_duty', check_in_at: new Date(`${day(1)}T09:00:00+05:30`).toISOString(), check_out_at: new Date(`${day(1)}T18:00:00+05:30`).toISOString() },
    { tenant_id: RAJ_TENANT_ID, user_id: mgrId, attendance_date: day(2), status_for_day: 'on_duty', check_in_at: new Date(`${day(2)}T09:15:00+05:30`).toISOString(), check_out_at: new Date(`${day(2)}T19:30:00+05:30`).toISOString() },
    { tenant_id: RAJ_TENANT_ID, user_id: mgrId, attendance_date: day(3), status_for_day: 'leave' },
    { tenant_id: RAJ_TENANT_ID, user_id: mgrId, attendance_date: day(4), status_for_day: 'on_duty', check_in_at: new Date(`${day(4)}T09:00:00+05:30`).toISOString(), check_out_at: new Date(`${day(4)}T18:15:00+05:30`).toISOString() },
  ])
  summary.field_attendance = 10

  // 5b. Field visits — 4 in the last 5 days for the SE
  await client.from('field_visit').delete().in('user_id', [mgrId, seId])
  await client.from('field_visit').insert([
    {
      id: fv(1), tenant_id: RAJ_TENANT_ID, user_id: seId,
      visited_at: new Date(`${day(1)}T11:00:00+05:30`).toISOString(),
      duration_minutes: 90,
      visit_purpose_id: vpId('site_survey'),
      project_id: SURAT_PROJECT, firm_id: SURAT_FIRM,
      lat: 21.1702, lng: 72.8311, location_label: 'Surat Chemicals — Plant 3 yard',
      state: 'completed',
    },
    {
      id: fv(2), tenant_id: RAJ_TENANT_ID, user_id: seId,
      visited_at: new Date(`${day(2)}T14:00:00+05:30`).toISOString(),
      duration_minutes: 120,
      visit_purpose_id: vpId('amc_visit'),
      firm_id: SURAT_FIRM,
      lat: 21.1702, lng: 72.8311, location_label: 'Surat Chemicals — AMC monthly visit',
      state: 'completed',
    },
    {
      id: fv(3), tenant_id: RAJ_TENANT_ID, user_id: seId,
      visited_at: new Date(`${day(4)}T10:30:00+05:30`).toISOString(),
      duration_minutes: 75,
      visit_purpose_id: vpId('sales_visit'),
      lead_id: ld(1), firm_id: RELIANCE_FIRM,
      lat: 20.3754, lng: 72.9047, location_label: 'Reliance Polymers GIDC, Vapi',
      state: 'completed',
    },
    {
      id: fv(4), tenant_id: RAJ_TENANT_ID, user_id: seId,
      visited_at: new Date(`${day(0)}T10:00:00+05:30`).toISOString(),
      visit_purpose_id: vpId('breakdown_response'),
      firm_id: SURAT_FIRM, project_id: SURAT_PROJECT,
      lat: 21.1702, lng: 72.8311, location_label: 'Surat Chemicals — HT panel breakdown',
      state: 'in_progress',
    },
  ])
  summary.field_visits = 4

  console.log(JSON.stringify({ ok: true, summary, raj_users: { manager_id: mgrId, sales_engineer_id: seId } }, null, 2))
}

main().catch((err) => {
  console.error(`seed-raj-extras failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
