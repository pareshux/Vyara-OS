'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'
import { attemptReserveOrderLines, releaseOrderReservations } from './reservations'

async function getActorContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

async function initialStageId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('order_stage')
    .select('id')
    .is('tenant_id', null)
    .eq('stage_key', 'confirmed')
    .single()
  return data?.id as string | undefined
}

export async function createOrderFromQuote(params: {
  quote_id: string
  expected_delivery_at?: string
  notes?: string
}): Promise<{ id: string; order_number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  // Snapshot the quote + its lines (cross-module READ is allowed; only writes are forbidden)
  const { data: quote, error: qErr } = await supabase
    .from('quotation')
    .select(
      `id, project_id, quotation_number, total, status,
       project:project_id(buyer_firm_id, owner_id),
       lines:quotation_line(product_id, product_name, sku_code, unit, quantity, unit_price, line_total, sort_order)`
    )
    .eq('id', params.quote_id)
    .single()

  if (qErr || !quote) return { error: qErr?.message ?? 'Quote not found' }

  // Type the relationship narrowing
  const proj = (Array.isArray(quote.project) ? quote.project[0] : quote.project) as
    | { buyer_firm_id: string | null; owner_id: string }
    | null

  const stageId = await initialStageId(supabase)
  if (!stageId) return { error: 'Order stages not seeded' }

  const { data: order, error: oErr } = await supabase
    .from('sales_order')
    .insert({
      tenant_id: tenantId,
      project_id: quote.project_id,
      quote_id: quote.id,
      buyer_firm_id: proj?.buyer_firm_id ?? null,
      current_stage_id: stageId,
      expected_delivery_at: params.expected_delivery_at ?? null,
      value: quote.total ?? 0,
      notes: params.notes ?? null,
      owner_id: proj?.owner_id ?? userId,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, order_number')
    .single()

  if (oErr) return { error: oErr.message }

  const lines = (quote.lines ?? []) as Array<{
    product_id: string | null
    product_name: string
    sku_code: string
    unit: string
    quantity: number
    unit_price: number
    line_total: number
    sort_order: number
  }>

  if (lines.length > 0) {
    const { error: lineErr } = await supabase.from('sales_order_line').insert(
      lines.map((l) => ({
        tenant_id: tenantId,
        sales_order_id: order.id,
        product_id: l.product_id,
        product_name: l.product_name,
        sku_code: l.sku_code,
        unit: l.unit,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.line_total,
        sort_order: l.sort_order,
      }))
    )
    if (lineErr) return { error: lineErr.message }
  }

  // Record initial stage history
  await supabase.from('sales_order_stage_history').insert({
    tenant_id: tenantId,
    sales_order_id: order.id,
    from_stage_id: null,
    to_stage_id: stageId,
    actor_id: userId,
    remark: 'Order created from quote',
  })

  // Mark quote as accepted (if not already) — single-module write (quotation)
  await supabase
    .from('quotation')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', quote.id)
    .neq('status', 'accepted')

  // Emit event so other modules (Dispatch, Finance) can react.
  await inngest.send({
    name: 'order.created',
    data: { order_id: order.id, quote_id: quote.id },
  })

  // Try to reserve stock for each line at the default warehouse (best-effort, non-blocking).
  // If it fails (no warehouse, no stock, etc.) the order still exists — the UI will show
  // back-order status per line and an operator can resolve manually.
  await attemptReserveOrderLines(order.id)

  revalidatePath('/orders')
  revalidatePath(`/projects/${quote.project_id}`)
  return { id: order.id, order_number: order.order_number as string }
}

export async function createOrderManual(params: {
  project_id: string
  buyer_firm_id?: string
  expected_delivery_at?: string
  notes?: string
  lines: Array<{ product_id?: string; product_name: string; sku_code: string; unit: string; quantity: number; unit_price: number }>
}): Promise<{ id: string; order_number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  if (!params.lines?.length) return { error: 'At least one line item is required' }

  const stageId = await initialStageId(supabase)
  if (!stageId) return { error: 'Order stages not seeded' }

  const value = params.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)

  // Resolve owner = project.owner_id (read-only cross-module is allowed)
  const { data: project } = await supabase
    .from('project')
    .select('owner_id, buyer_firm_id')
    .eq('id', params.project_id)
    .single()

  const { data: order, error: oErr } = await supabase
    .from('sales_order')
    .insert({
      tenant_id: tenantId,
      project_id: params.project_id,
      quote_id: null,
      buyer_firm_id: params.buyer_firm_id ?? project?.buyer_firm_id ?? null,
      current_stage_id: stageId,
      expected_delivery_at: params.expected_delivery_at ?? null,
      value,
      notes: params.notes ?? null,
      owner_id: project?.owner_id ?? userId,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, order_number')
    .single()

  if (oErr) return { error: oErr.message }

  const { error: lineErr } = await supabase.from('sales_order_line').insert(
    params.lines.map((l, i) => ({
      tenant_id: tenantId,
      sales_order_id: order.id,
      product_id: l.product_id ?? null,
      product_name: l.product_name,
      sku_code: l.sku_code,
      unit: l.unit,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.quantity * l.unit_price,
      sort_order: i,
    }))
  )
  if (lineErr) return { error: lineErr.message }

  await supabase.from('sales_order_stage_history').insert({
    tenant_id: tenantId,
    sales_order_id: order.id,
    from_stage_id: null,
    to_stage_id: stageId,
    actor_id: userId,
    remark: 'Order created manually',
  })

  await inngest.send({
    name: 'order.created',
    data: { order_id: order.id, quote_id: '' },
  })

  await attemptReserveOrderLines(order.id)

  revalidatePath('/orders')
  revalidatePath(`/projects/${params.project_id}`)
  return { id: order.id, order_number: order.order_number as string }
}

export async function advanceOrderStage(
  orderId: string,
  toStageId: string,
  remark?: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data: order, error: fErr } = await supabase
    .from('sales_order')
    .select('current_stage_id, order_number, project_id')
    .eq('id', orderId)
    .single()
  if (fErr || !order) return { error: 'Order not found' }

  const { error: uErr } = await supabase
    .from('sales_order')
    .update({ current_stage_id: toStageId, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', orderId)
  if (uErr) return { error: uErr.message }

  await supabase.from('sales_order_stage_history').insert({
    tenant_id: tenantId,
    sales_order_id: orderId,
    from_stage_id: order.current_stage_id,
    to_stage_id: toStageId,
    actor_id: userId,
    remark: remark ?? null,
  })

  // When stage advances to "ready" or "dispatched", create a task for dispatch coordination.
  const { data: stage } = await supabase
    .from('order_stage')
    .select('stage_key, label')
    .eq('id', toStageId)
    .single()

  if (stage?.stage_key === 'ready') {
    await supabase.from('task').insert({
      tenant_id: tenantId,
      project_id: order.project_id,
      type: 'dispatch_schedule',
      title: `Schedule dispatch — ${order.order_number}`,
      priority: 'high',
      source_entity_type: 'sales_order',
      source_entity_id: orderId,
    })
  }

  // On cancellation, release any active reservations
  if (stage?.stage_key === 'cancelled') {
    await releaseOrderReservations(orderId, remark || 'Order cancelled')
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  return { success: true }
}
