'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createSpecification(params: {
  project_id: string
  product_id: string
  finish?: string
  quantity?: number
  unit?: string
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const { data, error } = await supabase
    .from('specification')
    .insert({
      tenant_id: profile.tenant_id,
      project_id: params.project_id,
      product_id: params.product_id,
      finish: params.finish ?? null,
      quantity: params.quantity ?? null,
      unit: params.unit ?? null,
      notes: params.notes ?? null,
      is_confirmed: false,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createSpecification error', error)
    return { error: error.message }
  }

  await supabase.from('activity').insert({
    tenant_id: profile.tenant_id,
    entity_type: 'project',
    entity_id: params.project_id,
    project_id: params.project_id,
    type: 'created',
    actor_id: user.id,
    content: { note: 'Specification added' },
  })

  revalidatePath(`/projects/${params.project_id}`)
  return { id: data.id }
}
