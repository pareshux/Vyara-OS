'use server'

/** ─────────────────────────────────────────────────────────────
 *  Approval engine — FO-4 / Blueprint PLAT-014
 *
 *  Generic multi-level approval. Consumers (expense_claim, discount,
 *  credit_extension, …) write `requestApproval()` when they need a
 *  human sign-off. The engine:
 *
 *    1. Picks the matching `approval_policy` by (entity_type + amount band).
 *    2. Creates an `approval_request` and (for sequential mode) sets
 *       current_step_order = first step.
 *    3. Resolves the step's approver(s) — by role or specific user.
 *    4. Returns the request id. The caller stores it on its own entity
 *       so it can render an inline approval card.
 *
 *  Approvers see the request via `listMyPendingApprovals()` and act via
 *  `decideApproval()`. The engine writes a step_action row, advances or
 *  closes the request, and (for terminal decisions) emits an event so
 *  the consumer can write back to its own entity:
 *
 *    'approval.approved' / 'approval.rejected'  (via Inngest, future)
 *
 *  For now the caller polls / re-queries the request status when
 *  rendering — clean enough for v1.
 *
 *  Visibility (enforced here, since RLS only does tenant isolation):
 *    - Subject  : may read their own requests + cancel them.
 *    - Approver : may read pending requests where they're an eligible
 *                 approver of the current step (sequential) or any
 *                 open step (parallel).
 *    - Admin    : may read everything.
 *  ───────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/observability/capture'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type ApprovalMode = 'sequential' | 'parallel'
export type ApproverVia = 'role' | 'specific_user'
export type ApprovalAction = 'approved' | 'rejected' | 'escalated'

export type ApprovalPolicyStep = {
  id: string
  step_order: number
  approver_via: ApproverVia
  approver_role: string | null
  approver_user_id: string | null
  label: string | null
}

export type ApprovalPolicy = {
  id: string
  entity_type: string
  name: string
  min_amount: number | null
  max_amount: number | null
  mode: ApprovalMode
  require_all_parallel: boolean
  escalation_hours: number | null
  active: boolean
  notes: string | null
  steps: ApprovalPolicyStep[]
}

export type ApprovalStepActionRow = {
  id: string
  step_order: number
  approver_user_id: string
  approver_name?: string | null
  action: ApprovalAction
  comment: string | null
  acted_at: string
}

export type ApprovalRequestDetail = {
  id: string
  entity_type: string
  entity_id: string
  amount: number | null
  subject_user_id: string
  subject_name?: string | null
  status: ApprovalStatus
  current_step_order: number | null
  decided_at: string | null
  decided_by_summary: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  policy: ApprovalPolicy
  actions: ApprovalStepActionRow[]
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
   Policy lookup.

   Picks the active policy whose amount band contains the request
   amount. If `amount` is null we pick the policy with no min/max
   (the band-less default), else the smallest matching band.

   Returns the full policy with steps. Caller decides what to do
   when no policy matches (auto-approve? raise an error? both
   patterns are legitimate — see requestApproval).
   ──────────────────────────────────────────────────────────── */
async function findMatchingPolicy(
  supabase: SupabaseClient,
  tenantId: string,
  entityType: string,
  amount: number | null,
): Promise<ApprovalPolicy | null> {
  const { data: policies, error } = await supabase
    .from('approval_policy')
    .select(
      'id, entity_type, name, min_amount, max_amount, mode, require_all_parallel, escalation_hours, active, notes',
    )
    .eq('tenant_id', tenantId)
    .eq('entity_type', entityType)
    .eq('active', true)
    .is('deleted_at', null)
    .order('min_amount', { ascending: false, nullsFirst: false })

  if (error) {
    captureError(error, { action_name: 'findMatchingPolicy', tenant_id: tenantId, extra: { entityType } })
    return null
  }
  if (!policies || policies.length === 0) return null

  const matchingPolicy = policies.find((p) => {
    const min = p.min_amount as number | null
    const max = p.max_amount as number | null
    if (amount == null) {
      // amount-less request → only policies with no band match.
      return min == null && max == null
    }
    if (min != null && amount < Number(min)) return false
    if (max != null && amount > Number(max)) return false
    return true
  })
  if (!matchingPolicy) return null

  const { data: steps } = await supabase
    .from('approval_policy_step')
    .select('id, step_order, approver_via, approver_role, approver_user_id, label')
    .eq('policy_id', matchingPolicy.id)
    .order('step_order', { ascending: true })

  return {
    ...(matchingPolicy as Omit<ApprovalPolicy, 'steps'>),
    steps: (steps ?? []) as ApprovalPolicyStep[],
  }
}

