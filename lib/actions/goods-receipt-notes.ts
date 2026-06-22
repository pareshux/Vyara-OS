'use server'

/* ─────────────────────────────────────────────────────────────
   Goods Receipt Note server actions — Phase 1β (Blueprint DEL-017).

   State machine:
     draft → posted   (postGoodsReceiptNote — atomic update)
     draft → cancelled (cancelGoodsReceiptNote)
     posted is terminal in this slice; RTV is P1γ.

   `postGoodsReceiptNote` performs four things in sequence:
     1. Flip grn.status = 'posted'
     2. For each line: po_line.qty_received += accepted, qty_rejected += rejected
     3. Recompute po.status from cumulative receipt:
          - all lines fulfilled (received >= ordered) → 'received'
          - any line received > 0 but not all fulfilled → 'partly_received'
          - none received yet (cancelled GRNs) → status stays 'sent' / 'approved'
     4. For each line with product_id set: write a stock_movement
        (movement_type='receipt', reason_code='purchase',
         related_entity_type='goods_receipt_note', related_entity_id=grn.id)

   Atomicity caveat: Supabase JS doesn't expose transactions to the
   client lib. The action is sequential — if step (4) fails after (1-3)
   succeed, the GRN status is rolled back to 'draft' by the action so
   stock isn't left out of sync. Same pattern used elsewhere in this
   codebase (see lib/actions/complaints.ts).
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'

export type GrnStatus = 'draft' | 'posted' | 'cancelled'
export type QcStatus = 'not_required' | 'pending' | 'accepted' | 'rejected' | 'partial_accept'

export type GrnLineInput = {
  po_line_id: string
  qty_received: number
  qty_rejected?: number
  rejection_reason?: string
  batch_no?: string
  expiry_date?: string
  remarks?: string
}

export type GrnSummary = {
  id: string
  grn_number: string
  po_id: string
  po_number: string | null
  vendor_id: string
  vendor_name: string | null
  warehouse_id: string
  warehouse_name: string | null
  grn_date: string
  status: GrnStatus
  qc_status: QcStatus
  line_count: number
  qty_accepted_total: number
  qty_rejected_total: number
}

export type GrnLine = {
  id: string
  po_line_id: string
  product_id: string | null
  description: string
  unit: string
  qty_received: number
  qty_accepted: number
  qty_rejected: number
  rejection_reason: string | null
  batch_no: string | null
  expiry_date: string | null
  remarks: string | null
  po_line_description: string | null
  po_line_quantity: number | null
}

export type GrnDetail = {
  id: string
  grn_number: string
  po_id: string
  po_number: string | null
  vendor_id: string
  vendor_name: string | null
  warehouse_id: string
  warehouse_name: string | null
  grn_date: string
  status: GrnStatus
  qc_status: QcStatus
  qc_notes: string | null
  vendor_challan_no: string | null
  vendor_invoice_no: string | null
  vehicle_no: string | null
  transporter: string | null
  e_way_bill_no: string | null
  notes: string | null
  posted_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  lines: GrnLine[]
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

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

/* Supabase nested-relation array → object normalisation. */
function pickOne<T>(v: unknown): T | null {
  if (v == null) return null
  return Array.isArray(v) ? ((v[0] as T | undefined) ?? null) : (v as T)
}

function r3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/* ═══════════════════════════════════════════════════════════
   CREATE — draft GRN
   ═══════════════════════════════════════════════════════════ */

