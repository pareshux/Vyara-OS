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

export async function createSampleRequest(data: {
  project_id: string
  product_id: string
  contact_id?: string
  qty: number
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  // Fetch product name for activity note
  const { data: product } = await supabase
    .from('product')
    .select('name')
    .eq('id', data.product_id)
    .single()

  const { data: sample, error } = await supabase
    .from('sample_request')
    .insert({
      tenant_id: tenantId,
      project_id: data.project_id,
      product_id: data.product_id,
      contact_id: data.contact_id ?? null,
      qty: data.qty,
      notes: data.notes ?? null,
      status: 'requested',
      requested_at: new Date().toISOString(),
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createSampleRequest error', error)
    return { error: error.message }
  }

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'sample_request',
    entity_id: sample.id,
    project_id: data.project_id,
    type: 'sample',
    actor_id: userId,
    content: { note: `Sample requested for ${product?.name ?? 'product'}` },
  })

  revalidatePath(`/projects/${data.project_id}`)
  return { id: sample.id }
}

export async function updateSampleStatus(
  sampleId: string,
  status: 'dispatched' | 'delivered' | 'no_outcome',
  outcomeNotes?: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  // Fetch sample to get project_id
  const { data: existing, error: fetchError } = await supabase
    .from('sample_request')
    .select('project_id')
    .eq('id', sampleId)
    .single()

  if (fetchError || !existing) return { error: 'Sample not found' }

  const updatePayload: Record<string, unknown> = {
    status,
    updated_by: userId,
    updated_at: new Date().toISOString(),
    outcome_notes: outcomeNotes ?? null,
  }

  if (status === 'dispatched') {
    updatePayload.dispatched_at = new Date().toISOString()
  } else if (status === 'delivered' || status === 'no_outcome') {
    updatePayload.outcome_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('sample_request')
    .update(updatePayload)
    .eq('id', sampleId)

  if (error) {
    console.error('updateSampleStatus error', error)
    return { error: error.message }
  }

  const statusLabel =
    status === 'dispatched' ? 'Dispatched' :
    status === 'delivered' ? 'Delivered' :
    'No outcome'

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'sample_request',
    entity_id: sampleId,
    project_id: existing.project_id,
    type: 'sample',
    actor_id: userId,
    content: { note: `Sample status: ${statusLabel}` },
  })

  revalidatePath(`/projects/${existing.project_id}`)
  return { success: true }
}
