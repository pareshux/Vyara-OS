'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getActorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

async function readApprovalThreshold(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
): Promise<number> {
  const { data } = await supabase.from('tenant').select('settings').eq('id', tenantId).single()
  const s = (data?.settings as { inventory?: { adjustment_approval_threshold_inr?: number } } | null) ?? null
  return s?.inventory?.adjustment_approval_threshold_inr ?? 10000
}

export type AdjustmentType = 'damage' | 'count_diff' | 'correction' | 'opening_balance' | 'other'

export async function requestAdjustment(params: {
  warehouse_id: string
  product_id: string
  adjustment_type: AdjustmentType
  quantity_delta: number   // signed: positive = add, negative = remove
  reason: string
  estimated_value?: number  // ₹ value for threshold check
}): Promise<{ id: string; status: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId, role } = ctx

  if (params.quantity_delta === 0) return { error: 'Quantity delta cannot be zero' }
  if (!params.reason?.trim()) return { error: 'Reason is required' }

  const threshold = await readApprovalThreshold(supabase, tenantId)
  const estVal = params.estimated_value ?? 0
  const isManager = role === 'manager' || role === 'admin'
  // Auto-approve if: estimated value below threshold OR actor is a manager
  const autoApprove = estVal < threshold || isManager

  const { data: adj, error: adjErr } = await supabase
    .from('stock_adjustment')
    .insert({
      tenant_id: tenantId,
      warehouse_id: params.warehouse_id,
      product_id: params.product_id,
      adjustment_type: params.adjustment_type,
      quantity_delta: params.quantity_delta,
      estimated_value: params.estimated_value ?? null,
      reason: params.reason.trim(),
      status: autoApprove ? 'auto_approved' : 'pending',
      requested_by: userId,
      approved_by: autoApprove ? userId : null,
      approved_at: autoApprove ? new Date().toISOString() : null,
    })
    .select('id, status')
    .single()
  if (adjErr) return { error: adjErr.message }

  if (autoApprove) {
    const movErr = await applyAdjustmentMovement(supabase, adj.id, tenantId, userId, params)
    if (movErr) return { error: movErr }
  } else {
    // Create approval task for manager
    await supabase.from('task').insert({
      tenant_id: tenantId,
      type: 'stock_adjustment_approval',
      title: `Approve stock adjustment (${params.adjustment_type}, ${params.quantity_delta > 0 ? '+' : ''}${params.quantity_delta})`,
      description: params.reason.trim(),
      priority: 'high',
      source_entity_type: 'stock_adjustment',
      source_entity_id: adj.id,
    })
  }

  revalidatePath('/inventory')
  revalidatePath('/inventory/adjustments')
  revalidatePath(`/warehouses/${params.warehouse_id}`)
  return adj
}

async function applyAdjustmentMovement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adjustmentId: string,
  tenantId: string,
  actorId: string,
  params: {
    warehouse_id: string
    product_id: string
    quantity_delta: number
    adjustment_type: string
    reason: string
  }
): Promise<string | null> {
  const movementType = params.quantity_delta > 0 ? 'adjustment_plus' : 'adjustment_minus'
  const qty = Math.abs(params.quantity_delta)

  const { data: mov, error } = await supabase
    .from('stock_movement')
    .insert({
      tenant_id: tenantId,
      warehouse_id: params.warehouse_id,
      product_id: params.product_id,
      movement_type: movementType,
      quantity: qty,
      reason_code: params.adjustment_type,
      related_entity_type: 'stock_adjustment',
      related_entity_id: adjustmentId,
      actor_id: actorId,
      remark: params.reason,
    })
    .select('id')
    .single()
  if (error) return error.message

  await supabase.from('stock_adjustment').update({ movement_id: mov.id }).eq('id', adjustmentId)
  return null
}

export async function approveAdjustment(adjustmentId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId, role } = ctx
  if (role !== 'manager' && role !== 'admin') return { error: 'Only managers can approve adjustments' }

  const { data: adj } = await supabase
    .from('stock_adjustment')
    .select('warehouse_id, product_id, quantity_delta, adjustment_type, reason, status')
    .eq('id', adjustmentId)
    .single()
  if (!adj) return { error: 'Adjustment not found' }
  if (adj.status !== 'pending') return { error: `Cannot approve a ${adj.status} adjustment` }

  await supabase
    .from('stock_adjustment')
    .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() })
    .eq('id', adjustmentId)

  const movErr = await applyAdjustmentMovement(supabase, adjustmentId, tenantId, userId, adj as Parameters<typeof applyAdjustmentMovement>[4])
  if (movErr) return { error: movErr }

  // Mark related task as done
  await supabase
    .from('task')
    .update({ is_done: true, done_at: new Date().toISOString() })
    .eq('source_entity_type', 'stock_adjustment')
    .eq('source_entity_id', adjustmentId)
    .eq('is_done', false)

  revalidatePath('/inventory/adjustments')
  revalidatePath('/inventory')
  return { success: true }
}

export async function rejectAdjustment(
  adjustmentId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, role } = ctx
  if (role !== 'manager' && role !== 'admin') return { error: 'Only managers can reject adjustments' }
  if (!reason.trim()) return { error: 'Rejection reason is required' }

  const { error } = await supabase
    .from('stock_adjustment')
    .update({
      status: 'rejected',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejected_reason: reason.trim(),
    })
    .eq('id', adjustmentId)
    .eq('status', 'pending')
  if (error) return { error: error.message }

  await supabase
    .from('task')
    .update({ is_done: true, done_at: new Date().toISOString() })
    .eq('source_entity_type', 'stock_adjustment')
    .eq('source_entity_id', adjustmentId)
    .eq('is_done', false)

  revalidatePath('/inventory/adjustments')
  return { success: true }
}
