'use server'

/* ─────────────────────────────────────────────────────────────
   Request for Quotation server actions — Phase 4β (DEL-020).

   Multi-vendor evaluation step between PR and PO:
     PR (approved) → RFQ to N vendors → quotes received →
     Comparative Statement → PO with picked vendor

   State machine:
     draft → sent → quotes_collected → cs_finalised → po_raised
     draft → cancelled
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'

export type RfqStatus = 'draft' | 'sent' | 'quotes_collected' | 'cs_finalised' | 'po_raised' | 'cancelled'

export type RfqLineInput = {
  product_id?: string | null
  description: string
  hsn_code?: string | null
  unit?: string
  quantity: number
  specifications?: string
  required_by_date?: string | null
  source_pr_line_id?: string | null
}

export type RfqVendorInput = {
  vendor_id: string
}

export type RfqSummary = {
  id: string
  rfq_number: string
  project_id: string | null
  project_name: string | null
  rfq_date: string
  response_deadline: string | null
  required_by_date: string | null
  status: RfqStatus
  line_count: number
  vendor_count: number
  response_count: number   // total responses collected so far
  linked_po_id: string | null
  linked_po_number: string | null
  source_pr_count: number
}

export type RfqLineDetail = {
  id: string
  line_no: number
  product_id: string | null
  product_sku: string | null
  product_name: string | null
  description: string
  hsn_code: string | null
  unit: string
  quantity: number
  specifications: string | null
  required_by_date: string | null
  source_pr_line_id: string | null
}

export type RfqVendorDetail = {
  id: string
  vendor_id: string
  vendor_name: string
  vendor_code: string
  invited_at: string
  responded_at: string | null
  vendor_quote_no: string | null
  vendor_quote_date: string | null
  vendor_quote_validity: string | null
  payment_terms_days: number | null
  delivery_terms: string | null
  notes: string | null
  response_count: number  // # of lines this vendor responded to
}

export type RfqResponseRow = {
  id: string
  rfq_line_id: string
  vendor_id: string
  rate: number
  discount_pct: number
  gst_rate_pct: number
  delivery_days: number | null
  notes: string | null
  taxable_value: number | null
  amount_total: number | null
  is_l1: boolean | null
  is_selected: boolean
  selection_reason: string | null
}

export type RfqDetail = {
  id: string
  rfq_number: string
  project_id: string | null
  project_name: string | null
  cost_center: string | null
  source_pr_ids: string[]
  source_pr_numbers: string[]
  rfq_date: string
  response_deadline: string | null
  required_by_date: string | null
  notes: string | null
  status: RfqStatus
  linked_po_id: string | null
  linked_po_number: string | null
  cs_winner_decision: string | null
  sent_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  lines: RfqLineDetail[]
  vendors: RfqVendorDetail[]
  responses: RfqResponseRow[]
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

/* ═══ CREATE ═══════════════════════════════════════════════ */