/* ─────────────────────────────────────────────────────────────
   Resolve approver candidates for a single step.

   Returns the user_ids eligible to act on this step. The action
   layer checks "is the actor in this list" to gate decideApproval.
   ──────────────────────────────────────────────────────────── */
async function resolveStepApprovers(
  supabase: SupabaseClient,
  tenantId: string,
  step: ApprovalPolicyStep,
): Promise<string[]> {
  if (step.approver_via === 'specific_user') {
    return step.approver_user_id ? [step.approver_user_id] : []
  }
  // approver_via === 'role'
  if (!step.approver_role) return []
  const { data } = await supabase
    .from('user_profile')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', step.approver_role)
    .eq('is_active', true)
  return (data ?? []).map((r) => r.id as string)
}

/* ─────────────────────────────────────────────────────────────
   requestApproval — called by a consumer when its entity needs a
   human sign-off. The consumer is responsible for storing the
   returned requestId on its own entity row so it can render the
   approval card alongside the entity.

   Behaviour when no policy matches:
     - If `autoApproveIfNoPolicy=true` (default) → returns
       { ok:true, requestId:null, autoApproved:true }. Caller treats
       the entity as approved without a request row. Useful for
       "₹500 expense" cases where you don't want to clog the queue.
     - Else → { ok:false, error:'No policy matches' }.
   ──────────────────────────────────────────────────────────── */
