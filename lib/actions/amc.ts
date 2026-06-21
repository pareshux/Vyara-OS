'use server'

/**
 * lib/actions/amc.ts — CS-009 server actions (Raj demo Phase 4).
 *
 * AMC contract lifecycle:
 *   draft → active → expired | renewed | cancelled
 *
 * Visit-schedule auto-generation runs at contract activation
 * (createAmcContract with status='active' OR activateAmcContract).
 * Frequency → visits_per_year → evenly-spaced dates between
 * start_date and end_date.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result<T = void> = { ok: true; data: T } | { ok: false; error: string }

async function requireProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profile').select('id, tenant_id, role').eq('id', user.id).single()
  if (!profile) return { ok: false as const, error: 'Profile not found' }
  return { ok: true as const, supabase, user, profile }
}

const VISITS_PER_YEAR: Record<string, number> = {
  monthly: 12, quarterly: 4, bi_annual: 2, annual: 1, custom: 0,
}

/** Evenly-spaced dates between start_date and end_date inclusive.
 *  Returns N dates where N = visits_per_year × years_in_period (rounded).
 *  Excludes the very first day (visit on day-of-start would be useless). */
function computeScheduleDates(
  startISO: string, endISO: string, visits_per_year: number,
): string[] {
  if (visits_per_year <= 0) return []
  const start = new Date(startISO)
  const end = new Date(endISO)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  const years = totalDays / 365
  const totalVisits = Math.max(1, Math.round(visits_per_year * years))
  // Spacing in days = totalDays / (totalVisits + 1), first visit at start + spacing
  const spacingDays = totalDays / (totalVisits + 1)
  const out: string[] = []
  for (let i = 1; i <= totalVisits; i++) {
    const visitDate = new Date(start.getTime() + Math.round(spacingDays * i) * 86400000)
    out.push(visitDate.toISOString().slice(0, 10))
  }
  return out
}

// ─── createAmcContract ──────────────────────────────────────────

export type CreateAmcInput = {
  title: string
  scope?: string
  firm_id: string
  project_id?: string | null
  source_sales_order_id?: string | null
  start_date: string  // ISO date
  end_date: string    // ISO date
  value: number
  visit_frequency: 'monthly' | 'quarterly' | 'bi_annual' | 'annual' | 'custom'
  custom_visit_dates?: string[]  // only used when visit_frequency='custom'
  /** Set to true to activate immediately (skip 'draft' state). */
  activate?: boolean
}

