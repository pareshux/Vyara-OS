'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { consumeSampleStock } from './sample-consumption'

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
  quantity: number
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  const { data: sample, error } = await supabase
    .from('sample_request')
    .insert({
      tenant_id: tenantId,
      project_id: data.project_id,
      product_id: data.product_id,
      contact_id: data.contact_id ?? null,
      quantity: data.quantity,
      notes: data.notes ?? null,
      status: 'pending',
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createSampleRequest error', error)
    return { error: error.message }
  }

  // Activity timeline is auto-written by trg_sample_activity on INSERT
  // ('sample_requested'). No manual activity insert needed.

  revalidatePath(`/projects/${data.project_id}`)
  return { id: sample.id }
}

/**
 * UI status options:
 *  - 'dispatched'        → DB 'dispatched' (sets dispatched_at)
 *  - 'delivered'         → DB 'delivered'  (sets delivered_at)
 *  - 'outcome_positive'  → DB 'outcome_positive' (customer specified us / placed order)
 *  - 'outcome_negative'  → DB 'outcome_negative' (customer rejected / chose competitor)
 *  - 'cancelled'         → DB 'cancelled' (request abandoned)
 */
export type SampleStatusUpdate =
  | 'dispatched'
  | 'delivered'
  | 'outcome_positive'
  | 'outcome_negative'
  | 'cancelled'

export type UpdateSampleStatusResult =
  | { success: true; sampleConsumed?: boolean; sampleConsumeError?: string; sampleWarehouseCode?: string }
  | { error: string }

export async function updateSampleStatus(
  sampleId: string,
  status: SampleStatusUpdate,
  outcomeNotes?: string
): Promise<UpdateSampleStatusResult> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId } = ctx

  const updatePayload: Record<string, unknown> = {
    status,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }
  if (outcomeNotes !== undefined) {
    updatePayload.outcome_notes = outcomeNotes
  }

  if (status === 'dispatched') {
    updatePayload.dispatched_at = new Date().toISOString()
  } else if (status === 'delivered') {
    updatePayload.delivered_at = new Date().toISOString()
  }

  const { data: existing } = await supabase
    .from('sample_request')
    .select('project_id')
    .eq('id', sampleId)
    .single()

  const { error } = await supabase
    .from('sample_request')
    .update(updatePayload)
    .eq('id', sampleId)

  if (error) {
    console.error('updateSampleStatus error', error)
    return { error: error.message }
  }

  // trg_sample_activity writes 'sample_updated' on any status change.
  // No manual activity insert needed.

  // When the sample becomes 'dispatched', consume from the SAMPLES warehouse
  // bucket so commercial stock isn't affected. Non-blocking: if consumption
  // fails (e.g. no samples warehouse, insufficient stock), the status change
  // still sticks and we surface the warning to the caller.
  let sampleConsumed: boolean | undefined
  let sampleConsumeError: string | undefined
  let sampleWarehouseCode: string | undefined
  if (status === 'dispatched') {
    const result = await consumeSampleStock(sampleId)
    if ('error' in result) {
      sampleConsumed = false
      sampleConsumeError = result.error
    } else {
      sampleConsumed = result.consumed
      sampleWarehouseCode = result.warehouse_code
    }
  }

  if (existing) revalidatePath(`/projects/${existing.project_id}`)
  return { success: true, sampleConsumed, sampleConsumeError, sampleWarehouseCode }
}