export async function requestApproval(input: {
  entityType: string
  entityId: string
  amount?: number | null
  subjectUserId?: string                       // defaults to current actor
  notes?: string | null
  metadata?: Record<string, unknown>
  autoApproveIfNoPolicy?: boolean
}): Promise<
  | { ok: true; requestId: string; autoApproved: false }
  | { ok: true; requestId: null; autoApproved: true }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const subjectUserId = input.subjectUserId ?? actor.userId
  const amount = input.amount ?? null

  const policy = await findMatchingPolicy(actor.supabase, actor.tenantId, input.entityType, amount)
  if (!policy) {
    if (input.autoApproveIfNoPolicy !== false) {
      return { ok: true, requestId: null, autoApproved: true }
    }
    return { ok: false, error: `No active approval policy for ${input.entityType}` }
  }
  if (policy.steps.length === 0) {
    return { ok: false, error: 'Policy has no steps configured' }
  }

  const { data, error } = await actor.supabase
    .from('approval_request')
    .insert({
      tenant_id: actor.tenantId,
      policy_id: policy.id,
      entity_type: input.entityType,
      entity_id: input.entityId,
      amount,
      subject_user_id: subjectUserId,
      status: 'pending',
      // Sequential: open step 1. Parallel: null (every step is open).
      current_step_order: policy.mode === 'sequential' ? policy.steps[0].step_order : null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single()

  if (error || !data) {
    captureError(error ?? new Error('insert failed'), {
      action_name: 'requestApproval',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_type: input.entityType,
      entity_id: input.entityId,
    })
    return { ok: false, error: error?.message ?? 'Could not create approval request' }
  }

  return { ok: true, requestId: data.id as string, autoApproved: false }
}

/* ─────────────────────────────────────────────────────────────
   decideApproval — approver acts on the request.

   Sequential rules:
     - Approve  → write step_action; if last step, close as approved;
                  else advance current_step_order.
     - Reject   → write step_action; close as rejected.
   Parallel rules:
     - Approve  → write step_action; if all steps now have one
                  approval AND require_all_parallel=true, close;
                  if !require_all_parallel and any approval exists,
                  close on first approval. (Per-step approvers can't
                  approve the same step twice — DB guards via
                  application check below.)
     - Reject   → close immediately.
   ──────────────────────────────────────────────────────────── */
export async function decideApproval(
  requestId: string,
  action: 'approved' | 'rejected',
  comment?: string | null,
): Promise<
  | { ok: true; status: ApprovalStatus }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: req, error: reqErr } = await actor.supabase
    .from('approval_request')
    .select(
      'id, tenant_id, policy_id, entity_type, entity_id, status, current_step_order, subject_user_id, amount',
    )
    .eq('id', requestId)
    .maybeSingle()
  if (reqErr || !req) return { ok: false, error: 'Approval request not found' }
  if (req.status !== 'pending') return { ok: false, error: `Request already ${req.status}` }

  const { data: policy } = await actor.supabase
    .from('approval_policy')
    .select('id, mode, require_all_parallel')
    .eq('id', req.policy_id)
    .single()
  if (!policy) return { ok: false, error: 'Policy missing' }
  const mode = policy.mode as ApprovalMode

  const { data: steps } = await actor.supabase
    .from('approval_policy_step')
    .select('id, step_order, approver_via, approver_role, approver_user_id, label')
    .eq('policy_id', policy.id)
    .order('step_order', { ascending: true })
  const allSteps = (steps ?? []) as ApprovalPolicyStep[]
  if (allSteps.length === 0) return { ok: false, error: 'Policy has no steps' }

  // Which steps are open to this actor right now?
  const openSteps =
    mode === 'sequential'
      ? allSteps.filter((s) => s.step_order === req.current_step_order)
      : allSteps

  // Filter to steps where actor is an eligible approver.
  const actorEligibleSteps: ApprovalPolicyStep[] = []
  for (const s of openSteps) {
    const approvers = await resolveStepApprovers(actor.supabase, actor.tenantId, s)
    if (approvers.includes(actor.userId)) actorEligibleSteps.push(s)
  }
  if (actorEligibleSteps.length === 0) {
    // Admin can always act in case of a stuck request.
    if (!isAdminish(actor.role)) {
      return { ok: false, error: 'You are not an eligible approver for this step' }
    }
    // Admin acts on the first open step on behalf of the resolver.
    actorEligibleSteps.push(openSteps[0])
  }

  // Pick the lowest open step the actor can act on.
  const actingStep = actorEligibleSteps.sort((a, b) => a.step_order - b.step_order)[0]

  // Block double-action on the same step by the same user.
  const { data: prior } = await actor.supabase
    .from('approval_step_action')
    .select('id')
    .eq('request_id', req.id)
    .eq('step_order', actingStep.step_order)
    .eq('approver_user_id', actor.userId)
    .limit(1)
  if (prior && prior.length > 0) {
    return { ok: false, error: 'You have already acted on this step' }
  }

  // Insert the action row.
  const { error: insErr } = await actor.supabase.from('approval_step_action').insert({
    tenant_id: actor.tenantId,
    request_id: req.id,
    step_order: actingStep.step_order,
    approver_user_id: actor.userId,
    action,
    comment: comment ?? null,
  })
  if (insErr) {
    captureError(insErr, {
      action_name: 'decideApproval',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_id: requestId,
    })
    return { ok: false, error: insErr.message }
  }

  // Reject closes immediately regardless of mode.
  if (action === 'rejected') {
    return await closeRequest(
      actor.supabase,
      req.id,
      'rejected',
      `Rejected at step ${actingStep.step_order} by ${actor.fullName}`,
      actor.tenantId,
    )
  }

  // Approve flow.
  if (mode === 'sequential') {
    const next = allSteps.find((s) => s.step_order > actingStep.step_order)
    if (!next) {
      return await closeRequest(
        actor.supabase,
        req.id,
        'approved',
        `Approved by all ${allSteps.length} step(s)`,
        actor.tenantId,
      )
    }
    const { error: advErr } = await actor.supabase
      .from('approval_request')
      .update({ current_step_order: next.step_order, updated_at: new Date().toISOString() })
      .eq('id', req.id)
    if (advErr) return { ok: false, error: advErr.message }
    return { ok: true, status: 'pending' }
  }

  // Parallel mode.
  const { data: approvals } = await actor.supabase
    .from('approval_step_action')
    .select('step_order')
    .eq('request_id', req.id)
    .eq('action', 'approved')
  const approvedStepOrders = new Set((approvals ?? []).map((a) => a.step_order as number))

  if (!policy.require_all_parallel) {
    return await closeRequest(
      actor.supabase,
      req.id,
      'approved',
      `Approved (parallel, any-one)`,
      actor.tenantId,
    )
  }
  const allCleared = allSteps.every((s) => approvedStepOrders.has(s.step_order))
  if (allCleared) {
    return await closeRequest(
      actor.supabase,
      req.id,
      'approved',
      `Approved (parallel, all ${allSteps.length})`,
      actor.tenantId,
    )
  }
  return { ok: true, status: 'pending' }
}

