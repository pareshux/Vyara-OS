'use server'

/* ─────────────────────────────────────────────────────────────
   Return to Vendor (RTV) server actions — Phase 1γ (DEL-017 reverse flow).

   An RTV reverses a posted GRN (partial or full) when material is
   rejected post-acceptance or fails downstream QC. Distinct from
   draft-GRN cancel (which is an undo before stock posting).

   State machine:
     draft → posted    (atomic 4 steps mirroring GRN post in reverse)
     draft → cancelled (no-op)

   `postReturnToVendor` performs:
     1. Flip rtv.status = 'posted'
     2. For each line: decrement po_line.qty_received by qty_returned
        (guards against going below 0).
     3. Recompute parent PO status:
          - all lines qty_received >= ordered → still 'received'
          - any line received > 0 → 'partly_received'
          - all zero → 'sent' (back to pre-receipt state)
     4. For each line with product_id set: insert stock_movement
        with movement_type='return_to_vendor', reason_code='rtv',
        related_entity_type='return_to_vendor', related_entity_id=rtv.id.

   `recordVendorCreditNote` patches the credit-note round-trip
   (number + date) post-hoc. Doesn't change status.
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'

export type RtvStatus = 'draft' | 'posted' | 'cancelled'

export type RtvLineInput = {
  grn_line_id: string
  qty_returned: number
  reason?: string
  remarks?: string
}

export type RtvSummary = {
  id: string
  rtv_number: string
  grn_id: string
  grn_number: string | null
  po_id: string
  po_number: string | null
  vendor_id: string
  vendor_name: string | null
  warehouse_name: string | null
  rtv_date: string
  status: RtvStatus
  vendor_credit_note_no: string | null
  line_count: number
  qty_returned_total: number
}

export type RtvLine = {
  id: string
  grn_line_id: string
  po_line_id: string
  product_id: string | null
  description: string
  unit: string
  qty_returned: number
  reason: string | null
  remarks: string | null
  grn_qty_accepted: number | null   // context: how much was originally accepted on that GRN line
}

export type RtvDetail = {
  id: string
  rtv_number: string
  grn_id: string
  grn_number: string | null
  po_id: string
  po_number: string | null
  vendor_id: string
  vendor_name: string | null
  warehouse_id: string
  warehouse_name: string | null
  rtv_date: string
  reason: string | null
  notes: string | null
  vendor_credit_note_no: string | null
  vendor_credit_note_at: string | null
  status: RtvStatus
  posted_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  lines: RtvLine[]
}

/* ─── Helpers ────────────────────────────────────────────── */

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
function r3(n: number): number { return Math.round((n + Number.EPSILON) * 1000) / 1000 }

/* ═══════════════════════════════════════════════════════════
   CREATE — draft RTV
   ═══════════════════════════════════════════════════════════ */

