'use server'

/* ─────────────────────────────────────────────────────────────
   Purchase Order server actions — Blueprint DEL-016 (Phase 1α).

   Indian GST split happens here, at PO line write time:
     - vendor.gst_state_code (derived from GSTIN[0:2]) vs the
       warehouse state code (looked up from STATE_CODES) decides
       is_interstate. Interstate → IGST. Intra-state → CGST + SGST
       (50/50, with the last paise allocated to SGST to preserve
       round-trip).
     - When either side is missing/unknown the action defaults to
       is_interstate=true. IGST is universally correct; the only
       downside is a sub-optimal ITC routing the buyer can fix
       later.

   Approval workflow consumes the PLAT-014 engine. submit() calls
   requestApproval({ entityType: 'purchase_order', amount: total })
   which picks the matching policy (₹50k - ₹5L manager / ₹5L - ₹25L
   manager+admin / ₹25L+ admin — seeded in migration 0055). Sub-
   ₹50k POs auto-approve.

   syncPurchaseOrderFromApproval mirrors syncExpenseFromApproval —
   cheap denormalisation at read time so the PO list reflects the
   latest approval state without an Inngest write-back.
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/observability/capture'
import { requestApproval } from './approvals'

type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'partly_received'
  | 'received'
  | 'cancelled'
  | 'closed'

export type POLineInput = {
  product_id?: string | null
  description: string
  hsn_code?: string | null
  unit?: string
  quantity: number
  rate: number
  discount_pct?: number
  gst_rate_pct: number
}

export type POSummary = {
  id: string
  po_number: string
  vendor_id: string
  vendor_name: string
  project_id: string | null
  project_name: string | null
  warehouse_id: string
  warehouse_name: string
  po_date: string
  expected_delivery_at: string | null
  status: POStatus
  total: number
  payment_terms_days: number
  line_count: number
  qty_ordered_total: number
  qty_received_total: number
  receive_pct: number
  approval_request_id: string | null
}

export type POLine = {
  id: string
  line_no: number
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
  qty_received: number
  qty_rejected: number
}

export type PODetail = {
  id: string
  po_number: string
  vendor_id: string
  vendor_name: string
  vendor_gstin: string | null
  vendor_phone: string | null
  vendor_msme_status: string | null
  project_id: string | null
  project_name: string | null
  warehouse_id: string
  warehouse_name: string
  warehouse_state: string | null
  po_date: string
  expected_delivery_at: string | null
  status: POStatus
  vendor_address_snapshot: string | null
  bill_to_snapshot: string | null
  ship_to_snapshot: string | null
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  payment_terms_days: number
  delivery_terms: string | null
  warranty_terms: string | null
  liquidated_damages_terms: string | null
  retention_pct: number | null
  other_terms: string | null
  notes: string | null
  approval_request_id: string | null
  submitted_at: string | null
  approved_at: string | null
  sent_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  lines: POLine[]
}

/* ─── Indian GST state codes (first 2 digits of GSTIN) ─────── */

const STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh':  '02',
  'punjab':            '03',
  'chandigarh':        '04',
  'uttarakhand':       '05',
  'haryana':           '06',
  'delhi':             '07',
  'rajasthan':         '08',
  'uttar pradesh':     '09',
  'bihar':             '10',
  'sikkim':            '11',
  'arunachal pradesh': '12',
  'nagaland':          '13',
  'manipur':           '14',
  'mizoram':           '15',
  'tripura':           '16',
  'meghalaya':         '17',
  'assam':             '18',
  'west bengal':       '19',
  'jharkhand':         '20',
  'odisha':            '21',
  'chhattisgarh':      '22',
  'madhya pradesh':    '23',
  'gujarat':           '24',
  'daman and diu':     '25',
  'dadra and nagar haveli': '26',
  'maharashtra':       '27',
  'karnataka':         '29',
  'goa':               '30',
  'lakshadweep':       '31',
  'kerala':            '32',
  'tamil nadu':        '33',
  'puducherry':        '34',
  'andaman and nicobar islands': '35',
  'telangana':         '36',
  'andhra pradesh':    '37',
  'ladakh':            '38',
}

