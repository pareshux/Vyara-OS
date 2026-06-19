'use server'

/** ─────────────────────────────────────────────────────────────
 *  Expenses — FO-5 / Blueprint FIN-006 + FIN-007
 *
 *  Multi-category expense capture for reps. Vehicle reimbursement
 *  (km × rate) already lives on field_attendance; this module adds
 *  everything else — fuel, tolls, food, parking, accommodation, …
 *
 *  Lifecycle:
 *    draft → submitted → approved | rejected → exported
 *    draft → cancelled
 *
 *  Approval wiring (FO-4):
 *    On `submitExpense`:
 *      - findMatchingPolicy(entity_type='expense', amount=row.amount)
 *      - if a policy matches → engine creates approval_request;
 *        we store the id on expense; status='submitted'
 *      - if no policy + autoApproveIfNoPolicy=true → status='approved'
 *        with no approval_request_id (default — small expenses don't
 *        need a queue item)
 *
 *  Receipts come from PLAT-013 attachments
 *  (entity_type='expense', kind='receipt').
 *  ───────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'
import { requestApproval } from './approvals'

export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'exported'

export type ExpenseCategory = {
  id: string
  code: string
  label: string
  icon_key: string | null
  sort_order: number
  // Whether this is a tenant override (true) or a system row (false).
  is_tenant: boolean
}

export type ExpenseRow = {
  id: string
  user_id: string
  user_name: string | null
  expense_date: string
  category_id: string
  category_label: string
  category_code: string
  category_icon: string | null
  amount: number
  notes: string | null
  subject_type: string | null
  subject_id: string | null
  subject_label: string | null
  status: ExpenseStatus
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  exported_at: string | null
  approval_request_id: string | null
  created_at: string
}

async function getActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return {
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id as string,
    role: profile.role as string,
    fullName: profile.full_name as string,
  }
}

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

/* ─────────────────────────────────────────────────────────────
   listExpenseCategories — system + tenant overrides, sorted.
   Tenant overrides with the same `code` shadow the system row.
   ──────────────────────────────────────────────────────────── */
export async function listExpenseCategories(): Promise<
  | { ok: true; categories: ExpenseCategory[] }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data, error } = await actor.supabase
    .from('expense_category')
    .select('id, tenant_id, code, label, icon_key, sort_order, is_active')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) return { ok: false, error: error.message }

  type Row = {
    id: string
    tenant_id: string | null
    code: string
    label: string
    icon_key: string | null
    sort_order: number
    is_active: boolean
  }
  const rows = (data ?? []) as Row[]

  // Tenant rows shadow system rows on the same `code`.
  const byCode = new Map<string, ExpenseCategory>()
  for (const r of rows.filter((x) => x.tenant_id === null)) {
    byCode.set(r.code, {
      id: r.id,
      code: r.code,
      label: r.label,
      icon_key: r.icon_key,
      sort_order: r.sort_order,
      is_tenant: false,
    })
  }
  for (const r of rows.filter((x) => x.tenant_id !== null)) {
    byCode.set(r.code, {
      id: r.id,
      code: r.code,
      label: r.label,
      icon_key: r.icon_key,
      sort_order: r.sort_order,
      is_tenant: true,
    })
  }
  return {
    ok: true,
    categories: [...byCode.values()].sort((a, b) => a.sort_order - b.sort_order),
  }
}

/* ─────────────────────────────────────────────────────────────
   createExpense — draft row. The receipt photo is uploaded
   separately via AttachmentUploadButton against
   (entity_type='expense', entity_id=<this id>).
   ──────────────────────────────────────────────────────────── */