export async function createRfq(params: {
  project_id?: string | null
  cost_center?: string
  source_pr_ids?: string[]
  rfq_date?: string
  response_deadline?: string | null
  required_by_date?: string | null
  notes?: string
  lines: RfqLineInput[]
  vendors: RfqVendorInput[]
  send_immediately?: boolean
}): Promise<{ ok: true; id: string; rfq_number: string; status: RfqStatus } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Only admins or managers can create RFQs' }
  if (!params.lines || params.lines.length === 0) return { ok: false, error: 'At least one line is required' }
  if (!params.vendors || params.vendors.length < 2) return { ok: false, error: 'Invite at least 2 vendors for a meaningful comparison' }

  const { data: rfq, error: rfqErr } = await actor.supabase
    .from('request_for_quotation')
    .insert({
      tenant_id: actor.tenantId,
      project_id: params.project_id ?? null,
      cost_center: params.cost_center?.trim() || null,
      source_pr_ids: params.source_pr_ids ?? [],
      rfq_date: params.rfq_date ?? new Date().toISOString().slice(0, 10),
      response_deadline: params.response_deadline ?? null,
      required_by_date: params.required_by_date ?? null,
      notes: params.notes?.trim() || null,
      status: 'draft',
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id, rfq_number')
    .single()

  if (rfqErr || !rfq) {
    captureError(rfqErr ?? new Error('RFQ insert returned no row'), {
      action_name: 'createRfq', tenant_id: actor.tenantId, user_id: actor.userId,
    })
    return { ok: false, error: rfqErr?.message ?? 'Could not create RFQ' }
  }

  // Lines
  const linePayload = params.lines.map((l, i) => ({
    tenant_id: actor.tenantId,
    rfq_id: rfq.id,
    line_no: i + 1,
    source_pr_line_id: l.source_pr_line_id ?? null,
    product_id: l.product_id ?? null,
    description: l.description.trim(),
    hsn_code: l.hsn_code?.trim() || null,
    unit: l.unit?.trim() || 'nos',
    quantity: Number(l.quantity),
    specifications: l.specifications?.trim() || null,
    required_by_date: l.required_by_date ?? null,
  }))
  const { error: lineErr } = await actor.supabase
    .from('request_for_quotation_line')
    .insert(linePayload)
  if (lineErr) {
    await actor.supabase.from('request_for_quotation').update({ deleted_at: new Date().toISOString() }).eq('id', rfq.id)
    return { ok: false, error: `Failed to create RFQ lines: ${lineErr.message}` }
  }

  // Invited vendors
  const vendorPayload = params.vendors.map((v) => ({
    tenant_id: actor.tenantId,
    rfq_id: rfq.id,
    vendor_id: v.vendor_id,
  }))
  const { error: vErr } = await actor.supabase
    .from('request_for_quotation_vendor')
    .insert(vendorPayload)
  if (vErr) {
    await actor.supabase.from('request_for_quotation').update({ deleted_at: new Date().toISOString() }).eq('id', rfq.id)
    return { ok: false, error: `Failed to invite vendors: ${vErr.message}` }
  }

  revalidatePath('/procurement/rfqs')
  revalidatePath('/procurement')

  if (params.send_immediately) {
    const sent = await sendRfq(rfq.id as string)
    if (!sent.ok) {
      return { ok: false, error: `RFQ saved as draft (${rfq.rfq_number as string}); send failed: ${sent.error}` }
    }
    return { ok: true, id: rfq.id as string, rfq_number: rfq.rfq_number as string, status: 'sent' }
  }

  return { ok: true, id: rfq.id as string, rfq_number: rfq.rfq_number as string, status: 'draft' }
}

/* ═══ SEND — flip draft → sent ═══════════════════════════════ */

export async function sendRfq(rfqId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  const { data: rfq } = await actor.supabase
    .from('request_for_quotation')
    .select('id, status')
    .eq('id', rfqId)
    .maybeSingle()
  if (!rfq) return { ok: false, error: 'RFQ not found' }
  if (rfq.status !== 'draft') return { ok: false, error: `RFQ already ${rfq.status as string}` }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('request_for_quotation')
    .update({
      status: 'sent',
      sent_at: now,
      sent_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', rfqId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/rfqs')
  revalidatePath(`/procurement/rfqs/${rfqId}`)
  return { ok: true }
}

/* ═══ CANCEL ═══════════════════════════════════════════════ */

export async function cancelRfq(rfqId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!reason.trim()) return { ok: false, error: 'Reason is required' }

  const { data: rfq } = await actor.supabase
    .from('request_for_quotation')
    .select('id, status')
    .eq('id', rfqId)
    .maybeSingle()
  if (!rfq) return { ok: false, error: 'RFQ not found' }
  if (['cs_finalised', 'po_raised', 'cancelled'].includes(rfq.status as string)) {
    return { ok: false, error: `Cannot cancel ${rfq.status as string} RFQ` }
  }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('request_for_quotation')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: actor.userId,
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', rfqId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/rfqs')
  revalidatePath(`/procurement/rfqs/${rfqId}`)
  return { ok: true }
}

/* ═══ RECORD VENDOR RESPONSE ════════════════════════════════ */

