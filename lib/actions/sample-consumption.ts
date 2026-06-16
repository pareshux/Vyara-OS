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

/**
 * Consume sample stock for a sample request. Picks the first active
 * SAMPLES-type warehouse for the tenant. Idempotent — skips if a
 * sample_issue movement already exists for this sample_request.
 */
export async function consumeSampleStock(sampleRequestId: string): Promise<
  { consumed: boolean; warehouse_code?: string; message?: string }
  | { error: string }
> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  // Idempotency check
  const { data: prior } = await supabase
    .from('stock_movement')
    .select('id')
    .eq('related_entity_type', 'sample_request')
    .eq('related_entity_id', sampleRequestId)
    .eq('movement_type', 'sample_issue')
    .limit(1)
  if (prior && prior.length > 0) {
    return { consumed: false, message: 'Already consumed' }
  }

  const { data: sample } = await supabase
    .from('sample_request')
    .select('id, project_id, product_id, quantity')
    .eq('id', sampleRequestId)
    .single()
  if (!sample) return { error: 'Sample request not found' }

  // Find the samples warehouse
  const { data: samplesWh } = await supabase
    .from('warehouse')
    .select('id, code')
    .eq('tenant_id', tenantId)
    .eq('type', 'samples')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (!samplesWh) return { error: 'No active samples warehouse configured' }

  // Check available
  const { data: stk } = await supabase
    .from('stock')
    .select('available_qty')
    .eq('warehouse_id', samplesWh.id)
    .eq('product_id', sample.product_id)
    .maybeSingle()
  const available = stk ? Number(stk.available_qty) : 0
  const requested = Number(sample.quantity)
  if (available < requested) {
    return { error: `Sample stock insufficient: ${available} available, ${requested} requested at ${samplesWh.code}` }
  }

  const { error: movErr } = await supabase.from('stock_movement').insert({
    tenant_id: tenantId,
    warehouse_id: samplesWh.id,
    product_id: sample.product_id,
    movement_type: 'sample_issue',
    quantity: requested,
    reason_code: 'sample_dispatch',
    related_entity_type: 'sample_request',
    related_entity_id: sampleRequestId,
    actor_id: userId,
    remark: 'Sample dispatched from sample bucket',
  })
  if (movErr) return { error: movErr.message }

  revalidatePath('/inventory')
  return { consumed: true, warehouse_code: samplesWh.code }
}