export async function createExpense(input: {
  categoryId: string
  amount: number
  expenseDate: string                    // 'yyyy-MM-dd' (IST conceptual)
  notes?: string | null
  subjectType?: 'field_visit' | 'project' | 'lead' | 'firm' | null
  subjectId?: string | null
  forUserId?: string                     // admin/manager can log on behalf of a rep
}): Promise<{ ok: true; expenseId: string } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero' }
  }

  const targetUserId = input.forUserId ?? actor.userId
  if (targetUserId !== actor.userId && !isAdminish(actor.role)) {
    return { ok: false, error: 'You can only log your own expenses' }
  }

  const subjectType = input.subjectType ?? null
  const subjectId = input.subjectId ?? null
  if (Boolean(subjectType) !== Boolean(subjectId)) {
    return { ok: false, error: 'subject_type and subject_id must both be set or both null' }
  }

  const { data, error } = await actor.supabase
    .from('expense')
    .insert({
      tenant_id: actor.tenantId,
      user_id: targetUserId,
      expense_date: input.expenseDate,
      category_id: input.categoryId,
      amount: input.amount,
      notes: input.notes ?? null,
      subject_type: subjectType,
      subject_id: subjectId,
      status: 'draft',
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select('id')
    .single()

  if (error || !data) {
    captureError(error ?? new Error('expense insert failed'), {
      action_name: 'createExpense',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    return { ok: false, error: error?.message ?? 'Could not create expense' }
  }

  revalidatePath('/expenses')
  if (subjectType === 'field_visit' && subjectId) {
    revalidatePath(`/field/visits/${subjectId}`)
  }
  return { ok: true, expenseId: data.id as string }
}

/* ─────────────────────────────────────────────────────────────
   submitExpense — submit a draft. Raises an approval request if
   a matching policy exists; else auto-approves.
   ──────────────────────────────────────────────────────────── */
export async function submitExpense(
  expenseId: string,
): Promise<
  | { ok: true; status: ExpenseStatus; approvalRequestId: string | null }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: row } = await actor.supabase
    .from('expense')
    .select('id, user_id, amount, status, subject_type, subject_id')
    .eq('id', expenseId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Expense not found' }
  if (row.status !== 'draft') return { ok: false, error: `Expense already ${row.status}` }
  if (row.user_id !== actor.userId && !isAdminish(actor.role)) {
    return { ok: false, error: 'Permission denied' }
  }

  // Engine: request approval (auto-approve when no policy).
  const ar = await requestApproval({
    entityType: 'expense',
    entityId: row.id,
    amount: Number(row.amount),
    subjectUserId: row.user_id,
    notes: null,
    autoApproveIfNoPolicy: true,
  })
  if (!ar.ok) return { ok: false, error: ar.error }

  const nextStatus: ExpenseStatus = ar.autoApproved ? 'approved' : 'submitted'
  const now = new Date().toISOString()

  const { error } = await actor.supabase
    .from('expense')
    .update({
      status: nextStatus,
      submitted_at: now,
      approved_at: ar.autoApproved ? now : null,
      approval_request_id: ar.autoApproved ? null : ar.requestId,
      updated_at: now,
      updated_by: actor.userId,
    })
    .eq('id', expenseId)

  if (error) {
    captureError(error, {
      action_name: 'submitExpense',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_id: expenseId,
    })
    return { ok: false, error: error.message }
  }

  revalidatePath('/expenses')
  if (row.subject_type === 'field_visit' && row.subject_id) {
    revalidatePath(`/field/visits/${row.subject_id}`)
  }
  return {
    ok: true,
    status: nextStatus,
    approvalRequestId: ar.autoApproved ? null : ar.requestId,
  }
}

/* ─────────────────────────────────────────────────────────────
   cancelExpenseDraft — soft-delete a draft. Approved/exported
   rows are immutable from the rep side (admin can override via
   a future correction action — not in this slice).
   ──────────────────────────────────────────────────────────── */
export async function cancelExpenseDraft(
  expenseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: row } = await actor.supabase
    .from('expense')
    .select('id, user_id, status')
    .eq('id', expenseId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Expense not found' }
  if (row.user_id !== actor.userId && !isAdminish(actor.role)) {
    return { ok: false, error: 'Permission denied' }
  }
  if (row.status !== 'draft') return { ok: false, error: `Cannot cancel ${row.status} expense` }

  const { error } = await actor.supabase
    .from('expense')
    .update({
      status: 'cancelled',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    })
    .eq('id', expenseId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/expenses')
  return { ok: true }
}

/* ─────────────────────────────────────────────────────────────
   syncExpenseFromApproval — reconcile expense.status with its
   linked approval_request.status. Called at read time (cheap
   denormalisation; no Inngest dependency).
   ──────────────────────────────────────────────────────────── */
async function syncExpenseFromApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  expense: { id: string; status: ExpenseStatus; approval_request_id: string | null; user_id: string },
): Promise<ExpenseStatus> {
  if (expense.status !== 'submitted' || !expense.approval_request_id) return expense.status

  const { data: ar } = await supabase
    .from('approval_request')
    .select('status, decided_at, decided_by_summary')
    .eq('id', expense.approval_request_id)
    .maybeSingle()
  if (!ar) return expense.status

  if (ar.status === 'approved') {
    await supabase
      .from('expense')
      .update({ status: 'approved', approved_at: ar.decided_at ?? new Date().toISOString() })
      .eq('id', expense.id)
    return 'approved'
  }
  if (ar.status === 'rejected') {
    await supabase
      .from('expense')
      .update({
        status: 'rejected',
        rejected_at: ar.decided_at ?? new Date().toISOString(),
        rejection_reason: ar.decided_by_summary ?? null,
      })
      .eq('id', expense.id)
    return 'rejected'
  }
  if (ar.status === 'cancelled') {
    await supabase
      .from('expense')
      .update({ status: 'cancelled' })
      .eq('id', expense.id)
    return 'cancelled'
  }
  return expense.status
}

/* ─────────────────────────────────────────────────────────────
   listMyExpenses — reps see their own; managers see team.
   Filterable by status + date range. Reconciles each row's
   status with its linked approval_request lazily.
   ──────────────────────────────────────────────────────────── */
export async function listMyExpenses(input?: {
  fromDate?: string                       // 'yyyy-MM-dd'
  toDate?: string
  status?: ExpenseStatus | 'all_pending' | 'all'
  userId?: string                         // admin/manager filtering
}): Promise<
  | { ok: true; expenses: ExpenseRow[]; totalAmount: number }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  let query = actor.supabase
    .from('expense')
    .select(
      `id, user_id, expense_date, category_id, amount, notes,
       subject_type, subject_id, status, submitted_at, approved_at,
       rejected_at, rejection_reason, exported_at, approval_request_id, created_at,
       user:user_profile!expense_user_id_fkey(full_name),
       category:expense_category!inner(id, code, label, icon_key)`,
    )
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  // Scope. Reps to own; managers/admins default to "team", but can pass
  // userId to filter to one rep.
  if (isAdminish(actor.role)) {
    if (input?.userId) query = query.eq('user_id', input.userId)
  } else {
    query = query.eq('user_id', actor.userId)
  }

  if (input?.fromDate) query = query.gte('expense_date', input.fromDate)
  if (input?.toDate) query = query.lte('expense_date', input.toDate)
  if (input?.status === 'all_pending') {
    query = query.in('status', ['submitted', 'approved'])
  } else if (input?.status && input.status !== 'all') {
    query = query.eq('status', input.status)
  }

  const { data, error } = await query
  if (error) {
    captureError(error, { action_name: 'listMyExpenses', tenant_id: actor.tenantId, user_id: actor.userId })
    return { ok: false, error: error.message }
  }

  type RawRow = {
    id: string
    user_id: string
    expense_date: string
    category_id: string
    amount: string | number
    notes: string | null
    subject_type: string | null
    subject_id: string | null
    status: ExpenseStatus
    submitted_at: string | null
    approved_at: string | null
    rejected_at: string | null
    rejection_reason: string | null
    exported_at: string | null
    approval_request_id: string | null
    created_at: string
    user: { full_name: string | null } | { full_name: string | null }[] | null
    category: { id: string; code: string; label: string; icon_key: string | null } | { id: string; code: string; label: string; icon_key: string | null }[]
  }
  const rows = (data ?? []) as unknown as RawRow[]

  const out: ExpenseRow[] = []
  let total = 0
  for (const r of rows) {
    const userRow = Array.isArray(r.user) ? r.user[0] ?? null : r.user
    const catRow = Array.isArray(r.category) ? r.category[0] : r.category

    // Lazy reconciliation with approval_request.
    let status: ExpenseStatus = r.status
    if (r.status === 'submitted' && r.approval_request_id) {
      status = await syncExpenseFromApproval(actor.supabase, {
        id: r.id,
        status: r.status,
        approval_request_id: r.approval_request_id,
        user_id: r.user_id,
      })
    }

    const amount = Number(r.amount)
    total += amount

    out.push({
      id: r.id,
      user_id: r.user_id,
      user_name: userRow?.full_name ?? null,
      expense_date: r.expense_date,
      category_id: r.category_id,
      category_label: catRow.label,
      category_code: catRow.code,
      category_icon: catRow.icon_key,
      amount,
      notes: r.notes,
      subject_type: r.subject_type,
      subject_id: r.subject_id,
      subject_label: null,                  // resolved by caller if needed
      status,
      submitted_at: r.submitted_at,
      approved_at: r.approved_at,
      rejected_at: r.rejected_at,
      rejection_reason: r.rejection_reason,
      exported_at: r.exported_at,
      approval_request_id: r.approval_request_id,
      created_at: r.created_at,
    })
  }

  return { ok: true, expenses: out, totalAmount: total }
}

/* ─────────────────────────────────────────────────────────────
   getExpense — single-row detail.
   ──────────────────────────────────────────────────────────── */
export async function getExpense(
  expenseId: string,
): Promise<{ ok: true; expense: ExpenseRow } | { ok: false; error: string }> {
  const result = await listMyExpenses({ status: 'all' })
  // listMyExpenses already scopes to actor; reuse for simplicity.
  // (Premature optimisation here would cost more in branches than it saves.)
  if (!result.ok) return result
  const hit = result.expenses.find((e) => e.id === expenseId)
  if (!hit) return { ok: false, error: 'Expense not found' }
  return { ok: true, expense: hit }
}