export async function recordVendorRfqResponse(params: {
  rfq_id: string
  vendor_id: string
  vendor_quote_no?: string
  vendor_quote_date?: string
  vendor_quote_validity?: string
  payment_terms_days?: number
  delivery_terms?: string
  notes?: string
  // Per-line quote
  responses: Array<{
    rfq_line_id: string
    rate: number
    discount_pct?: number
    gst_rate_pct?: number
    delivery_days?: number
    notes?: string
  }>
}): Promise<{ ok: true; response_count: number } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  // Validate vendor is invited
  const { data: rfqVendor } = await actor.supabase
    .from('request_for_quotation_vendor')
    .select('id')
    .eq('rfq_id', params.rfq_id)
    .eq('vendor_id', params.vendor_id)
    .maybeSingle()
  if (!rfqVendor) return { ok: false, error: 'Vendor was not invited to this RFQ' }

  // Update vendor-level fields on the invited-vendor row
  const now = new Date().toISOString()
  await actor.supabase
    .from('request_for_quotation_vendor')
    .update({
      responded_at: now,
      vendor_quote_no: params.vendor_quote_no?.trim() || null,
      vendor_quote_date: params.vendor_quote_date ?? null,
      vendor_quote_validity: params.vendor_quote_validity ?? null,
      payment_terms_days: params.payment_terms_days ?? null,
      delivery_terms: params.delivery_terms?.trim() || null,
      notes: params.notes?.trim() || null,
    })
    .eq('id', rfqVendor.id)

  // Upsert per-line responses
  const responsePayload = params.responses
    .filter((r) => r.rate > 0)
    .map((r) => {
      const rate = Number(r.rate)
      const discount = Number(r.discount_pct ?? 0)
      const gst = Number(r.gst_rate_pct ?? 0)
      // We don't know qty here on the action level — defer taxable_value
      // computation to the read-model since qty is on rfq_line.
      return {
        tenant_id: actor.tenantId,
        rfq_id: params.rfq_id,
        rfq_line_id: r.rfq_line_id,
        vendor_id: params.vendor_id,
        rate,
        discount_pct: discount,
        gst_rate_pct: gst,
        delivery_days: r.delivery_days != null ? Number(r.delivery_days) : null,
        notes: r.notes?.trim() || null,
        updated_at: now,
      }
    })

  if (responsePayload.length === 0) {
    return { ok: false, error: 'At least one line response with rate > 0 is required' }
  }

  // Upsert (replace if already exists per (rfq_line_id, vendor_id) unique key)
  for (const row of responsePayload) {
    const { error } = await actor.supabase
      .from('request_for_quotation_response')
      .upsert(row, { onConflict: 'rfq_line_id,vendor_id' })
    if (error) {
      captureError(error, {
        action_name: 'recordVendorRfqResponse',
        tenant_id: actor.tenantId,
        entity_id: params.rfq_id,
      })
      return { ok: false, error: error.message }
    }
  }

  // Compute taxable_value + amount_total for each response now that they exist
  // Pull the line qty
  for (const row of responsePayload) {
    const { data: line } = await actor.supabase
      .from('request_for_quotation_line')
      .select('quantity')
      .eq('id', row.rfq_line_id)
      .maybeSingle()
    if (!line) continue
    const qty = Number(line.quantity)
    const gross = qty * row.rate
    const taxable = r2(gross - gross * (row.discount_pct / 100))
    const tax = r2(taxable * (row.gst_rate_pct / 100))
    const total = r2(taxable + tax)
    await actor.supabase
      .from('request_for_quotation_response')
      .update({ taxable_value: taxable, amount_total: total })
      .eq('rfq_line_id', row.rfq_line_id)
      .eq('vendor_id', row.vendor_id)
  }

  // If all invited vendors have responded → flip RFQ status to quotes_collected
  const { data: vendorList } = await actor.supabase
    .from('request_for_quotation_vendor')
    .select('id, responded_at')
    .eq('rfq_id', params.rfq_id)
  const allResponded = (vendorList ?? []).every((v) => v.responded_at != null)
  if (allResponded) {
    await actor.supabase
      .from('request_for_quotation')
      .update({ status: 'quotes_collected', updated_at: now })
      .eq('id', params.rfq_id)
      .eq('status', 'sent')
  }

  revalidatePath(`/procurement/rfqs/${params.rfq_id}`)
  return { ok: true, response_count: responsePayload.length }
}

/* ═══ FINALISE CS (selection per line + optional override reasons) ══ */

