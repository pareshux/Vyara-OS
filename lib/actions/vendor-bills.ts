'use server'

/* ─────────────────────────────────────────────────────────────
   Vendor Bill server actions + 3-way match engine — Phase 2α
   (Blueprint DEL-018).

   The 3-way match is the *value* of automating AP — catches
   over-billing, rate creep, HSN drift between PO and invoice.
   It runs server-side on submitVendorBill and writes per-line
   match_status onto each vendor_bill_line, plus an aggregated
   bill-level match_status.

   Match rules (per line, when po_line_id is set):
     - qty:   bill.quantity must be ≤ (po.qty_received − po.qty_billed)
              Catches over-billing relative to what's actually been
              received. Exact-zero or positive headroom passes.
     - rate:  bill.rate must equal po.rate (no tolerance v1; PO
              amendment is the right path if rate changed).
     - HSN:   if both po.hsn_code and bill.hsn_code present, they
              must match exactly. Either-side missing is allowed
              (warn-not-fail).
     - GST%:  bill.gst_rate_pct must equal po.gst_rate_pct.

   Unlinked lines (no po_line_id) get match_status='unlinked' — bill
   can still be submitted, but the bill-level aggregate moves to
   'under_review' so a human notices.

   Per-line precedence (worst-wins): qty_over > rate_mismatch >
   gst_mismatch > hsn_mismatch > unlinked > matched.

   Bill-level aggregate:
     - any line is qty_over / rate_mismatch / gst_mismatch / hsn_mismatch
       → 'mismatched'
     - else if any line is 'unlinked'
       → 'under_review'
     - else
       → 'matched'

   On approveVendorBill: po_line.qty_billed += bill_line.quantity
   for each line with po_line_id set.
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'
import { requestApproval } from './approvals'
import {
  matchBillLine,
  aggregateBillMatch,
  type LineMatchStatus,
  type BillMatchStatus,
} from '@/lib/procurement/match-engine'

export type { LineMatchStatus, BillMatchStatus }
export type BillStatus = 'draft' | 'submitted' | 'approved' | 'partly_paid' | 'paid' | 'cancelled'

export type VendorBillLineInput = {
  po_line_id?: string | null
  description: string
  hsn_code?: string | null
  unit?: string
  quantity: number
  rate: number
  discount_pct?: number
  gst_rate_pct: number
  product_id?: string | null
}

export type VendorBillSummary = {
  id: string
  bill_number: string
  vendor_invoice_no: string
  vendor_invoice_date: string
  vendor_id: string
  vendor_name: string | null
  po_id: string | null
  po_number: string | null
  bill_date: string
  due_date: string | null
  status: BillStatus
  match_status: BillMatchStatus
  total: number
  amount_paid: number
  amount_outstanding: number
  line_count: number
  approval_request_id: string | null
}

export type VendorBillLine = {
  id: string
  line_no: number
  po_line_id: string | null
  product_id: string | null
  description: string
  hsn_code: string | null
  unit: string
  quantity: number
  rate: number
  discount_pct: number
  taxable_value: number
  is_interstate: boolean
  gst_rate_pct: number
  igst_amount: number
  cgst_amount: number
  sgst_amount: number
  amount_total: number
  match_status: LineMatchStatus
  match_notes: string | null
  // Context from the matched PO line (read-only)
  po_line_description: string | null
  po_line_quantity: number | null
  po_line_rate: number | null
  po_line_hsn_code: string | null
  po_line_gst_rate_pct: number | null
}

export type VendorBillDetail = {
  id: string
  bill_number: string
  vendor_invoice_no: string
  vendor_invoice_date: string
  vendor_id: string
  vendor_name: string | null
  vendor_gstin: string | null
  vendor_msme_status: string | null
  po_id: string | null
  po_number: string | null
  grn_id: string | null
  grn_number: string | null
  bill_date: string
  received_at: string | null
  due_date: string | null
  status: BillStatus
  match_status: BillMatchStatus
  match_run_at: string | null
  match_notes: string | null
  subtotal: number
  discount_amount: number
  tax_amount: number
  round_off: number
  total: number
  amount_paid: number
  amount_outstanding: number
  vendor_address_snapshot: string | null
  bill_to_snapshot: string | null
  approval_request_id: string | null
  submitted_at: string | null
  approved_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  notes: string | null
  created_at: string
  // P5 additions
  irn_no: string | null
  irn_validated_at: string | null
  gstr_2b_status: 'pending' | 'matched' | 'mismatched' | 'not_in_2b' | 'reversed' | null
  gstr_2b_period: string | null
  itc_eligible: boolean | null
  lines: VendorBillLine[]
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
function r3(n: number): number { return Math.round((n + Number.EPSILON) * 1000) / 1000 }

/* ═══════════════════════════════════════════════════════════
   3-way match engine lives in lib/procurement/match-engine.ts
   (pure functions; can't co-locate in a 'use server' module).
   ═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   CREATE — draft vendor bill (auto-runs match)
   ═══════════════════════════════════════════════════════════ */

