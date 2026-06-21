#!/usr/bin/env tsx
/**
 * scripts/seed-raj-mock-data.ts — Raj demo Phase 2 mock data.
 *
 * Seeds products, firms, contacts, projects, quotations, sales orders,
 * and one advance invoice for the raj-avinsys tenant. All rows use
 * fixed UUIDs (prefix aa<entity>...) so re-runs UPSERT cleanly.
 *
 * Run AFTER:
 *   - scripts/onboard-tenant.ts ./scripts/onboard-tenant-config.raj.json
 *   - scripts/seed-raj-pipeline.ts
 *   - migration 0046 applied (project.segment CHECK extended)
 *
 * Auth: requires SUPABASE_SERVICE_ROLE_KEY. Run as:
 *   tsx --env-file=.env.local scripts/seed-raj-mock-data.ts
 *
 * Idempotency: fixed UUIDs + upsert on PK. Re-runs replace existing
 * rows (UPDATE on conflict). Activity triggers will fire on each
 * re-run, accumulating duplicate activity rows — acceptable for demo
 * (cleanup is `DELETE FROM activity WHERE entity_id IN (...)`).
 *
 * Constitution v3 / 2026-06-22.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Constants ────────────────────────────────────────────────────

const RAJ_TENANT_ID = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'
const RAJ_ADMIN_USER_ID = 'c6ae8540-a65b-4249-84b5-7f410a64e29f'

// Fixed UUID generator helpers. Pattern: aa<entity-prefix><seq>...
const fid = (entityPrefix: string, n: number): string =>
  `aa${entityPrefix.padStart(2, '0')}${String(n).padStart(4, '0')}-0000-0000-0000-${String(n).padStart(12, '0')}`

const productId  = (n: number) => fid('01', n)
const firmId     = (n: number) => fid('02', n)
const contactId  = (n: number) => fid('03', n)
const projectId  = (n: number) => fid('04', n)
const quoteId    = (n: number) => fid('05', n)
const qlineId    = (n: number) => fid('06', n)
const orderId    = (n: number) => fid('07', n)
const olineId    = (n: number) => fid('08', n)
const invoiceId  = (n: number) => fid('09', n)

// ─── Service-role client ──────────────────────────────────────────

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─── Lookup helpers ───────────────────────────────────────────────

async function lookupStageId(s: SupabaseClient, segment: string, stage_key: string): Promise<string> {
  const { data, error } = await s.from('pipeline_stage')
    .select('id')
    .eq('tenant_id', RAJ_TENANT_ID)
    .eq('segment', segment)
    .eq('stage_key', stage_key)
    .single()
  if (error || !data) throw new Error(`pipeline_stage lookup failed for ${segment}/${stage_key}: ${error?.message ?? 'no row'}`)
  return data.id as string
}

async function lookupOrderStageId(s: SupabaseClient, stage_key: string): Promise<string> {
  const { data, error } = await s.from('order_stage')
    .select('id')
    .is('tenant_id', null)
    .eq('stage_key', stage_key)
    .single()
  if (error || !data) throw new Error(`order_stage lookup failed for ${stage_key}: ${error?.message ?? 'no row'}`)
  return data.id as string
}

// ─── Data ─────────────────────────────────────────────────────────

const PRODUCTS = [
  // Cables
  { id: productId(1), sku_code: 'CBL-HT-95',  name: '11kV HT XLPE Cable 3C × 95 sq.mm',    category: 'Cable',      unit: 'rmt', mrp:  485, base_price: 410 },
  { id: productId(2), sku_code: 'CBL-LT-150', name: 'LT XLPE Cable 3.5C × 150 sq.mm',      category: 'Cable',      unit: 'rmt', mrp:  185, base_price: 158 },
  // Transformers
  { id: productId(3), sku_code: 'TX-500-11', name: '500 kVA · 11kV / 433V Transformer ONAN', category: 'Transformer', unit: 'nos', mrp: 385000, base_price: 320000 },
  // Panels
  { id: productId(4), sku_code: 'PNL-MCC-200', name: 'MCC Panel 200A · IP54',            category: 'Panel',      unit: 'nos', mrp: 135000, base_price: 112000 },
  { id: productId(5), sku_code: 'PNL-APFC-100', name: 'APFC Panel 100 kVAr · IP42',      category: 'Panel',      unit: 'nos', mrp:  95000, base_price:  78000 },
  { id: productId(6), sku_code: 'PNL-VFD-75',  name: 'VFD Panel 75 kW · Drive + Bypass', category: 'Panel',      unit: 'nos', mrp: 175000, base_price: 145000 },
  // Switchgear
  { id: productId(7), sku_code: 'SWG-HT-IDR', name: 'HT Indoor Switchgear 12kV · Vacuum Circuit Breaker', category: 'Switchgear', unit: 'nos', mrp: 485000, base_price: 415000 },
  // Hardware (cable trays, etc)
  { id: productId(8), sku_code: 'HW-TRAY-300', name: 'GI Cable Tray 300mm × 75mm · Perforated', category: 'Hardware', unit: 'rmt', mrp: 385, base_price: 310 },
]

const FIRMS = [
  { id: firmId(1), name: 'Surat Chemicals Pvt Ltd',           type: 'customer', city: 'Surat',     gstin: '24AABCS1234A1Z5', phone: '+91-261-2345-678', email: 'plant@suratchemicals.example' },
  { id: firmId(2), name: 'Anand Pharma Ltd',                  type: 'customer', city: 'Anand',     gstin: '24AABCA9876B2Z1', phone: '+91-2692-345-789', email: 'eng@anandpharma.example' },
  { id: firmId(3), name: 'Adani Green Energy Co.',            type: 'customer', city: 'Mundra',    gstin: '24AABCA1111C3Z3', phone: '+91-2838-279-000', email: 'epc@adanigreen.example' },
  { id: firmId(4), name: 'L&T Infrastructure (Vapi Office)',  type: 'customer', city: 'Vapi',      gstin: '24AAACL5555D4Z4', phone: '+91-260-241-2345', email: 'vapi.proj@lntinfra.example' },
  { id: firmId(5), name: 'Reliance Polymers GIDC',            type: 'customer', city: 'Vapi',      gstin: '24AAACR9999E5Z6', phone: '+91-260-242-9876', email: 'electrical@relpoly.example' },
]

const CONTACTS = [
  // Surat Chemicals (firm 1)
  { id: contactId(1),  firm_id: firmId(1), full_name: 'Mr. Bhavin Shah',     role_title: 'Plant Engineer',       phone: '+91-98250-12345', email: 'bhavin.shah@suratchemicals.example' },
  { id: contactId(2),  firm_id: firmId(1), full_name: 'Mr. Ramesh Patel',    role_title: 'GM Projects',          phone: '+91-98250-23456', email: 'ramesh.patel@suratchemicals.example' },
  { id: contactId(3),  firm_id: firmId(1), full_name: 'Ms. Pooja Mehta',     role_title: 'Finance Manager',      phone: '+91-98250-34567', email: 'pooja.mehta@suratchemicals.example' },
  // Anand Pharma (firm 2)
  { id: contactId(4),  firm_id: firmId(2), full_name: 'Dr. Anjali Pandya',   role_title: 'VP Engineering',       phone: '+91-99258-45678', email: 'a.pandya@anandpharma.example' },
  { id: contactId(5),  firm_id: firmId(2), full_name: 'Mr. Kirti Joshi',     role_title: 'Maintenance Head',     phone: '+91-99258-56789', email: 'k.joshi@anandpharma.example' },
  // Adani Green (firm 3)
  { id: contactId(6),  firm_id: firmId(3), full_name: 'Mr. Vikas Agarwal',   role_title: 'EPC Project Director', phone: '+91-99099-67890', email: 'v.agarwal@adanigreen.example' },
  { id: contactId(7),  firm_id: firmId(3), full_name: 'Mr. Suresh Iyer',     role_title: 'Electrical Lead',      phone: '+91-99099-78901', email: 's.iyer@adanigreen.example' },
  { id: contactId(8),  firm_id: firmId(3), full_name: 'Ms. Nidhi Krishnan',  role_title: 'Procurement Officer',  phone: '+91-99099-89012', email: 'n.krishnan@adanigreen.example' },
  // L&T Infra (firm 4)
  { id: contactId(9),  firm_id: firmId(4), full_name: 'Mr. Arjun Reddy',     role_title: 'Site Project Manager', phone: '+91-93760-90123', email: 'arjun.r@lntinfra.example' },
  { id: contactId(10), firm_id: firmId(4), full_name: 'Mr. Manoj Kale',      role_title: 'Electrical Engineer',  phone: '+91-93760-01234', email: 'manoj.k@lntinfra.example' },
  // Reliance Polymers (firm 5)
  { id: contactId(11), firm_id: firmId(5), full_name: 'Mr. Hardik Modi',     role_title: 'Asst. Manager - Utilities', phone: '+91-94288-12345', email: 'h.modi@relpoly.example' },
  { id: contactId(12), firm_id: firmId(5), full_name: 'Mr. Pranav Joshi',    role_title: 'Sr. Electrical Engineer',   phone: '+91-94288-23456', email: 'p.joshi@relpoly.example' },
]

// Project metadata. current_stage_id + buyer_firm_id resolved at runtime.
const PROJECTS = [
  {
    id: projectId(1),
    name: 'Surat Chemicals — Plant 3 HT Power Distribution',
    segment: 'epc_project',
    stage_key: 'drawings_approved',  // Stage 9
    buyer_firm: 1,
    city: 'Surat',
    estimated_value: 18_500_000,
    order_value:     18_500_000,
    notes: 'New 11kV incomer + LV distribution for Plant 3 expansion. Order awarded Q1 2026; drawings approved 2026-05-30. Manufacturing kicks off next week.',
  },
  {
    id: projectId(2),
    name: 'Adani Green — Mundra Solar Park HT Infrastructure',
    segment: 'epc_project',
    stage_key: 'manufacturing',  // Stage 11
    buyer_firm: 3,
    city: 'Mundra',
    estimated_value: 42_000_000,
    order_value:     42_000_000,
    notes: '500 MW solar HT collection infrastructure. Panel assembly 60% complete; FAT scheduled 2026-07-15. On-site mobilisation 2026-08-01.',
  },
  {
    id: projectId(3),
    name: 'Anand Pharma — MCC Refurbishment',
    segment: 'epc_project',
    stage_key: 'quote_sent',  // Stage 5
    buyer_firm: 2,
    city: 'Anand',
    estimated_value: 2_800_000,
    order_value:     null,  // not won yet
    notes: 'Refurbishment of 4 MCC panels in API Block C. Quote sent 2026-06-15; customer reviewing. Decision expected by month-end.',
  },
  {
    id: projectId(4),
    name: 'L&T Infra Vapi — VFD Panel Set',
    segment: 'panel_order',
    stage_key: 'manufacturing',  // Panel Stage 7
    buyer_firm: 4,
    city: 'Vapi',
    estimated_value: 4_200_000,
    order_value:     4_200_000,
    notes: 'Six 75 kW VFD panels for raw water pumping station. Drawings approved; assembly in progress.',
  },
]

// Project stakeholders — pair each project with its primary contacts
const STAKEHOLDERS = [
  // Surat Chemicals project
  { project_id: projectId(1), contact_id: contactId(1), role: 'buyer',          is_primary: true  },
  { project_id: projectId(1), contact_id: contactId(2), role: 'decision_maker', is_primary: false },
  // Adani project
  { project_id: projectId(2), contact_id: contactId(6), role: 'decision_maker', is_primary: true  },
  { project_id: projectId(2), contact_id: contactId(7), role: 'buyer',          is_primary: false },
  // Anand Pharma project
  { project_id: projectId(3), contact_id: contactId(4), role: 'decision_maker', is_primary: true  },
  { project_id: projectId(3), contact_id: contactId(5), role: 'influencer',     is_primary: false },
  // L&T Vapi project
  { project_id: projectId(4), contact_id: contactId(9), role: 'buyer',          is_primary: true  },
]

// Quotations. Pre-fill quotation_number with RA-* prefix to bypass the
// VT-* hardcoded trigger (recorded as Vyara-ism in OVERNIGHT-NOTES).
const QUOTATIONS = [
  { id: quoteId(1), project_idx: 1, quotation_number: 'RA-QT-2026-0001', status: 'accepted', subtotal: 18_500_000, total: 18_500_000, sent_at: '2026-04-12T10:00:00Z', accepted_at: '2026-04-28T15:30:00Z' },
  { id: quoteId(2), project_idx: 2, quotation_number: 'RA-QT-2026-0002', status: 'accepted', subtotal: 42_000_000, total: 42_000_000, sent_at: '2026-03-08T11:00:00Z', accepted_at: '2026-03-25T16:00:00Z' },
  { id: quoteId(3), project_idx: 3, quotation_number: 'RA-QT-2026-0003', status: 'sent',     subtotal:  2_800_000, total:  2_800_000, sent_at: '2026-06-15T09:00:00Z', accepted_at: null },
  { id: quoteId(4), project_idx: 4, quotation_number: 'RA-QT-2026-0004', status: 'accepted', subtotal:  4_200_000, total:  4_200_000, sent_at: '2026-05-02T14:00:00Z', accepted_at: '2026-05-12T11:00:00Z' },
]

// Quotation lines — keep tight (3-4 lines per quote)
const QUOTATION_LINES = [
  // Quote 1 (Surat Chemicals — ₹1.85cr)
  { id: qlineId(1),  quote_id: quoteId(1), product_idx: 3, quantity: 2,     unit_price: 385000, sort_order: 1 }, // 2 transformers = 7.7L
  { id: qlineId(2),  quote_id: quoteId(1), product_idx: 7, quantity: 1,     unit_price: 485000, sort_order: 2 }, // 1 HT switchgear = 4.85L
  { id: qlineId(3),  quote_id: quoteId(1), product_idx: 1, quantity: 800,   unit_price:    485, sort_order: 3 }, // 800m HT cable = 3.88L
  { id: qlineId(4),  quote_id: quoteId(1), product_idx: 4, quantity: 2,     unit_price: 135000, sort_order: 4 }, // 2 MCC panels = 2.7L
  // Quote 2 (Adani Mundra — ₹4.2cr)
  { id: qlineId(5),  quote_id: quoteId(2), product_idx: 3, quantity: 8,     unit_price: 385000, sort_order: 1 }, // 8 transformers = 30.8L
  { id: qlineId(6),  quote_id: quoteId(2), product_idx: 1, quantity: 5000,  unit_price:    485, sort_order: 2 }, // 5000m HT cable = 24.25L
  { id: qlineId(7),  quote_id: quoteId(2), product_idx: 7, quantity: 1,     unit_price: 485000, sort_order: 3 }, // 1 HT switchgear = 4.85L
  // Quote 3 (Anand Pharma — ₹28L)
  { id: qlineId(8),  quote_id: quoteId(3), product_idx: 4, quantity: 4,     unit_price: 135000, sort_order: 1 }, // 4 MCC panels = 5.4L
  { id: qlineId(9),  quote_id: quoteId(3), product_idx: 5, quantity: 2,     unit_price:  95000, sort_order: 2 }, // 2 APFC panels = 1.9L
  // Quote 4 (L&T VFD — ₹42L)
  { id: qlineId(10), quote_id: quoteId(4), product_idx: 6, quantity: 6,     unit_price: 175000, sort_order: 1 }, // 6 VFD panels = 10.5L
  { id: qlineId(11), quote_id: quoteId(4), product_idx: 2, quantity: 600,   unit_price:    185, sort_order: 2 }, // 600m LT cable = 1.11L
]

// Sales orders — one per accepted quote (3 orders for 3 accepted quotes).
// current_stage_id resolved at runtime to order_stage system rows.
// stage_key 'in_production' aligns with project's manufacturing-ish stage.
const SALES_ORDERS = [
  { id: orderId(1), order_number: 'RA-SO-2026-0001', quote_idx: 1, project_idx: 1, buyer_firm: 1, stage_key: 'in_production', value: 18_500_000, order_date: '2026-04-29', expected_delivery_at: '2026-08-15' },
  { id: orderId(2), order_number: 'RA-SO-2026-0002', quote_idx: 2, project_idx: 2, buyer_firm: 3, stage_key: 'in_production', value: 42_000_000, order_date: '2026-03-26', expected_delivery_at: '2026-09-30' },
  { id: orderId(3), order_number: 'RA-SO-2026-0003', quote_idx: 4, project_idx: 4, buyer_firm: 4, stage_key: 'in_production', value:  4_200_000, order_date: '2026-05-13', expected_delivery_at: '2026-07-20' },
]

// One advance invoice (10% milestone) — Surat Chemicals.
const INVOICES = [
  {
    id: invoiceId(1),
    invoice_number: 'RA-INV-2026-0001',
    project_idx: 1,
    order_idx: 1,
    buyer_firm: 1,
    invoice_date: '2026-04-30',
    due_date: '2026-05-30',
    payment_terms_days: 30,
    subtotal: 1_850_000,
    gst_pct: 18,
    gst_amount: 333_000,
    total: 2_183_000,
    retention_pct: 0,
    retention_amount: 0,
    billed_amount: 2_183_000,
    paid_amount: 2_183_000,  // advance paid in full
    is_running_bill: true,
    running_bill_seq: 1,
    is_final_bill: false,
    status: 'paid',
    notes: 'RA Bill 1 of 5 · Advance 10% on PO',
  },
]

// ─── Seed helpers ─────────────────────────────────────────────────

type Summary = { table: string; rows: number; action: 'upserted' | 'inserted' }
const summary: Summary[] = []

async function upsert(s: SupabaseClient, table: string, rows: object[], onConflict = 'id') {
  if (rows.length === 0) return
  const withTenant = rows.map((r) => ({ tenant_id: RAJ_TENANT_ID, ...r }))
  const { error } = await s.from(table).upsert(withTenant, { onConflict })
  if (error) throw new Error(`${table} upsert failed: ${error.message}`)
  summary.push({ table, rows: rows.length, action: 'upserted' })
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const s = sb()

  // Stage IDs we need to embed in projects + sales_orders
  console.log('Looking up stage IDs...')
  const projectStageIds: Record<string, string> = {}
  for (const p of PROJECTS) {
    const key = `${p.segment}/${p.stage_key}`
    if (!projectStageIds[key]) projectStageIds[key] = await lookupStageId(s, p.segment, p.stage_key)
  }
  const orderStageIds: Record<string, string> = {}
  for (const o of SALES_ORDERS) {
    if (!orderStageIds[o.stage_key]) orderStageIds[o.stage_key] = await lookupOrderStageId(s, o.stage_key)
  }

  // 1. Products
  console.log('Seeding products...')
  await upsert(s, 'product', PRODUCTS)

  // 2. Firms
  console.log('Seeding firms...')
  await upsert(s, 'firm', FIRMS.map((f) => ({
    id: f.id, name: f.name, type: f.type, city: f.city, gstin: f.gstin,
    phone: f.phone, email: f.email, state: 'Gujarat',
  })))

  // 3. Contacts
  console.log('Seeding contacts...')
  await upsert(s, 'contact', CONTACTS)

  // 4. Projects (must come before stakeholders / quotes / orders)
  // Note: `project` table doesn't have a `notes` column — we stash
  // descriptive text in custom_fields.description (JSONB).
  console.log('Seeding projects...')
  await upsert(s, 'project', PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    segment: p.segment,
    current_stage_id: projectStageIds[`${p.segment}/${p.stage_key}`],
    buyer_firm_id: firmId(p.buyer_firm),
    owner_id: RAJ_ADMIN_USER_ID,
    city: p.city,
    state: 'Gujarat',
    estimated_value: p.estimated_value,
    order_value: p.order_value,
    custom_fields: { description: p.notes },
  })))

  // 5. Stakeholders
  console.log('Seeding project_stakeholders...')
  // No fixed UUID for stakeholders — use natural key (project_id + contact_id + role) and delete-then-insert.
  await s.from('project_stakeholder')
    .delete()
    .eq('tenant_id', RAJ_TENANT_ID)
    .in('project_id', PROJECTS.map((p) => p.id))
  const { error: shErr } = await s.from('project_stakeholder').insert(
    STAKEHOLDERS.map((s) => ({ tenant_id: RAJ_TENANT_ID, ...s }))
  )
  if (shErr) throw new Error(`project_stakeholder insert failed: ${shErr.message}`)
  summary.push({ table: 'project_stakeholder', rows: STAKEHOLDERS.length, action: 'inserted' })

  // 6. Quotations
  console.log('Seeding quotations...')
  await upsert(s, 'quotation', QUOTATIONS.map((q) => ({
    id: q.id,
    project_id: PROJECTS[q.project_idx - 1].id,
    quotation_number: q.quotation_number,
    status: q.status,
    subtotal: q.subtotal,
    discount_pct: 0,
    total: q.total,
    sent_at: q.sent_at,
    accepted_at: q.accepted_at,
  })))

  // 7. Quotation lines (delete-then-insert; line items don't have natural keys
  //    in the same way and re-running with different line composition shouldn't
  //    leave stale lines)
  console.log('Seeding quotation_lines...')
  await s.from('quotation_line')
    .delete()
    .eq('tenant_id', RAJ_TENANT_ID)
    .in('quotation_id', QUOTATIONS.map((q) => q.id))
  const { error: qlErr } = await s.from('quotation_line').insert(
    QUOTATION_LINES.map((l) => {
      const prod = PRODUCTS[l.product_idx - 1]
      return {
        id: l.id,
        tenant_id: RAJ_TENANT_ID,
        quotation_id: l.quote_id,
        product_id: prod.id,
        product_name: prod.name,
        sku_code: prod.sku_code,
        unit: prod.unit,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: 0,
        line_total: l.quantity * l.unit_price,
        sort_order: l.sort_order,
      }
    })
  )
  if (qlErr) throw new Error(`quotation_line insert failed: ${qlErr.message}`)
  summary.push({ table: 'quotation_line', rows: QUOTATION_LINES.length, action: 'inserted' })

  // 8. Sales orders
  console.log('Seeding sales_orders...')
  await upsert(s, 'sales_order', SALES_ORDERS.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    project_id: PROJECTS[o.project_idx - 1].id,
    quote_id: QUOTATIONS[o.quote_idx - 1].id,
    buyer_firm_id: firmId(o.buyer_firm),
    current_stage_id: orderStageIds[o.stage_key],
    order_date: o.order_date,
    expected_delivery_at: o.expected_delivery_at,
    value: o.value,
    owner_id: RAJ_ADMIN_USER_ID,
  })))

  // 9. Sales order lines (copy from accepted quotes — snapshot at order time)
  console.log('Seeding sales_order_lines...')
  await s.from('sales_order_line')
    .delete()
    .eq('tenant_id', RAJ_TENANT_ID)
    .in('sales_order_id', SALES_ORDERS.map((o) => o.id))
  const olRows: object[] = []
  let olineN = 1
  for (const order of SALES_ORDERS) {
    const quote = QUOTATIONS[order.quote_idx - 1]
    const lines = QUOTATION_LINES.filter((l) => l.quote_id === quote.id)
    for (const l of lines) {
      const prod = PRODUCTS[l.product_idx - 1]
      olRows.push({
        id: olineId(olineN++),
        tenant_id: RAJ_TENANT_ID,
        sales_order_id: order.id,
        product_id: prod.id,
        product_name: prod.name,
        sku_code: prod.sku_code,
        unit: prod.unit,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.quantity * l.unit_price,
        sort_order: l.sort_order,
      })
    }
  }
  const { error: olErr } = await s.from('sales_order_line').insert(olRows)
  if (olErr) throw new Error(`sales_order_line insert failed: ${olErr.message}`)
  summary.push({ table: 'sales_order_line', rows: olRows.length, action: 'inserted' })

  // 10. Invoices (the one advance)
  console.log('Seeding invoices...')
  await upsert(s, 'invoice', INVOICES.map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    project_id: PROJECTS[i.project_idx - 1].id,
    sales_order_id: SALES_ORDERS[i.order_idx - 1].id,
    buyer_firm_id: firmId(i.buyer_firm),
    invoice_date: i.invoice_date,
    due_date: i.due_date,
    payment_terms_days: i.payment_terms_days,
    subtotal: i.subtotal,
    gst_pct: i.gst_pct,
    gst_amount: i.gst_amount,
    total: i.total,
    retention_pct: i.retention_pct,
    retention_amount: i.retention_amount,
    billed_amount: i.billed_amount,
    paid_amount: i.paid_amount,
    is_running_bill: i.is_running_bill,
    running_bill_seq: i.running_bill_seq,
    is_final_bill: i.is_final_bill,
    status: i.status,
    notes: i.notes,
  })))

  console.log(JSON.stringify({
    ok: true,
    tenant: { id: RAJ_TENANT_ID, name: 'Raj Avinsys Pvt. Ltd.' },
    seeded: summary,
  }, null, 2))
}

main().catch((err) => {
  console.error(`seed-raj-mock-data failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