export async function finaliseCs(params: {
  rfq_id: string
  selections: Array<{ rfq_line_id: string; vendor_id: string; reason?: string }>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  const { data: rfq } = await actor.supabase
    .from('request_for_quotation')
    .select('id, status')
    .eq('id', params.rfq_id)
    .maybeSingle()
  if (!rfq) return { ok: false, error: 'RFQ not found' }
  if (!['sent', 'quotes_collected'].includes(rfq.status as string)) {
    return { ok: false, error: `Cannot finalise CS for RFQ in status ${rfq.status as string}` }
  }
  if (params.selections.length === 0) return { ok: false, error: 'No selections provided' }

  // First clear any prior selections (in case user re-finalises)
  await actor.supabase
    .from('request_for_quotation_response')
    .update({ is_selected: false, selection_reason: null })
    .eq('rfq_id', params.rfq_id)

  // Compute L1 (lowest amount_total per line) and mark
  const { data: allResponses } = await actor.supabase
    .from('request_for_quotation_response')
    .select('id, rfq_line_id, vendor_id, amount_total')
    .eq('rfq_id', params.rfq_id)

  // Reset all is_l1 first
  await actor.supabase
    .from('request_for_quotation_response')
    .update({ is_l1: false })
    .eq('rfq_id', params.rfq_id)

  // Per-line: pick the L1
  const byLine = new Map<string, Array<{ id: string; vendor_id: string; amount_total: number | null }>>()
  for (const r of (allResponses ?? [])) {
    const list = byLine.get(r.rfq_line_id as string) ?? []
    list.push({ id: r.id as string, vendor_id: r.vendor_id as string, amount_total: r.amount_total as number | null })
    byLine.set(r.rfq_line_id as string, list)
  }
  for (const [, rows] of byLine) {
    const sorted = rows
      .filter((r) => r.amount_total != null)
      .sort((a, b) => (a.amount_total as number) - (b.amount_total as number))
    if (sorted.length > 0) {
      await actor.supabase
        .from('request_for_quotation_response')
        .update({ is_l1: true })
        .eq('id', sorted[0].id)
    }
  }

  // Mark selections
  for (const s of params.selections) {
    const { error } = await actor.supabase
      .from('request_for_quotation_response')
      .update({ is_selected: true, selection_reason: s.reason?.trim() || null })
      .eq('rfq_line_id', s.rfq_line_id)
      .eq('vendor_id', s.vendor_id)
    if (error) return { ok: false, error: error.message }
  }

  const now = new Date().toISOString()
  await actor.supabase
    .from('request_for_quotation')
    .update({ status: 'cs_finalised', updated_at: now, updated_by: actor.userId })
    .eq('id', params.rfq_id)

  revalidatePath('/procurement/rfqs')
  revalidatePath(`/procurement/rfqs/${params.rfq_id}`)
  return { ok: true }
}

/* ═══ READ ═════════════════════════════════════════════════ */

export async function listRfqs(params?: { status?: RfqStatus | 'all'; limit?: number }): Promise<RfqSummary[]> {
  const actor = await getActor()
  if (!actor) return []

  let q = actor.supabase
    .from('request_for_quotation')
    .select(`
      id, rfq_number, project_id, rfq_date, response_deadline, required_by_date,
      status, source_pr_ids, linked_po_id,
      project:project_id ( id, name ),
      linked_po:linked_po_id ( id, po_number ),
      lines:request_for_quotation_line ( id ),
      vendors:request_for_quotation_vendor ( id ),
      responses:request_for_quotation_response ( id )
    `)
    .eq('tenant_id', actor.tenantId)
    .order('rfq_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.status && params.status !== 'all') q = q.eq('status', params.status)

  const { data, error } = await q
  if (error || !data) return []

  return data.map((r) => {
    const project = pickOne<{ id: string; name: string }>(r.project)
    const linkedPo = pickOne<{ id: string; po_number: string }>(r.linked_po)
    const lines = (r.lines as Array<unknown> | null) ?? []
    const vendors = (r.vendors as Array<unknown> | null) ?? []
    const responses = (r.responses as Array<unknown> | null) ?? []
    const sourcePrIds = (r.source_pr_ids as string[] | null) ?? []
    return {
      id: r.id as string,
      rfq_number: r.rfq_number as string,
      project_id: (r.project_id as string | null) ?? null,
      project_name: project?.name ?? null,
      rfq_date: r.rfq_date as string,
      response_deadline: (r.response_deadline as string | null) ?? null,
      required_by_date: (r.required_by_date as string | null) ?? null,
      status: r.status as RfqStatus,
      line_count: lines.length,
      vendor_count: vendors.length,
      response_count: responses.length,
      linked_po_id: (r.linked_po_id as string | null) ?? null,
      linked_po_number: linkedPo?.po_number ?? null,
      source_pr_count: sourcePrIds.length,
    } satisfies RfqSummary
  })
}

export async function getRfq(rfqId: string): Promise<RfqDetail | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r } = await actor.supabase
    .from('request_for_quotation')
    .select(`
      id, rfq_number, project_id, cost_center, source_pr_ids,
      rfq_date, response_deadline, required_by_date, notes,
      status, linked_po_id, cs_winner_decision,
      sent_at, cancelled_at, cancellation_reason, created_at,
      project:project_id ( id, name ),
      linked_po:linked_po_id ( id, po_number ),
      lines:request_for_quotation_line (
        id, line_no, source_pr_line_id, product_id, description, hsn_code, unit,
        quantity, specifications, required_by_date,
        product:product_id ( id, sku_code, name )
      ),
      vendors:request_for_quotation_vendor (
        id, vendor_id, invited_at, responded_at,
        vendor_quote_no, vendor_quote_date, vendor_quote_validity,
        payment_terms_days, delivery_terms, notes,
        vendor:vendor_id ( id, name, code )
      ),
      responses:request_for_quotation_response (
        id, rfq_line_id, vendor_id, rate, discount_pct, gst_rate_pct,
        delivery_days, notes, taxable_value, amount_total,
        is_l1, is_selected, selection_reason
      )
    `)
    .eq('id', rfqId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!r) return null

  // Fetch PR numbers for the source_pr_ids
  const sourcePrIds = ((r.source_pr_ids as string[] | null) ?? [])
  let sourcePrNumbers: string[] = []
  if (sourcePrIds.length > 0) {
    const { data: prs } = await actor.supabase
      .from('purchase_requisition')
      .select('id, pr_number')
      .in('id', sourcePrIds)
    sourcePrNumbers = (prs ?? []).map((p) => p.pr_number as string)
  }

  const project = pickOne<{ id: string; name: string }>(r.project)
  const linkedPo = pickOne<{ id: string; po_number: string }>(r.linked_po)

  type RawLine = {
    id: string; line_no: number; source_pr_line_id: string | null
    product_id: string | null; description: string; hsn_code: string | null
    unit: string; quantity: number; specifications: string | null
    required_by_date: string | null; product?: unknown
  }
  const lines: RfqLineDetail[] = ((r.lines as RawLine[] | null) ?? [])
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => {
      const product = pickOne<{ id: string; sku_code: string; name: string }>(l.product)
      return {
        id: l.id,
        line_no: l.line_no,
        product_id: l.product_id,
        product_sku: product?.sku_code ?? null,
        product_name: product?.name ?? null,
        description: l.description,
        hsn_code: l.hsn_code,
        unit: l.unit,
        quantity: Number(l.quantity),
        specifications: l.specifications,
        required_by_date: l.required_by_date,
        source_pr_line_id: l.source_pr_line_id,
      }
    })

  type RawVendor = {
    id: string; vendor_id: string; invited_at: string; responded_at: string | null
    vendor_quote_no: string | null; vendor_quote_date: string | null
    vendor_quote_validity: string | null; payment_terms_days: number | null
    delivery_terms: string | null; notes: string | null; vendor?: unknown
  }
  // Quick map for per-vendor response counts
  const responses = (r.responses as RfqResponseRow[] | null) ?? []
  const respByVendor = new Map<string, number>()
  for (const resp of responses) {
    respByVendor.set(resp.vendor_id, (respByVendor.get(resp.vendor_id) ?? 0) + 1)
  }

  const vendors: RfqVendorDetail[] = ((r.vendors as RawVendor[] | null) ?? []).map((v) => {
    const vendor = pickOne<{ id: string; name: string; code: string }>(v.vendor)
    return {
      id: v.id,
      vendor_id: v.vendor_id,
      vendor_name: vendor?.name ?? '—',
      vendor_code: vendor?.code ?? '',
      invited_at: v.invited_at,
      responded_at: v.responded_at,
      vendor_quote_no: v.vendor_quote_no,
      vendor_quote_date: v.vendor_quote_date,
      vendor_quote_validity: v.vendor_quote_validity,
      payment_terms_days: v.payment_terms_days,
      delivery_terms: v.delivery_terms,
      notes: v.notes,
      response_count: respByVendor.get(v.vendor_id) ?? 0,
    }
  })

  return {
    id: r.id as string,
    rfq_number: r.rfq_number as string,
    project_id: (r.project_id as string | null) ?? null,
    project_name: project?.name ?? null,
    cost_center: (r.cost_center as string | null) ?? null,
    source_pr_ids: sourcePrIds,
    source_pr_numbers: sourcePrNumbers,
    rfq_date: r.rfq_date as string,
    response_deadline: (r.response_deadline as string | null) ?? null,
    required_by_date: (r.required_by_date as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: r.status as RfqStatus,
    linked_po_id: (r.linked_po_id as string | null) ?? null,
    linked_po_number: linkedPo?.po_number ?? null,
    cs_winner_decision: (r.cs_winner_decision as string | null) ?? null,
    sent_at: (r.sent_at as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    cancellation_reason: (r.cancellation_reason as string | null) ?? null,
    created_at: r.created_at as string,
    lines,
    vendors,
    responses: responses.map((rsp) => ({
      ...rsp,
      taxable_value: rsp.taxable_value != null ? Number(rsp.taxable_value) : null,
      amount_total: rsp.amount_total != null ? Number(rsp.amount_total) : null,
    })),
  }
}

/* ─── Form pickers ─────────────────────────────────────────── */

export async function listApprovedPrsForRfq(): Promise<Array<{
  id: string; pr_number: string; project_name: string | null; estimated_value: number; line_count: number
}>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('purchase_requisition')
    .select('id, pr_number, estimated_value, project:project_id(name), lines:purchase_requisition_line(id)')
    .eq('tenant_id', actor.tenantId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []).map((r) => {
    const project = pickOne<{ name: string }>(r.project)
    const lines = (r.lines as Array<unknown> | null) ?? []
    return {
      id: r.id as string,
      pr_number: r.pr_number as string,
      project_name: project?.name ?? null,
      estimated_value: Number(r.estimated_value ?? 0),
      line_count: lines.length,
    }
  })
}

