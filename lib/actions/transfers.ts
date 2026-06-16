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

export async function createStockTransfer(params: {
  from_warehouse_id: string
  to_warehouse_id: string
  scheduled_at?: string
  notes?: string
  lines: Array<{ product_id: string; quantity: number; notes?: string }>
}): Promise<{ id: string; transfer_number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx
  if (params.from_warehouse_id === params.to_warehouse_id) return { error: 'Source and destination must differ' }
  if (!params.lines?.length) return { error: 'At least one line item is required' }

  const { data: transfer, error } = await supabase
    .from('stock_transfer')
    .insert({
      tenant_id: tenantId,
      from_warehouse_id: params.from_warehouse_id,
      to_warehouse_id: params.to_warehouse_id,
      status: 'draft',
      scheduled_at: params.scheduled_at ?? null,
      notes: params.notes ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, transfer_number')
    .single()
  if (error) return { error: error.message }

  const { error: lineErr } = await supabase.from('stock_transfer_line').insert(
    params.lines.map((l, i) => ({
      tenant_id: tenantId,
      stock_transfer_id: transfer.id,
      product_id: l.product_id,
      quantity: l.quantity,
      notes: l.notes ?? null,
      sort_order: i,
    }))
  )
  if (lineErr) return { error: lineErr.message }

  revalidatePath('/inventory/transfers')
  return { id: transfer.id, transfer_number: transfer.transfer_number as string }
}

/** Draft → In Transit: write transfer_out on source for each line. */
export async function shipStockTransfer(transferId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data: transfer } = await supabase
    .from('stock_transfer')
    .select('id, from_warehouse_id, status, lines:stock_transfer_line(product_id, quantity)')
    .eq('id', transferId)
    .single()
  if (!transfer) return { error: 'Transfer not found' }
  if (transfer.status !== 'draft') return { error: `Cannot ship a ${transfer.status} transfer` }

  // Insert transfer_out movements
  for (const l of (transfer.lines ?? []) as Array<{ product_id: string; quantity: number }>) {
    const { error } = await supabase.from('stock_movement').insert({
      tenant_id: tenantId,
      warehouse_id: transfer.from_warehouse_id,
      product_id: l.product_id,
      movement_type: 'transfer_out',
      quantity: l.quantity,
      reason_code: 'transfer',
      related_entity_type: 'stock_transfer',
      related_entity_id: transferId,
      actor_id: userId,
      remark: 'Shipped',
    })
    if (error) return { error: `Failed on line: ${error.message}` }
  }

  await supabase
    .from('stock_transfer')
    .update({
      status: 'in_transit',
      shipped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', transferId)

  revalidatePath(`/inventory/transfers/${transferId}`)
  revalidatePath('/inventory/transfers')
  revalidatePath('/inventory')
  return { success: true }
}

/** In Transit → Completed: write transfer_in on destination. */
export async function completeStockTransfer(transferId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data: transfer } = await supabase
    .from('stock_transfer')
    .select('id, to_warehouse_id, status, lines:stock_transfer_line(product_id, quantity)')
    .eq('id', transferId)
    .single()
  if (!transfer) return { error: 'Transfer not found' }
  if (transfer.status !== 'in_transit') return { error: `Cannot complete a ${transfer.status} transfer` }

  for (const l of (transfer.lines ?? []) as Array<{ product_id: string; quantity: number }>) {
    const { error } = await supabase.from('stock_movement').insert({
      tenant_id: tenantId,
      warehouse_id: transfer.to_warehouse_id,
      product_id: l.product_id,
      movement_type: 'transfer_in',
      quantity: l.quantity,
      reason_code: 'transfer',
      related_entity_type: 'stock_transfer',
      related_entity_id: transferId,
      actor_id: userId,
      remark: 'Received',
    })
    if (error) return { error: `Failed on line: ${error.message}` }
  }

  await supabase
    .from('stock_transfer')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', transferId)

  revalidatePath(`/inventory/transfers/${transferId}`)
  revalidatePath('/inventory/transfers')
  revalidatePath('/inventory')
  return { success: true }
}

/** Cancel an in-transit transfer — reverse the source transfer_out via transfer_in on source. */
export async function cancelStockTransfer(transferId: string, reason: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx
  if (!reason.trim()) return { error: 'Cancellation reason is required' }

  const { data: transfer } = await supabase
    .from('stock_transfer')
    .select('id, from_warehouse_id, status, lines:stock_transfer_line(product_id, quantity)')
    .eq('id', transferId)
    .single()
  if (!transfer) return { error: 'Transfer not found' }
  if (transfer.status === 'completed' || transfer.status === 'cancelled') {
    return { error: `Cannot cancel a ${transfer.status} transfer` }
  }

  // If already in transit, restore source stock
  if (transfer.status === 'in_transit') {
    for (const l of (transfer.lines ?? []) as Array<{ product_id: string; quantity: number }>) {
      await supabase.from('stock_movement').insert({
        tenant_id: tenantId,
        warehouse_id: transfer.from_warehouse_id,
        product_id: l.product_id,
        movement_type: 'transfer_in',
        quantity: l.quantity,
        reason_code: 'transfer_cancelled',
        related_entity_type: 'stock_transfer',
        related_entity_id: transferId,
        actor_id: userId,
        remark: `Cancellation reversal: ${reason.trim()}`,
      })
    }
  }

  await supabase
    .from('stock_transfer')
    .update({ status: 'cancelled', updated_at: new Date().toISOString(), updated_by: userId, notes: reason.trim() })
    .eq('id', transferId)

  revalidatePath(`/inventory/transfers/${transferId}`)
  revalidatePath('/inventory/transfers')
  revalidatePath('/inventory')
  return { success: true }
}