function stateCodeFor(stateName: string | null | undefined): string | null {
  if (!stateName) return null
  return STATE_CODES[stateName.trim().toLowerCase()] ?? null
}

function isInterstate(vendorGstStateCode: string | null, warehouseState: string | null): boolean {
  const whCode = stateCodeFor(warehouseState)
  if (!vendorGstStateCode || !whCode) return true
  return vendorGstStateCode !== whCode
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Supabase's PostgREST returns nested relations as arrays even when the
 * FK is single-row. Normalise so callers see {…} | null.
 */
function pickOne<T>(v: unknown): T | null {
  if (v == null) return null
  return (Array.isArray(v) ? (v[0] as T | undefined) ?? null : (v as T))
}

/* ─── Actor context ─────────────────────────────────────────── */

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

function isAdminish(role: string) {
  return role === 'admin' || role === 'manager'
}

/* ─── Create ─────────────────────────────────────────────────── */

export async function createPurchaseOrder(params: {
  vendor_id: string
  ship_to_warehouse_id: string
  project_id?: string | null
  po_date?: string
  expected_delivery_at?: string | null
  payment_terms_days?: number
  delivery_terms?: string
  warranty_terms?: string
  liquidated_damages_terms?: string
  retention_pct?: number | null
  other_terms?: string
  notes?: string
  lines: POLineInput[]
  /** When supplied, on successful PO create the PR's status flips to po_raised + linked_po_id set. */
  from_pr_id?: string | null
  /** When supplied, RFQ.status flips to po_raised + linked_po_id set; PO row stamps source_rfq_id. */
  from_rfq_id?: string | null
}): Promise<{ ok: true; id: string; po_number: string } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Only admins or managers can create purchase orders' }
  if (!params.lines || params.lines.length === 0) return { ok: false, error: 'At least one line item is required' }

  // 1) Fetch vendor + warehouse + tenant.settings.company for snapshots.
  const { data: vendor, error: vErr } = await actor.supabase
    .from('vendor')
    .select('id, name, gstin, gst_state_code, address, phone, email, payment_terms_days')
    .eq('id', params.vendor_id)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (vErr || !vendor) return { ok: false, error: 'Vendor not found' }

  const { data: warehouse, error: whErr } = await actor.supabase
    .from('warehouse')
    .select('id, name, address, city, state')
    .eq('id', params.ship_to_warehouse_id)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (whErr || !warehouse) return { ok: false, error: 'Warehouse not found' }

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

  const shipTo = [
    warehouse.name as string,
    warehouse.address as string | null,
    [warehouse.city as string | null, warehouse.state as string | null].filter(Boolean).join(', ') || null,
  ].filter(Boolean).join(' · ')

  const vendorAddr = [
    vendor.name as string,
    vendor.address as string | null,
    vendor.gstin ? `GSTIN ${vendor.gstin as string}` : null,
  ].filter(Boolean).join(' · ')

  // 2) Compute line GST treatment.
  const interstate = isInterstate(
    vendor.gst_state_code as string | null,
    warehouse.state as string | null,
  )

  let subtotal = 0
  let discountTotal = 0
  let taxTotal = 0
  const linesPayload: Array<Record<string, unknown>> = []

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i]
    const qty = Number(line.quantity)
    const rate = Number(line.rate)
    const discount = Number(line.discount_pct ?? 0)
    const gstRate = Number(line.gst_rate_pct ?? 0)

    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: `Line ${i + 1}: quantity must be > 0` }
    }
    if (!Number.isFinite(rate) || rate < 0) {
      return { ok: false, error: `Line ${i + 1}: rate must be ≥ 0` }
    }
    if (discount < 0 || discount > 100) {
      return { ok: false, error: `Line ${i + 1}: discount must be between 0 and 100` }
    }

    const lineGross = qty * rate
    const lineDiscount = r2(lineGross * (discount / 100))
    const taxableValue = r2(lineGross - lineDiscount)
    const tax = r2(taxableValue * (gstRate / 100))
    const igst = interstate ? tax : 0
    const cgst = interstate ? 0 : r2(tax / 2)
    // Allocate last paise to SGST so cgst + sgst === tax even after rounding.
    const sgst = interstate ? 0 : r2(tax - cgst)
    const amountTotal = r2(taxableValue + tax)

    subtotal += taxableValue
    discountTotal += lineDiscount
    taxTotal += tax

    linesPayload.push({
      tenant_id: actor.tenantId,
      line_no: i + 1,
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
    })
  }

  const total = r2(subtotal + taxTotal)

  // 3) Insert PO header.
  const { data: po, error: poErr } = await actor.supabase
    .from('purchase_order')
    .insert({
      tenant_id: actor.tenantId,
      vendor_id: params.vendor_id,
      project_id: params.project_id ?? null,
      ship_to_warehouse_id: params.ship_to_warehouse_id,
      po_date: params.po_date ?? new Date().toISOString().slice(0, 10),
      expected_delivery_at: params.expected_delivery_at ?? null,
      currency: 'INR',
      status: 'draft',
      vendor_address_snapshot: vendorAddr,
      bill_to_snapshot: billTo,
      ship_to_snapshot: shipTo,
      subtotal: r2(subtotal),
      discount_amount: r2(discountTotal),
      tax_amount: r2(taxTotal),
      total,
      payment_terms_days: params.payment_terms_days ?? (vendor.payment_terms_days as number | null) ?? 30,
      delivery_terms: params.delivery_terms?.trim() || null,
      warranty_terms: params.warranty_terms?.trim() || null,
      liquidated_damages_terms: params.liquidated_damages_terms?.trim() || null,
      retention_pct: params.retention_pct ?? null,
      other_terms: params.other_terms?.trim() || null,
      notes: params.notes?.trim() || null,
      source_pr_id: params.from_pr_id ?? null,
      source_rfq_id: params.from_rfq_id ?? null,
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id, po_number')
    .single()

  if (poErr || !po) {
    captureError(poErr ?? new Error('PO insert returned no row'), {
      action_name: 'createPurchaseOrder',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    return { ok: false, error: poErr?.message ?? 'Could not create purchase order' }
  }

  // 4) Insert lines.
  const linesWithPoId = linesPayload.map((l) => ({ ...l, po_id: po.id }))
  const { error: lineErr } = await actor.supabase
    .from('purchase_order_line')
    .insert(linesWithPoId)

  if (lineErr) {
    // Roll back the PO via soft-delete so the orphan doesn't litter the list.
    await actor.supabase
      .from('purchase_order')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', po.id)
    captureError(lineErr, {
      action_name: 'createPurchaseOrder.lines',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_id: po.id as string,
    })
    return { ok: false, error: `Failed to create PO lines: ${lineErr.message}` }
  }

  // 5) Link back to PR / RFQ when this PO was raised from one.
  //    Done after PO insert so PR/RFQ updates can't orphan us on insert failure.
  if (params.from_pr_id) {
    await actor.supabase
      .from('purchase_requisition')
      .update({
        status: 'po_raised',
        linked_po_id: po.id,
        updated_at: new Date().toISOString(),
        updated_by: actor.userId,
      })
      .eq('id', params.from_pr_id)
      .eq('tenant_id', actor.tenantId)
    revalidatePath(`/procurement/requisitions/${params.from_pr_id}`)
    revalidatePath('/procurement/requisitions')
  }

  if (params.from_rfq_id) {
    await actor.supabase
      .from('request_for_quotation')
      .update({
        status: 'po_raised',
        linked_po_id: po.id,
        updated_at: new Date().toISOString(),
        updated_by: actor.userId,
      })
      .eq('id', params.from_rfq_id)
      .eq('tenant_id', actor.tenantId)
    revalidatePath(`/procurement/rfqs/${params.from_rfq_id}`)
    revalidatePath('/procurement/rfqs')
  }

  revalidatePath('/procurement')
  revalidatePath('/procurement/orders')
  return { ok: true, id: po.id as string, po_number: po.po_number as string }
}

/* ─── PR lookup for ?from_pr= prefill ──────────────────────── */

export type PrForPoPrefill = {
  pr_id: string
  pr_number: string
  project_id: string | null
  cost_center: string | null
  required_by_date: string | null
  preferred_vendor_id: string | null
  lines: Array<{
    product_id: string | null
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    estimated_rate: number
  }>
}

export async function getPrForPoPrefill(prId: string): Promise<PrForPoPrefill | null> {
  const actor = await getActor()
  if (!actor) return null
  const { data } = await actor.supabase
    .from('purchase_requisition')
    .select(`
      id, pr_number, project_id, cost_center, required_by_date, status,
      lines:purchase_requisition_line ( product_id, description, hsn_code, unit, quantity, estimated_rate, preferred_vendor_id, line_no )
    `)
    .eq('id', prId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!data) return null
  if (data.status !== 'approved') return null  // only approved PRs can raise PO

  type RawLine = { product_id: string | null; description: string; hsn_code: string | null; unit: string; quantity: number; estimated_rate: number; preferred_vendor_id: string | null; line_no: number }
  const lines = ((data.lines as RawLine[] | null) ?? [])
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      product_id: l.product_id,
      description: l.description,
      hsn_code: l.hsn_code,
      unit: l.unit,
      quantity: Number(l.quantity),
      estimated_rate: Number(l.estimated_rate),
    }))

  // Most-frequent preferred vendor across lines (simple mode pick)
  const vendorVotes = new Map<string, number>()
  for (const l of (data.lines as Array<{ preferred_vendor_id: string | null }> | null) ?? []) {
    if (l.preferred_vendor_id) vendorVotes.set(l.preferred_vendor_id, (vendorVotes.get(l.preferred_vendor_id) ?? 0) + 1)
  }
  const preferred = Array.from(vendorVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    pr_id: data.id as string,
    pr_number: data.pr_number as string,
    project_id: (data.project_id as string | null) ?? null,
    cost_center: (data.cost_center as string | null) ?? null,
    required_by_date: (data.required_by_date as string | null) ?? null,
    preferred_vendor_id: preferred,
    lines,
  }
}

