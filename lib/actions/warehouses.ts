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

export type WarehouseType = 'own_plant' | 'transit' | 'samples' | 'dealer_consignment' | 'other'

export async function createWarehouse(params: {
  code: string
  name: string
  type: WarehouseType
  city?: string
  state?: string
  address?: string
  manager_id?: string
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  if (!params.code.trim() || !params.name.trim()) return { error: 'Code and name are required' }

  const { data, error } = await supabase
    .from('warehouse')
    .insert({
      tenant_id: tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '-'),
      name: params.name.trim(),
      type: params.type,
      city: params.city?.trim() ?? null,
      state: params.state?.trim() ?? 'Gujarat',
      address: params.address?.trim() ?? null,
      manager_id: params.manager_id ?? null,
      notes: params.notes?.trim() ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/warehouses')
  return { id: data.id }
}

export async function updateWarehouse(
  id: string,
  patch: Partial<{
    name: string
    type: WarehouseType
    city: string
    state: string
    address: string
    manager_id: string | null
    notes: string
    is_active: boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId } = ctx

  const { error } = await supabase
    .from('warehouse')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/warehouses')
  revalidatePath(`/warehouses/${id}`)
  return { success: true }
}

export async function deactivateWarehouse(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId } = ctx

  const { error } = await supabase
    .from('warehouse')
    .update({ is_active: false, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/warehouses')
  return { success: true }
}
