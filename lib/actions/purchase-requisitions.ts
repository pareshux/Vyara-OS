'use server'

/* ─────────────────────────────────────────────────────────────
   Purchase Requisition server actions — Phase 4α (DEL-015).

   The "I need X for Y project" demand-capture step. Sits before
   the PO in the procurement chain:

     PR (this slice)          [P4α]
     → RFQ                    [P4β — not built]
     → Comparative Statement  [P4γ — not built]
     → PO                     [P1α — shipped]

   For v1 the PR is independent — clicking "Raise PO from this PR"
   on the detail page (P4β work) will pre-fill the PO form and link
   back. Until then, approved PRs sit as a request log.

   State machine:
     draft → submitted → approved      (or rejected)
     draft → cancelled
     approved → po_raised               (set by P4β PR→PO conversion)
   ──────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'
import { requestApproval } from './approvals'

export type PrStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'po_raised'

export type PrLineInput = {
  product_id?: string | null
  description: string
  hsn_code?: string | null
  unit?: string
  quantity: number
  estimated_rate: number
  preferred_vendor_id?: string | null
  specifications?: string
}

export type PrSummary = {
  id: string
  pr_number: string
  project_id: string | null
  project_name: string | null
  cost_center: string | null
  requested_by: string | null
  requested_by_name: string | null
  required_by_date: string | null
  estimated_value: number
  status: PrStatus
  approval_request_id: string | null
  linked_po_id: string | null
  linked_po_number: string | null
  line_count: number
  created_at: string
}

export type PrLine = {
  id: string
  line_no: number
  product_id: string | null
  product_sku: string | null
  product_name: string | null
  description: string
  hsn_code: string | null
  unit: string
  quantity: number
  estimated_rate: number
  estimated_value: number
  preferred_vendor_id: string | null
  preferred_vendor_name: string | null
  specifications: string | null
}

export type PrDetail = {
  id: string
  pr_number: string
  project_id: string | null
  project_name: string | null
  cost_center: string | null
  requested_by: string | null
  requested_by_name: string | null
  required_by_date: string | null
  justification: string | null
  notes: string | null
  estimated_value: number
  status: PrStatus
  approval_request_id: string | null
  linked_po_id: string | null
  linked_po_number: string | null
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  approved_by_name: string | null
  rejected_at: string | null
  rejected_by: string | null
  rejection_reason: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  lines: PrLine[]
}

/* ─── Helpers ───────────────────────────────────────────────── */

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
   CREATE
   ═══════════════════════════════════════════════════════════ */