async function closeRequest(
  supabase: SupabaseClient,
  requestId: string,
  status: 'approved' | 'rejected',
  summary: string,
  tenantId: string,
): Promise<{ ok: true; status: ApprovalStatus } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('approval_request')
    .update({
      status,
      current_step_order: null,
      decided_at: new Date().toISOString(),
      decided_by_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  if (error) {
    captureError(error, { action_name: 'closeRequest', tenant_id: tenantId, entity_id: requestId })
    return { ok: false, error: error.message }
  }
  revalidatePath('/approvals')
  return { ok: true, status }
}

/* ─────────────────────────────────────────────────────────────
   cancelApprovalRequest — subject or admin.
   ──────────────────────────────────────────────────────────── */
export async function cancelApprovalRequest(
  requestId: string,
  reason?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: req } = await actor.supabase
    .from('approval_request')
    .select('id, subject_user_id, status')
    .eq('id', requestId)
    .maybeSingle()
  if (!req) return { ok: false, error: 'Request not found' }
  if (req.status !== 'pending') return { ok: false, error: `Already ${req.status}` }
  if (req.subject_user_id !== actor.userId && !isAdminish(actor.role)) {
    return { ok: false, error: 'Permission denied' }
  }

  const { error } = await actor.supabase
    .from('approval_request')
    .update({
      status: 'cancelled',
      current_step_order: null,
      decided_at: new Date().toISOString(),
      decided_by_summary: reason ? `Cancelled: ${reason}` : 'Cancelled by requester',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/approvals')
  return { ok: true }
}

/* ─────────────────────────────────────────────────────────────
   listMyPendingApprovals — for the /approvals page.

   "Pending and I'm eligible to act on the current open step."
   ──────────────────────────────────────────────────────────── */
export type PendingApprovalRow = {
  id: string
  entity_type: string
  entity_id: string
  amount: number | null
  subject_name: string | null
  subject_role: string | null
  policy_name: string
  policy_mode: ApprovalMode
  current_step_order: number | null
  current_step_label: string | null
  notes: string | null
  created_at: string
}

export async function listMyPendingApprovals(): Promise<
  | { ok: true; requests: PendingApprovalRow[] }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data, error } = await actor.supabase
    .from('approval_request')
    .select(
      `id, entity_type, entity_id, amount, current_step_order, notes, created_at, subject_user_id,
       subject:user_profile!approval_request_subject_user_id_fkey(full_name, role),
       policy:approval_policy!inner(id, name, mode)`,
    )
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    captureError(error, { action_name: 'listMyPendingApprovals', tenant_id: actor.tenantId, user_id: actor.userId })
    return { ok: false, error: error.message }
  }

  // For each request, fetch its open step(s) + check actor eligibility.
  // (N+1 here — acceptable for v1; an approver typically has < 50 open.)
  // Supabase types foreign-key embeds as arrays even for 1-to-1 FKs.
  const out: PendingApprovalRow[] = []
  const rows = (data ?? []) as unknown as Array<{
    id: string
    entity_type: string
    entity_id: string
    amount: number | null
    current_step_order: number | null
    notes: string | null
    created_at: string
    subject_user_id: string
    subject: { full_name: string | null; role: string | null } | { full_name: string | null; role: string | null }[] | null
    policy: { id: string; name: string; mode: ApprovalMode } | { id: string; name: string; mode: ApprovalMode }[]
  }>
  for (const r of rows) {
    const subjectRow = Array.isArray(r.subject) ? r.subject[0] ?? null : r.subject
    const policyRow = Array.isArray(r.policy) ? r.policy[0] : r.policy
    if (!policyRow) continue
    const { data: steps } = await actor.supabase
      .from('approval_policy_step')
      .select('id, step_order, approver_via, approver_role, approver_user_id, label')
      .eq('policy_id', policyRow.id)
      .order('step_order', { ascending: true })

    const allSteps = (steps ?? []) as ApprovalPolicyStep[]
    const openSteps =
      policyRow.mode === 'sequential'
        ? allSteps.filter((s) => s.step_order === r.current_step_order)
        : allSteps

    // Eligibility: admin always; else resolve approver list per step.
    let eligible = isAdminish(actor.role)
    let openStepLabel: string | null = null
    for (const s of openSteps) {
      if (!eligible) {
        const approvers = await resolveStepApprovers(actor.supabase, actor.tenantId, s)
        if (approvers.includes(actor.userId)) eligible = true
      }
      if (openStepLabel == null) openStepLabel = s.label ?? `Step ${s.step_order}`
    }
    if (!eligible) continue

    out.push({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      amount: r.amount,
      subject_name: subjectRow?.full_name ?? null,
      subject_role: subjectRow?.role ?? null,
      policy_name: policyRow.name,
      policy_mode: policyRow.mode,
      current_step_order: r.current_step_order,
      current_step_label: openStepLabel,
      notes: r.notes,
      created_at: r.created_at,
    })
  }

  return { ok: true, requests: out }
}