export async function createVendorBill(params: {
  vendor_id: string
  po_id?: string | null
  grn_id?: string | null
  vendor_invoice_no: string
  vendor_invoice_date: string
  bill_date?: string
  received_at?: string | null
  due_date?: string | null
  notes?: string
  lines: VendorBillLineInput[]
  submit_immediately?: boolean
}): Promise<{ ok: true; id: string; bill_number: string; match_status: BillMatchStatus } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Only admins or managers can book vendor bills' }
  if (!params.lines || params.lines.length === 0) return { ok: false, error: 'At least one line is required' }
  if (!params.vendor_invoice_no.trim()) return { ok: false, error: 'Vendor invoice number is required' }
  if (!params.vendor_invoice_date) return { ok: false, error: 'Vendor invoice date is required' }

  // Resolve vendor + (optional) PO
  const { data: vendor } = await actor.supabase
    .from('vendor')
    .select('id, name, gstin, address, payment_terms_days')
    .eq('id', params.vendor_id)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!vendor) return { ok: false, error: 'Vendor not found' }

  let poLineMap = new Map<string, { id: string; quantity: number; qty_received: number; qty_billed: number; rate: number; hsn_code: string | null; gst_rate_pct: number; is_interstate: boolean; description: string }>()
  let receivedAtFromGrn: string | null = null

  if (params.po_id) {
    const { data: po } = await actor.supabase
      .from('purchase_order')
      .select('id, vendor_id, payment_terms_days, lines:purchase_order_line ( id, quantity, qty_received, qty_billed, rate, hsn_code, gst_rate_pct, is_interstate, description )')
      .eq('id', params.po_id)
      .eq('tenant_id', actor.tenantId)
      .maybeSingle()
    if (!po) return { ok: false, error: 'PO not found' }
    if (po.vendor_id !== params.vendor_id) return { ok: false, error: 'PO vendor does not match the bill vendor' }
    const poLines = (po.lines as Array<{ id: string; quantity: number; qty_received: number; qty_billed: number; rate: number; hsn_code: string | null; gst_rate_pct: number; is_interstate: boolean; description: string }> | null) ?? []
    poLineMap = new Map(poLines.map((l) => [l.id, l]))
  }

  if (params.grn_id) {
    const { data: grn } = await actor.supabase
      .from('goods_receipt_note')
      .select('id, grn_date, po_id')
      .eq('id', params.grn_id)
      .eq('tenant_id', actor.tenantId)
      .maybeSingle()
    if (!grn) return { ok: false, error: 'GRN not found' }
    if (params.po_id && grn.po_id !== params.po_id) {
      return { ok: false, error: 'GRN belongs to a different PO' }
    }
    receivedAtFromGrn = grn.grn_date as string
  }

  // Compute received_at (drives MSME 45-day)
  const receivedAt = params.received_at ?? receivedAtFromGrn ?? null

  // Compute due_date (received_at + payment_terms_days). If neither received nor vendor terms, leave null.
  let due_date: string | null = params.due_date ?? null
  if (!due_date && receivedAt && (vendor.payment_terms_days != null)) {
    const d = new Date(receivedAt + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + Number(vendor.payment_terms_days))
    due_date = d.toISOString().slice(0, 10)
  }

  // Build sanitised lines + run match
  type SanitisedLine = {
    line_no: number
    po_line_id: string | null
    product_id: string | null
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    rate: number
    discount_pct: number
    taxable_value: number
    is_interstate: boolean
    gst_rate_pct: number
    igst_amount: number
    cgst_amount: number
    sgst_amount: number
    amount_total: number
    match_status: LineMatchStatus
    match_notes: string | null
  }
  const sanitised: SanitisedLine[] = []
  let subtotal = 0
  let discountTotal = 0
  let taxTotal = 0

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i]
    const qty = Number(line.quantity)
    const rate = Number(line.rate)
    const discount = Number(line.discount_pct ?? 0)
    const gstRate = Number(line.gst_rate_pct ?? 0)

    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: `Line ${i + 1}: quantity > 0 required` }
    if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: `Line ${i + 1}: rate ≥ 0 required` }

    const poLine = line.po_line_id ? (poLineMap.get(line.po_line_id) ?? null) : null
    const interstate = poLine ? Boolean(poLine.is_interstate) : false

    const gross = qty * rate
    const lineDiscount = r2(gross * (discount / 100))
    const taxableValue = r2(gross - lineDiscount)
    const tax = r2(taxableValue * (gstRate / 100))
    const igst = interstate ? tax : 0
    const cgst = interstate ? 0 : r2(tax / 2)
    const sgst = interstate ? 0 : r2(tax - cgst)
    const amountTotal = r2(taxableValue + tax)

    const match = matchBillLine(
      { quantity: qty, rate, hsn_code: line.hsn_code ?? null, gst_rate_pct: gstRate },
      { po_line: poLine ? { id: poLine.id, quantity: poLine.quantity, qty_received: poLine.qty_received, qty_billed: poLine.qty_billed, rate: poLine.rate, hsn_code: poLine.hsn_code, gst_rate_pct: poLine.gst_rate_pct } : null },
    )

    subtotal += taxableValue
    discountTotal += lineDiscount
    taxTotal += tax

    sanitised.push({
      line_no: i + 1,
      po_line_id: line.po_line_id ?? null,
      product_id: line.product_id ?? null,
      description: line.description.trim(),
      hsn_code: line.hsn_code?.trim() || null,
      unit: line.unit?.trim() || 'nos',
      quantity: qty,
      rate,
      discount_pct: discount,
      taxable_value: taxableValue,
      is_interstate: interstate,
      gst_rate_pct: gstRate,
      igst_amount: igst,
      cgst_amount: cgst,
      sgst_amount: sgst,
      amount_total: amountTotal,
      match_status: match.status,
      match_notes: match.notes,
    })
  }

  const total = r2(subtotal + taxTotal)
  const billMatchStatus = aggregateBillMatch(sanitised.map((s) => s.match_status))

  // Address snapshots
  const { data: tenant } = await actor.supabase
    .from('tenant')
    .select('name, settings')
    .eq('id', actor.tenantId)
    .single()
  const companySettings = (tenant?.settings as { company?: { address?: string; city?: string; state?: string; gstin?: string } } | null)?.company ?? {}
  const billTo = [
    tenant?.name as string | undefined,
    companySettings.address,
    [companySettings.city, companySettings.state].filter(Boolean).join(', ') || null,
    companySettings.gstin ? `GSTIN ${companySettings.gstin}` : null,
  ].filter(Boolean).join(' · ')
  const vendorAddr = [
    vendor.name as string,
    vendor.address as string | null,
    vendor.gstin ? `GSTIN ${vendor.gstin as string}` : null,
  ].filter(Boolean).join(' · ')

  // Insert bill header
  const { data: bill, error: billErr } = await actor.supabase
    .from('vendor_bill')
    .insert({
      tenant_id: actor.tenantId,
      vendor_id: params.vendor_id,
      po_id: params.po_id ?? null,
      grn_id: params.grn_id ?? null,
      vendor_invoice_no: params.vendor_invoice_no.trim(),
      vendor_invoice_date: params.vendor_invoice_date,
      bill_date: params.bill_date ?? new Date().toISOString().slice(0, 10),
      received_at: receivedAt,
      due_date,
      currency: 'INR',
      status: 'draft',
      match_status: billMatchStatus,
      match_run_at: new Date().toISOString(),
      match_notes: billMatchStatus === 'mismatched' ? 'Lines with hard mismatches — review before submit.' : null,
      subtotal: r2(subtotal),
      discount_amount: r2(discountTotal),
      tax_amount: r2(taxTotal),
      total,
      amount_paid: 0,
      amount_outstanding: total,
      vendor_address_snapshot: vendorAddr,
      bill_to_snapshot: billTo,
      notes: params.notes?.trim() || null,
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id, bill_number')
    .single()

  if (billErr || !bill) {
    captureError(billErr ?? new Error('vendor bill insert returned no row'), {
      action_name: 'createVendorBill',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    // Surface unique-violation more cleanly
    if (billErr?.message?.includes('vendor_bill_tenant_id_vendor_id_vendor_invoice_no_key')) {
      return { ok: false, error: `Vendor invoice number "${params.vendor_invoice_no}" already booked for this vendor` }
    }
    return { ok: false, error: billErr?.message ?? 'Could not create vendor bill' }
  }

  // Insert bill lines
  const linePayload = sanitised.map((s) => ({ ...s, tenant_id: actor.tenantId, bill_id: bill.id }))
  const { error: lineErr } = await actor.supabase
    .from('vendor_bill_line')
    .insert(linePayload)

  if (lineErr) {
    await actor.supabase
      .from('vendor_bill')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', bill.id)
    return { ok: false, error: `Failed to create bill lines: ${lineErr.message}` }
  }

  revalidatePath('/procurement/bills')
  if (params.po_id) revalidatePath(`/procurement/orders/${params.po_id}`)

  if (params.submit_immediately) {
    const sub = await submitVendorBill(bill.id as string)
    if (!sub.ok) {
      return { ok: false, error: `Bill saved as draft (${bill.bill_number as string}); submit failed: ${sub.error}` }
    }
  }

  return { ok: true, id: bill.id as string, bill_number: bill.bill_number as string, match_status: billMatchStatus }
}

/* ═══════════════════════════════════════════════════════════
   SUBMIT — raises approval (mismatched bills can still be
   submitted; the approver sees the match diagnostics)
   ═══════════════════════════════════════════════════════════ */

export async function submitVendorBill(
  billId: string,
): Promise<{ ok: true; status: BillStatus; approvalRequestId: string | null } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  const { data: bill } = await actor.supabase
    .from('vendor_bill')
    .select('id, status, total, created_by')
    .eq('id', billId)
    .maybeSingle()
  if (!bill) return { ok: false, error: 'Bill not found' }
  if (bill.status !== 'draft') return { ok: false, error: `Bill already ${bill.status as string}` }

  const ar = await requestApproval({
    entityType: 'vendor_bill',
    entityId: bill.id as string,
    amount: Number(bill.total),
    subjectUserId: (bill.created_by as string | null) ?? actor.userId,
    autoApproveIfNoPolicy: true,
  })
  if (!ar.ok) return { ok: false, error: ar.error }

  const now = new Date().toISOString()
  const nextStatus: BillStatus = ar.autoApproved ? 'approved' : 'submitted'

  const { error } = await actor.supabase
    .from('vendor_bill')
    .update({
      status: nextStatus,
      submitted_at: now,
      approved_at: ar.autoApproved ? now : null,
      approved_by: ar.autoApproved ? actor.userId : null,
      approval_request_id: ar.autoApproved ? null : ar.requestId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', billId)
  if (error) return { ok: false, error: error.message }

  // If auto-approved, push qty_billed onto po_line immediately
  if (ar.autoApproved) {
    await applyApprovedBillEffects(actor.supabase, billId)
  }

  revalidatePath('/procurement/bills')
  revalidatePath(`/procurement/bills/${billId}`)
  return { ok: true, status: nextStatus, approvalRequestId: ar.autoApproved ? null : ar.requestId }
}

/* ═══════════════════════════════════════════════════════════
   APPROVED-BILL EFFECTS — increment po_line.qty_billed
   ═══════════════════════════════════════════════════════════ */

async function applyApprovedBillEffects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  billId: string,
) {
  const { data: lines } = await supabase
    .from('vendor_bill_line')
    .select('po_line_id, quantity')
    .eq('bill_id', billId)
  if (!lines || lines.length === 0) return

  for (const l of lines) {
    if (!l.po_line_id) continue
    const { data: poLine } = await supabase
      .from('purchase_order_line')
      .select('qty_billed')
      .eq('id', l.po_line_id)
      .maybeSingle()
    if (!poLine) continue
    const next = r3(Number(poLine.qty_billed || 0) + Number(l.quantity || 0))
    await supabase
      .from('purchase_order_line')
      .update({ qty_billed: next, updated_at: new Date().toISOString() })
      .eq('id', l.po_line_id)
  }
}

/* ═══════════════════════════════════════════════════════════
   CANCEL — draft-only (use credit note flow for approved bills)
   ═══════════════════════════════════════════════════════════ */

export async function cancelVendorBill(
  billId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!reason.trim()) return { ok: false, error: 'Cancellation reason is required' }

  const { data: bill } = await actor.supabase
    .from('vendor_bill')
    .select('id, status, po_id')
    .eq('id', billId)
    .maybeSingle()
  if (!bill) return { ok: false, error: 'Bill not found' }
  if (bill.status !== 'draft') {
    return { ok: false, error: `Cannot cancel ${bill.status as string} bill — for approved bills, record an RTV + credit note.` }
  }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('vendor_bill')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: actor.userId,
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', billId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/bills')
  revalidatePath(`/procurement/bills/${billId}`)
  if (bill.po_id) revalidatePath(`/procurement/orders/${bill.po_id as string}`)
  return { ok: true }
}

/* ═══════════════════════════════════════════════════════════
   SYNC — read-time approval reconciliation (mirrors expenses /
   purchase-orders pattern)
   ═══════════════════════════════════════════════════════════ */

async function syncBillFromApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bill: { id: string; status: BillStatus; approval_request_id: string | null },
): Promise<BillStatus> {
  if (bill.status !== 'submitted' || !bill.approval_request_id) return bill.status

  const { data: ar } = await supabase
    .from('approval_request')
    .select('status')
    .eq('id', bill.approval_request_id)
    .maybeSingle()
  if (!ar) return bill.status

  const arStatus = ar.status as string
  const now = new Date().toISOString()

  if (arStatus === 'approved') {
    await supabase
      .from('vendor_bill')
      .update({ status: 'approved', approved_at: now, updated_at: now })
      .eq('id', bill.id)
    // Apply qty_billed increment now that the bill is approved
    await applyApprovedBillEffects(supabase, bill.id)
    return 'approved'
  } else if (arStatus === 'rejected') {
    await supabase
      .from('vendor_bill')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        cancellation_reason: 'Rejected via approval',
        updated_at: now,
      })
      .eq('id', bill.id)
    return 'cancelled'
  }
  return bill.status
}

