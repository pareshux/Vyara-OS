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

/** Generate a quotation number: VT-QT-YYYY-NNNN */
async function generateQuotationNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear()

  // Count existing quotations this year for this tenant
  const { count } = await supabase
    .from('quotation')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', `${year}-01-01`)
    .lt('created_at', `${year + 1}-01-01`)

  const seq = ((count ?? 0) + 1).toString().padStart(4, '0')
  return `VT-QT-${year}-${seq}`
}

export async function createQuotation(data: {
  project_id: string
  notes?: string
  valid_until?: string
  lines: Array<{ product_id: string; quantity: number; unit_price: number; description?: string }>
}): Promise<{ id: string; number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  if (!data.lines || data.lines.length === 0) {
    return { error: 'At least one line item is required' }
  }

  const quotationNumber = await generateQuotationNumber(supabase, tenantId)

  const totalAmount = data.lines.reduce(
    (sum, line) => sum + line.quantity * line.unit_price,
    0
  )

  const { data: quotation, error: quotationError } = await supabase
    .from('quotation')
    .insert({
      tenant_id: tenantId,
      project_id: data.project_id,
      number: quotationNumber,
      status: 'draft',
      total_amount: totalAmount,
      valid_until: data.valid_until ?? null,
      notes: data.notes ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, number')
    .single()

  if (quotationError) {
    console.error('createQuotation error', quotationError)
    return { error: quotationError.message }
  }

  const lineRows = data.lines.map((line) => ({
    tenant_id: tenantId,
    quotation_id: quotation.id,
    product_id: line.product_id,
    description: line.description ?? null,
    quantity: line.quantity,
    unit_price: line.unit_price,
    total_price: line.quantity * line.unit_price,
  }))

  const { error: linesError } = await supabase
    .from('quotation_line')
    .insert(lineRows)

  if (linesError) {
    console.error('createQuotation lines error', linesError)
    return { error: linesError.message }
  }

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'quotation',
    entity_id: quotation.id,
    project_id: data.project_id,
    type: 'quote',
    actor_id: userId,
    content: { note: `Quote ${quotationNumber} created` },
  })

  revalidatePath(`/projects/${data.project_id}`)
  return { id: quotation.id, number: quotationNumber }
}

export async function updateQuotationStatus(
  quotationId: string,
  status: 'sent' | 'won' | 'lost',
  notes?: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  const { data: existing, error: fetchError } = await supabase
    .from('quotation')
    .select('project_id, number')
    .eq('id', quotationId)
    .single()

  if (fetchError || !existing) return { error: 'Quotation not found' }

  const updatePayload: Record<string, unknown> = {
    status,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }

  if (status === 'sent') {
    updatePayload.sent_at = new Date().toISOString()
  }
  if (notes) {
    updatePayload.notes = notes
  }

  const { error } = await supabase
    .from('quotation')
    .update(updatePayload)
    .eq('id', quotationId)

  if (error) {
    console.error('updateQuotationStatus error', error)
    return { error: error.message }
  }

  if (status === 'won') {
    await supabase
      .from('project')
      .update({ won_quote_id: quotationId })
      .eq('id', existing.project_id)
  }

  const statusLabel =
    status === 'sent' ? 'sent' :
    status === 'won' ? 'won' :
    'lost'

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'quotation',
    entity_id: quotationId,
    project_id: existing.project_id,
    type: 'quote',
    actor_id: userId,
    content: { note: `Quote ${existing.number} marked as ${statusLabel}` },
  })

  revalidatePath(`/projects/${existing.project_id}`)
  return { success: true }
}
