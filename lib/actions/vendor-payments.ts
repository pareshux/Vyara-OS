'use server'

/* ─────────────────────────────────────────────────────────────
   Vendor Payment server actions — Phase 3α (Blueprint FIN-021 + FIN-022).

   Closes the procurement chain: PO → GRN → Vendor Bill → Payment.

   State machine:
     draft → posted    (atomic: increment bill.amount_paid +
                        recompute bill.status to partly_paid/paid for
                        each allocation)
     draft → cancelled

   TDS is computed at payment level (uniform section across all
   allocations in v1). The `suggestTds` helper in lib/procurement/
   tds-engine.ts auto-fills based on vendor_type at form open; user
   can override per payment. PAN-availability triggers §206AA
   higher-rate suggestion when vendor PAN is null.

   Multi-bill payments: one vendor can be paid for multiple bills
   in a single voucher (common with NEFT consolidating 3-4 invoices).
   The vendor_payment_allocation table is the join. Bill amount_paid
   updates atomically across the allocation set on post.
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'
import {
  computeTds,
  type TdsSection,
} from '@/lib/procurement/tds-engine'

export type PaymentStatus = 'draft' | 'posted' | 'cancelled'
export type PaymentMode = 'neft' | 'rtgs' | 'cheque' | 'upi' | 'cash' | 'bg_adjustment' | 'on_account'

export type PaymentAllocationInput = {
  bill_id: string
  allocated_amount: number
}

export type PaymentSummary = {
  id: string
  payment_number: string
  vendor_id: string
  vendor_name: string | null
  payment_date: string
  payment_mode: PaymentMode
  reference_no: string | null
  gross_amount: number
  tds_section: TdsSection | null
  tds_pct: number
  tds_amount: number
  net_amount: number
  status: PaymentStatus
  allocation_count: number
}

export type PaymentAllocation = {
  id: string
  bill_id: string
  bill_number: string | null
  vendor_invoice_no: string | null
  bill_total: number | null
  allocated_amount: number
}

export type PaymentDetail = {
  id: string
  payment_number: string
  vendor_id: string
  vendor_name: string | null
  vendor_gstin: string | null
  vendor_pan: string | null
  vendor_msme_status: string | null
  payment_date: string
  payment_mode: PaymentMode
  bank_account_used: string | null
  reference_no: string | null
  gross_amount: number
  tds_section: TdsSection | null
  tds_pct: number
  tds_amount: number
  net_amount: number
  status: PaymentStatus
  posted_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  notes: string | null
  created_at: string
  allocations: PaymentAllocation[]
}

/* ─── Helpers ─────────────────────────────────────────────── */

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
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id as string,
    role: profile.role as string,
  }
}

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }
function pickOne<T>(v: unknown): T | null {
  if (v == null) return null
  return Array.isArray(v) ? ((v[0] as T | undefined) ?? null) : (v as T)
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }

/* ═══════════════════════════════════════════════════════════
   CREATE — draft payment with multi-bill allocation + TDS
   ═══════════════════════════════════════════════════════════ */