export async function createReturnToVendor(params: {
  grn_id: string
  rtv_date?: string
  reason?: string
  notes?: string
  lines: RtvLineInput[]
  post_immediately?: boolean
}): Promise<{ ok: true; id: string; rtv_number: string; status: RtvStatus } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Only admins or managers can record returns' }
  if (!params.lines || params.lines.length === 0) return { ok: false, error: 'At least one line is required' }

  // Fetch GRN + lines so we know vendor/warehouse/PO and can validate qty
  const { data: grn, error: grnErr } = await actor.supabase
    .from('goods_receipt_note')
    .select(`
      id, status, po_id, vendor_id, warehouse_id,
      lines:goods_receipt_note_line (
        id, po_line_id, product_id, description, unit, qty_accepted
      )
    `)
    .eq('id', params.grn_id)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (grnErr || !grn) return { ok: false, error: 'GRN not found' }
  if (grn.status !== 'posted') {
    return { ok: false, error: `RTV requires a posted GRN (current status: ${grn.status as string})` }
  }

  const grnLines = ((grn.lines as Array<{ id: string; po_line_id: string; product_id: string | null; description: string; unit: string; qty_accepted: number }> | null) ?? [])
  const grnLineMap = new Map(grnLines.map((l) => [l.id, l]))

  // Fetch existing RTV lines for this GRN to compute remaining returnable qty per GRN line
  const { data: priorRtvLines } = await actor.supabase
    .from('return_to_vendor_line')
    .select('grn_line_id, qty_returned, rtv:rtv_id(status)')
    .in('grn_line_id', grnLines.map((l) => l.id))

  const priorReturnedByGrnLine = new Map<string, number>()
  for (const r of (priorRtvLines ?? [])) {
    const rtvStatus = pickOne<{ status: string }>((r as { rtv?: unknown }).rtv)?.status
    if (rtvStatus !== 'posted') continue   // only posted RTVs count against the cap
    const key = r.grn_line_id as string
    priorReturnedByGrnLine.set(key, (priorReturnedByGrnLine.get(key) ?? 0) + Number(r.qty_returned || 0))
  }

  type SanitisedLine = {
    grn_line_id: string
    po_line_id: string
    product_id: string | null
    description: string
    unit: string
    qty_returned: number
    reason: string | null
    remarks: string | null
  }
  const sanitised: SanitisedLine[] = []

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i]
    const grnLine = grnLineMap.get(line.grn_line_id)
    if (!grnLine) return { ok: false, error: `Line ${i + 1}: GRN line ${line.grn_line_id} doesn't belong to this GRN` }

    const qReturned = r3(Number(line.qty_returned))
    if (!Number.isFinite(qReturned) || qReturned <= 0) {
      return { ok: false, error: `Line ${i + 1}: qty_returned must be > 0` }
    }

    const alreadyReturned = priorReturnedByGrnLine.get(grnLine.id) ?? 0
    const remaining = r3(Number(grnLine.qty_accepted) - alreadyReturned)
    if (qReturned > remaining) {
      return { ok: false, error: `Line ${i + 1}: can return at most ${remaining} ${grnLine.unit} (accepted ${grnLine.qty_accepted}, already returned ${alreadyReturned})` }
    }
    if (!line.reason?.trim()) {
      return { ok: false, error: `Line ${i + 1}: reason is required` }
    }

    sanitised.push({
      grn_line_id: grnLine.id,
      po_line_id: grnLine.po_line_id,
      product_id: grnLine.product_id,
      description: grnLine.description,
      unit: grnLine.unit,
      qty_returned: qReturned,
      reason: line.reason.trim(),
      remarks: line.remarks?.trim() || null,
    })
  }

  if (sanitised.length === 0) return { ok: false, error: 'At least one line is required' }

  // Insert RTV header (draft)
  const { data: rtv, error: rtvErr } = await actor.supabase
    .from('return_to_vendor')
    .insert({
      tenant_id: actor.tenantId,
      grn_id: grn.id,
      po_id: grn.po_id,
      vendor_id: grn.vendor_id,
      warehouse_id: grn.warehouse_id,
      rtv_date: params.rtv_date ?? new Date().toISOString().slice(0, 10),
      reason: params.reason?.trim() || null,
      notes: params.notes?.trim() || null,
      status: 'draft',
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id, rtv_number')
    .single()

  if (rtvErr || !rtv) {
    captureError(rtvErr ?? new Error('RTV insert returned no row'), {
      action_name: 'createReturnToVendor',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    return { ok: false, error: rtvErr?.message ?? 'Could not create RTV' }
  }

  const linePayload = sanitised.map((s) => ({
    tenant_id: actor.tenantId,
    rtv_id: rtv.id,
    grn_line_id: s.grn_line_id,
    po_line_id: s.po_line_id,
    product_id: s.product_id,
    description: s.description,
    unit: s.unit,
    qty_returned: s.qty_returned,
    reason: s.reason,
    remarks: s.remarks,
  }))

  const { error: lineErr } = await actor.supabase
    .from('return_to_vendor_line')
    .insert(linePayload)

  if (lineErr) {
    await actor.supabase
      .from('return_to_vendor')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', rtv.id)
    captureError(lineErr, {
      action_name: 'createReturnToVendor.lines',
      tenant_id: actor.tenantId,
      entity_id: rtv.id as string,
    })
    return { ok: false, error: `Failed to create RTV lines: ${lineErr.message}` }
  }

  revalidatePath('/procurement/returns')
  revalidatePath(`/procurement/grns/${params.grn_id}`)

  if (params.post_immediately) {
    const posted = await postReturnToVendor(rtv.id as string)
    if (!posted.ok) {
      return { ok: false, error: `RTV saved as draft (${rtv.rtv_number as string}); posting failed: ${posted.error}` }
    }
    return { ok: true, id: rtv.id as string, rtv_number: rtv.rtv_number as string, status: 'posted' }
  }

  return { ok: true, id: rtv.id as string, rtv_number: rtv.rtv_number as string, status: 'draft' }
}

/* ═══════════════════════════════════════════════════════════
   POST — atomic state advance (reverse of GRN post)
   ═══════════════════════════════════════════════════════════ */

export async function postReturnToVendor(
  rtvId: string,
): Promise<{ ok: true; po_status: string } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  const { data: rtv } = await actor.supabase
    .from('return_to_vendor')
    .select(`
      id, status, po_id, vendor_id, warehouse_id, grn_id,
      lines:return_to_vendor_line ( id, po_line_id, product_id, qty_returned )
    `)
    .eq('id', rtvId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (!rtv) return { ok: false, error: 'RTV not found' }
  if (rtv.status !== 'draft') return { ok: false, error: `RTV is already ${rtv.status as string}` }

  const rtvLines = ((rtv.lines as Array<{ id: string; po_line_id: string; product_id: string | null; qty_returned: number }> | null) ?? [])
  if (rtvLines.length === 0) return { ok: false, error: 'RTV has no lines' }

  const now = new Date().toISOString()

  // 1) Flip RTV status to posted
  const { error: flipErr } = await actor.supabase
    .from('return_to_vendor')
    .update({
      status: 'posted',
      posted_at: now,
      posted_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', rtvId)
  if (flipErr) return { ok: false, error: flipErr.message }

  async function rollback(reason: string) {
    await actor!.supabase
      .from('return_to_vendor')
      .update({
        status: 'draft',
        posted_at: null,
        posted_by: null,
        notes: `[post failed: ${reason}]`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rtvId)
  }

  // 2) Decrement po_line.qty_received for each line
  for (const rl of rtvLines) {
    const { data: poLine } = await actor.supabase
      .from('purchase_order_line')
      .select('id, qty_received')
      .eq('id', rl.po_line_id)
      .maybeSingle()

    if (!poLine) {
      await rollback(`PO line ${rl.po_line_id} not found`)
      return { ok: false, error: `PO line ${rl.po_line_id} not found` }
    }

    const newReceived = Math.max(0, r3(Number(poLine.qty_received || 0) - Number(rl.qty_returned || 0)))

    const { error: updErr } = await actor.supabase
      .from('purchase_order_line')
      .update({ qty_received: newReceived, updated_at: now })
      .eq('id', rl.po_line_id)

    if (updErr) {
      await rollback(`po_line update failed: ${updErr.message}`)
      return { ok: false, error: `Failed to update PO line: ${updErr.message}` }
    }
  }

  // 3) Recompute parent PO status
  const { data: refreshedLines } = await actor.supabase
    .from('purchase_order_line')
    .select('quantity, qty_received')
    .eq('po_id', rtv.po_id)

  let nextPoStatus: string = 'sent'
  if (refreshedLines && refreshedLines.length > 0) {
    const allFulfilled = refreshedLines.every(
      (l) => Number(l.qty_received || 0) >= Number(l.quantity || 0),
    )
    const anyReceived = refreshedLines.some((l) => Number(l.qty_received || 0) > 0)
    if (allFulfilled) nextPoStatus = 'received'
    else if (anyReceived) nextPoStatus = 'partly_received'
    else nextPoStatus = 'sent'   // RTV brought us back to pre-receipt
  }

  const { error: poErr } = await actor.supabase
    .from('purchase_order')
    .update({
      status: nextPoStatus,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', rtv.po_id)
  if (poErr) {
    captureError(poErr, {
      action_name: 'postReturnToVendor.po_status_update',
      tenant_id: actor.tenantId,
      entity_id: rtv.po_id as string,
    })
  }

  // 4) Write stock_movement rows for product-linked lines
  const stockMovements = rtvLines
    .filter((rl) => rl.product_id != null && Number(rl.qty_returned || 0) > 0)
    .map((rl) => ({
      tenant_id: actor.tenantId,
      warehouse_id: rtv.warehouse_id,
      product_id: rl.product_id,
      movement_type: 'return_to_vendor',
      quantity: Number(rl.qty_returned),
      reason_code: 'rtv',
      related_entity_type: 'return_to_vendor',
      related_entity_id: rtv.id,
      actor_id: actor.userId,
      remark: null,
    }))

  if (stockMovements.length > 0) {
    const { error: smErr } = await actor.supabase
      .from('stock_movement')
      .insert(stockMovements)
    if (smErr) {
      captureError(smErr, {
        action_name: 'postReturnToVendor.stock_movement',
        tenant_id: actor.tenantId,
        entity_id: rtv.id as string,
      })
    }
  }

  revalidatePath('/procurement')
  revalidatePath('/procurement/returns')
  revalidatePath(`/procurement/returns/${rtvId}`)
  revalidatePath(`/procurement/grns/${rtv.grn_id}`)
  revalidatePath(`/procurement/orders/${rtv.po_id}`)
  revalidatePath('/inventory')
  revalidatePath(`/warehouses/${rtv.warehouse_id}`)

  return { ok: true, po_status: nextPoStatus }
}

/* ═══════════════════════════════════════════════════════════
   CANCEL — draft only
   ═══════════════════════════════════════════════════════════ */

export async function cancelReturnToVendor(
  rtvId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!reason.trim()) return { ok: false, error: 'Cancellation reason is required' }

  const { data: rtv } = await actor.supabase
    .from('return_to_vendor')
    .select('id, status, grn_id, po_id')
    .eq('id', rtvId)
    .maybeSingle()
  if (!rtv) return { ok: false, error: 'RTV not found' }
  if (rtv.status !== 'draft') return { ok: false, error: `Cannot cancel a ${rtv.status as string} RTV. Posted returns are reversed via a fresh GRN.` }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('return_to_vendor')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: actor.userId,
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', rtvId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/returns')
  revalidatePath(`/procurement/returns/${rtvId}`)
  revalidatePath(`/procurement/grns/${rtv.grn_id}`)
  revalidatePath(`/procurement/orders/${rtv.po_id}`)
  return { ok: true }
}

/* ═══════════════════════════════════════════════════════════
   Vendor credit-note round trip
   ═══════════════════════════════════════════════════════════ */

export async function recordVendorCreditNote(
  rtvId: string,
  params: { credit_note_no: string; credit_note_date: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!params.credit_note_no.trim() || !params.credit_note_date) {
    return { ok: false, error: 'Credit note number and date are required' }
  }

  const { data: rtv } = await actor.supabase
    .from('return_to_vendor')
    .select('id, status')
    .eq('id', rtvId)
    .maybeSingle()
  if (!rtv) return { ok: false, error: 'RTV not found' }
  if (rtv.status !== 'posted') {
    return { ok: false, error: 'Credit notes can only be recorded against posted RTVs' }
  }

  const { error } = await actor.supabase
    .from('return_to_vendor')
    .update({
      vendor_credit_note_no: params.credit_note_no.trim(),
      vendor_credit_note_at: params.credit_note_date,
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    })
    .eq('id', rtvId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/procurement/returns/${rtvId}`)
  return { ok: true }
}

/* ═══════════════════════════════════════════════════════════
   READ — list + detail + lookup for the form
   ═══════════════════════════════════════════════════════════ */

export async function listReturnsToVendor(params?: {
  status?: RtvStatus | 'all'
  grn_id?: string
  limit?: number
}): Promise<RtvSummary[]> {
  const actor = await getActor()
  if (!actor) return []

  let q = actor.supabase
    .from('return_to_vendor')
    .select(`
      id, rtv_number, grn_id, po_id, vendor_id, warehouse_id, rtv_date, status, vendor_credit_note_no,
      grn:grn_id ( id, grn_number ),
      po:po_id ( id, po_number ),
      vendor:vendor_id ( id, name ),
      warehouse:warehouse_id ( id, name ),
      lines:return_to_vendor_line ( id, qty_returned )
    `)
    .eq('tenant_id', actor.tenantId)
    .order('rtv_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params?.grn_id) q = q.eq('grn_id', params.grn_id)

  const { data, error } = await q
  if (error || !data) return []

  return data.map((r) => {
    const grn = pickOne<{ id: string; grn_number: string }>(r.grn)
    const po = pickOne<{ id: string; po_number: string }>(r.po)
    const vendor = pickOne<{ id: string; name: string }>(r.vendor)
    const warehouse = pickOne<{ id: string; name: string }>(r.warehouse)
    const lines = (r.lines as Array<{ qty_returned: number }> | null) ?? []
    return {
      id: r.id as string,
      rtv_number: r.rtv_number as string,
      grn_id: r.grn_id as string,
      grn_number: grn?.grn_number ?? null,
      po_id: r.po_id as string,
      po_number: po?.po_number ?? null,
      vendor_id: r.vendor_id as string,
      vendor_name: vendor?.name ?? null,
      warehouse_name: warehouse?.name ?? null,
      rtv_date: r.rtv_date as string,
      status: r.status as RtvStatus,
      vendor_credit_note_no: (r.vendor_credit_note_no as string | null) ?? null,
      line_count: lines.length,
      qty_returned_total: lines.reduce((s, l) => s + Number(l.qty_returned || 0), 0),
    } satisfies RtvSummary
  })
}

export async function getReturnToVendor(rtvId: string): Promise<RtvDetail | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r } = await actor.supabase
    .from('return_to_vendor')
    .select(`
      id, rtv_number, grn_id, po_id, vendor_id, warehouse_id, rtv_date,
      reason, notes, vendor_credit_note_no, vendor_credit_note_at,
      status, posted_at, cancelled_at, cancellation_reason, created_at,
      grn:grn_id ( id, grn_number ),
      po:po_id ( id, po_number ),
      vendor:vendor_id ( id, name ),
      warehouse:warehouse_id ( id, name ),
      lines:return_to_vendor_line (
        id, grn_line_id, po_line_id, product_id, description, unit,
        qty_returned, reason, remarks,
        grn_line:grn_line_id ( qty_accepted )
      )
    `)
    .eq('id', rtvId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (!r) return null

  const grn = pickOne<{ id: string; grn_number: string }>(r.grn)
  const po = pickOne<{ id: string; po_number: string }>(r.po)
  const vendor = pickOne<{ id: string; name: string }>(r.vendor)
  const warehouse = pickOne<{ id: string; name: string }>(r.warehouse)

  type RawLine = {
    id: string
    grn_line_id: string
    po_line_id: string
    product_id: string | null
    description: string
    unit: string
    qty_returned: number
    reason: string | null
    remarks: string | null
    grn_line?: unknown
  }
  const lines: RtvLine[] = ((r.lines as RawLine[] | null) ?? []).map((l) => {
    const grnLine = pickOne<{ qty_accepted: number }>(l.grn_line)
    return {
      id: l.id,
      grn_line_id: l.grn_line_id,
      po_line_id: l.po_line_id,
      product_id: l.product_id,
      description: l.description,
      unit: l.unit,
      qty_returned: Number(l.qty_returned),
      reason: l.reason ?? null,
      remarks: l.remarks ?? null,
      grn_qty_accepted: grnLine?.qty_accepted != null ? Number(grnLine.qty_accepted) : null,
    }
  })

  return {
    id: r.id as string,
    rtv_number: r.rtv_number as string,
    grn_id: r.grn_id as string,
    grn_number: grn?.grn_number ?? null,
    po_id: r.po_id as string,
    po_number: po?.po_number ?? null,
    vendor_id: r.vendor_id as string,
    vendor_name: vendor?.name ?? null,
    warehouse_id: r.warehouse_id as string,
    warehouse_name: warehouse?.name ?? null,
    rtv_date: r.rtv_date as string,
    reason: (r.reason as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    vendor_credit_note_no: (r.vendor_credit_note_no as string | null) ?? null,
    vendor_credit_note_at: (r.vendor_credit_note_at as string | null) ?? null,
    status: r.status as RtvStatus,
    posted_at: (r.posted_at as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    cancellation_reason: (r.cancellation_reason as string | null) ?? null,
    created_at: r.created_at as string,
    lines,
  }
}

/* ─── Lookup: GRN snapshot for the RTV form (lines + already-returned) ── */

export type GrnForReturn = {
  id: string
  grn_number: string
  status: string
  grn_date: string
  po_id: string
  po_number: string
  vendor_id: string
  vendor_name: string
  warehouse_name: string
  lines: Array<{
    id: string
    description: string
    unit: string
    qty_accepted: number
    qty_already_returned: number
    qty_returnable: number
    product_id: string | null
  }>
}

export async function getGrnForReturn(grnId: string): Promise<GrnForReturn | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: grn } = await actor.supabase
    .from('goods_receipt_note')
    .select(`
      id, grn_number, status, grn_date, po_id, vendor_id,
      po:po_id ( id, po_number ),
      vendor:vendor_id ( id, name ),
      warehouse:warehouse_id ( id, name ),
      lines:goods_receipt_note_line (
        id, description, unit, qty_accepted, product_id
      )
    `)
    .eq('id', grnId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (!grn) return null

  const po = pickOne<{ id: string; po_number: string }>(grn.po)
  const vendor = pickOne<{ id: string; name: string }>(grn.vendor)
  const warehouse = pickOne<{ id: string; name: string }>(grn.warehouse)
  const grnLines = ((grn.lines as Array<{ id: string; description: string; unit: string; qty_accepted: number; product_id: string | null }> | null) ?? [])

  // Aggregate qty already returned by posted RTVs against these GRN lines
  const { data: priorRtvLines } = await actor.supabase
    .from('return_to_vendor_line')
    .select('grn_line_id, qty_returned, rtv:rtv_id ( status )')
    .in('grn_line_id', grnLines.map((l) => l.id))

  const alreadyReturned = new Map<string, number>()
  for (const r of (priorRtvLines ?? [])) {
    const rtvStatus = pickOne<{ status: string }>((r as { rtv?: unknown }).rtv)?.status
    if (rtvStatus !== 'posted') continue
    const key = r.grn_line_id as string
    alreadyReturned.set(key, (alreadyReturned.get(key) ?? 0) + Number(r.qty_returned || 0))
  }

  return {
    id: grn.id as string,
    grn_number: grn.grn_number as string,
    status: grn.status as string,
    grn_date: grn.grn_date as string,
    po_id: grn.po_id as string,
    po_number: po?.po_number ?? grn.po_id as string,
    vendor_id: grn.vendor_id as string,
    vendor_name: vendor?.name ?? '—',
    warehouse_name: warehouse?.name ?? '—',
    lines: grnLines.map((l) => {
      const ret = alreadyReturned.get(l.id) ?? 0
      return {
        id: l.id,
        description: l.description,
        unit: l.unit,
        qty_accepted: Number(l.qty_accepted),
        qty_already_returned: ret,
        qty_returnable: Math.max(0, r3(Number(l.qty_accepted) - ret)),
        product_id: l.product_id,
      }
    }),
  }
}
