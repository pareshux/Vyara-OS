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

export async function createFuelType(params: {
  code: string
  label: string
  sort_order?: number
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage fuel types' }
  if (!params.code.trim() || !params.label.trim()) return { error: 'Code and label are required' }

  const { data, error } = await ctx.supabase
    .from('fuel_type')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '_'),
      label: params.label.trim(),
      sort_order: params.sort_order ?? 0,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/fuel-types')
  revalidatePath('/admin/vehicles')
  revalidatePath('/admin/vehicle-rates')
  return { id: data.id }
}

export async function updateFuelType(
  id: string,
  patch: Partial<{ label: string; sort_order: number; is_active: boolean }>,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage fuel types' }

  const { error } = await ctx.supabase
    .from('fuel_type')
    .update({ ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/fuel-types')
  revalidatePath('/admin/vehicles')
  revalidatePath('/admin/vehicle-rates')
  return { success: true }
}
