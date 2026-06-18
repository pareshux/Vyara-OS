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

/**
 * Sets the current rate for a (vehicle_type, fuel_type) combination.
 * If a current (effective_to IS NULL) row exists, it is closed out at
 * effective_from - 1 day and a new row is inserted. If no row exists,
 * a new one is inserted. Same call covers create + supersede.
 */
export async function setReimbursementRate(params: {
  vehicle_type_id: string
  fuel_type_id: string
  rate_per_km: number
  effective_from?: string // ISO date; defaults to today
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage rates' }
  if (!(params.rate_per_km >= 0)) return { error: 'Rate must be ≥ 0' }

  const effectiveFrom = params.effective_from ?? new Date().toISOString().slice(0, 10)
  // Compute effective_to for the row we're replacing: one day before effective_from.
  const fromDate = new Date(effectiveFrom + 'T00:00:00Z')
  fromDate.setUTCDate(fromDate.getUTCDate() - 1)
  const closeOutDate = fromDate.toISOString().slice(0, 10)

  // Close out the existing current row (if any).
  const { error: closeErr } = await ctx.supabase
    .from('vehicle_reimbursement_rate')
    .update({
      effective_to: closeOutDate,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenantId)
    .eq('vehicle_type_id', params.vehicle_type_id)
    .eq('fuel_type_id', params.fuel_type_id)
    .is('effective_to', null)
    .is('deleted_at', null)
  if (closeErr) return { error: closeErr.message }

  // Insert the new current row.
  const { data, error } = await ctx.supabase
    .from('vehicle_reimbursement_rate')
    .insert({
      tenant_id: ctx.tenantId,
      vehicle_type_id: params.vehicle_type_id,
      fuel_type_id: params.fuel_type_id,
      rate_per_km: params.rate_per_km,
      effective_from: effectiveFrom,
      effective_to: null,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/vehicle-rates')
  revalidatePath('/admin/vehicles')
  return { id: data.id }
}

/**
 * Soft-clears a current rate (effective_to = today). Used when an admin
 * wants to "unset" a rate without immediately replacing it. After this,
 * vehicles using this (type, fuel) combination fall back to their
 * per-vehicle custom_rate_per_km or NULL (manual entry on claim).
 */
export async function clearReimbursementRate(params: {
  vehicle_type_id: string
  fuel_type_id: string
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage rates' }

  const today = new Date().toISOString().slice(0, 10)
  const { error } = await ctx.supabase
    .from('vehicle_reimbursement_rate')
    .update({
      effective_to: today,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenantId)
    .eq('vehicle_type_id', params.vehicle_type_id)
    .eq('fuel_type_id', params.fuel_type_id)
    .is('effective_to', null)
    .is('deleted_at', null)
  if (error) return { error: error.message }
  revalidatePath('/admin/vehicle-rates')
  revalidatePath('/admin/vehicles')
  return { success: true }
}