export async function createAmcContract(input: CreateAmcInput): Promise<Result<{ id: string; contract_number: string; visits_scheduled: number }>> {
  const auth = await requireProfile()
  if (!auth.ok) return auth
  const { supabase, profile } = auth

  if (!input.title.trim()) return { ok: false, error: 'Title is required' }
  if (!input.firm_id) return { ok: false, error: 'Customer firm is required' }
  if (new Date(input.end_date) <= new Date(input.start_date)) {
    return { ok: false, error: 'end_date must be after start_date' }
  }

  const visitsPerYear = VISITS_PER_YEAR[input.visit_frequency]
  if (visitsPerYear === undefined) return { ok: false, error: `Unknown visit_frequency: ${input.visit_frequency}` }

  const status = input.activate ? 'active' : 'draft'
  const nowIso = new Date().toISOString()

  // Insert contract row
  const { data: contract, error: cErr } = await supabase
    .from('amc_contract')
    .insert({
      tenant_id: profile.tenant_id,
      title: input.title.trim(),
      scope: input.scope?.trim() ?? null,
      firm_id: input.firm_id,
      project_id: input.project_id ?? null,
      source_sales_order_id: input.source_sales_order_id ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      value: input.value,
      visit_frequency: input.visit_frequency,
      visits_per_year: visitsPerYear,
      status,
      activated_at: status === 'active' ? nowIso : null,
      activated_by: status === 'active' ? profile.id : null,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select('id, contract_number')
    .single()
  if (cErr || !contract) return { ok: false, error: cErr?.message ?? 'Insert failed' }

  // Generate visit schedule rows
  let visitDates: string[] = []
  if (input.visit_frequency === 'custom') {
    visitDates = (input.custom_visit_dates ?? []).filter((d) => {
      const t = new Date(d).getTime()
      return t >= new Date(input.start_date).getTime() && t <= new Date(input.end_date).getTime()
    }).sort()
  } else {
    visitDates = computeScheduleDates(input.start_date, input.end_date, visitsPerYear)
  }

  if (visitDates.length > 0) {
    const visitRows = visitDates.map((scheduled_date, idx) => ({
      tenant_id: profile.tenant_id,
      amc_contract_id: contract.id,
      visit_number: idx + 1,
      scheduled_date,
      status: 'scheduled',
    }))
    const { error: vErr } = await supabase.from('amc_visit_schedule').insert(visitRows)
    if (vErr) return { ok: false, error: `Contract created but visit schedule failed: ${vErr.message}` }
  }

  revalidatePath('/amc')
  return {
    ok: true,
    data: {
      id: contract.id as string,
      contract_number: contract.contract_number as string,
      visits_scheduled: visitDates.length,
    },
  }
}

// ─── markVisitDone ──────────────────────────────────────────────

export async function markAmcVisitDone(input: {
  visit_id: string
  notes?: string
  field_visit_id?: string | null
}): Promise<Result> {
  const auth = await requireProfile()
  if (!auth.ok) return auth
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('amc_visit_schedule')
    .update({
      status: 'done',
      done_at: new Date().toISOString(),
      done_by: profile.id,
      notes: input.notes ?? null,
      field_visit_id: input.field_visit_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.visit_id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/amc')
  return { ok: true, data: undefined }
}

// ─── cancelAmcContract ──────────────────────────────────────────

export async function cancelAmcContract(input: {
  contract_id: string
  reason: string
}): Promise<Result> {
  const auth = await requireProfile()
  if (!auth.ok) return auth
  const { supabase, profile } = auth

  if (!input.reason.trim()) return { ok: false, error: 'Cancellation reason is required' }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('amc_contract')
    .update({
      status: 'cancelled',
      cancelled_at: nowIso,
      cancelled_by: profile.id,
      cancellation_reason: input.reason.trim(),
      updated_at: nowIso,
      updated_by: profile.id,
    })
    .eq('id', input.contract_id)
  if (error) return { ok: false, error: error.message }

  // Cancel all scheduled (not-yet-done) visits
  await supabase
    .from('amc_visit_schedule')
    .update({ status: 'cancelled', updated_at: nowIso })
    .eq('amc_contract_id', input.contract_id)
    .eq('status', 'scheduled')

  revalidatePath('/amc')
  return { ok: true, data: undefined }
}

// ─── listAmcContracts ───────────────────────────────────────────

export type AmcListRow = {
  id: string
  contract_number: string
  title: string
  firm_name: string | null
  status: string
  start_date: string
  end_date: string
  value: number
  visit_frequency: string
  visits_done: number
  visits_scheduled: number
  visits_overdue: number
  days_to_expiry: number
}

export async function listAmcContracts(): Promise<Result<AmcListRow[]>> {
  const auth = await requireProfile()
  if (!auth.ok) return auth
  const { supabase } = auth

  const { data, error } = await supabase
    .from('amc_contract')
    .select(`
      id, contract_number, title, status, start_date, end_date, value, visit_frequency,
      firm:firm_id(name),
      visits:amc_visit_schedule(id, status, scheduled_date)
    `)
    .order('end_date', { ascending: true })
  if (error) return { ok: false, error: error.message }

  type Visit = { id: string; status: string; scheduled_date: string }
  type Raw = {
    id: string
    contract_number: string
    title: string
    status: string
    start_date: string
    end_date: string
    value: number
    visit_frequency: string
    firm: { name: string } | { name: string }[] | null
    visits: Visit[]
  }
  const pick = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? (v[0] ?? null) : v
  const today = new Date().toISOString().slice(0, 10)

  const rows: AmcListRow[] = (data as Raw[] ?? []).map((c) => {
    const visits = c.visits ?? []
    const done = visits.filter((v) => v.status === 'done').length
    const scheduled = visits.filter((v) => v.status === 'scheduled').length
    const overdue = visits.filter((v) => v.status === 'scheduled' && v.scheduled_date < today).length
    const daysToExpiry = Math.round((new Date(c.end_date).getTime() - new Date(today).getTime()) / 86400000)
    return {
      id: c.id,
      contract_number: c.contract_number,
      title: c.title,
      firm_name: pick(c.firm)?.name ?? null,
      status: c.status,
      start_date: c.start_date,
      end_date: c.end_date,
      value: c.value,
      visit_frequency: c.visit_frequency,
      visits_done: done,
      visits_scheduled: scheduled,
      visits_overdue: overdue,
      days_to_expiry: daysToExpiry,
    }
  })

  return { ok: true, data: rows }
}