export async function getPrLinesForRfq(prIds: string[]): Promise<Array<{
  pr_id: string; pr_number: string; line_id: string; description: string; hsn_code: string | null
  unit: string; quantity: number; specifications: string | null; product_id: string | null
}>> {
  const actor = await getActor()
  if (!actor || prIds.length === 0) return []
  const { data } = await actor.supabase
    .from('purchase_requisition')
    .select(`
      id, pr_number,
      lines:purchase_requisition_line ( id, line_no, description, hsn_code, unit, quantity, specifications, product_id )
    `)
    .in('id', prIds)
    .eq('tenant_id', actor.tenantId)
  if (!data) return []
  const out: Array<{
    pr_id: string; pr_number: string; line_id: string; description: string; hsn_code: string | null
    unit: string; quantity: number; specifications: string | null; product_id: string | null
  }> = []
  for (const pr of data) {
    type RawLine = { id: string; line_no: number; description: string; hsn_code: string | null; unit: string; quantity: number; specifications: string | null; product_id: string | null }
    const lines = ((pr.lines as RawLine[] | null) ?? []).sort((a, b) => a.line_no - b.line_no)
    for (const l of lines) {
      out.push({
        pr_id: pr.id as string,
        pr_number: pr.pr_number as string,
        line_id: l.id,
        description: l.description,
        hsn_code: l.hsn_code,
        unit: l.unit,
        quantity: Number(l.quantity),
        specifications: l.specifications,
        product_id: l.product_id,
      })
    }
  }
  return out
}