/* ─── RFQ lookup for ?from_rfq=&vendor= prefill ─────────────── */

export type RfqForPoPrefill = {
  rfq_id: string
  rfq_number: string
  project_id: string | null
  cost_center: string | null
  required_by_date: string | null
  vendor_id: string
  vendor_name: string
  lines: Array<{
    product_id: string | null
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    rate: number
    gst_rate_pct: number
    discount_pct: number
  }>
}

export async function getRfqForPoPrefill(rfqId: string, vendorId: string): Promise<RfqForPoPrefill | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: rfq } = await actor.supabase
    .from('request_for_quotation')
    .select(`
      id, rfq_number, project_id, cost_center, required_by_date, status,
      lines:request_for_quotation_line ( id, line_no, product_id, description, hsn_code, unit, quantity )
    `)
    .eq('id', rfqId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!rfq) return null
  if (!['cs_finalised', 'quotes_collected'].includes(rfq.status as string)) return null

  const { data: vendor } = await actor.supabase
    .from('vendor')
    .select('id, name')
    .eq('id', vendorId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!vendor) return null

  const { data: selectedResponses } = await actor.supabase
    .from('request_for_quotation_response')
    .select('rfq_line_id, rate, discount_pct, gst_rate_pct')
    .eq('rfq_id', rfqId)
    .eq('vendor_id', vendorId)
    .eq('is_selected', true)

  type RawLine = { id: string; line_no: number; product_id: string | null; description: string; hsn_code: string | null; unit: string; quantity: number }
  type RawResp = { rfq_line_id: string; rate: number; discount_pct: number; gst_rate_pct: number }
  const lineMap = new Map(((rfq.lines as RawLine[] | null) ?? []).map((l) => [l.id, l]))
  const responses = (selectedResponses as RawResp[] | null) ?? []

  const lines = responses
    .map((r) => {
      const line = lineMap.get(r.rfq_line_id)
      if (!line) return null
      return {
        product_id: line.product_id,
        description: line.description,
        hsn_code: line.hsn_code,
        unit: line.unit,
        quantity: Number(line.quantity),
        rate: Number(r.rate),
        gst_rate_pct: Number(r.gst_rate_pct),
        discount_pct: Number(r.discount_pct),
      }
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)

  return {
    rfq_id: rfq.id as string,
    rfq_number: rfq.rfq_number as string,
    project_id: (rfq.project_id as string | null) ?? null,
    cost_center: (rfq.cost_center as string | null) ?? null,
    required_by_date: (rfq.required_by_date as string | null) ?? null,
    vendor_id: vendorId,
    vendor_name: vendor.name as string,
    lines,
  }
}