export async function createPurchaseRequisition(params: {
  project_id?: string | null
  cost_center?: string
  required_by_date?: string | null
  justification?: string
  notes?: string
  lines: PrLineInput[]
  submit_immediately?: boolean
}): Promise<{ ok: true; id: string; pr_number: string; status: PrStatus } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  // Anyone (incl. sales_engineer / dealer roles) can RAISE a PR — but
  // approval threshold still gates spend. v1 limits to admin/manager
  // for simplicity; rep self-service PR is a v2 nicety.
  if (!isAdminish(actor.role)) return { ok: false, error: 'Only admins or managers can create requisitions' }
  if (!params.lines || params.lines.length === 0) return { ok: false, error: 'At least one line is required' }

  let estimatedValue = 0
  type SanitisedLine = {
    line_no: number
    product_id: string | null
    description: string
    hsn_code: string | null
    unit: string
    quantity: number
    estimated_rate: number
    estimated_value: number
    preferred_vendor_id: string | null
    specifications: string | null
  }
  const sanitised: SanitisedLine[] = []

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i]
    const qty = Number(line.quantity)
    const rate = Number(line.estimated_rate)
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: `Line ${i + 1}: quantity must be > 0` }
    if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: `Line ${i + 1}: estimated rate must be ≥ 0` }
    if (!line.description.trim()) return { ok: false, error: `Line ${i + 1}: description is required` }

    const value = r2(qty * rate)
    estimatedValue = r2(estimatedValue + value)

    sanitised.push({
      line_no: i + 1,
      product_id: line.product_id ?? null,
      description: line.description.trim(),
      hsn_code: line.hsn_code?.trim() || null,
      unit: line.unit?.trim() || 'nos',
      quantity: r3(qty),
      estimated_rate: r2(rate),
      estimated_value: value,
      preferred_vendor_id: line.preferred_vendor_id ?? null,
      specifications: line.specifications?.trim() || null,
    })
  }

  const { data: pr, error: prErr } = await actor.supabase
    .from('purchase_requisition')
    .insert({
      tenant_id: actor.tenantId,
      project_id: params.project_id ?? null,
      cost_center: params.cost_center?.trim() || null,
      requested_by: actor.userId,
      required_by_date: params.required_by_date ?? null,
      justification: params.justification?.trim() || null,
      notes: params.notes?.trim() || null,
      estimated_value: estimatedValue,
      status: 'draft',
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id, pr_number')
    .single()

  if (prErr || !pr) {
    captureError(prErr ?? new Error('PR insert returned no row'), {
      action_name: 'createPurchaseRequisition',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    return { ok: false, error: prErr?.message ?? 'Could not create requisition' }
  }

  const linePayload = sanitised.map((s) => ({ ...s, tenant_id: actor.tenantId, pr_id: pr.id }))
  const { error: lineErr } = await actor.supabase
    .from('purchase_requisition_line')
    .insert(linePayload)

  if (lineErr) {
    await actor.supabase
      .from('purchase_requisition')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', pr.id)
    captureError(lineErr, {
      action_name: 'createPurchaseRequisition.lines',
      tenant_id: actor.tenantId,
      entity_id: pr.id as string,
    })
    return { ok: false, error: `Failed to create PR lines: ${lineErr.message}` }
  }

  revalidatePath('/procurement/requisitions')
  revalidatePath('/procurement')

  if (params.submit_immediately) {
    const sub = await submitPurchaseRequisition(pr.id as string)
    if (!sub.ok) {
      return { ok: false, error: `PR saved as draft (${pr.pr_number as string}); submit failed: ${sub.error}` }
    }
    return { ok: true, id: pr.id as string, pr_number: pr.pr_number as string, status: sub.status }
  }

  return { ok: true, id: pr.id as string, pr_number: pr.pr_number as string, status: 'draft' }
}

/* ═══════════════════════════════════════════════════════════
   SUBMIT — raises approval; auto-approves under threshold
   ═══════════════════════════════════════════════════════════ */

export async function submitPurchaseRequisition(
  prId: string,
): Promise<{ ok: true; status: PrStatus; approvalRequestId: string | null } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }

  const { data: pr } = await actor.supabase
    .from('purchase_requisition')
    .select('id, status, estimated_value, requested_by')
    .eq('id', prId)
    .maybeSingle()
  if (!pr) return { ok: false, error: 'Requisition not found' }
  if (pr.status !== 'draft') return { ok: false, error: `Requisition is already ${pr.status as string}` }

  const ar = await requestApproval({
    entityType: 'purchase_requisition',
    entityId: pr.id as string,
    amount: Number(pr.estimated_value),
    subjectUserId: (pr.requested_by as string | null) ?? actor.userId,
    autoApproveIfNoPolicy: true,
  })
  if (!ar.ok) return { ok: false, error: ar.error }

  const now = new Date().toISOString()
  const nextStatus: PrStatus = ar.autoApproved ? 'approved' : 'submitted'

  const { error } = await actor.supabase
    .from('purchase_requisition')
    .update({
      status: nextStatus,
      submitted_at: now,
      approved_at: ar.autoApproved ? now : null,
      approved_by: ar.autoApproved ? actor.userId : null,
      approval_request_id: ar.autoApproved ? null : ar.requestId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', prId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/requisitions')
  revalidatePath(`/procurement/requisitions/${prId}`)
  return { ok: true, status: nextStatus, approvalRequestId: ar.autoApproved ? null : ar.requestId }
}

/* ═══════════════════════════════════════════════════════════
   SYNC — read-time approval reconciliation
   ═══════════════════════════════════════════════════════════ */

async function syncPrFromApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pr: { id: string; status: PrStatus; approval_request_id: string | null },
): Promise<PrStatus> {
  if (pr.status !== 'submitted' || !pr.approval_request_id) return pr.status

  const { data: ar } = await supabase
    .from('approval_request')
    .select('status')
    .eq('id', pr.approval_request_id)
    .maybeSingle()
  if (!ar) return pr.status

  const arStatus = ar.status as string
  const now = new Date().toISOString()

  if (arStatus === 'approved') {
    await supabase
      .from('purchase_requisition')
      .update({ status: 'approved', approved_at: now, updated_at: now })
      .eq('id', pr.id)
    return 'approved'
  } else if (arStatus === 'rejected') {
    await supabase
      .from('purchase_requisition')
      .update({
        status: 'rejected',
        rejected_at: now,
        rejection_reason: 'Rejected via approval',
        updated_at: now,
      })
      .eq('id', pr.id)
    return 'rejected'
  }
  return pr.status
}

/* ═══════════════════════════════════════════════════════════
   CANCEL — draft-only
   ═══════════════════════════════════════════════════════════ */

export async function cancelPurchaseRequisition(
  prId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!isAdminish(actor.role)) return { ok: false, error: 'Permission denied' }
  if (!reason.trim()) return { ok: false, error: 'Cancellation reason is required' }

  const { data: pr } = await actor.supabase
    .from('purchase_requisition')
    .select('id, status')
    .eq('id', prId)
    .maybeSingle()
  if (!pr) return { ok: false, error: 'Requisition not found' }
  if (pr.status !== 'draft') return { ok: false, error: `Cannot cancel ${pr.status as string} requisition. Submitted PRs need approval to be rejected.` }

  const now = new Date().toISOString()
  const { error } = await actor.supabase
    .from('purchase_requisition')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: actor.userId,
      cancellation_reason: reason.trim(),
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', prId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/procurement/requisitions')
  revalidatePath(`/procurement/requisitions/${prId}`)
  return { ok: true }
}

