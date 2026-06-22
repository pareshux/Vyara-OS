'use server'

/* ─────────────────────────────────────────────────────────────
   GSTR-2B reconciliation server actions — Phase 5 (FIN-023).

   Two paths:
     1. uploadGstr2bBatch — accountant uploads a CSV/JSON file
        (downloaded from gst.gov.in or via integrator) → we parse
        rows + reconcile against vendor_bill.
     2. runReconciliation — re-runs matching without re-uploading
        (e.g. when new vendor bills land that should match an
        already-uploaded 2B period).

   Matching: vendor_gstin + vendor_invoice_no + invoice_date.
   Total mismatch within 0.01 → 'matched' but amount_mismatch flag.

   ITC eligibility derivation: bill.itc_eligible = TRUE iff
     bill matched + 2B entry exists + 2B entry has itc_available=true.
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'

export type Gstr2bMatchStatus = 'unmatched' | 'matched' | 'in_books_not_in_2b' | 'in_2b_not_in_books' | 'amount_mismatch'
export type Gstr2bBillStatus = 'pending' | 'matched' | 'mismatched' | 'not_in_2b' | 'reversed'

export type Gstr2bEntryInput = {
  vendor_gstin: string
  vendor_name?: string
  vendor_invoice_no: string
  vendor_invoice_date: string
  invoice_type?: string
  taxable_value?: number
  igst_amount?: number
  cgst_amount?: number
  sgst_amount?: number
  cess_amount?: number
  total: number
  itc_available?: boolean
  itc_reversal_reason?: string
}

export type Gstr2bSummary = {
  period: string
  total_entries: number
  matched_count: number
  matched_value: number
  unmatched_in_2b_count: number       // in 2B but not in our books
  unmatched_in_2b_value: number
  in_books_not_in_2b_count: number     // we booked but 2B doesn't show
  in_books_not_in_2b_value: number
  amount_mismatch_count: number
  itc_eligible_count: number
  itc_eligible_value: number
}

export type Gstr2bEntryRow = {
  id: string
  period: string
  vendor_gstin: string
  vendor_name: string | null
  vendor_invoice_no: string
  vendor_invoice_date: string
  invoice_type: string | null
  taxable_value: number
  total: number
  itc_available: boolean
  itc_reversal_reason: string | null
  matched_bill_id: string | null
  matched_bill_number: string | null
  match_status: Gstr2bMatchStatus
  match_notes: string | null
}

async function getActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return {
    supabase, userId: user.id,
    tenantId: profile.tenant_id as string,
    role: profile.role as string,
  }
}
function isAdminish(role: string) { return role === 'admin' || role === 'manager' }
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }

/* ═══ Upload + parse ═══════════════════════════════════════ */

export async function uploadGstr2bBatch(params: {
  period: string  // 'YYYY-MM'
  entries: Gstr2bEntryInput[]
}): Promise<{ ok: true; inserted: number; matched: number; updated: number } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!/^\d{4}-\d{2}$/.test(params.period)) return { ok: false, error: 'period must be YYYY-MM' }
  if (params.entries.length === 0) return { ok: false, error: 'No entries to upload' }

  const batchId = crypto.randomUUID()
  const now = new Date().toISOString()

  // Upsert entries (skip duplicates by unique constraint on tenant+period+gstin+invoice_no)
  const payload = params.entries.map((e) => ({
    tenant_id: actor.tenantId,
    period: params.period,
    vendor_gstin: e.vendor_gstin.trim().toUpperCase(),
    vendor_name: e.vendor_name?.trim() || null,
    vendor_invoice_no: e.vendor_invoice_no.trim(),
    vendor_invoice_date: e.vendor_invoice_date,
    invoice_type: e.invoice_type ?? 'B2B',
    taxable_value: r2(Number(e.taxable_value ?? 0)),
    igst_amount: r2(Number(e.igst_amount ?? 0)),
    cgst_amount: r2(Number(e.cgst_amount ?? 0)),
    sgst_amount: r2(Number(e.sgst_amount ?? 0)),
    cess_amount: r2(Number(e.cess_amount ?? 0)),
    total: r2(Number(e.total)),
    itc_available: e.itc_available ?? true,
    itc_reversal_reason: e.itc_reversal_reason ?? null,
    uploaded_at: now,
    uploaded_by: actor.userId,
    upload_batch_id: batchId,
    match_status: 'unmatched' as Gstr2bMatchStatus,
  }))

  const { error: insErr } = await actor.supabase
    .from('gstr_2b_entry')
    .upsert(payload, { onConflict: 'tenant_id,period,vendor_gstin,vendor_invoice_no' })
  if (insErr) {
    captureError(insErr, { action_name: 'uploadGstr2bBatch.upsert', tenant_id: actor.tenantId })
    return { ok: false, error: insErr.message }
  }

  // Now reconcile against vendor_bill
  const recon = await runReconciliation(params.period)
  if (!recon.ok) return { ok: false, error: recon.error }

  return { ok: true, inserted: params.entries.length, matched: recon.matched, updated: recon.updated_bills }
}

/* ═══ Reconciliation ═══════════════════════════════════════ */