/* ─── Submit for approval ────────────────────────────────────── */

export async function submitPurchaseOrder(
  poId: string,
): Promise<
  | { ok: true; status: POStatus; approvalRequestId: string | null }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  const { data: po } = await actor.supabase
    .from('purchase_order')
    .select('id, status, total, created_by')
    .eq('id', poId)
    .maybeSingle()
  if (!po) return { ok: false, error: 'Purchase order not found' }
  if (po.status !== 'draft') return { ok: false, error: `PO already ${po.status as string}` }

  const ar = await requestApproval({
    entityType: 'purchase_order',
    entityId: po.id as string,
    amount: Number(po.total),
    subjectUserId: (po.created_by as string | null) ?? actor.userId,
    autoApproveIfNoPolicy: true,
  })
  if (!ar.ok) return { ok: false, error: ar.error }

  const now = new Date().toISOString()
  const nextStatus: POStatus = ar.autoApproved ? 'approved' : 'pending_approval'

  const { error } = await actor.supabase
    .from('purchase_order')
    .update({
      status: nextStatus,
      submitted_at: now,
      approved_at: ar.autoApproved ? now : null,
      approved_by: ar.autoApproved ? actor.userId : null,
      approval_request_id: ar.autoApproved ? null : ar.requestId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', poId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement')
  revalidatePath('/procurement/orders')
  revalidatePath(`/procurement/orders/${poId}`)
  return {
    ok: true,
    status: nextStatus,
    approvalRequestId: ar.autoApproved ? null : ar.requestId,
  }
}