/* ═══════════════════════════════════════════════════════════
   LIST + DETAIL
   ═══════════════════════════════════════════════════════════ */

export async function listVendorBills(params?: {
  status?: BillStatus | 'all'
  match_status?: BillMatchStatus | 'all'
  vendor_id?: string
  po_id?: string
  limit?: number
}): Promise<VendorBillSummary[]> {
  const actor = await getActor()
  if (!actor) return []

  let q = actor.supabase
    .from('vendor_bill')
    .select(`
      id, bill_number, vendor_invoice_no, vendor_invoice_date,
      vendor_id, po_id, bill_date, due_date, status, match_status,
      total, amount_paid, amount_outstanding, approval_request_id,
      vendor:vendor_id ( id, name ),
      po:po_id ( id, po_number ),
      lines:vendor_bill_line ( id )
    `)
    .eq('tenant_id', actor.tenantId)
    .order('bill_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params?.match_status && params.match_status !== 'all') q = q.eq('match_status', params.match_status)
  if (params?.vendor_id) q = q.eq('vendor_id', params.vendor_id)
  if (params?.po_id) q = q.eq('po_id', params.po_id)

  const { data, error } = await q
  if (error || !data) return []

  return Promise.all(data.map(async (r) => {
    const synced = await syncBillFromApproval(actor.supabase, {
      id: r.id as string,
      status: r.status as BillStatus,
      approval_request_id: (r.approval_request_id as string | null) ?? null,
    })
    const vendor = pickOne<{ id: string; name: string }>(r.vendor)
    const po = pickOne<{ id: string; po_number: string }>(r.po)
    const lines = (r.lines as Array<{ id: string }> | null) ?? []
    return {
      id: r.id as string,
      bill_number: r.bill_number as string,
      vendor_invoice_no: r.vendor_invoice_no as string,
      vendor_invoice_date: r.vendor_invoice_date as string,
      vendor_id: r.vendor_id as string,
      vendor_name: vendor?.name ?? null,
      po_id: (r.po_id as string | null) ?? null,
      po_number: po?.po_number ?? null,
      bill_date: r.bill_date as string,
      due_date: (r.due_date as string | null) ?? null,
      status: synced,
      match_status: r.match_status as BillMatchStatus,
      total: Number(r.total ?? 0),
      amount_paid: Number(r.amount_paid ?? 0),
      amount_outstanding: Number(r.amount_outstanding ?? 0),
      line_count: lines.length,
      approval_request_id: (r.approval_request_id as string | null) ?? null,
    } satisfies VendorBillSummary
  }))
}

export async function getVendorBill(billId: string): Promise<VendorBillDetail | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r } = await actor.supabase
    .from('vendor_bill')
    .select(`
      id, bill_number, vendor_invoice_no, vendor_invoice_date,
      vendor_id, po_id, grn_id, bill_date, received_at, due_date,
      status, match_status, match_run_at, match_notes,
      subtotal, discount_amount, tax_amount, round_off, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      approval_request_id, submitted_at, approved_at,
      cancelled_at, cancellation_reason, notes, created_at,
      irn_no, irn_validated_at, gstr_2b_status, gstr_2b_period, itc_eligible,
      vendor:vendor_id ( id, name, gstin, msme_status ),
      po:po_id ( id, po_number ),
      grn:grn_id ( id, grn_number ),
      lines:vendor_bill_line (
        id, line_no, po_line_id, product_id, description, hsn_code, unit,
        quantity, rate, discount_pct, taxable_value, is_interstate,
        gst_rate_pct, igst_amount, cgst_amount, sgst_amount, amount_total,
        match_status, match_notes,
        po_line:po_line_id ( description, quantity, rate, hsn_code, gst_rate_pct )
      )
    `)
    .eq('id', billId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (!r) return null

  const synced = await syncBillFromApproval(actor.supabase, {
    id: r.id as string,
    status: r.status as BillStatus,
    approval_request_id: (r.approval_request_id as string | null) ?? null,
  })

  const vendor = pickOne<{ id: string; name: string; gstin: string | null; msme_status: string | null }>(r.vendor)
  const po = pickOne<{ id: string; po_number: string }>(r.po)
  const grn = pickOne<{ id: string; grn_number: string }>(r.grn)

  type RawLine = {
    id: string; line_no: number; po_line_id: string | null; product_id: string | null
    description: string; hsn_code: string | null; unit: string
    quantity: number; rate: number; discount_pct: number; taxable_value: number
    is_interstate: boolean; gst_rate_pct: number
    igst_amount: number; cgst_amount: number; sgst_amount: number; amount_total: number
    match_status: LineMatchStatus; match_notes: string | null
    po_line?: unknown
  }
  const lines: VendorBillLine[] = ((r.lines as RawLine[] | null) ?? [])
    .map((l) => {
      const poLine = pickOne<{ description: string; quantity: number; rate: number; hsn_code: string | null; gst_rate_pct: number }>(l.po_line)
      return {
        id: l.id, line_no: l.line_no, po_line_id: l.po_line_id, product_id: l.product_id,
        description: l.description, hsn_code: l.hsn_code, unit: l.unit,
        quantity: Number(l.quantity), rate: Number(l.rate), discount_pct: Number(l.discount_pct),
        taxable_value: Number(l.taxable_value), is_interstate: Boolean(l.is_interstate),
        gst_rate_pct: Number(l.gst_rate_pct),
        igst_amount: Number(l.igst_amount), cgst_amount: Number(l.cgst_amount),
        sgst_amount: Number(l.sgst_amount), amount_total: Number(l.amount_total),
        match_status: l.match_status, match_notes: l.match_notes,
        po_line_description: poLine?.description ?? null,
        po_line_quantity: poLine?.quantity != null ? Number(poLine.quantity) : null,
        po_line_rate: poLine?.rate != null ? Number(poLine.rate) : null,
        po_line_hsn_code: poLine?.hsn_code ?? null,
        po_line_gst_rate_pct: poLine?.gst_rate_pct != null ? Number(poLine.gst_rate_pct) : null,
      }
    })
    .sort((a, b) => a.line_no - b.line_no)

  return {
    id: r.id as string,
    bill_number: r.bill_number as string,
    vendor_invoice_no: r.vendor_invoice_no as string,
    vendor_invoice_date: r.vendor_invoice_date as string,
    vendor_id: r.vendor_id as string,
    vendor_name: vendor?.name ?? null,
    vendor_gstin: vendor?.gstin ?? null,
    vendor_msme_status: vendor?.msme_status ?? null,
    po_id: (r.po_id as string | null) ?? null,
    po_number: po?.po_number ?? null,
    grn_id: (r.grn_id as string | null) ?? null,
    grn_number: grn?.grn_number ?? null,
    bill_date: r.bill_date as string,
    received_at: (r.received_at as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    status: synced,
    match_status: r.match_status as BillMatchStatus,
    match_run_at: (r.match_run_at as string | null) ?? null,
    match_notes: (r.match_notes as string | null) ?? null,
    subtotal: Number(r.subtotal ?? 0),
    discount_amount: Number(r.discount_amount ?? 0),
    tax_amount: Number(r.tax_amount ?? 0),
    round_off: Number(r.round_off ?? 0),
    total: Number(r.total ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    amount_outstanding: Number(r.amount_outstanding ?? 0),
    vendor_address_snapshot: (r.vendor_address_snapshot as string | null) ?? null,
    bill_to_snapshot: (r.bill_to_snapshot as string | null) ?? null,
    approval_request_id: (r.approval_request_id as string | null) ?? null,
    submitted_at: (r.submitted_at as string | null) ?? null,
    approved_at: (r.approved_at as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    cancellation_reason: (r.cancellation_reason as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    irn_no: (r.irn_no as string | null) ?? null,
    irn_validated_at: (r.irn_validated_at as string | null) ?? null,
    gstr_2b_status: (r.gstr_2b_status as VendorBillDetail['gstr_2b_status']) ?? null,
    gstr_2b_period: (r.gstr_2b_period as string | null) ?? null,
    itc_eligible: (r.itc_eligible as boolean | null) ?? null,
    lines,
  }
}

/* ─── Lookup: PO snapshot for new-bill form ─────────────────── */

export type PoForBilling = {
  id: string
  po_number: string
  vendor_id: string
  vendor_name: string
  status: string
  lines: Array<{
    id: string
    line_no: number
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    qty_received: number
    qty_billed: number
    qty_billable: number
    rate: number
    gst_rate_pct: number
    product_id: string | null
  }>
}

export async function getPoForBilling(poId: string): Promise<PoForBilling | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r } = await actor.supabase
    .from('purchase_order')
    .select(`
      id, po_number, vendor_id, status,
      vendor:vendor_id ( id, name ),
      lines:purchase_order_line (
        id, line_no, description, hsn_code, unit,
        quantity, qty_received, qty_billed, rate, gst_rate_pct, product_id
      )
    `)
    .eq('id', poId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!r) return null

  const vendor = pickOne<{ id: string; name: string }>(r.vendor)
  type RawLine = {
    id: string; line_no: number; description: string; hsn_code: string | null
    unit: string; quantity: number; qty_received: number; qty_billed: number
    rate: number; gst_rate_pct: number; product_id: string | null
  }
  const lines = ((r.lines as RawLine[] | null) ?? [])
    .map((l) => ({
      id: l.id,
      line_no: l.line_no,
      description: l.description,
      hsn_code: l.hsn_code,
      unit: l.unit,
      quantity: Number(l.quantity),
      qty_received: Number(l.qty_received || 0),
      qty_billed: Number(l.qty_billed || 0),
      qty_billable: Math.max(0, r3(Number(l.qty_received || 0) - Number(l.qty_billed || 0))),
      rate: Number(l.rate),
      gst_rate_pct: Number(l.gst_rate_pct),
      product_id: l.product_id,
    }))
    .sort((a, b) => a.line_no - b.line_no)

  return {
    id: r.id as string,
    po_number: r.po_number as string,
    vendor_id: r.vendor_id as string,
    vendor_name: vendor?.name ?? '—',
    status: r.status as string,
    lines,
  }
}

export async function listPosForBilling(): Promise<Array<{
  id: string; po_number: string; vendor_name: string; status: string; billable_qty_total: number
}>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('purchase_order')
    .select(`
      id, po_number, status,
      vendor:vendor_id ( name ),
      lines:purchase_order_line ( quantity, qty_received, qty_billed )
    `)
    .eq('tenant_id', actor.tenantId)
    .in('status', ['partly_received', 'received'])
    .order('po_date', { ascending: false })
    .limit(200)
  if (!data) return []
  return data
    .map((r) => {
      const vendor = pickOne<{ name: string }>(r.vendor)
      const lines = (r.lines as Array<{ quantity: number; qty_received: number; qty_billed: number }> | null) ?? []
      const billable = lines.reduce((s, l) => s + Math.max(0, Number(l.qty_received || 0) - Number(l.qty_billed || 0)), 0)
      return {
        id: r.id as string,
        po_number: r.po_number as string,
        vendor_name: vendor?.name ?? '—',
        status: r.status as string,
        billable_qty_total: r3(billable),
      }
    })
    .filter((p) => p.billable_qty_total > 0)
}