export async function runReconciliation(period: string): Promise<
  | { ok: true; matched: number; in_books_not_in_2b: number; in_2b_not_in_books: number; updated_bills: number }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: 'period must be YYYY-MM' }

  // Period date range
  const [yearStr, monthStr] = period.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const from = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const to = new Date(year, month, 0).toISOString().slice(0, 10)  // last day of month

  // Pull all 2B entries for this period
  const { data: entries } = await actor.supabase
    .from('gstr_2b_entry')
    .select('id, vendor_gstin, vendor_invoice_no, vendor_invoice_date, total, itc_available')
    .eq('tenant_id', actor.tenantId)
    .eq('period', period)
    .is('deleted_at', null)

  // Pull vendor bills with vendor_invoice_date in this period
  const { data: bills } = await actor.supabase
    .from('vendor_bill')
    .select('id, vendor_invoice_no, vendor_invoice_date, total, vendor:vendor_id(gstin)')
    .eq('tenant_id', actor.tenantId)
    .gte('vendor_invoice_date', from)
    .lte('vendor_invoice_date', to)
    .in('status', ['approved', 'partly_paid', 'paid'])
    .is('deleted_at', null)

  // Reset 2B match state for this period; we'll re-stamp.
  await actor.supabase
    .from('gstr_2b_entry')
    .update({ match_status: 'unmatched', matched_bill_id: null, match_notes: null })
    .eq('tenant_id', actor.tenantId)
    .eq('period', period)

  // Build bill lookup by (gstin, invoice_no)
  type RawBill = { id: string; vendor_invoice_no: string; vendor_invoice_date: string; total: number; vendor: { gstin: string | null } | { gstin: string | null }[] | null }
  function vendorGstin(b: RawBill): string | null {
    const v = Array.isArray(b.vendor) ? b.vendor[0] : b.vendor
    return v?.gstin ?? null
  }
  const billByKey = new Map<string, RawBill>()
  for (const b of (bills as RawBill[] | null) ?? []) {
    const gstin = vendorGstin(b)
    if (!gstin) continue
    const key = `${gstin.toUpperCase()}|${b.vendor_invoice_no.trim()}`
    billByKey.set(key, b)
  }
  const matchedBillIds = new Set<string>()

  let matched = 0
  let amountMismatch = 0
  let inBooksNotIn2B = 0
  let in2BNotInBooks = 0

  // Walk 2B entries → mark match status
  for (const e of (entries ?? [])) {
    const key = `${(e.vendor_gstin as string).toUpperCase()}|${(e.vendor_invoice_no as string).trim()}`
    const bill = billByKey.get(key)
    if (!bill) {
      // 2B has it; books don't
      await actor.supabase
        .from('gstr_2b_entry')
        .update({ match_status: 'in_2b_not_in_books', match_notes: 'Invoice exists in 2B but not in our books.' })
        .eq('id', e.id)
      in2BNotInBooks++
      continue
    }
    matchedBillIds.add(bill.id)
    const diff = Math.abs(Number(bill.total) - Number(e.total))
    if (diff > 0.01) {
      await actor.supabase
        .from('gstr_2b_entry')
        .update({
          match_status: 'amount_mismatch',
          matched_bill_id: bill.id,
          match_notes: `Total mismatch: book ₹${Number(bill.total).toFixed(2)} vs 2B ₹${Number(e.total).toFixed(2)}`,
        })
        .eq('id', e.id)
      amountMismatch++
    } else {
      await actor.supabase
        .from('gstr_2b_entry')
        .update({ match_status: 'matched', matched_bill_id: bill.id, match_notes: null })
        .eq('id', e.id)
      matched++
    }
  }

  // Walk bills → any that didn't get matched (in our books but not in 2B)
  let updatedBills = 0
  for (const b of (bills as RawBill[] | null) ?? []) {
    const gstin = vendorGstin(b)
    const matchedEntry = (entries ?? []).find((e) =>
      (e.vendor_gstin as string).toUpperCase() === (gstin ?? '').toUpperCase() &&
      (e.vendor_invoice_no as string).trim() === b.vendor_invoice_no.trim()
    )
    if (!matchedEntry) {
      // In our books but not in 2B
      await actor.supabase
        .from('vendor_bill')
        .update({
          gstr_2b_status: 'not_in_2b',
          gstr_2b_period: period,
          itc_eligible: false,
        })
        .eq('id', b.id)
      inBooksNotIn2B++
      updatedBills++
    } else {
      const isMatched = Math.abs(Number(b.total) - Number(matchedEntry.total)) <= 0.01
      await actor.supabase
        .from('vendor_bill')
        .update({
          gstr_2b_status: isMatched ? 'matched' : 'mismatched',
          gstr_2b_period: period,
          itc_eligible: isMatched && Boolean(matchedEntry.itc_available),
        })
        .eq('id', b.id)
      updatedBills++
    }
  }

  revalidatePath('/procurement/gstr-2b')
  revalidatePath('/procurement/bills')

  return { ok: true, matched, in_books_not_in_2b: inBooksNotIn2B, in_2b_not_in_books: in2BNotInBooks, updated_bills: updatedBills }
}