/* ─── Send to vendor (status flip — no PDF/email yet) ───────── */

export async function sendPurchaseOrder(
  poId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  const { data: po } = await actor.supabase
    .from('purchase_order')
    .select('id, status')
    .eq('id', poId)
    .maybeSingle()
  if (!po) return { ok: false, error: 'Purchase order not found' }
  if (po.status !== 'approved') {
    return { ok: false, error: `Can only send approved POs (current: ${po.status as string})` }
  }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('purchase_order')
    .update({
      status: 'sent',
      sent_at: now,
      sent_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', poId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement')
  revalidatePath('/procurement/orders')
  revalidatePath(`/procurement/orders/${poId}`)
  return { ok: true }
}

/* ─── Cancel ─────────────────────────────────────────────────── */

export async function cancelPurchaseOrder(
  poId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!reason.trim()) return { ok: false, error: 'Cancellation reason is required' }

  const { data: po } = await actor.supabase
    .from('purchase_order')
    .select('id, status')
    .eq('id', poId)
    .maybeSingle()
  if (!po) return { ok: false, error: 'Purchase order not found' }
  if (['received', 'closed', 'cancelled'].includes(po.status as string)) {
    return { ok: false, error: `Cannot cancel ${po.status as string} PO` }
  }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('purchase_order')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: actor.userId,
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', poId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement')
  revalidatePath('/procurement/orders')
  revalidatePath(`/procurement/orders/${poId}`)
  return { ok: true }
}

/* ─── Sync approval state (cheap denormalisation at read time) ── */

async function syncPOFromApproval(
  supabase: SupabaseClient,
  po: { id: string; status: POStatus; approval_request_id: string | null },
): Promise<POStatus> {
  if (po.status !== 'pending_approval' || !po.approval_request_id) return po.status

  const { data: ar } = await supabase
    .from('approval_request')
    .select('status')
    .eq('id', po.approval_request_id)
    .maybeSingle()
  if (!ar) return po.status

  const arStatus = ar.status as string
  let next: POStatus = po.status
  const patch: Record<string, unknown> = {}
  const now = new Date().toISOString()

  if (arStatus === 'approved') {
    next = 'approved'
    patch.status = next
    patch.approved_at = now
    patch.updated_at = now
  } else if (arStatus === 'rejected') {
    next = 'cancelled'
    patch.status = next
    patch.cancelled_at = now
    patch.cancellation_reason = 'Rejected via approval'
    patch.updated_at = now
  }

  if (next !== po.status) {
    await supabase.from('purchase_order').update(patch).eq('id', po.id)
  }
  return next
}

