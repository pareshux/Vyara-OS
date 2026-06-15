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

  await inngest.send({
    name: 'dispatch.scheduled',
    data: { dispatch_id: dispatch.id, order_id: params.sales_order_id },
  })

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
    await inngest.send({
      name: 'dispatch.completed',
      data: { dispatch_id: dispatchId },
    })

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
    .select('current_stage_id, project_id')
    .eq('id', params.dispatch_id)
    .single()
  if (!dispatch) return { error: 'Dispatch not found' }

  const { error: uErr } = await supabase
    .from('dispatch')
    .update({
      pod_url: params.pod_url,
      pod_signature_name: params.signature_name ?? null,
      pod_uploaded_at: new Date().toISOString(),
      pod_uploaded_by: userId,
      current_stage_id: podStageId,
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
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

  await inngest.send({
    name: 'dispatch.completed',
    data: { dispatch_id: params.dispatch_id, pod_url: params.pod_url },
  })

  revalidatePath(`/dispatches/${params.dispatch_id}`)
  revalidatePath('/dispatches')
  revalidatePath('/warehouse')
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
