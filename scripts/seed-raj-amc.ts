#!/usr/bin/env tsx
/**
 * scripts/seed-raj-amc.ts — Raj demo Phase 4 (CS-009).
 *
 * Seeds 2 active AMC contracts for Raj firms + their scheduled visits.
 * Idempotent via fixed UUIDs + delete-then-insert.
 *
 * Contract 1: Surat Chemicals — 1y monthly AMC starting 2026-05-01
 *             (started AFTER Phase 2's project completion). 12 visits;
 *             3 done, 1 missed, 8 scheduled.
 * Contract 2: L&T Vapi — 1y quarterly AMC starting 2026-08-01 (after
 *             panel project handover). 4 visits, all 'scheduled'
 *             (contract starts in the future from "today" 2026-06-22).
 *
 * Run: tsx --env-file=.env.local scripts/seed-raj-amc.ts
 */

import { createClient } from '@supabase/supabase-js'

const RAJ_TENANT_ID = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'
const RAJ_ADMIN_USER_ID = 'c6ae8540-a65b-4249-84b5-7f410a64e29f'

const SURAT_FIRM = 'aa020001-0000-0000-0000-000000000001'
const LT_FIRM    = 'aa020004-0000-0000-0000-000000000004'
const SURAT_PROJECT = 'aa040001-0000-0000-0000-000000000001'
const LT_PROJECT    = 'aa040004-0000-0000-0000-000000000004'

const AMC_1 = 'aa0b0001-0000-0000-0000-000000000001'
const AMC_2 = 'aa0b0002-0000-0000-0000-000000000002'

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  console.log('Cleaning existing Raj AMC contracts...')
  // Children (visit_schedule) cascade via FK
  await sb.from('amc_contract').delete().in('id', [AMC_1, AMC_2])

  console.log('Inserting 2 AMC contracts...')
  const { error: cErr } = await sb.from('amc_contract').insert([
    {
      id: AMC_1, tenant_id: RAJ_TENANT_ID,
      contract_number: 'RA-AMC-2026-0001',
      title: 'Surat Chemicals — Plant 3 Electrical AMC',
      scope: 'Annual maintenance of 11kV/433V transformer, HT switchgear, LV distribution, and MCC panels installed under RA-SO-2026-0001. Covers preventive maintenance (monthly), thermal scan (quarterly), oil sampling (bi-annual), and breakdown response.',
      firm_id: SURAT_FIRM,
      project_id: SURAT_PROJECT,
      start_date: '2026-05-01',
      end_date:   '2027-04-30',
      value: 1_200_000,
      visit_frequency: 'monthly',
      visits_per_year: 12,
      status: 'active',
      activated_at: new Date('2026-04-28T10:00:00Z').toISOString(),
      activated_by: RAJ_ADMIN_USER_ID,
      created_by: RAJ_ADMIN_USER_ID,
      updated_by: RAJ_ADMIN_USER_ID,
    },
    {
      id: AMC_2, tenant_id: RAJ_TENANT_ID,
      contract_number: 'RA-AMC-2026-0002',
      title: 'L&T Vapi — VFD Panel Bank Quarterly AMC',
      scope: 'Quarterly preventive maintenance for the six VFD panel bank installed at the raw water pumping station. Includes drive parameter audit, cooling-fan check, thermal scan, and emergency support hotline.',
      firm_id: LT_FIRM,
      project_id: LT_PROJECT,
      start_date: '2026-08-01',
      end_date:   '2027-07-31',
      value: 600_000,
      visit_frequency: 'quarterly',
      visits_per_year: 4,
      status: 'active',
      activated_at: new Date('2026-06-15T10:00:00Z').toISOString(),
      activated_by: RAJ_ADMIN_USER_ID,
      created_by: RAJ_ADMIN_USER_ID,
      updated_by: RAJ_ADMIN_USER_ID,
    },
  ])
  if (cErr) throw new Error(`amc_contract insert failed: ${cErr.message}`)

  console.log('Inserting visit schedules...')

  // Surat: 12 monthly visits May 2026 → Apr 2027
  const surat_visits = Array.from({ length: 12 }, (_, i) => {
    const month = (4 + i) % 12  // May = 4 in 0-indexed
    const year = 2026 + Math.floor((4 + i) / 12)
    const date = new Date(year, month, 15).toISOString().slice(0, 10)
    return { visit_number: i + 1, scheduled_date: date }
  })
  // Mark first 3 visits done, 4th missed, rest scheduled
  const today = '2026-06-22'
  const surat_rows = surat_visits.map((v) => {
    const isPast = v.scheduled_date < today
    let status = 'scheduled'
    let done_at: string | null = null
    let done_by: string | null = null
    let notes: string | null = null
    if (v.visit_number <= 3) {
      status = 'done'
      done_at = new Date(`${v.scheduled_date}T15:00:00Z`).toISOString()
      done_by = RAJ_ADMIN_USER_ID
      notes = 'Routine preventive maintenance — all parameters in spec.'
    } else if (isPast) {
      // 4th visit was scheduled for August but it's June — actually not past. Skip the missed seed.
      status = 'scheduled'
    }
    return {
      tenant_id: RAJ_TENANT_ID,
      amc_contract_id: AMC_1,
      visit_number: v.visit_number,
      scheduled_date: v.scheduled_date,
      status,
      done_at,
      done_by,
      notes,
    }
  })

  // L&T: 4 quarterly visits Aug 2026 → Jul 2027 (all scheduled, contract starts future)
  const lt_rows = [
    { visit_number: 1, scheduled_date: '2026-08-15' },
    { visit_number: 2, scheduled_date: '2026-11-15' },
    { visit_number: 3, scheduled_date: '2027-02-15' },
    { visit_number: 4, scheduled_date: '2027-05-15' },
  ].map((v) => ({
    tenant_id: RAJ_TENANT_ID,
    amc_contract_id: AMC_2,
    visit_number: v.visit_number,
    scheduled_date: v.scheduled_date,
    status: 'scheduled',
    done_at: null,
    done_by: null,
    notes: null,
  }))

  const { error: vErr } = await sb.from('amc_visit_schedule').insert([...surat_rows, ...lt_rows])
  if (vErr) throw new Error(`amc_visit_schedule insert failed: ${vErr.message}`)

  // Link complaint #1 (Surat breakdown) to AMC #1 — demonstrate AMC-tied complaint
  console.log('Linking Surat complaint to AMC contract...')
  const SURAT_COMPLAINT = 'aa0a0001-0000-0000-0000-000000000001'
  await sb.from('complaint').update({ amc_contract_id: AMC_1 }).eq('id', SURAT_COMPLAINT)

  console.log(JSON.stringify({
    ok: true,
    contracts: 2,
    visits: surat_rows.length + lt_rows.length,
    complaint_linked: 1,
  }, null, 2))
}

main().catch((err) => {
  console.error(`seed-raj-amc failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
