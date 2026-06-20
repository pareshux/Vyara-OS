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

/** Resolve the default own_plant warehouse for a tenant. */
async function resolveDefaultWarehouseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
): Promise<string | null> {
  // 1. Try tenant.settings.inventory.default_warehouse_code
  const { data: tenant } = await supabase.from('tenant').select('settings').eq('id', tenantId).single()
  const settings = (tenant?.settings as { inventory?: { default_warehouse_code?: string } } | null) ?? null
  const code = settings?.inventory?.default_warehouse_code
  if (code) {
    const { data: byCode } = await supabase
      .from('warehouse')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('code', code)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle()
    if (byCode) return byCode.id
  }
  // 2. Fallback: first active own_plant warehouse
  const { data: fallback } = await supabase
    .from('warehouse')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('type', 'own_plant')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  return fallback?.id ?? null
}

export type LineReservationResult = {
  order_line_id: string
  sku_code: string
  requested: number
  reserved: number
  status: 'reserved' | 'partial' | 'backorder' | 'no_product' | 'no_warehouse' | 'error'
  message?: string
}

/**
 * For each line on the order, attempt to reserve stock at the default warehouse.
 * Reserves min(available, requested). Idempotent: skips lines that already
 * have an active reservation (deduplicated by the UNIQUE index in schema).
 */
export async function attemptReserveOrderLines(orderId: string): Promise<{
  results: LineReservationResult[]
} | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  return runReservationAttempt(ctx.supabase, orderId, ctx.tenantId, ctx.userId)
}

/**
 * Service-role variant for Inngest handlers running outside an auth session.
 * Caller passes their own supabase client (service-role) + the tenant_id read
 * from the source event/row. userId is optional (no actor when system-driven).
 */
export async function attemptReserveOrderLinesService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orderId: string,
  tenantId: string,
  userId: string | null
): Promise<{ results: LineReservationResult[] } | { error: string }> {
  return runReservationAttempt(supabase, orderId, tenantId, userId)
}

async function runReservationAttempt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orderId: string,
  tenantId: string,
  userId: string | null
): Promise<{ results: LineReservationResult[] } | { error: string }> {
  const warehouseId = await resolveDefaultWarehouseId(supabase, tenantId)
  if (!warehouseId) {
    return { error: 'No active own_plant warehouse configured for this tenant' }
  }

  const { data: order } = await supabase
    .from('sales_order')
    .select('id, lines:sales_order_line(id, product_id, sku_code, quantity)')
    .eq('id', orderId)
    .single()
  if (!order) return { error: 'Order not found' }

  type OrderLine = { id: string; product_id: string | null; sku_code: string; quantity: number }
  const lines = (order.lines ?? []) as OrderLine[]
  const results: LineReservationResult[] = []

  for (const line of lines) {
    if (!line.product_id) {
      results.push({ order_line_id: line.id, sku_code: line.sku_code, requested: Number(line.quantity), reserved: 0, status: 'no_product', message: 'Line has no product_id' })
      continue
    }

    // Check existing active reservation for this line + product
    const { data: existing } = await supabase
      .from('stock_reservation')
      .select('id, quantity')
      .eq('related_entity_type', 'sales_order_line')
      .eq('related_entity_id', line.id)
      .eq('product_id', line.product_id)
      .eq('status', 'active')
      .maybeSingle()
    if (existing) {
      results.push({
        order_line_id: line.id,
        sku_code: line.sku_code,
        requested: Number(line.quantity),
        reserved: Number(existing.quantity),
        status: Number(existing.quantity) >= Number(line.quantity) ? 'reserved' : 'partial',
        message: 'Already reserved',
      })
      continue
    }

    // Read available stock
    const { data: stk } = await supabase
      .from('stock')
      .select('available_qty')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', line.product_id)
      .maybeSingle()
    const available = stk ? Number(stk.available_qty) : 0
    const requested = Number(line.quantity)
    const reserveQty = Math.min(available, requested)

    if (reserveQty === 0) {
      results.push({ order_line_id: line.id, sku_code: line.sku_code, requested, reserved: 0, status: 'backorder', message: 'No stock available' })
      continue
    }

    // Insert reservation row
    const { data: res, error: resErr } = await supabase
      .from('stock_reservation')
      .insert({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        product_id: line.product_id,
        quantity: reserveQty,
        status: 'active',
        related_entity_type: 'sales_order_line',
        related_entity_id: line.id,
        created_by: userId,
      })
      .select('id')
      .single()
    if (resErr) {
      results.push({ order_line_id: line.id, sku_code: line.sku_code, requested, reserved: 0, status: 'error', message: resErr.message })
      continue
    }

    // Insert reservation_in movement (trigger updates stock atomically)
    const { error: movErr } = await supabase.from('stock_movement').insert({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      product_id: line.product_id,
      movement_type: 'reservation_in',
      quantity: reserveQty,
      reason_code: 'sales_order',
      related_entity_type: 'stock_reservation',
      related_entity_id: res.id,
      actor_id: userId,
      remark: `Reserved against sales order line`,
    })
    if (movErr) {
      // Roll back the reservation row (best-effort)
      await supabase.from('stock_reservation').delete().eq('id', res.id)
      results.push({ order_line_id: line.id, sku_code: line.sku_code, requested, reserved: 0, status: 'error', message: movErr.message })
      continue
    }

    results.push({
      order_line_id: line.id,
      sku_code: line.sku_code,
      requested,
      reserved: reserveQty,
      status: reserveQty >= requested ? 'reserved' : 'partial',
    })
  }

  revalidatePath('/inventory')
  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  return { results }
}

