#!/usr/bin/env tsx
/**
 * scripts/test-raj-complaints.ts — Raj Phase 3 integration test.
 *
 * Signs in as Raj admin via anon-key (exercises RLS). Verifies the
 * 3 seeded complaints + their stage history + cross-tenant isolation.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const VYARA_TENANT_ID = 'a1111111-1111-1111-1111-111111111111'
const RAJ_ADMIN_EMAIL = 'admin@rajavinsys.example'
const RAJ_ADMIN_PASSWORD = 'RajDemo@1234'

let pass = 0, fail = 0
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) { console.log(`  ✓ ${label}`); pass++ }
  else { console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); fail++ }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('env vars missing')
  const sb: SupabaseClient = createClient(url, anonKey)

  console.log('\n=== Sign in ===')
  const { data: auth } = await sb.auth.signInWithPassword({ email: RAJ_ADMIN_EMAIL, password: RAJ_ADMIN_PASSWORD })
  check('Raj admin signs in', !!auth.session)
  if (!auth.session) process.exit(1)

  console.log('\n=== Complaint row counts ===')
  const { count: total } = await sb.from('complaint').select('*', { count: 'exact', head: true })
  check(`complaint count = 3 (seeded)`, total === 3, `got ${total}`)

  console.log('\n=== Cross-tenant isolation ===')
  const { data: vyaraComplaints } = await sb.from('complaint').select('id').eq('tenant_id', VYARA_TENANT_ID)
  check('Raj sees 0 Vyara complaints', (vyaraComplaints?.length ?? 0) === 0)

  console.log('\n=== Complaint joins ===')
  const { data: full } = await sb.from('complaint').select(`
    complaint_number, title,
    firm:firm_id(name),
    severity:severity_id(label, rank),
    stage:current_stage_id(stage_key, is_open),
    assignee:assignee_id(full_name),
    resolution_notes
  `).order('complaint_number')
  check('joins return all 3', (full?.length ?? 0) === 3)
  type Pick<T> = T | T[] | null
  const p = <T,>(v: Pick<T>): T | null => Array.isArray(v) ? (v[0] ?? null) : v
  if (full) {
    type Row = { complaint_number: string; title: string; firm: Pick<{ name: string }>; severity: Pick<{ label: string; rank: number }>; stage: Pick<{ stage_key: string; is_open: boolean }>; assignee: Pick<{ full_name: string }>; resolution_notes: string | null }
    const rows = full as unknown as Row[]
    const surat = rows.find((r) => r.complaint_number === 'RA-CMP-2026-0001')
    const adani = rows.find((r) => r.complaint_number === 'RA-CMP-2026-0002')
    const lt    = rows.find((r) => r.complaint_number === 'RA-CMP-2026-0003')

    check('  RA-CMP-2026-0001 (Surat) is critical + in_progress + assigned',
      !!surat && p(surat.severity)?.label === 'Critical' && p(surat.stage)?.stage_key === 'in_progress' && !!p(surat.assignee))
    check('  RA-CMP-2026-0002 (Adani) is logged + unassigned',
      !!adani && p(adani.stage)?.stage_key === 'logged' && p(adani.assignee) === null)
    check('  RA-CMP-2026-0003 (L&T) is closed + has resolution_notes',
      !!lt && p(lt.stage)?.stage_key === 'closed' && !!lt.resolution_notes)
  }

  console.log('\n=== Stage history ===')
  const { count: histCount } = await sb.from('complaint_stage_history').select('*', { count: 'exact', head: true })
  check(`history rows = 11 (4 + 1 + 6)`, histCount === 11, `got ${histCount}`)

  console.log('\n=== Severity master visibility ===')
  const { data: sev } = await sb.from('severity_master').select('code').order('rank')
  check('4 system severities visible', (sev?.length ?? 0) >= 4)
  const codes = (sev ?? []).map((s) => s.code as string)
  check('  includes low/medium/high/critical', ['low','medium','high','critical'].every((c) => codes.includes(c)))

  console.log('\n=== Complaint stage master ===')
  const { data: stages } = await sb.from('complaint_stage').select('stage_key, is_open, is_terminal').order('order_index')
  check('7 system complaint stages visible', (stages?.length ?? 0) >= 7)

  console.log(`\n=== Result: ${pass} pass · ${fail} fail ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => { console.error(`crashed: ${err}`); process.exit(1) })
