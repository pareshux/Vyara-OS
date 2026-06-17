'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'
import { attemptReserveOrderLines } from './reservations'

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

/**
 * Get the dealer record for the current dealer-role user. Returns null
 * if user is not a dealer or has no active link.
 */
async function resolveDealerForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ id: string; firm_id: string; firm_name: string; default_project_id: string | null; tenant_id: string } | null> {
  const { data } = await supabase
    .from('dealer_user')
    .select(
      `dealer:dealer_id(id, firm_id, default_project_id, tenant_id, firm:firm_id(name))`
    )
    .eq('auth_user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return null
  const d = (Array.isArray(data.dealer) ? data.dealer[0] : data.dealer) as
    | { id: string; firm_id: string; default_project_id: string | null; tenant_id: string; firm: { name: string } | { name: string }[] | null }
    | null
  if (!d) return null
  const firm = (Array.isArray(d.firm) ? d.firm[0] : d.firm) as { name: string } | null
  return {
    id: d.id,
    firm_id: d.firm_id,
    default_project_id: d.default_project_id,
    tenant_id: d.tenant_id,
    firm_name: firm?.name ?? 'Dealer',
  }
}

/**
 * Ensure the dealer has a default project. Creates "Dealer orders — {firm_name}"
 * if missing. Returns the project_id. The created project has segment='dealer',
 * an initial 'active' stage (seeded in 0012), and an owner picked from the
 * tenant's first admin/manager (best-effort fallback).
 */
async function ensureDealerProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealer: { id: string; firm_id: string; firm_name: string; default_project_id: string | null; tenant_id: string },
  actorUserId: string
): Promise<{ projectId: string } | { error: string }> {
  if (dealer.default_project_id) return { projectId: dealer.default_project_id }

  // Resolve initial stage for segment='dealer'
  const { data: stage } = await supabase
    .from('pipeline_stage')
    .select('id')
    .eq('segment', 'dealer')
    .eq('stage_key', 'active')
    .or(`tenant_id.eq.${dealer.tenant_id},tenant_id.is.null`)
    .order('tenant_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (!stage) return { error: 'No pipeline_stage seeded for segment=dealer' }

  // Resolve a sensible owner — first active admin/manager for this tenant
  const { data: owner } = await supabase
    .from('user_profile')
    .select('id')
    .eq('tenant_id', dealer.tenant_id)
    .in('role', ['admin', 'manager'])
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  const { data: project, error: pErr } = await supabase
    .from('project')
    .insert({
      tenant_id: dealer.tenant_id,
      name: `Dealer orders — ${dealer.firm_name}`,
      segment: 'dealer',
      current_stage_id: stage.id,
      buyer_firm_id: dealer.firm_id,
      owner_id: owner?.id ?? actorUserId,
      city: null,
      estimated_value: 0,
    })
    .select('id')
    .single()
  if (pErr) return { error: pErr.message }

  await supabase
    .from('dealer')
    .update({ default_project_id: project.id })
    .eq('id', dealer.id)

  return { projectId: project.id }
}

// ─── placeDealerOrder ────────────────────────────────────────────────────────

export async function placeDealerOrder(params: {
  expected_delivery_at?: string  // ISO date
  site_ref?: string              // dealer's optional PO / site reference; goes into notes
  notes?: string
  lines: Array<{ product_id: string; quantity: number }>
}): Promise<{ id: string; order_number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.role !== 'dealer') return { error: 'Only dealer users can place dealer-portal orders' }
  if (!params.lines?.length) return { error: 'At least one line item is required' }

  const dealer = await resolveDealerForUser(ctx.supabase, ctx.userId)
  if (!dealer) return { error: 'No active dealer record found for your account' }

  // Auto-create or reuse the dealer's default project
  const projRes = await ensureDealerProject(ctx.supabase, dealer, ctx.userId)
  if ('error' in projRes) return projRes
  const projectId = projRes.projectId

  // Resolve order owner — same admin/manager as the dealer's project owner
  const { data: owner } = await ctx.supabase
    .from('project')
    .select('owner_id')
    .eq('id', projectId)
    .single()

  // Resolve product snapshots
  const productIds = Array.from(new Set(params.lines.map((l) => l.product_id)))
  const { data: products } = await ctx.supabase
    .from('product')
    .select('id, sku_code, name, unit, mrp')
    .in('id', productIds)
    .eq('is_active', true)
    .is('deleted_at', null)
  const byId = Object.fromEntries((products ?? []).map((p) => [p.id, p as { id: string; sku_code: string; name: string; unit: string; mrp: number | null }]))
  for (const l of params.lines) {
    if (!byId[l.product_id]) return { error: `Product ${l.product_id} not found or inactive` }
  }

  // Resolve initial stage_id for sales_order
  const { data: stage } = await ctx.supabase
    .from('order_stage')
    .select('id')
    .is('tenant_id', null)
    .eq('stage_key', 'confirmed')
    .single()
  if (!stage) return { error: 'Order stages not seeded' }

  // Build notes: combine site_ref + notes
  const combinedNotes = [
    params.site_ref ? `Site / PO ref: ${params.site_ref.trim()}` : '',
    params.notes?.trim() ?? '',
  ].filter(Boolean).join('\n\n') || null

  // Insert order (uses dealer's MRP for price — dealer-specific pricing is Slice 3.5+)
  const totalValue = params.lines.reduce((sum, l) => {
    const p = byId[l.product_id]
    const unitPrice = p.mrp ? Number(p.mrp) : 0
    return sum + l.quantity * unitPrice
  }, 0)

  const { data: order, error: oErr } = await ctx.supabase
    .from('sales_order')
    .insert({
      tenant_id: ctx.tenantId,
      project_id: projectId,
      quote_id: null,
      buyer_firm_id: dealer.firm_id,
      current_stage_id: stage.id,
      expected_delivery_at: params.expected_delivery_at ?? null,
      value: totalValue,
      notes: combinedNotes,
      owner_id: owner?.owner_id ?? ctx.userId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      created_via: 'dealer_portal',
    })
    .select('id, order_number')
    .single()
  if (oErr) return { error: oErr.message }

  // Lines with snapshots
  const lineRows = params.lines.map((l, i) => {
    const p = byId[l.product_id]
    const unitPrice = p.mrp ? Number(p.mrp) : 0
    return {
      tenant_id: ctx.tenantId,
      sales_order_id: order.id,
      product_id: l.product_id,
      product_name: p.name,
      sku_code: p.sku_code,
      unit: p.unit,
      quantity: l.quantity,
      unit_price: unitPrice,
      line_total: l.quantity * unitPrice,
      sort_order: i,
    }
  })
  const { error: lErr } = await ctx.supabase.from('sales_order_line').insert(lineRows)
  if (lErr) return { error: lErr.message }

  // Stage history
  await ctx.supabase.from('sales_order_stage_history').insert({
    tenant_id: ctx.tenantId,
    sales_order_id: order.id,
    from_stage_id: null,
    to_stage_id: stage.id,
    actor_id: ctx.userId,
    remark: 'Order placed via dealer portal',
  })

  try {
    await inngest.send({
      name: 'order.created',
      data: { order_id: order.id, quote_id: '' },
    })
  } catch (e) { console.warn('inngest.send(order.created/dealer) failed (non-fatal):', e) }

  try {
    await attemptReserveOrderLines(order.id)
  } catch (e) { console.warn('attemptReserveOrderLines failed (non-fatal):', e) }

  revalidatePath('/dealer-portal/orders')
  revalidatePath('/dealer-portal/dashboard')
  revalidatePath('/orders')  // internal team should see the new order too
  return { id: order.id, order_number: order.order_number as string }
}
