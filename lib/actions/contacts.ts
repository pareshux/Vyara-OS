'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getTenantId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_profile')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  return data?.tenant_id ?? null
}

export async function createFirm(params: {
  name: string
  type: string
  city?: string
  phone?: string
  email?: string
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  if (!tenantId) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('firm')
    .insert({
      tenant_id: tenantId,
      name: params.name,
      type: params.type,
      city: params.city ?? null,
      phone: params.phone ?? null,
      email: params.email ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createFirm error', error)
    return { error: error.message }
  }

  revalidatePath('/contacts')
  return { id: data.id }
}

export async function createContact(params: {
  full_name: string
  firm_id?: string
  role_title?: string
  phone?: string
  email?: string
  city?: string
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  if (!tenantId) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('contact')
    .insert({
      tenant_id: tenantId,
      full_name: params.full_name,
      firm_id: params.firm_id ?? null,
      role_title: params.role_title ?? null,
      phone: params.phone ?? null,
      email: params.email ?? null,
      city: params.city ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createContact error', error)
    return { error: error.message }
  }

  revalidatePath('/contacts')
  return { id: data.id }
}