/** Release all active reservations linked to this order's lines. */
export async function releaseOrderReservations(orderId: string, reason: string): Promise<{ released: number } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data: lines } = await supabase.from('sales_order_line').select('id').eq('sales_order_id', orderId)
  if (!lines?.length) return { released: 0 }
  const lineIds = lines.map((l) => l.id)

  const { data: reservations } = await supabase
    .from('stock_reservation')
    .select('id, warehouse_id, product_id, quantity')
    .eq('status', 'active')
    .eq('related_entity_type', 'sales_order_line')
    .in('related_entity_id', lineIds)

  let released = 0
  for (const r of (reservations ?? []) as Array<{ id: string; warehouse_id: string; product_id: string; quantity: number }>) {
    await supabase
      .from('stock_reservation')
      .update({ status: 'released', released_at: new Date().toISOString(), release_reason: reason })
      .eq('id', r.id)
    await supabase.from('stock_movement').insert({
      tenant_id: tenantId,
      warehouse_id: r.warehouse_id,
      product_id: r.product_id,
      movement_type: 'reservation_out',
      quantity: r.quantity,
      reason_code: 'sales_order_cancelled',
      related_entity_type: 'stock_reservation',
      related_entity_id: r.id,
      actor_id: userId,
      remark: reason,
    })
    released++
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/inventory')
  return { released }
}

/** Manually release a single reservation. */
export async function releaseReservation(reservationId: string, reason: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx
  if (!reason.trim()) return { error: 'Reason required' }

  const { data: r } = await supabase
    .from('stock_reservation')
    .select('warehouse_id, product_id, quantity, status, related_entity_id')
    .eq('id', reservationId)
    .single()
  if (!r) return { error: 'Reservation not found' }
  if (r.status !== 'active') return { error: `Cannot release ${r.status} reservation` }

  await supabase
    .from('stock_reservation')
    .update({ status: 'released', released_at: new Date().toISOString(), release_reason: reason.trim() })
    .eq('id', reservationId)
  await supabase.from('stock_movement').insert({
    tenant_id: tenantId,
    warehouse_id: r.warehouse_id,
    product_id: r.product_id,
    movement_type: 'reservation_out',
    quantity: r.quantity,
    reason_code: 'manual_release',
    related_entity_type: 'stock_reservation',
    related_entity_id: reservationId,
    actor_id: userId,
    remark: reason.trim(),
  })
  revalidatePath('/inventory')
  revalidatePath('/orders')
  return { success: true }
}