/* ─── List ───────────────────────────────────────────────────── */

export async function listPurchaseOrders(params?: {
  status?: POStatus | 'all'
  vendor_id?: string
  limit?: number
}): Promise<POSummary[]> {
  const actor = await getActor()
  if (!actor) return []

  let q = actor.supabase
    .from('purchase_order')
    .select(`
      id, po_number, vendor_id, project_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status, total, payment_terms_days,
      approval_request_id,
      vendor:vendor_id ( id, name ),
      project:project_id ( id, name ),
      warehouse:ship_to_warehouse_id ( id, name ),
      lines:purchase_order_line ( id, quantity, qty_received )
    `)
    .eq('tenant_id', actor.tenantId)
    .order('po_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params?.vendor_id) q = q.eq('vendor_id', params.vendor_id)

  const { data, error } = await q
  if (error || !data) return []

  // Sync any pending_approval rows so the list reflects current state.
  const rows = await Promise.all(
    data.map(async (r) => {
      const synced = await syncPOFromApproval(actor.supabase, {
        id: r.id as string,
        status: r.status as POStatus,
        approval_request_id: (r.approval_request_id as string | null) ?? null,
      })

      const lineRows = (r.lines as Array<{ quantity: number; qty_received: number }> | null) ?? []
      const qty_ordered_total = lineRows.reduce((s, l) => s + Number(l.quantity || 0), 0)
      const qty_received_total = lineRows.reduce((s, l) => s + Number(l.qty_received || 0), 0)
      const receive_pct = qty_ordered_total > 0
        ? Math.min(100, Math.round((qty_received_total / qty_ordered_total) * 100))
        : 0

      const vendor = pickOne<{ id: string; name: string }>(r.vendor)
      const project = pickOne<{ id: string; name: string }>(r.project)
      const warehouse = pickOne<{ id: string; name: string }>(r.warehouse)

      return {
        id: r.id as string,
        po_number: r.po_number as string,
        vendor_id: r.vendor_id as string,
        vendor_name: vendor?.name ?? 'Unknown vendor',
        project_id: (r.project_id as string | null) ?? null,
        project_name: project?.name ?? null,
        warehouse_id: r.ship_to_warehouse_id as string,
        warehouse_name: warehouse?.name ?? 'Unknown warehouse',
        po_date: r.po_date as string,
        expected_delivery_at: (r.expected_delivery_at as string | null) ?? null,
        status: synced,
        total: Number(r.total ?? 0),
        payment_terms_days: r.payment_terms_days as number,
        line_count: lineRows.length,
        qty_ordered_total,
        qty_received_total,
        receive_pct,
        approval_request_id: (r.approval_request_id as string | null) ?? null,
      } satisfies POSummary
    }),
  )

  return rows
}

/* ─── Get one (detail) ───────────────────────────────────────── */

export async function getPurchaseOrder(poId: string): Promise<PODetail | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r, error } = await actor.supabase
    .from('purchase_order')
    .select(`
      id, po_number, vendor_id, project_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, warranty_terms,
      liquidated_damages_terms, retention_pct, other_terms, notes,
      approval_request_id, submitted_at, approved_at, sent_at,
      cancelled_at, cancellation_reason, created_at,
      vendor:vendor_id ( id, name, gstin, phone, msme_status ),
      project:project_id ( id, name ),
      warehouse:ship_to_warehouse_id ( id, name, state ),
      lines:purchase_order_line (
        id, line_no, product_id, description, hsn_code, unit,
        quantity, rate, discount_pct, taxable_value,
        is_interstate, gst_rate_pct,
        igst_amount, cgst_amount, sgst_amount, amount_total,
        qty_received, qty_rejected
      )
    `)
    .eq('id', poId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (error || !r) return null

  const synced = await syncPOFromApproval(actor.supabase, {
    id: r.id as string,
    status: r.status as POStatus,
    approval_request_id: (r.approval_request_id as string | null) ?? null,
  })

  const vendor = pickOne<{ id: string; name: string; gstin: string | null; phone: string | null; msme_status: string | null }>(r.vendor)
  const project = pickOne<{ id: string; name: string }>(r.project)
  const warehouse = pickOne<{ id: string; name: string; state: string | null }>(r.warehouse)
  const lines = ((r.lines as POLine[] | null) ?? [])
    .map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
      discount_pct: Number(l.discount_pct),
      taxable_value: Number(l.taxable_value),
      gst_rate_pct: Number(l.gst_rate_pct),
      igst_amount: Number(l.igst_amount),
      cgst_amount: Number(l.cgst_amount),
      sgst_amount: Number(l.sgst_amount),
      amount_total: Number(l.amount_total),
      qty_received: Number(l.qty_received),
      qty_rejected: Number(l.qty_rejected),
    }))
    .sort((a, b) => a.line_no - b.line_no)

  return {
    id: r.id as string,
    po_number: r.po_number as string,
    vendor_id: r.vendor_id as string,
    vendor_name: vendor?.name ?? 'Unknown vendor',
    vendor_gstin: vendor?.gstin ?? null,
    vendor_phone: vendor?.phone ?? null,
    vendor_msme_status: vendor?.msme_status ?? null,
    project_id: (r.project_id as string | null) ?? null,
    project_name: project?.name ?? null,
    warehouse_id: r.ship_to_warehouse_id as string,
    warehouse_name: warehouse?.name ?? 'Unknown warehouse',
    warehouse_state: warehouse?.state ?? null,
    po_date: r.po_date as string,
    expected_delivery_at: (r.expected_delivery_at as string | null) ?? null,
    status: synced,
    vendor_address_snapshot: (r.vendor_address_snapshot as string | null) ?? null,
    bill_to_snapshot: (r.bill_to_snapshot as string | null) ?? null,
    ship_to_snapshot: (r.ship_to_snapshot as string | null) ?? null,
    subtotal: Number(r.subtotal ?? 0),
    discount_amount: Number(r.discount_amount ?? 0),
    tax_amount: Number(r.tax_amount ?? 0),
    total: Number(r.total ?? 0),
    payment_terms_days: r.payment_terms_days as number,
    delivery_terms: (r.delivery_terms as string | null) ?? null,
    warranty_terms: (r.warranty_terms as string | null) ?? null,
    liquidated_damages_terms: (r.liquidated_damages_terms as string | null) ?? null,
    retention_pct: (r.retention_pct as number | null) ?? null,
    other_terms: (r.other_terms as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    approval_request_id: (r.approval_request_id as string | null) ?? null,
    submitted_at: (r.submitted_at as string | null) ?? null,
    approved_at: (r.approved_at as string | null) ?? null,
    sent_at: (r.sent_at as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    cancellation_reason: (r.cancellation_reason as string | null) ?? null,
    created_at: r.created_at as string,
    lines,
  }
}

/* ─── Lookups for the create form ──────────────────────────── */

export async function listVendorsForPicker(): Promise<Array<{
  id: string
  name: string
  code: string
  gstin: string | null
  payment_terms_days: number | null
  msme_status: string | null
}>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('vendor')
    .select('id, name, code, gstin, payment_terms_days, msme_status, is_active')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(500)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.code as string,
    gstin: (r.gstin as string | null) ?? null,
    payment_terms_days: (r.payment_terms_days as number | null) ?? null,
    msme_status: (r.msme_status as string | null) ?? null,
  }))
}

export async function listWarehousesForPicker(): Promise<Array<{
  id: string
  name: string
  code: string
  state: string | null
}>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('warehouse')
    .select('id, name, code, state, is_active')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(50)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.code as string,
    state: (r.state as string | null) ?? null,
  }))
}

export async function listProductsForPicker(): Promise<Array<{
  id: string
  sku_code: string
  name: string
  unit: string
}>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('product')
    .select('id, sku_code, name, unit, is_active')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(500)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    sku_code: r.sku_code as string,
    name: r.name as string,
    unit: r.unit as string,
  }))
}

export async function listProjectsForPicker(): Promise<Array<{
  id: string
  name: string
}>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('project')
    .select('id, name')
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }))
}