/* ═══════════════════════════════════════════════════════════
   READ — list + detail + form pickers
   ═══════════════════════════════════════════════════════════ */

export async function listPurchaseRequisitions(params?: {
  status?: PrStatus | 'all'
  project_id?: string
  requested_by?: string
  limit?: number
}): Promise<PrSummary[]> {
  const actor = await getActor()
  if (!actor) return []

  let q = actor.supabase
    .from('purchase_requisition')
    .select(`
      id, pr_number, project_id, cost_center, requested_by,
      required_by_date, estimated_value, status, approval_request_id,
      linked_po_id, created_at,
      project:project_id ( id, name ),
      requester:requested_by ( id, full_name ),
      linked_po:linked_po_id ( id, po_number ),
      lines:purchase_requisition_line ( id )
    `)
    .eq('tenant_id', actor.tenantId)
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.status && params.status !== 'all') q = q.eq('status', params.status)
  if (params?.project_id) q = q.eq('project_id', params.project_id)
  if (params?.requested_by) q = q.eq('requested_by', params.requested_by)

  const { data, error } = await q
  if (error || !data) return []

  return Promise.all(data.map(async (r) => {
    const synced = await syncPrFromApproval(actor.supabase, {
      id: r.id as string,
      status: r.status as PrStatus,
      approval_request_id: (r.approval_request_id as string | null) ?? null,
    })
    const project = pickOne<{ id: string; name: string }>(r.project)
    const requester = pickOne<{ id: string; full_name: string }>(r.requester)
    const linkedPo = pickOne<{ id: string; po_number: string }>(r.linked_po)
    const lines = (r.lines as Array<{ id: string }> | null) ?? []
    return {
      id: r.id as string,
      pr_number: r.pr_number as string,
      project_id: (r.project_id as string | null) ?? null,
      project_name: project?.name ?? null,
      cost_center: (r.cost_center as string | null) ?? null,
      requested_by: (r.requested_by as string | null) ?? null,
      requested_by_name: requester?.full_name ?? null,
      required_by_date: (r.required_by_date as string | null) ?? null,
      estimated_value: Number(r.estimated_value ?? 0),
      status: synced,
      approval_request_id: (r.approval_request_id as string | null) ?? null,
      linked_po_id: (r.linked_po_id as string | null) ?? null,
      linked_po_number: linkedPo?.po_number ?? null,
      line_count: lines.length,
      created_at: r.created_at as string,
    } satisfies PrSummary
  }))
}