export async function createVendorPayment(params: {
  vendor_id: string
  payment_date?: string
  payment_mode: PaymentMode
  bank_account_used?: string
  reference_no?: string
  tds_section?: TdsSection | null
  tds_pct?: number
  notes?: string
  allocations: PaymentAllocationInput[]
  post_immediately?: boolean
}): Promise<{ ok: true; id: string; payment_number: string; status: PaymentStatus } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Only admins or managers can record payments' }
  if (!params.allocations || params.allocations.length === 0) return { ok: false, error: 'At least one bill must be allocated' }

  // Resolve vendor (drives validations + snapshot)
  const { data: vendor } = await actor.supabase
    .from('vendor')
    .select('id, name, msme_status, pan')
    .eq('id', params.vendor_id)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!vendor) return { ok: false, error: 'Vendor not found' }

  // Validate bills + allocations
  const billIds = params.allocations.map((a) => a.bill_id)
  const { data: bills } = await actor.supabase
    .from('vendor_bill')
    .select('id, vendor_id, total, amount_paid, amount_outstanding, status')
    .in('id', billIds)
    .eq('tenant_id', actor.tenantId)

  if (!bills || bills.length !== billIds.length) {
    return { ok: false, error: 'One or more bills not found' }
  }
  const billMap = new Map(bills.map((b) => [b.id, b]))

  let gross = 0
  for (let i = 0; i < params.allocations.length; i++) {
    const a = params.allocations[i]
    const bill = billMap.get(a.bill_id)
    if (!bill) return { ok: false, error: `Bill ${a.bill_id} not found` }
    if (bill.vendor_id !== params.vendor_id) {
      return { ok: false, error: `Bill ${a.bill_id} belongs to a different vendor` }
    }
    if (!['approved', 'partly_paid'].includes(bill.status as string)) {
      return { ok: false, error: `Bill ${a.bill_id} is in status '${bill.status}' — only approved or partly_paid bills can be paid` }
    }
    const amt = Number(a.allocated_amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      return { ok: false, error: `Allocation ${i + 1}: amount must be > 0` }
    }
    const outstanding = Number(bill.amount_outstanding || 0)
    if (amt > outstanding + 0.01) {
      return { ok: false, error: `Allocation ${i + 1}: ${amt} exceeds bill outstanding ${outstanding}` }
    }
    gross += amt
  }
  gross = r2(gross)

  // TDS
  const tdsPct = Number(params.tds_pct ?? 0)
  if (tdsPct < 0 || tdsPct > 50) return { ok: false, error: 'TDS rate must be between 0 and 50%' }
  if (tdsPct > 0 && !params.tds_section) return { ok: false, error: 'TDS section is required when rate > 0' }
  const { tds, net } = computeTds(gross, tdsPct)

  // Insert header
  const { data: payment, error: payErr } = await actor.supabase
    .from('vendor_payment')
    .insert({
      tenant_id: actor.tenantId,
      vendor_id: params.vendor_id,
      payment_date: params.payment_date ?? new Date().toISOString().slice(0, 10),
      payment_mode: params.payment_mode,
      bank_account_used: params.bank_account_used?.trim() || null,
      reference_no: params.reference_no?.trim() || null,
      gross_amount: gross,
      tds_section: tdsPct > 0 ? (params.tds_section ?? null) : null,
      tds_pct: tdsPct,
      tds_amount: tds,
      net_amount: net,
      status: 'draft',
      notes: params.notes?.trim() || null,
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id, payment_number')
    .single()

  if (payErr || !payment) {
    captureError(payErr ?? new Error('payment insert returned no row'), {
      action_name: 'createVendorPayment',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    return { ok: false, error: payErr?.message ?? 'Could not create payment' }
  }

  // Insert allocations
  const allocPayload = params.allocations.map((a) => ({
    tenant_id: actor.tenantId,
    payment_id: payment.id,
    bill_id: a.bill_id,
    allocated_amount: Number(a.allocated_amount),
  }))
  const { error: allocErr } = await actor.supabase
    .from('vendor_payment_allocation')
    .insert(allocPayload)
  if (allocErr) {
    await actor.supabase
      .from('vendor_payment')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', payment.id)
    return { ok: false, error: `Failed to create allocations: ${allocErr.message}` }
  }

  revalidatePath('/procurement/payments')
  revalidatePath('/procurement/ap-ageing')

  if (params.post_immediately) {
    const posted = await postVendorPayment(payment.id as string)
    if (!posted.ok) {
      return { ok: false, error: `Payment saved as draft (${payment.payment_number as string}); posting failed: ${posted.error}` }
    }
    return { ok: true, id: payment.id as string, payment_number: payment.payment_number as string, status: 'posted' }
  }

  return { ok: true, id: payment.id as string, payment_number: payment.payment_number as string, status: 'draft' }
}

/* ═══════════════════════════════════════════════════════════
   POST — atomic apply: increment bill.amount_paid + flip status
   ═══════════════════════════════════════════════════════════ */

export async function postVendorPayment(
  paymentId: string,
): Promise<{ ok: true; bills_affected: number } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  // Fetch payment + allocations
  const { data: payment } = await actor.supabase
    .from('vendor_payment')
    .select('id, status, vendor_id, allocations:vendor_payment_allocation(id, bill_id, allocated_amount)')
    .eq('id', paymentId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!payment) return { ok: false, error: 'Payment not found' }
  if (payment.status !== 'draft') return { ok: false, error: `Payment is already ${payment.status as string}` }

  const allocs = ((payment.allocations as Array<{ id: string; bill_id: string; allocated_amount: number }> | null) ?? [])
  if (allocs.length === 0) return { ok: false, error: 'Payment has no allocations' }

  // Re-validate against current bill state (in case bills were paid by another payment between draft + post)
  const billIds = allocs.map((a) => a.bill_id)
  const { data: bills } = await actor.supabase
    .from('vendor_bill')
    .select('id, total, amount_paid, amount_outstanding, status')
    .in('id', billIds)
  if (!bills) return { ok: false, error: 'Failed to fetch bills for re-validation' }
  const billMap = new Map(bills.map((b) => [b.id, b]))

  for (const a of allocs) {
    const bill = billMap.get(a.bill_id)
    if (!bill) return { ok: false, error: `Bill ${a.bill_id} not found at post time` }
    const outstanding = Number(bill.amount_outstanding || 0)
    if (Number(a.allocated_amount) > outstanding + 0.01) {
      return { ok: false, error: `Bill outstanding decreased since draft (now ${outstanding}; tried to allocate ${a.allocated_amount}). Cancel + recreate the payment.` }
    }
  }

  const now = new Date().toISOString()

  // Flip payment status first; rollback if anything downstream fails.
  const { error: flipErr } = await actor.supabase
    .from('vendor_payment')
    .update({
      status: 'posted',
      posted_at: now,
      posted_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', paymentId)
  if (flipErr) return { ok: false, error: flipErr.message }

  async function rollback(reason: string) {
    await actor!.supabase
      .from('vendor_payment')
      .update({
        status: 'draft',
        posted_at: null,
        posted_by: null,
        notes: `[post failed: ${reason}]`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
  }

  // Apply per-bill effects
  for (const a of allocs) {
    const bill = billMap.get(a.bill_id)!
    const newPaid = r2(Number(bill.amount_paid || 0) + Number(a.allocated_amount))
    const newOutstanding = r2(Number(bill.total || 0) - newPaid)
    let nextStatus = bill.status
    if (newOutstanding <= 0.01) nextStatus = 'paid'
    else if (newPaid > 0) nextStatus = 'partly_paid'

    const { error: updErr } = await actor.supabase
      .from('vendor_bill')
      .update({
        amount_paid: newPaid,
        amount_outstanding: Math.max(0, newOutstanding),
        status: nextStatus,
        updated_at: now,
        updated_by: actor.userId,
      })
      .eq('id', a.bill_id)
    if (updErr) {
      await rollback(`bill update failed: ${updErr.message}`)
      return { ok: false, error: `Failed to update bill ${a.bill_id}: ${updErr.message}` }
    }
  }

  revalidatePath('/procurement/payments')
  revalidatePath(`/procurement/payments/${paymentId}`)
  revalidatePath('/procurement/bills')
  revalidatePath('/procurement/ap-ageing')

  return { ok: true, bills_affected: allocs.length }
}

/* ═══════════════════════════════════════════════════════════
   CANCEL — draft-only
   ═══════════════════════════════════════════════════════════ */

export async function cancelVendorPayment(
  paymentId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!reason.trim()) return { ok: false, error: 'Cancellation reason is required' }

  const { data: payment } = await actor.supabase
    .from('vendor_payment')
    .select('id, status')
    .eq('id', paymentId)
    .maybeSingle()
  if (!payment) return { ok: false, error: 'Payment not found' }
  if (payment.status !== 'draft') {
    return { ok: false, error: `Cannot cancel ${payment.status as string} payment. To reverse a posted payment, record a reverse-allocation in v2.` }
  }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('vendor_payment')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: actor.userId,
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', paymentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/payments')
  revalidatePath(`/procurement/payments/${paymentId}`)
  return { ok: true }
}

/* ═══════════════════════════════════════════════════════════
   READ — list + detail + form lookups
   ═══════════════════════════════════════════════════════════ */

export async function listVendorPayments(params?: {
  status?: PaymentStatus | 'all'
  mode?: PaymentMode | 'all'
  vendor_id?: string
  bill_id?: string
  limit?: number
}): Promise<PaymentSummary[]> {
  const actor = await getActor()
  if (!actor) return []

  let q = actor.supabase
    .from('vendor_payment')
    .select(`
      id, payment_number, vendor_id, payment_date, payment_mode, reference_no,
      gross_amount, tds_section, tds_pct, tds_amount, net_amount, status,
      vendor:vendor_id ( id, name ),
      allocations:vendor_payment_allocation ( id, bill_id )
    `)
    .eq('tenant_id', actor.tenantId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params?.mode && params.mode !== 'all') q = q.eq('payment_mode', params.mode)
  if (params?.vendor_id) q = q.eq('vendor_id', params.vendor_id)

  const { data, error } = await q
  if (error || !data) return []

  let rows = data.map((r) => {
    const vendor = pickOne<{ id: string; name: string }>(r.vendor)
    const allocations = (r.allocations as Array<{ id: string; bill_id: string }> | null) ?? []
    return {
      id: r.id as string,
      payment_number: r.payment_number as string,
      vendor_id: r.vendor_id as string,
      vendor_name: vendor?.name ?? null,
      payment_date: r.payment_date as string,
      payment_mode: r.payment_mode as PaymentMode,
      reference_no: (r.reference_no as string | null) ?? null,
      gross_amount: Number(r.gross_amount ?? 0),
      tds_section: (r.tds_section as TdsSection | null) ?? null,
      tds_pct: Number(r.tds_pct ?? 0),
      tds_amount: Number(r.tds_amount ?? 0),
      net_amount: Number(r.net_amount ?? 0),
      status: r.status as PaymentStatus,
      allocation_count: allocations.length,
    } satisfies PaymentSummary
  })

  // Bill-id filter is applied post-fetch (we joined the join table for count)
  if (params?.bill_id) {
    const billId = params.bill_id
    const { data: hits } = await actor.supabase
      .from('vendor_payment_allocation')
      .select('payment_id')
      .eq('bill_id', billId)
    const paymentIdSet = new Set((hits ?? []).map((h) => h.payment_id as string))
    rows = rows.filter((r) => paymentIdSet.has(r.id))
  }
  return rows
}

export async function getVendorPayment(paymentId: string): Promise<PaymentDetail | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r } = await actor.supabase
    .from('vendor_payment')
    .select(`
      id, payment_number, vendor_id, payment_date, payment_mode,
      bank_account_used, reference_no,
      gross_amount, tds_section, tds_pct, tds_amount, net_amount,
      status, posted_at, cancelled_at, cancellation_reason, notes, created_at,
      vendor:vendor_id ( id, name, gstin, pan, msme_status ),
      allocations:vendor_payment_allocation (
        id, bill_id, allocated_amount,
        bill:bill_id ( id, bill_number, vendor_invoice_no, total )
      )
    `)
    .eq('id', paymentId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!r) return null

  const vendor = pickOne<{ id: string; name: string; gstin: string | null; pan: string | null; msme_status: string | null }>(r.vendor)

  type RawAlloc = {
    id: string; bill_id: string; allocated_amount: number; bill?: unknown
  }
  const allocations: PaymentAllocation[] = ((r.allocations as RawAlloc[] | null) ?? []).map((a) => {
    const bill = pickOne<{ id: string; bill_number: string; vendor_invoice_no: string; total: number }>(a.bill)
    return {
      id: a.id,
      bill_id: a.bill_id,
      bill_number: bill?.bill_number ?? null,
      vendor_invoice_no: bill?.vendor_invoice_no ?? null,
      bill_total: bill?.total != null ? Number(bill.total) : null,
      allocated_amount: Number(a.allocated_amount),
    }
  })

  return {
    id: r.id as string,
    payment_number: r.payment_number as string,
    vendor_id: r.vendor_id as string,
    vendor_name: vendor?.name ?? null,
    vendor_gstin: vendor?.gstin ?? null,
    vendor_pan: vendor?.pan ?? null,
    vendor_msme_status: vendor?.msme_status ?? null,
    payment_date: r.payment_date as string,
    payment_mode: r.payment_mode as PaymentMode,
    bank_account_used: (r.bank_account_used as string | null) ?? null,
    reference_no: (r.reference_no as string | null) ?? null,
    gross_amount: Number(r.gross_amount ?? 0),
    tds_section: (r.tds_section as TdsSection | null) ?? null,
    tds_pct: Number(r.tds_pct ?? 0),
    tds_amount: Number(r.tds_amount ?? 0),
    net_amount: Number(r.net_amount ?? 0),
    status: r.status as PaymentStatus,
    posted_at: (r.posted_at as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    cancellation_reason: (r.cancellation_reason as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    allocations,
  }
}

/* ─── Form lookups ─────────────────────────────────────────── */

export type VendorPickerRow = {
  id: string
  name: string
  code: string
  vendor_type: string
  msme_status: string | null
  pan: string | null
  payment_terms_days: number | null
  outstanding: number
  bill_count: number
}

export async function listVendorsWithOutstanding(): Promise<VendorPickerRow[]> {
  const actor = await getActor()
  if (!actor) return []

  // Pull all vendors + sum of outstanding from approved/partly_paid bills
  const { data: vendors } = await actor.supabase
    .from('vendor')
    .select('id, name, code, vendor_type, msme_status, pan, payment_terms_days, is_active')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true)
    .order('name')

  if (!vendors) return []

  const { data: bills } = await actor.supabase
    .from('vendor_bill')
    .select('vendor_id, amount_outstanding, status')
    .eq('tenant_id', actor.tenantId)
    .in('status', ['approved', 'partly_paid'])
    .gt('amount_outstanding', 0)

  const outstandingByVendor = new Map<string, { outstanding: number; count: number }>()
  for (const b of (bills ?? [])) {
    const cur = outstandingByVendor.get(b.vendor_id as string) ?? { outstanding: 0, count: 0 }
    cur.outstanding += Number(b.amount_outstanding || 0)
    cur.count += 1
    outstandingByVendor.set(b.vendor_id as string, cur)
  }

  return vendors.map((v) => {
    const agg = outstandingByVendor.get(v.id as string) ?? { outstanding: 0, count: 0 }
    return {
      id: v.id as string,
      name: v.name as string,
      code: v.code as string,
      vendor_type: v.vendor_type as string,
      msme_status: (v.msme_status as string | null) ?? null,
      pan: (v.pan as string | null) ?? null,
      payment_terms_days: (v.payment_terms_days as number | null) ?? null,
      outstanding: r2(agg.outstanding),
      bill_count: agg.count,
    } satisfies VendorPickerRow
  })
}

export type BillForPayment = {
  id: string
  bill_number: string
  vendor_invoice_no: string
  vendor_invoice_date: string
  bill_date: string
  due_date: string | null
  total: number
  amount_paid: number
  amount_outstanding: number
  days_overdue: number
  msme_flag: 'not_applicable' | 'unknown' | 'ok' | 'warning' | 'breach'
}

export async function getBillsForPayment(vendorId: string): Promise<BillForPayment[]> {
  const actor = await getActor()
  if (!actor) return []

  // Hit the view to get computed days_overdue + msme_flag
  const { data } = await actor.supabase
    .from('vendor_bill_ageing_v')
    .select('id, bill_number, vendor_invoice_no, vendor_invoice_date, bill_date, due_date, total, amount_paid, amount_outstanding, days_overdue, msme_flag')
    .eq('vendor_id', vendorId)
    .order('days_overdue', { ascending: false })
    .order('bill_date', { ascending: true })
  if (!data) return []
  return data.map((b) => ({
    id: b.id as string,
    bill_number: b.bill_number as string,
    vendor_invoice_no: b.vendor_invoice_no as string,
    vendor_invoice_date: b.vendor_invoice_date as string,
    bill_date: b.bill_date as string,
    due_date: (b.due_date as string | null) ?? null,
    total: Number(b.total),
    amount_paid: Number(b.amount_paid ?? 0),
    amount_outstanding: Number(b.amount_outstanding),
    days_overdue: Number(b.days_overdue ?? 0),
    msme_flag: b.msme_flag as BillForPayment['msme_flag'],
  }))
}