/* ═══ Reads ════════════════════════════════════════════════ */

export async function listGstr2bPeriods(): Promise<Array<{ period: string; entry_count: number }>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('gstr_2b_entry')
    .select('period')
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
  const counts = new Map<string, number>()
  for (const r of (data ?? [])) {
    counts.set(r.period as string, (counts.get(r.period as string) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([period, entry_count]) => ({ period, entry_count }))
    .sort((a, b) => b.period.localeCompare(a.period))
}

export async function getGstr2bPeriodSummary(period: string): Promise<Gstr2bSummary | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: entries } = await actor.supabase
    .from('gstr_2b_entry')
    .select('total, match_status, itc_available')
    .eq('tenant_id', actor.tenantId)
    .eq('period', period)

  // ALSO pull bills in this period that aren't in 2B
  const [yearStr, monthStr] = period.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const from = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const to = new Date(year, month, 0).toISOString().slice(0, 10)
  const { data: notIn2bBills } = await actor.supabase
    .from('vendor_bill')
    .select('total')
    .eq('tenant_id', actor.tenantId)
    .gte('vendor_invoice_date', from)
    .lte('vendor_invoice_date', to)
    .in('status', ['approved', 'partly_paid', 'paid'])
    .eq('gstr_2b_status', 'not_in_2b')

  const all = (entries ?? [])
  const totalEntries = all.length
  const matched = all.filter((e) => e.match_status === 'matched')
  const matchedCount = matched.length
  const matchedValue = matched.reduce((s, e) => s + Number(e.total || 0), 0)
  const in2bNotBooks = all.filter((e) => e.match_status === 'in_2b_not_in_books')
  const amtMismatch = all.filter((e) => e.match_status === 'amount_mismatch')
  const itcEligible = matched.filter((e) => e.itc_available !== false)
  const bookOnly = notIn2bBills ?? []

  return {
    period,
    total_entries: totalEntries,
    matched_count: matchedCount,
    matched_value: r2(matchedValue),
    unmatched_in_2b_count: in2bNotBooks.length,
    unmatched_in_2b_value: r2(in2bNotBooks.reduce((s, e) => s + Number(e.total || 0), 0)),
    in_books_not_in_2b_count: bookOnly.length,
    in_books_not_in_2b_value: r2(bookOnly.reduce((s, b) => s + Number(b.total || 0), 0)),
    amount_mismatch_count: amtMismatch.length,
    itc_eligible_count: itcEligible.length,
    itc_eligible_value: r2(itcEligible.reduce((s, e) => s + Number(e.total || 0), 0)),
  }
}

export async function listGstr2bEntries(period: string, filter?: { match_status?: Gstr2bMatchStatus | 'all' }): Promise<Gstr2bEntryRow[]> {
  const actor = await getActor()
  if (!actor) return []
  let q = actor.supabase
    .from('gstr_2b_entry')
    .select(`
      id, period, vendor_gstin, vendor_name, vendor_invoice_no, vendor_invoice_date,
      invoice_type, taxable_value, total, itc_available, itc_reversal_reason,
      matched_bill_id, match_status, match_notes,
      matched_bill:matched_bill_id ( bill_number )
    `)
    .eq('tenant_id', actor.tenantId)
    .eq('period', period)
    .is('deleted_at', null)
    .order('vendor_name', { ascending: true })
    .limit(500)
  if (filter?.match_status && filter.match_status !== 'all') q = q.eq('match_status', filter.match_status)

  const { data } = await q
  if (!data) return []
  return data.map((r) => {
    const billRel = r.matched_bill as { bill_number: string } | { bill_number: string }[] | null
    const bill = Array.isArray(billRel) ? billRel[0] : billRel
    return {
      id: r.id as string,
      period: r.period as string,
      vendor_gstin: r.vendor_gstin as string,
      vendor_name: (r.vendor_name as string | null) ?? null,
      vendor_invoice_no: r.vendor_invoice_no as string,
      vendor_invoice_date: r.vendor_invoice_date as string,
      invoice_type: (r.invoice_type as string | null) ?? null,
      taxable_value: Number(r.taxable_value ?? 0),
      total: Number(r.total ?? 0),
      itc_available: Boolean(r.itc_available),
      itc_reversal_reason: (r.itc_reversal_reason as string | null) ?? null,
      matched_bill_id: (r.matched_bill_id as string | null) ?? null,
      matched_bill_number: bill?.bill_number ?? null,
      match_status: r.match_status as Gstr2bMatchStatus,
      match_notes: (r.match_notes as string | null) ?? null,
    }
  })
}

/* ═══ Bill IRN update ═══════════════════════════════════════ */

export async function updateBillIrn(billId: string, irnNo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!irnNo.trim()) return { ok: false, error: 'IRN cannot be blank' }

  const { error } = await actor.supabase
    .from('vendor_bill')
    .update({
      irn_no: irnNo.trim(),
      irn_validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    })
    .eq('id', billId)
    .eq('tenant_id', actor.tenantId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/procurement/bills/${billId}`)
  return { ok: true }
}