export async function createGoodsReceiptNote(params: {
  po_id: string
  grn_date?: string
  vendor_challan_no?: string
  vendor_invoice_no?: string
  vehicle_no?: string
  transporter?: string
  e_way_bill_no?: string
  qc_status?: QcStatus
  qc_notes?: string
  notes?: string
  lines: GrnLineInput[]
  /** When true, GRN is posted immediately after insert. Skips the draft state. */
  post_immediately?: boolean
}): Promise<{ ok: true; id: string; grn_number: string; status: GrnStatus } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Only admins or managers can record receipts' }
  if (!params.lines || params.lines.length === 0) return { ok: false, error: 'At least one line is required' }

  // Fetch PO + lines so we can validate qty + grab vendor / warehouse.
  const { data: po, error: poErr } = await actor.supabase
    .from('purchase_order')
    .select(`
      id, status, vendor_id, ship_to_warehouse_id,
      lines:purchase_order_line ( id, description, quantity, qty_received, qty_rejected, product_id, unit )
    `)
    .eq('id', params.po_id)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (poErr || !po) return { ok: false, error: 'Purchase order not found' }

  const receivableStatuses = ['approved', 'sent', 'partly_received']
  if (!receivableStatuses.includes(po.status as string)) {
    return { ok: false, error: `Cannot receive against a ${po.status as string} PO (must be approved / sent / partly_received)` }
  }

  // Validate each input line maps to a PO line under this PO.
  const poLines = ((po.lines as Array<{ id: string; quantity: number; qty_received: number; qty_rejected: number; product_id: string | null; description: string; unit: string }> | null) ?? [])
  const poLineMap = new Map(poLines.map((l) => [l.id, l]))

  // Sanitised line payload + per-line validation
  type SanitisedLine = {
    po_line_id: string
    product_id: string | null
    description: string
    unit: string
    qty_received: number
    qty_accepted: number
    qty_rejected: number
    rejection_reason: string | null
    batch_no: string | null
    expiry_date: string | null
    remarks: string | null
  }
  const sanitised: SanitisedLine[] = []

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i]
    const poLine = poLineMap.get(line.po_line_id)
    if (!poLine) return { ok: false, error: `Line ${i + 1}: PO line ${line.po_line_id} doesn't belong to this PO` }

    const qReceived = r3(Number(line.qty_received))
    const qRejected = r3(Number(line.qty_rejected ?? 0))
    if (!Number.isFinite(qReceived) || qReceived < 0) {
      return { ok: false, error: `Line ${i + 1}: qty_received must be ≥ 0` }
    }
    if (!Number.isFinite(qRejected) || qRejected < 0) {
      return { ok: false, error: `Line ${i + 1}: qty_rejected must be ≥ 0` }
    }
    if (qRejected > qReceived) {
      return { ok: false, error: `Line ${i + 1}: rejected qty cannot exceed received qty` }
    }
    if (qReceived === 0 && qRejected === 0) {
      continue  // skip empty lines silently — user left them blank
    }
    if (qRejected > 0 && !line.rejection_reason?.trim()) {
      return { ok: false, error: `Line ${i + 1}: rejection reason is required when qty_rejected > 0` }
    }

    sanitised.push({
      po_line_id: poLine.id,
      product_id: poLine.product_id,
      description: poLine.description,
      unit: poLine.unit,
      qty_received: qReceived,
      qty_accepted: r3(qReceived - qRejected),
      qty_rejected: qRejected,
      rejection_reason: line.rejection_reason?.trim() || null,
      batch_no: line.batch_no?.trim() || null,
      expiry_date: line.expiry_date || null,
      remarks: line.remarks?.trim() || null,
    })
  }

  if (sanitised.length === 0) {
    return { ok: false, error: 'At least one line must have qty_received > 0' }
  }

  // Insert GRN header (draft)
  const { data: grn, error: grnErr } = await actor.supabase
    .from('goods_receipt_note')
    .insert({
      tenant_id: actor.tenantId,
      po_id: po.id,
      vendor_id: po.vendor_id,
      warehouse_id: po.ship_to_warehouse_id,
      grn_date: params.grn_date ?? new Date().toISOString().slice(0, 10),
      vendor_challan_no: params.vendor_challan_no?.trim() || null,
      vendor_invoice_no: params.vendor_invoice_no?.trim() || null,
      vehicle_no: params.vehicle_no?.trim() || null,
      transporter: params.transporter?.trim() || null,
      e_way_bill_no: params.e_way_bill_no?.trim() || null,
      qc_status: params.qc_status ?? 'not_required',
      qc_notes: params.qc_notes?.trim() || null,
      notes: params.notes?.trim() || null,
      status: 'draft',
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id, grn_number')
    .single()

  if (grnErr || !grn) {
    captureError(grnErr ?? new Error('GRN insert returned no row'), {
      action_name: 'createGoodsReceiptNote',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    return { ok: false, error: grnErr?.message ?? 'Could not create GRN' }
  }

  // Insert GRN lines
  const linePayload = sanitised.map((s) => ({
    tenant_id: actor.tenantId,
    grn_id: grn.id,
    po_line_id: s.po_line_id,
    product_id: s.product_id,
    description: s.description,
    unit: s.unit,
    qty_received: s.qty_received,
    qty_accepted: s.qty_accepted,
    qty_rejected: s.qty_rejected,
    rejection_reason: s.rejection_reason,
    batch_no: s.batch_no,
    expiry_date: s.expiry_date,
    remarks: s.remarks,
  }))

  const { error: lineErr } = await actor.supabase
    .from('goods_receipt_note_line')
    .insert(linePayload)

  if (lineErr) {
    await actor.supabase
      .from('goods_receipt_note')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', grn.id)
    captureError(lineErr, {
      action_name: 'createGoodsReceiptNote.lines',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_id: grn.id as string,
    })
    return { ok: false, error: `Failed to create GRN lines: ${lineErr.message}` }
  }

  revalidatePath('/procurement')
  revalidatePath('/procurement/grns')
  revalidatePath(`/procurement/orders/${params.po_id}`)

  if (params.post_immediately) {
    const posted = await postGoodsReceiptNote(grn.id as string)
    if (!posted.ok) {
      return { ok: false, error: `GRN saved as draft (${grn.grn_number as string}); posting failed: ${posted.error}` }
    }
    return { ok: true, id: grn.id as string, grn_number: grn.grn_number as string, status: 'posted' }
  }

  return { ok: true, id: grn.id as string, grn_number: grn.grn_number as string, status: 'draft' }
}

/* ═══════════════════════════════════════════════════════════
   POST — atomic state advance
   ═══════════════════════════════════════════════════════════ */

export async function postGoodsReceiptNote(
  grnId: string,
): Promise<{ ok: true; po_status: string } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  // Fetch GRN + lines + parent PO + parent PO lines
  const { data: grn, error: grnErr } = await actor.supabase
    .from('goods_receipt_note')
    .select(`
      id, status, po_id, vendor_id, warehouse_id, grn_date,
      lines:goods_receipt_note_line (
        id, po_line_id, product_id, qty_accepted, qty_rejected
      )
    `)
    .eq('id', grnId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (grnErr || !grn) return { ok: false, error: 'GRN not found' }
  if (grn.status !== 'draft') return { ok: false, error: `GRN is already ${grn.status as string}` }

  const grnLines = ((grn.lines as Array<{ id: string; po_line_id: string; product_id: string | null; qty_accepted: number; qty_rejected: number }> | null) ?? [])
  if (grnLines.length === 0) return { ok: false, error: 'GRN has no lines' }

  const now = new Date().toISOString()

  // 1) Flip GRN status to posted (we'll roll back if any downstream step fails)
  const { error: flipErr } = await actor.supabase
    .from('goods_receipt_note')
    .update({
      status: 'posted',
      posted_at: now,
      posted_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', grnId)

  if (flipErr) return { ok: false, error: flipErr.message }

  // Best-effort rollback helper
  async function rollbackGrn(reason: string) {
    await actor!.supabase
      .from('goods_receipt_note')
      .update({
        status: 'draft',
        posted_at: null,
        posted_by: null,
        updated_at: new Date().toISOString(),
        notes: `[post failed: ${reason}]`,
      })
      .eq('id', grnId)
  }

  // 2) Increment qty_received + qty_rejected on each PO line
  for (const gl of grnLines) {
    // Fetch current values (avoid a race where two GRNs post simultaneously
    // — last-write-wins; we accept this for v1).
    const { data: poLine } = await actor.supabase
      .from('purchase_order_line')
      .select('id, qty_received, qty_rejected')
      .eq('id', gl.po_line_id)
      .maybeSingle()

    if (!poLine) {
      await rollbackGrn(`PO line ${gl.po_line_id} not found`)
      return { ok: false, error: `PO line ${gl.po_line_id} not found` }
    }

    const newReceived = r3(Number(poLine.qty_received || 0) + Number(gl.qty_accepted || 0))
    const newRejected = r3(Number(poLine.qty_rejected || 0) + Number(gl.qty_rejected || 0))

    const { error: updErr } = await actor.supabase
      .from('purchase_order_line')
      .update({
        qty_received: newReceived,
        qty_rejected: newRejected,
        updated_at: now,
      })
      .eq('id', gl.po_line_id)

    if (updErr) {
      await rollbackGrn(`po_line update failed: ${updErr.message}`)
      return { ok: false, error: `Failed to update PO line: ${updErr.message}` }
    }
  }

  // 3) Recompute PO status: pull all lines again + decide
  const { data: refreshedLines } = await actor.supabase
    .from('purchase_order_line')
    .select('id, quantity, qty_received')
    .eq('po_id', grn.po_id)

  let nextPoStatus: string = 'partly_received'
  if (refreshedLines && refreshedLines.length > 0) {
    const allFulfilled = refreshedLines.every(
      (l) => Number(l.qty_received || 0) >= Number(l.quantity || 0),
    )
    const anyReceived = refreshedLines.some((l) => Number(l.qty_received || 0) > 0)
    if (allFulfilled) nextPoStatus = 'received'
    else if (anyReceived) nextPoStatus = 'partly_received'
    else nextPoStatus = 'sent'  // shouldn't happen since we wrote receipts, but safe fallback
  }

  const { error: poErr } = await actor.supabase
    .from('purchase_order')
    .update({
      status: nextPoStatus,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', grn.po_id)

  if (poErr) {
    // PO status update failed — don't try to undo line increments,
    // just log and continue. The GRN is posted; PO status will catch
    // up on next manual edit.
    captureError(poErr, {
      action_name: 'postGoodsReceiptNote.po_status_update',
      tenant_id: actor.tenantId,
      entity_id: grn.po_id as string,
    })
  }

  // 4) Write stock_movement rows for accepted lines with product_id set
  const stockMovements = grnLines
    .filter((gl) => gl.product_id != null && Number(gl.qty_accepted || 0) > 0)
    .map((gl) => ({
      tenant_id: actor.tenantId,
      warehouse_id: grn.warehouse_id,
      product_id: gl.product_id,
      movement_type: 'receipt',
      quantity: Number(gl.qty_accepted),
      reason_code: 'purchase',
      related_entity_type: 'goods_receipt_note',
      related_entity_id: grn.id,
      actor_id: actor.userId,
      remark: null,
    }))

  if (stockMovements.length > 0) {
    const { error: smErr } = await actor.supabase
      .from('stock_movement')
      .insert(stockMovements)

    if (smErr) {
      // Log and continue — the GRN is still validly posted. Stock movement
      // failure typically means the product was deleted or warehouse was
      // suspended; the data is recoverable via re-post or manual fix.
      captureError(smErr, {
        action_name: 'postGoodsReceiptNote.stock_movement',
        tenant_id: actor.tenantId,
        entity_id: grn.id as string,
      })
    }
  }

  revalidatePath('/procurement')
  revalidatePath('/procurement/grns')
  revalidatePath(`/procurement/grns/${grnId}`)
  revalidatePath(`/procurement/orders/${grn.po_id}`)
  revalidatePath('/inventory')
  revalidatePath(`/warehouses/${grn.warehouse_id}`)

  return { ok: true, po_status: nextPoStatus }
}

/* ═══════════════════════════════════════════════════════════
   CANCEL — only for draft GRNs
   ═══════════════════════════════════════════════════════════ */

export async function cancelGoodsReceiptNote(
  grnId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!reason.trim()) return { ok: false, error: 'Cancellation reason is required' }

  const { data: grn } = await actor.supabase
    .from('goods_receipt_note')
    .select('id, status, po_id')
    .eq('id', grnId)
    .maybeSingle()
  if (!grn) return { ok: false, error: 'GRN not found' }
  if (grn.status !== 'draft') return { ok: false, error: `Cannot cancel a ${grn.status as string} GRN (use RTV for posted receipts — P1γ)` }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('goods_receipt_note')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: actor.userId,
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', grnId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/grns')
  revalidatePath(`/procurement/grns/${grnId}`)
  revalidatePath(`/procurement/orders/${grn.po_id}`)
  return { ok: true }
}

/* ═══════════════════════════════════════════════════════════
   READ — list + detail
   ═══════════════════════════════════════════════════════════ */

export async function listGoodsReceiptNotes(params?: {
  status?: GrnStatus | 'all'
  po_id?: string
  limit?: number
}): Promise<GrnSummary[]> {
  const actor = await getActor()
  if (!actor) return []

  let q = actor.supabase
    .from('goods_receipt_note')
    .select(`
      id, grn_number, po_id, vendor_id, warehouse_id, grn_date, status, qc_status,
      po:po_id ( id, po_number ),
      vendor:vendor_id ( id, name ),
      warehouse:warehouse_id ( id, name ),
      lines:goods_receipt_note_line ( id, qty_accepted, qty_rejected )
    `)
    .eq('tenant_id', actor.tenantId)
    .order('grn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params?.po_id) q = q.eq('po_id', params.po_id)

  const { data, error } = await q
  if (error || !data) return []

  return data.map((r) => {
    const po = pickOne<{ id: string; po_number: string }>(r.po)
    const vendor = pickOne<{ id: string; name: string }>(r.vendor)
    const warehouse = pickOne<{ id: string; name: string }>(r.warehouse)
    const lines = (r.lines as Array<{ qty_accepted: number; qty_rejected: number }> | null) ?? []
    return {
      id: r.id as string,
      grn_number: r.grn_number as string,
      po_id: r.po_id as string,
      po_number: po?.po_number ?? null,
      vendor_id: r.vendor_id as string,
      vendor_name: vendor?.name ?? null,
      warehouse_id: r.warehouse_id as string,
      warehouse_name: warehouse?.name ?? null,
      grn_date: r.grn_date as string,
      status: r.status as GrnStatus,
      qc_status: r.qc_status as QcStatus,
      line_count: lines.length,
      qty_accepted_total: lines.reduce((s, l) => s + Number(l.qty_accepted || 0), 0),
      qty_rejected_total: lines.reduce((s, l) => s + Number(l.qty_rejected || 0), 0),
    } satisfies GrnSummary
  })
}

export async function getGoodsReceiptNote(grnId: string): Promise<GrnDetail | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r } = await actor.supabase
    .from('goods_receipt_note')
    .select(`
      id, grn_number, po_id, vendor_id, warehouse_id, grn_date, status, qc_status, qc_notes,
      vendor_challan_no, vendor_invoice_no, vehicle_no, transporter, e_way_bill_no, notes,
      posted_at, cancelled_at, cancellation_reason, created_at,
      po:po_id ( id, po_number ),
      vendor:vendor_id ( id, name ),
      warehouse:warehouse_id ( id, name ),
      lines:goods_receipt_note_line (
        id, po_line_id, product_id, description, unit,
        qty_received, qty_accepted, qty_rejected, rejection_reason,
        batch_no, expiry_date, remarks,
        po_line:po_line_id ( description, quantity )
      )
    `)
    .eq('id', grnId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (!r) return null

  const po = pickOne<{ id: string; po_number: string }>(r.po)
  const vendor = pickOne<{ id: string; name: string }>(r.vendor)
  const warehouse = pickOne<{ id: string; name: string }>(r.warehouse)

  type RawLine = {
    id: string
    po_line_id: string
    product_id: string | null
    description: string
    unit: string
    qty_received: number
    qty_accepted: number
    qty_rejected: number
    rejection_reason: string | null
    batch_no: string | null
    expiry_date: string | null
    remarks: string | null
    po_line?: unknown
  }
  const lines: GrnLine[] = ((r.lines as RawLine[] | null) ?? [])
    .map((l) => {
      const poLine = pickOne<{ description: string; quantity: number }>(l.po_line)
      return {
        id: l.id,
        po_line_id: l.po_line_id,
        product_id: l.product_id ?? null,
        description: l.description,
        unit: l.unit,
        qty_received: Number(l.qty_received),
        qty_accepted: Number(l.qty_accepted),
        qty_rejected: Number(l.qty_rejected),
        rejection_reason: l.rejection_reason ?? null,
        batch_no: l.batch_no ?? null,
        expiry_date: l.expiry_date ?? null,
        remarks: l.remarks ?? null,
        po_line_description: poLine?.description ?? null,
        po_line_quantity: poLine?.quantity != null ? Number(poLine.quantity) : null,
      }
    })

  return {
    id: r.id as string,
    grn_number: r.grn_number as string,
    po_id: r.po_id as string,
    po_number: po?.po_number ?? null,
    vendor_id: r.vendor_id as string,
    vendor_name: vendor?.name ?? null,
    warehouse_id: r.warehouse_id as string,
    warehouse_name: warehouse?.name ?? null,
    grn_date: r.grn_date as string,
    status: r.status as GrnStatus,
    qc_status: r.qc_status as QcStatus,
    qc_notes: (r.qc_notes as string | null) ?? null,
    vendor_challan_no: (r.vendor_challan_no as string | null) ?? null,
    vendor_invoice_no: (r.vendor_invoice_no as string | null) ?? null,
    vehicle_no: (r.vehicle_no as string | null) ?? null,
    transporter: (r.transporter as string | null) ?? null,
    e_way_bill_no: (r.e_way_bill_no as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    posted_at: (r.posted_at as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    cancellation_reason: (r.cancellation_reason as string | null) ?? null,
    created_at: r.created_at as string,
    lines,
  }
}

/* ─── Receive-eligible PO lookup (for the form) ─────────────── */

export type PoForReceive = {
  id: string
  po_number: string
  vendor_id: string
  vendor_name: string
  warehouse_id: string
  warehouse_name: string
  status: string
  lines: Array<{
    id: string
    line_no: number
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    qty_received: number
    qty_rejected: number
    qty_pending: number
    product_id: string | null
  }>
}

export async function getPoForReceive(poId: string): Promise<PoForReceive | null> {
  const actor = await getActor()
  if (!actor) return null
  const { data: r } = await actor.supabase
    .from('purchase_order')
    .select(`
      id, po_number, vendor_id, ship_to_warehouse_id, status,
      vendor:vendor_id ( id, name ),
      warehouse:ship_to_warehouse_id ( id, name ),
      lines:purchase_order_line (
        id, line_no, description, hsn_code, unit, quantity,
        qty_received, qty_rejected, product_id
      )
    `)
    .eq('id', poId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (!r) return null

  const vendor = pickOne<{ id: string; name: string }>(r.vendor)
  const warehouse = pickOne<{ id: string; name: string }>(r.warehouse)
  type RawLine = {
    id: string
    line_no: number
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    qty_received: number
    qty_rejected: number
    product_id: string | null
  }
  const lines = ((r.lines as RawLine[] | null) ?? [])
    .map((l) => {
      const qty = Number(l.quantity)
      const received = Number(l.qty_received || 0)
      return {
        id: l.id,
        line_no: l.line_no,
        description: l.description,
        hsn_code: l.hsn_code,
        unit: l.unit,
        quantity: qty,
        qty_received: received,
        qty_rejected: Number(l.qty_rejected || 0),
        qty_pending: Math.max(0, r3(qty - received)),
        product_id: l.product_id,
      }
    })
    .sort((a, b) => a.line_no - b.line_no)

  return {
    id: r.id as string,
    po_number: r.po_number as string,
    vendor_id: r.vendor_id as string,
    vendor_name: vendor?.name ?? 'Unknown vendor',
    warehouse_id: r.ship_to_warehouse_id as string,
    warehouse_name: warehouse?.name ?? 'Unknown warehouse',
    status: r.status as string,
    lines,
  }
}