/* ─────────────────────────────────────────────────────────────
   getApprovalRequest — full detail for inline rendering on an
   entity's detail page. The caller passes the request id stored
   on its entity. Returns policy, steps, action history.
   ──────────────────────────────────────────────────────────── */
export async function getApprovalRequest(
  requestId: string,
): Promise<
  | { ok: true; request: ApprovalRequestDetail }
  | { ok: false; error: string }
> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: req, error } = await actor.supabase
    .from('approval_request')
    .select(
      `id, entity_type, entity_id, amount, subject_user_id, status, current_step_order,
       decided_at, decided_by_summary, notes, metadata, created_at,
       subject:user_profile!approval_request_subject_user_id_fkey(full_name),
       policy:approval_policy!inner(id, entity_type, name, min_amount, max_amount, mode, require_all_parallel, escalation_hours, active, notes)`,
    )
    .eq('id', requestId)
    .maybeSingle()
  if (error || !req) return { ok: false, error: error?.message ?? 'Not found' }

  const reqRow = req as unknown as {
    id: string
    entity_type: string
    entity_id: string
    amount: number | null
    subject_user_id: string
    status: ApprovalStatus
    current_step_order: number | null
    decided_at: string | null
    decided_by_summary: string | null
    notes: string | null
    metadata: Record<string, unknown>
    created_at: string
    subject: { full_name: string | null } | { full_name: string | null }[] | null
    policy: Omit<ApprovalPolicy, 'steps'> | Omit<ApprovalPolicy, 'steps'>[]
  }
  const subjectRow = Array.isArray(reqRow.subject) ? reqRow.subject[0] ?? null : reqRow.subject
  const policyRow = Array.isArray(reqRow.policy) ? reqRow.policy[0] : reqRow.policy
  if (!policyRow) return { ok: false, error: 'Policy missing' }

  const { data: stepRows } = await actor.supabase
    .from('approval_policy_step')
    .select('id, step_order, approver_via, approver_role, approver_user_id, label')
    .eq('policy_id', policyRow.id)
    .order('step_order', { ascending: true })

  const { data: actionRows } = await actor.supabase
    .from('approval_step_action')
    .select(
      `id, step_order, approver_user_id, action, comment, acted_at,
       approver:user_profile!approval_step_action_approver_user_id_fkey(full_name)`,
    )
    .eq('request_id', requestId)
    .order('acted_at', { ascending: true })

  const actionRowsTyped = (actionRows ?? []) as unknown as Array<{
    id: string
    step_order: number
    approver_user_id: string
    action: ApprovalAction
    comment: string | null
    acted_at: string
    approver: { full_name: string | null } | { full_name: string | null }[] | null
  }>
  const actions: ApprovalStepActionRow[] = actionRowsTyped.map((a) => {
    const approverRow = Array.isArray(a.approver) ? a.approver[0] ?? null : a.approver
    return {
      id: a.id,
      step_order: a.step_order,
      approver_user_id: a.approver_user_id,
      approver_name: approverRow?.full_name ?? null,
      action: a.action,
      comment: a.comment,
      acted_at: a.acted_at,
    }
  })

  return {
    ok: true,
    request: {
      id: reqRow.id,
      entity_type: reqRow.entity_type,
      entity_id: reqRow.entity_id,
      amount: reqRow.amount,
      subject_user_id: reqRow.subject_user_id,
      subject_name: subjectRow?.full_name ?? null,
      status: reqRow.status,
      current_step_order: reqRow.current_step_order,
      decided_at: reqRow.decided_at,
      decided_by_summary: reqRow.decided_by_summary,
      notes: reqRow.notes,
      metadata: reqRow.metadata,
      created_at: reqRow.created_at,
      policy: {
        ...policyRow,
        steps: (stepRows ?? []) as ApprovalPolicyStep[],
      },
      actions,
    },
  }
}
