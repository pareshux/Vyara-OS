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

// Vehicle-number formatting: trim, uppercase, collapse spaces → single dash.
function normaliseVehicleNumber(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, '-')
}

async function closeOpenAssignmentRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vehicleId: string,
) {
  await supabase
    .from('vehicle_assignment_history')
    .update({ ended_at: new Date().toISOString() })
    .eq('vehicle_id', vehicleId)
    .is('ended_at', null)
}

async function openAssignmentRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  actorId: string,
  vehicleId: string,
  userId: string | null,
  reason: string | null,
) {
  await supabase
    .from('vehicle_assignment_history')
    .insert({
      tenant_id: tenantId,
      vehicle_id: vehicleId,
      user_id: userId,
      reason,
      assigned_by: actorId,
    })
}

export async function createVehicle(params: {
  vehicle_number: string
  vehicle_type_id: string
  fuel_type_id: string
  ownership: 'company' | 'personal'
  assigned_user_id?: string | null
  custom_rate_per_km?: number | null
  make_model?: string | null
  notes?: string | null
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage vehicles' }
  if (!params.vehicle_number.trim()) return { error: 'Vehicle number is required' }
  if (params.custom_rate_per_km != null && params.custom_rate_per_km < 0) {
    return { error: 'Custom rate must be ≥ 0' }
  }

  const number = normaliseVehicleNumber(params.vehicle_number)

  const { data, error } = await ctx.supabase
    .from('vehicle')
    .insert({
      tenant_id: ctx.tenantId,
      vehicle_number: number,
      vehicle_type_id: params.vehicle_type_id,
      fuel_type_id: params.fuel_type_id,
      ownership: params.ownership,
      assigned_user_id: params.assigned_user_id ?? null,
      custom_rate_per_km: params.custom_rate_per_km ?? null,
      make_model: params.make_model?.trim() || null,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Open the initial assignment history row (covers the null case too —
  // an unassigned vehicle gets one row with user_id=null so the history
  // is always non-empty for an existing vehicle).
  await openAssignmentRow(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    data.id,
    params.assigned_user_id ?? null,
    'Initial assignment',
  )

  revalidatePath('/admin/vehicles')
  return { id: data.id }
}

export async function updateVehicle(
  id: string,
  patch: Partial<{
    vehicle_number: string
    vehicle_type_id: string
    fuel_type_id: string
    ownership: 'company' | 'personal'
    custom_rate_per_km: number | null
    make_model: string | null
    notes: string | null
    is_active: boolean
  }>,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage vehicles' }
  if (patch.custom_rate_per_km != null && patch.custom_rate_per_km < 0) {
    return { error: 'Custom rate must be ≥ 0' }
  }

  const normalised: typeof patch = { ...patch }
  if (typeof patch.vehicle_number === 'string') {
    normalised.vehicle_number = normaliseVehicleNumber(patch.vehicle_number)
  }

  const { error } = await ctx.supabase
    .from('vehicle')
    .update({ ...normalised, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/vehicles')
  return { success: true }
}

/**
 * Change a vehicle's assignment. Closes the currently-open history row
 * (if any) and opens a new one. Pass user_id=null to unassign.
 */
export async function setVehicleAssignment(params: {
  vehicle_id: string
  user_id: string | null
  reason?: string | null
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage vehicles' }

  // Read current assignment so we can no-op if unchanged.
  const { data: current, error: readErr } = await ctx.supabase
    .from('vehicle')
    .select('assigned_user_id')
    .eq('id', params.vehicle_id)
    .single()
  if (readErr) return { error: readErr.message }
  if (current.assigned_user_id === params.user_id) return { success: true }

  const { error } = await ctx.supabase
    .from('vehicle')
    .update({
      assigned_user_id: params.user_id,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.vehicle_id)
  if (error) return { error: error.message }

  await closeOpenAssignmentRow(ctx.supabase, params.vehicle_id)
  await openAssignmentRow(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    params.vehicle_id,
    params.user_id,
    params.reason?.trim() || null,
  )

  revalidatePath('/admin/vehicles')
  return { success: true }
}
