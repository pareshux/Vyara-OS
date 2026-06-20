'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

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

async function stageIdByKey(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('dispatch_stage')
    .select('id')
    .is('tenant_id', null)
    .eq('stage_key', key)
    .single()
  return data?.id as string | undefined
}

export async function scheduleDispatch(params: {
  sales_order_id: string
  scheduled_at: string
  transporter_id?: string
  lr_number?: string
  vehicle_number?: string
  driver_phone?: string
  notes?: string
  /** lines to ship (snapshot of sales_order_line ids + qty) */
  lines: Array<{ sales_order_line_id?: string; product_name: string; sku_code: string; unit: string; quantity: number }>
}): Promise<{ id: string; dispatch_number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const stageId = await stageIdByKey(supabase, 'scheduled')
  if (!stageId) return { error: 'Dispatch stages not seeded' }

  // Read project + owner for denormalization (cross-module READ is fine)
  const { data: order } = await supabase
    .from('sales_order')
    .select('project_id, owner_id')
    .eq('id', params.sales_order_id)
    .single()
  if (!order) return { error: 'Order not found' }

  // ─── Over-dispatch guard ────────────────────────────────────────────────
  // Across tranches, sum(dispatched_qty) must not exceed sales_order_line.quantity.
  // We exclude cancelled and deleted dispatches from the prior-shipped tally.
  const linesWithSrc = params.lines.filter((l) => l.sales_order_line_id)
  if (linesWithSrc.length > 0) {
    const cancelledStageId = await stageIdByKey(supabase, 'cancelled')
    let validDispatches = supabase
      .from('dispatch')
      .select('id')
      .eq('sales_order_id', params.sales_order_id)
      .is('deleted_at', null)
    if (cancelledStageId) {
      validDispatches = validDispatches.neq('current_stage_id', cancelledStageId)
    }
    const { data: priorDispatches } = await validDispatches
    const priorDispatchIds = (priorDispatches ?? []).map((d) => d.id as string)

    const sourceLineIds = linesWithSrc.map((l) => l.sales_order_line_id!) as string[]
    const { data: priorLineRows } = priorDispatchIds.length > 0
      ? await supabase
          .from('dispatch_line')
          .select('sales_order_line_id, quantity')
          .in('dispatch_id', priorDispatchIds)
          .in('sales_order_line_id', sourceLineIds)
      : { data: [] as Array<{ sales_order_line_id: string | null; quantity: number }> }

    const priorShipped: Record<string, number> = {}
    for (const r of priorLineRows ?? []) {
      if (!r.sales_order_line_id) continue
      priorShipped[r.sales_order_line_id] = (priorShipped[r.sales_order_line_id] ?? 0) + Number(r.quantity)
    }

    const { data: orderLines } = await supabase
      .from('sales_order_line')
      .select('id, quantity, sku_code, unit')
      .in('id', sourceLineIds)
    const orderedByLine = Object.fromEntries(
      (orderLines ?? []).map((l) => [l.id as string, { ordered: Number(l.quantity), sku: l.sku_code as string, unit: l.unit as string }])
    )

    for (const reqLine of linesWithSrc) {
      const lineId = reqLine.sales_order_line_id!
      const meta = orderedByLine[lineId]
      if (!meta) continue
      const already = priorShipped[lineId] ?? 0
      const cumulative = already + Number(reqLine.quantity)
      if (cumulative > meta.ordered + 0.0001) {
        return {
          error: `${meta.sku}: cannot dispatch ${reqLine.quantity} ${meta.unit} — ${already} already shipped, only ${(meta.ordered - already).toFixed(2)} remaining of ${meta.ordered} ordered.`,
        }
      }
    }
  }

  const { data: dispatch, error } = await supabase
    .from('dispatch')
    .insert({
      tenant_id: tenantId,
      sales_order_id: params.sales_order_id,
      project_id: order.project_id,
      transporter_id: params.transporter_id ?? null,
      current_stage_id: stageId,
      scheduled_at: params.scheduled_at,
      lr_number: params.lr_number ?? null,
      vehicle_number: params.vehicle_number ?? null,
      driver_phone: params.driver_phone ?? null,
      notes: params.notes ?? null,
      owner_id: order.owner_id,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, dispatch_number')
    .single()
  if (error) return { error: error.message }

  if (params.lines.length > 0) {
    const { error: lineErr } = await supabase.from('dispatch_line').insert(
      params.lines.map((l, i) => ({
        tenant_id: tenantId,
        dispatch_id: dispatch.id,
        sales_order_line_id: l.sales_order_line_id ?? null,
        product_name: l.product_name,
        sku_code: l.sku_code,
        unit: l.unit,
        quantity: l.quantity,
        sort_order: i,
      }))
    )
    if (lineErr) return { error: lineErr.message }
  }

  await supabase.from('dispatch_stage_history').insert({
    tenant_id: tenantId,
    dispatch_id: dispatch.id,
    from_stage_id: null,
    to_stage_id: stageId,
    actor_id: userId,
    remark: 'Dispatch scheduled',
  })

  try {
    await inngest.send({
      name: 'dispatch.scheduled',
      data: { dispatch_id: dispatch.id, order_id: params.sales_order_id },
    })
  } catch (e) { console.warn('inngest.send(dispatch.scheduled) failed (non-fatal):', e) }

  revalidatePath('/dispatches')
  revalidatePath('/warehouse')
  revalidatePath(`/orders/${params.sales_order_id}`)
  return { id: dispatch.id, dispatch_number: dispatch.dispatch_number as string }
}

export async function advanceDispatchStage(
  dispatchId: string,
  stageKey: 'in_transit' | 'delivered' | 'pod_uploaded' | 'closed' | 'cancelled',
  remark?: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const newStageId = await stageIdByKey(supabase, stageKey)
  if (!newStageId) return { error: `Stage ${stageKey} not found` }

  const { data: dispatch } = await supabase
    .from('dispatch')
    .select('current_stage_id, sales_order_id, project_id, dispatch_number')
    .eq('id', dispatchId)
    .single()
  if (!dispatch) return { error: 'Dispatch not found' }

  const patch: Record<string, unknown> = {
    current_stage_id: newStageId,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }
  if (stageKey === 'in_transit' && !patch.dispatched_at) {
    patch.dispatched_at = new Date().toISOString()
  }
  if (stageKey === 'delivered') {
    patch.delivered_at = new Date().toISOString()
  }

  const { error: uErr } = await supabase.from('dispatch').update(patch).eq('id', dispatchId)
  if (uErr) return { error: uErr.message }

  await supabase.from('dispatch_stage_history').insert({
    tenant_id: tenantId,
    dispatch_id: dispatchId,
    from_stage_id: dispatch.current_stage_id,
    to_stage_id: newStageId,
    actor_id: userId,
    remark: remark ?? null,
  })

  if (stageKey === 'delivered') {
    try {
      await inngest.send({
        name: 'dispatch.completed',
        data: { dispatch_id: dispatchId },
      })
    } catch (e) { console.warn('inngest.send(dispatch.completed) failed (non-fatal):', e) }

    // Auto-create a "POD pending" task if no POD yet
    await supabase.from('task').insert({
      tenant_id: tenantId,
      project_id: dispatch.project_id,
      type: 'dispatch_pod_pending',
      title: `Upload POD for ${dispatch.dispatch_number}`,
      priority: 'medium',
      source_entity_type: 'dispatch',
      source_entity_id: dispatchId,
    })
  }

  revalidatePath(`/dispatches/${dispatchId}`)
  revalidatePath('/dispatches')
  revalidatePath('/warehouse')
  return { success: true }
}

export async function recordPOD(params: {
  dispatch_id: string
  pod_url: string  // storage path (e.g. "<tenant_id>/<dispatch_id>/pod.jpg")
  signature_name?: string
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const podStageId = await stageIdByKey(supabase, 'pod_uploaded')
  if (!podStageId) return { error: 'pod_uploaded stage missing' }

  const { data: dispatch } = await supabase
    .from('dispatch')
    .select('current_stage_id, project_id, delivered_at')
    .eq('id', params.dispatch_id)
    .single()
  if (!dispatch) return { error: 'Dispatch not found' }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    pod_url: params.pod_url,
    pod_signature_name: params.signature_name ?? null,
    pod_uploaded_at: nowIso,
    pod_uploaded_by: userId,
    current_stage_id: podStageId,
    updated_at: nowIso,
    updated_by: userId,
  }
  // Only stamp delivered_at if Mark Delivered hadn't already recorded the true time.
  if (!dispatch.delivered_at) patch.delivered_at = nowIso

  const { error: uErr } = await supabase
    .from('dispatch')
    .update(patch)
    .eq('id', params.dispatch_id)
  if (uErr) return { error: uErr.message }

  await supabase.from('dispatch_stage_history').insert({
    tenant_id: tenantId,
    dispatch_id: params.dispatch_id,
    from_stage_id: dispatch.current_stage_id,
    to_stage_id: podStageId,
    actor_id: userId,
    remark: 'POD captured',
  })

  // Mark any pending POD task done
  await supabase
    .from('task')
    .update({ is_done: true, done_at: new Date().toISOString() })
    .eq('source_entity_type', 'dispatch')
    .eq('source_entity_id', params.dispatch_id)
    .eq('type', 'dispatch_pod_pending')
    .eq('is_done', false)

  try {
    await inngest.send({
      name: 'dispatch.completed',
      data: { dispatch_id: params.dispatch_id, pod_url: params.pod_url },
    })
  } catch (e) { console.warn('inngest.send(dispatch.completed/pod) failed (non-fatal):', e) }

  revalidatePath(`/dispatches/${params.dispatch_id}`)
  revalidatePath('/dispatches')
  revalidatePath('/warehouse')
  return { success: true }
}

export async function updateDispatchNotes(
  dispatchId: string,
  notes: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data: existing } = await supabase
    .from('dispatch')
    .select('id, project_id, dispatch_number, notes')
    .eq('id', dispatchId)
    .single()
  if (!existing) return { error: 'Dispatch not found' }

  const cleaned = notes.trim()
  const { error } = await supabase
    .from('dispatch')
    .update({
      notes: cleaned.length > 0 ? cleaned : null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', dispatchId)
  if (error) return { error: error.message }

  // Surface the change on the project's timeline so the manager sees that
  // the dispatcher logged something on this tranche.
  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'dispatch',
    entity_id: dispatchId,
    project_id: existing.project_id,
    type: 'note',
    actor_id: userId,
    content: {
      note: cleaned
        ? `Dispatch ${existing.dispatch_number} note updated: ${cleaned.slice(0, 280)}`
        : `Dispatch ${existing.dispatch_number} note cleared`,
    },
  })

  revalidatePath(`/dispatches/${dispatchId}`)
  revalidatePath('/dispatches')
  revalidatePath('/warehouse')
  if (existing.project_id) revalidatePath(`/projects/${existing.project_id}`)
  return { success: true }
}

export async function createTransporter(params: {
  name: string
  contact_name?: string
  phone?: string
  vehicle_count?: number
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data, error } = await supabase
    .from('transporter')
    .insert({
      tenant_id: tenantId,
      name: params.name,
      contact_name: params.contact_name ?? null,
      phone: params.phone ?? null,
      vehicle_count: params.vehicle_count ?? null,
      notes: params.notes ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/dispatches')
  revalidatePath('/warehouse')
  return { id: data.id }
}
