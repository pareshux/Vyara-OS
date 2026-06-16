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

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

// ─── PRICE LIST (HEADER) ─────────────────────────────────────────────────────

export type Segment = 'architect' | 'dealer' | 'tender' | 'retail' | 'government' | 'corporate' | 'generic' | null

export async function createPriceList(params: {
  code: string
  label: string
  segment?: Segment
  region?: string
  currency?: string
  effective_from?: string
  effective_to?: string
  is_default?: boolean
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage price lists' }
  if (!params.code.trim() || !params.label.trim()) return { error: 'Code and label are required' }

  if (params.is_default) {
    await ctx.supabase
      .from('price_list')
      .update({ is_default: false, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId)
      .eq('is_default', true)
  }

  const { data, error } = await ctx.supabase
    .from('price_list')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '_'),
      label: params.label.trim(),
      segment: params.segment ?? null,
      region: params.region?.trim() || null,
      currency: params.currency?.trim() || 'INR',
      effective_from: params.effective_from || new Date().toISOString().slice(0, 10),
      effective_to: params.effective_to || null,
      is_default: params.is_default ?? false,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/price-lists')
  return { id: data.id }
}

export async function updatePriceList(
  id: string,
  patch: Partial<{
    label: string
    segment: Segment
    region: string | null
    currency: string
    effective_from: string
    effective_to: string | null
    is_active: boolean
    notes: string | null
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage price lists' }

  const { error } = await ctx.supabase
    .from('price_list')
    .update({ ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/price-lists')
  revalidatePath(`/admin/price-lists/${id}`)
  return { success: true }
}

export async function setDefaultPriceList(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can change defaults' }

  await ctx.supabase
    .from('price_list')
    .update({ is_default: false, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId)
    .eq('is_default', true)
    .neq('id', id)

  const { error } = await ctx.supabase
    .from('price_list')
    .update({ is_default: true, is_active: true, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/price-lists')
  return { success: true }
}

// ─── PRICE LIST ENTRY ────────────────────────────────────────────────────────

export async function upsertPriceListEntry(params: {
  id?: string  // present = update
  price_list_id: string
  product_id: string
  unit_price: number
  min_qty?: number
  valid_from?: string | null
  valid_to?: string | null
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage price entries' }
  if (params.unit_price < 0) return { error: 'Price must be non-negative' }
  if ((params.min_qty ?? 0) < 0) return { error: 'Min qty must be non-negative' }

  if (params.id) {
    const { error } = await ctx.supabase
      .from('price_list_entry')
      .update({
        unit_price: params.unit_price,
        min_qty: params.min_qty ?? 0,
        valid_from: params.valid_from ?? null,
        valid_to: params.valid_to ?? null,
        notes: params.notes?.trim() || null,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
    if (error) return { error: error.message }
    revalidatePath(`/admin/price-lists/${params.price_list_id}`)
    return { id: params.id }
  } else {
    const { data, error } = await ctx.supabase
      .from('price_list_entry')
      .insert({
        tenant_id: ctx.tenantId,
        price_list_id: params.price_list_id,
        product_id: params.product_id,
        unit_price: params.unit_price,
        min_qty: params.min_qty ?? 0,
        valid_from: params.valid_from ?? null,
        valid_to: params.valid_to ?? null,
        notes: params.notes?.trim() || null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') {
        return { error: 'An entry for this product + min_qty already exists in this list — edit the existing row instead.' }
      }
      return { error: error.message }
    }
    revalidatePath(`/admin/price-lists/${params.price_list_id}`)
    return { id: data.id }
  }
}

export async function deletePriceListEntry(
  entryId: string,
  priceListId: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can delete price entries' }

  const { error } = await ctx.supabase.from('price_list_entry').delete().eq('id', entryId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/price-lists/${priceListId}`)
  return { success: true }
}

// ─── ACTIVE-PRICE LOOKUP (for quote + order line forms) ──────────────────────

export type ActivePrice = {
  unit_price: number
  price_list_id: string
  price_list_code: string
  price_list_label: string
  entry_id: string
} | null

/**
 * Resolves the active price for a product on a given project. Wraps the
 * get_active_price() SQL function (migration 0014) which already encodes
 * resolution priority: (segment+region) > (segment) > (region) > (default).
 *
 * Returns null if no price list covers the product — caller should fall
 * back to product.base_price / mrp.
 */
export async function getActivePriceForLine(params: {
  project_id: string
  product_id: string
  qty: number
}): Promise<{ price: ActivePrice } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!params.product_id || !params.project_id) return { error: 'Missing project or product' }

  // Read project segment + (text) territory — RLS handles tenant isolation
  const { data: project } = await ctx.supabase
    .from('project')
    .select('segment, territory')
    .eq('id', params.project_id)
    .maybeSingle()
  if (!project) return { error: 'Project not found' }

  // Resolve the price (returns price_list_id + entry_id + unit_price, or NULL row)
  const { data: row, error } = await ctx.supabase.rpc('get_active_price', {
    p_tenant: ctx.tenantId,
    p_product: params.product_id,
    p_segment: project.segment ?? null,
    p_region: project.territory ?? null,
    p_qty: params.qty,
  })
  if (error) return { error: error.message }

  // RPC returns an array of rows (a SETOF function); take the first non-null one
  const first = Array.isArray(row) ? row[0] : row
  if (!first || !first.price_list_id) return { price: null }

  // Resolve the price-list code/label for display
  const { data: list } = await ctx.supabase
    .from('price_list')
    .select('code, label')
    .eq('id', first.price_list_id)
    .maybeSingle()

  return {
    price: {
      unit_price: Number(first.unit_price),
      price_list_id: first.price_list_id,
      price_list_code: list?.code ?? '—',
      price_list_label: list?.label ?? '—',
      entry_id: first.entry_id,
    },
  }
}
