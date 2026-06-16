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

export type VendorType = 'supplier' | 'contractor' | 'service' | 'other'

const VENDOR_TYPES: VendorType[] = ['supplier', 'contractor', 'service', 'other']

export async function createVendor(params: {
  code: string
  name: string
  vendor_type: VendorType
  gstin?: string
  contact_name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage vendors' }
  if (!params.code.trim() || !params.name.trim()) return { error: 'Code and name are required' }
  if (!VENDOR_TYPES.includes(params.vendor_type)) return { error: 'Invalid vendor type' }

  const { data, error } = await ctx.supabase
    .from('vendor')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '-'),
      name: params.name.trim(),
      vendor_type: params.vendor_type,
      gstin: params.gstin?.trim() || null,
      contact_name: params.contact_name?.trim() || null,
      phone: params.phone?.trim() || null,
      email: params.email?.trim().toLowerCase() || null,
      address: params.address?.trim() || null,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/vendors')
  return { id: data.id }
}

export async function updateVendor(
  id: string,
  patch: Partial<{
    name: string
    vendor_type: VendorType
    gstin: string | null
    contact_name: string | null
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    is_active: boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage vendors' }
  if (patch.vendor_type && !VENDOR_TYPES.includes(patch.vendor_type)) {
    return { error: 'Invalid vendor type' }
  }

  const { error } = await ctx.supabase
    .from('vendor')
    .update({ ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/vendors')
  return { success: true }
}
