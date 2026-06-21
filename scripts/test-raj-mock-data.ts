#!/usr/bin/env tsx
/**
 * scripts/test-raj-mock-data.ts — integration test for Raj Phase 2 seed.
 *
 * Signs in as Raj admin via the public anon flow (NOT service-role) so
 * every assertion exercises RLS. Confirms the seeded data is visible,
 * counts are correct, joins work, and cross-tenant isolation holds
 * (Vyara data must NOT be visible to Raj admin).
 *
 * Run: tsx --env-file=.env.local scripts/test-raj-mock-data.ts
 * Exits 0 on all-pass, 1 on first failure.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const RAJ_TENANT_ID = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'
const VYARA_TENANT_ID = 'a1111111-1111-1111-1111-111111111111'
const RAJ_ADMIN_EMAIL = 'admin@rajavinsys.example'
const RAJ_ADMIN_PASSWORD = 'RajDemo@1234'

let pass = 0
let fail = 0
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    fail++
  }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('SUPABASE env vars missing')

  const sb: SupabaseClient = createClient(url, anonKey)

  // ─── Sign in as Raj admin ─────────────────────────────────
  console.log('\n=== Sign in ===')
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: RAJ_ADMIN_EMAIL,
    password: RAJ_ADMIN_PASSWORD,
  })
  check('Raj admin signs in', !!auth.session && !authErr, authErr?.message)
  if (!auth.session) { process.exit(1) }

  // ─── Count assertions ─────────────────────────────────────
  console.log('\n=== Row counts (RLS-scoped) ===')
  const counts: Array<[string, number]> = [
    ['firm',                5],
    ['contact',            12],
    ['product',             8],
    ['project',             4],
    ['project_stakeholder', 7],
    ['quotation',           4],
    ['quotation_line',     11],
    ['sales_order',         3],
    ['sales_order_line',    9],
    ['invoice',             1],
  ]
  for (const [table, expected] of counts) {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true })
    check(`${table} count = ${expected}`, count === expected && !error, `got ${count} (err: ${error?.message ?? 'none'})`)
  }

  // ─── Cross-tenant isolation ───────────────────────────────
  console.log('\n=== Cross-tenant isolation ===')
  // Raj admin should NOT see Vyara firms. Vyara has many firms; if we see ANY
  // firm with tenant_id = Vyara, RLS leaked.
  const { data: vyaraFirms } = await sb.from('firm').select('id').eq('tenant_id', VYARA_TENANT_ID)
  check('Raj admin sees 0 Vyara firms via RLS', (vyaraFirms?.length ?? 0) === 0,
    `saw ${vyaraFirms?.length ?? 0} Vyara firms (RLS bug if >0)`)

  // ─── Stage joins ──────────────────────────────────────────
  console.log('\n=== Pipeline-stage joins ===')
  const { data: projWithStage, error: psErr } = await sb
    .from('project')
    .select('name, segment, current_stage:current_stage_id(label, order_index, is_terminal)')
    .order('name')
  check('project joins to pipeline_stage', !psErr && (projWithStage?.length ?? 0) === 4, psErr?.message)
  if (projWithStage) {
    type Row = { name: string; segment: string; current_stage: { label: string; order_index: number; is_terminal: boolean } | null }
    for (const p of projWithStage as unknown as Row[]) {
      check(`  project '${p.name.slice(0, 40)}...' has stage label`,
        !!p.current_stage?.label, `stage: ${JSON.stringify(p.current_stage)}`)
    }
  }

  // ─── Sales-order joins ────────────────────────────────────
  console.log('\n=== Sales-order joins ===')
  const { data: orders, error: oErr } = await sb
    .from('sales_order')
    .select('order_number, value, project:project_id(name), buyer_firm:buyer_firm_id(name), current_stage:current_stage_id(label)')
    .order('order_number')
  check('sales_order joins to project + firm + order_stage', !oErr && (orders?.length ?? 0) === 3, oErr?.message)
  if (orders) {
    type O = { order_number: string; value: number; project: { name: string } | null; buyer_firm: { name: string } | null; current_stage: { label: string } | null }
    for (const o of orders as unknown as O[]) {
      check(`  ${o.order_number} · ₹${o.value.toLocaleString('en-IN')} · ${o.buyer_firm?.name ?? '(no firm)'}`,
        !!o.project?.name && !!o.buyer_firm?.name && !!o.current_stage?.label)
    }
  }

  // ─── Invoice ageing view ──────────────────────────────────
  console.log('\n=== Invoice ageing view ===')
  const { data: ageing, error: aErr } = await sb
    .from('invoice_ageing_v')
    .select('invoice_number, total, billed_amount, paid_amount, outstanding, ageing_bucket, status')
  check('invoice_ageing_v queryable', !aErr && (ageing?.length ?? 0) === 1, aErr?.message)
  if (ageing && ageing.length > 0) {
    const inv = ageing[0]
    check(`  RA-INV-2026-0001 in 'closed' bucket (paid in full)`,
      inv.ageing_bucket === 'closed', `bucket: ${inv.ageing_bucket}, outstanding: ${inv.outstanding}`)
  }

  // ─── Stage seeding consistency ────────────────────────────
  console.log('\n=== Stage seeding consistency ===')
  const { data: stages, error: stErr } = await sb
    .from('pipeline_stage')
    .select('segment, stage_key, label, order_index')
    .eq('tenant_id', RAJ_TENANT_ID)
    .order('segment')
    .order('order_index')
  check('Raj has 30 tenant-scoped pipeline_stage rows', (stages?.length ?? 0) === 30, stErr?.message)
  const epcCount = stages?.filter(s => s.segment === 'epc_project').length ?? 0
  const panelCount = stages?.filter(s => s.segment === 'panel_order').length ?? 0
  check(`  18 epc_project stages`, epcCount === 18, `got ${epcCount}`)
  check(`  12 panel_order stages`, panelCount === 12, `got ${panelCount}`)

  // ─── Summary ──────────────────────────────────────────────
  console.log(`\n=== Result: ${pass} pass · ${fail} fail ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`test-raj-mock-data crashed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
