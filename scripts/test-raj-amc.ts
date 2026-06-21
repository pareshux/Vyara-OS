#!/usr/bin/env tsx
/**
 * scripts/test-raj-amc.ts — Raj Phase 4 integration test.
 */
import { createClient } from '@supabase/supabase-js'

let pass = 0, fail = 0
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) { console.log(`  ✓ ${label}`); pass++ }
  else { console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); fail++ }
}

async function main(): Promise<void> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  console.log('\n=== Sign in ===')
  const { data: auth } = await sb.auth.signInWithPassword({ email: 'admin@rajavinsys.example', password: 'RajDemo@1234' })
  check('Raj admin signs in', !!auth.session)
  if (!auth.session) process.exit(1)

  console.log('\n=== AMC contract counts ===')
  const { count: total } = await sb.from('amc_contract').select('*', { count: 'exact', head: true })
  check('amc_contract count = 2', total === 2, `got ${total}`)

  const { count: visits } = await sb.from('amc_visit_schedule').select('*', { count: 'exact', head: true })
  check('amc_visit_schedule count = 16 (12 Surat + 4 L&T)', visits === 16, `got ${visits}`)

  console.log('\n=== Cross-tenant isolation ===')
  const { data: vyaraAmc } = await sb.from('amc_contract').select('id').eq('tenant_id', 'a1111111-1111-1111-1111-111111111111')
  check('Raj sees 0 Vyara AMC contracts', (vyaraAmc?.length ?? 0) === 0)

  console.log('\n=== Contract joins + visit progress ===')
  const { data } = await sb.from('amc_contract').select(`
    contract_number, title, status, visit_frequency, value,
    firm:firm_id(name),
    visits:amc_visit_schedule(status, scheduled_date)
  `).order('contract_number')
  check('both contracts returned with joins', (data?.length ?? 0) === 2)
  if (data) {
    type V = { status: string; scheduled_date: string }
    type Row = {
      contract_number: string; title: string; status: string; visit_frequency: string; value: number
      firm: { name: string } | { name: string }[] | null
      visits: V[]
    }
    const pick = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? (v[0] ?? null) : v
    const surat = (data as unknown as Row[]).find((c) => c.contract_number === 'RA-AMC-2026-0001')
    const lt    = (data as unknown as Row[]).find((c) => c.contract_number === 'RA-AMC-2026-0002')

    check('  Surat AMC is active monthly with 12 visits',
      !!surat && surat.status === 'active' && surat.visit_frequency === 'monthly' && surat.visits.length === 12)
    check('  Surat has exactly 3 visits marked done',
      !!surat && surat.visits.filter((v) => v.status === 'done').length === 3)
    check('  L&T AMC is active quarterly with 4 visits',
      !!lt && lt.status === 'active' && lt.visit_frequency === 'quarterly' && lt.visits.length === 4)
    check('  L&T has 0 done (all scheduled — contract starts Aug 2026)',
      !!lt && lt.visits.every((v) => v.status === 'scheduled'))
  }

  console.log('\n=== Complaint linkage ===')
  const { data: linkedComplaints } = await sb
    .from('complaint')
    .select('complaint_number, amc_contract_id')
    .not('amc_contract_id', 'is', null)
  check('1 complaint linked to AMC contract', (linkedComplaints?.length ?? 0) === 1)
  if (linkedComplaints && linkedComplaints.length > 0) {
    check(`  linked complaint is RA-CMP-2026-0001 (Surat breakdown)`,
      linkedComplaints[0].complaint_number === 'RA-CMP-2026-0001')
  }

  console.log(`\n=== Result: ${pass} pass · ${fail} fail ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => { console.error(`crashed: ${err}`); process.exit(1) })