export async function getPurchaseRequisition(prId: string): Promise<PrDetail | null> {
  const actor = await getActor()
  if (!actor) return null

  const { data: r } = await actor.supabase
    .from('purchase_requisition')
    .select(`
      id, pr_number, project_id, cost_center, requested_by,
      required_by_date, justification, notes,
      estimated_value, status, approval_request_id, linked_po_id,
      submitted_at, approved_at, approved_by, rejected_at, rejected_by,
      rejection_reason, cancelled_at, cancellation_reason, created_at,
      project:project_id ( id, name ),
      requester:requested_by ( id, full_name ),
      approver:approved_by ( id, full_name ),
      linked_po:linked_po_id ( id, po_number ),
      lines:purchase_requisition_line (
        id, line_no, product_id, description, hsn_code, unit,
        quantity, estimated_rate, estimated_value,
        preferred_vendor_id, specifications,
        product:product_id ( id, sku_code, name ),
        preferred_vendor:preferred_vendor_id ( id, name )
      )
    `)
    .eq('id', prId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()

  if (!r) return null

  const synced = await syncPrFromApproval(actor.supabase, {
    id: r.id as string,
    status: r.status as PrStatus,
    approval_request_id: (r.approval_request_id as string | null) ?? null,
  })

  const project = pickOne<{ id: string; name: string }>(r.project)
  const requester = pickOne<{ id: string; full_name: string }>(r.requester)
  const approver = pickOne<{ id: string; full_name: string }>(r.approver)
  const linkedPo = pickOne<{ id: string; po_number: string }>(r.linked_po)

  type RawLine = {
    id: string; line_no: number; product_id: string | null
    description: string; hsn_code: string | null; unit: string
    quantity: number; estimated_rate: number; estimated_value: number
    preferred_vendor_id: string | null; specifications: string | null
    product?: unknown; preferred_vendor?: unknown
  }
  const lines: PrLine[] = ((r.lines as RawLine[] | null) ?? [])
    .map((l) => {
      const product = pickOne<{ id: string; sku_code: string; name: string }>(l.product)
      const vendor = pickOne<{ id: string; name: string }>(l.preferred_vendor)
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
        estimated_rate: Number(l.estimated_rate),
        estimated_value: Number(l.estimated_value),
        preferred_vendor_id: l.preferred_vendor_id,
        preferred_vendor_name: vendor?.name ?? null,
        specifications: l.specifications,
      }
    })
    .sort((a, b) => a.line_no - b.line_no)

  return {
    id: r.id as string,
    pr_number: r.pr_number as string,
    project_id: (r.project_id as string | null) ?? null,
    project_name: project?.name ?? null,
    cost_center: (r.cost_center as string | null) ?? null,
    requested_by: (r.requested_by as string | null) ?? null,
    requested_by_name: requester?.full_name ?? null,
    required_by_date: (r.required_by_date as string | null) ?? null,
    justification: (r.justification as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    estimated_value: Number(r.estimated_value ?? 0),
    status: synced,
    approval_request_id: (r.approval_request_id as string | null) ?? null,
    linked_po_id: (r.linked_po_id as string | null) ?? null,
    linked_po_number: linkedPo?.po_number ?? null,
    submitted_at: (r.submitted_at as string | null) ?? null,
    approved_at: (r.approved_at as string | null) ?? null,
    approved_by: (r.approved_by as string | null) ?? null,
    approved_by_name: approver?.full_name ?? null,
    rejected_at: (r.rejected_at as string | null) ?? null,
    rejected_by: (r.rejected_by as string | null) ?? null,
    rejection_reason: (r.rejection_reason as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    cancellation_reason: (r.cancellation_reason as string | null) ?? null,
    created_at: r.created_at as string,
    lines,
  }
}

/* ─── Form pickers ─────────────────────────────────────────── */

export async function listProjectsForPrPicker(): Promise<Array<{ id: string; name: string }>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('project')
    .select('id, name')
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }))
}

export async function listProductsForPrPicker(): Promise<Array<{ id: string; sku_code: string; name: string; unit: string }>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('product')
    .select('id, sku_code, name, unit, is_active')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true)
    .order('name')
    .limit(500)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    sku_code: r.sku_code as string,
    name: r.name as string,
    unit: r.unit as string,
  }))
}

export async function listVendorsForPrPicker(): Promise<Array<{ id: string; name: string; code: string }>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('vendor')
    .select('id, name, code, is_active')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true)
    .order('name')
    .limit(500)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.code as string,
  }))
}
