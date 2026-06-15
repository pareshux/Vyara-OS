'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/aisensy/client'
import { inngest } from '@/lib/inngest/client'

async function getActorContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

async function stageIdByKey(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('collection_stage')
    .select('id')
    .is('tenant_id', null)
    .eq('stage_key', key)
    .single()
  return data?.id as string | undefined
}

async function advanceCollectionStage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  collectionId: string,
  newStageKey: string,
  remark?: string,
  actorId?: string,
  tenantId?: string
): Promise<{ success: true } | { error: string }> {
  const newStageId = await stageIdByKey(supabase, newStageKey)
  if (!newStageId) return { error: `Stage ${newStageKey} not seeded` }
  const { data: existing } = await supabase
    .from('collection')
    .select('current_stage_id')
    .eq('id', collectionId)
    .single()
  if (!existing) return { error: 'Collection not found' }
  if (existing.current_stage_id === newStageId) return { success: true }

  const { error: uErr } = await supabase
    .from('collection')
    .update({
      current_stage_id: newStageId,
      updated_at: new Date().toISOString(),
      updated_by: actorId ?? null,
    })
    .eq('id', collectionId)
  if (uErr) return { error: uErr.message }

  if (tenantId) {
    await supabase.from('collection_stage_history').insert({
      tenant_id: tenantId,
      collection_id: collectionId,
      from_stage_id: existing.current_stage_id,
      to_stage_id: newStageId,
      actor_id: actorId ?? null,
      remark: remark ?? null,
    })
  }
  return { success: true }
}

// ─── Server actions ────────────────────────────────────────────────────────

export async function recordReceipt(params: {
  invoice_id: string
  amount: number
  payment_mode: 'cheque' | 'neft' | 'rtgs' | 'upi' | 'cash' | 'card' | 'other'
  payment_reference?: string
  received_at: string  // YYYY-MM-DD
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data, error } = await supabase
    .from('receipt')
    .insert({
      tenant_id: tenantId,
      invoice_id: params.invoice_id,
      amount: params.amount,
      payment_mode: params.payment_mode,
      payment_reference: params.payment_reference ?? null,
      received_at: params.received_at,
      notes: params.notes ?? null,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await inngest.send({
    name: 'payment.received',
    data: { invoice_id: params.invoice_id, amount: params.amount },
  })

  revalidatePath('/collections')
  revalidatePath('/invoices')
  revalidatePath(`/invoices/${params.invoice_id}`)
  return { id: data.id }
}

export async function recordPromiseToPay(params: {
  collection_id: string
  invoice_id: string
  amount: number
  promise_date: string
  contact_id?: string
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data, error } = await supabase
    .from('promise_to_pay')
    .insert({
      tenant_id: tenantId,
      collection_id: params.collection_id,
      invoice_id: params.invoice_id,
      amount: params.amount,
      promise_date: params.promise_date,
      contact_id: params.contact_id ?? null,
      notes: params.notes ?? null,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await advanceCollectionStage(supabase, params.collection_id, 'promise_to_pay', 'PTP recorded', userId, tenantId)

  // Open a follow-up task on the promise date
  await supabase.from('task').insert({
    tenant_id: tenantId,
    type: 'payment_ptp',
    title: `Follow up: PTP ₹${params.amount.toLocaleString('en-IN')} due ${params.promise_date}`,
    description: 'Confirm if the promise to pay was honoured.',
    due_at: new Date(`${params.promise_date}T10:00:00.000Z`).toISOString(),
    priority: 'high',
    source_entity_type: 'collection',
    source_entity_id: params.collection_id,
  })

  await inngest.send({
    name: 'payment.promised',
    data: { promise_id: data.id, amount: params.amount, promise_date: params.promise_date },
  })

  revalidatePath('/collections')
  revalidatePath(`/invoices/${params.invoice_id}`)
  return { id: data.id }
}

export async function sendDunningWhatsApp(params: {
  collection_id: string
  template_key?: string
  to_phone: string
  message_text: string   // human-readable preview (kept in payload + as stub fallback)
  invoice_number: string
  amount: string
}): Promise<{ ok: true; mode: string; activity_id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const template = params.template_key ?? 'vyara_dunning_v1'
  const result = await sendWhatsApp({
    to: params.to_phone,
    template,
    params: { invoice_number: params.invoice_number, amount: params.amount },
    fallbackText: params.message_text,
  })

  if (!result.ok) {
    // Log a failed attempt
    await supabase.from('collection_activity').insert({
      tenant_id: tenantId,
      collection_id: params.collection_id,
      channel: 'whatsapp',
      template_key: template,
      outcome: 'failed',
      notes: result.error,
      payload: { to: params.to_phone, params: { invoice_number: params.invoice_number, amount: params.amount } },
      created_by: userId,
    })
    return { error: result.error }
  }

  const { data, error } = await supabase
    .from('collection_activity')
    .insert({
      tenant_id: tenantId,
      collection_id: params.collection_id,
      channel: 'whatsapp',
      template_key: template,
      outcome: 'sent',
      external_id: result.messageId,
      payload: {
        to: params.to_phone,
        params: { invoice_number: params.invoice_number, amount: params.amount },
        mode: result.mode,
      },
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await supabase
    .from('collection')
    .update({ last_dunning_at: new Date().toISOString() })
    .eq('id', params.collection_id)

  // Auto-advance to dunning_whatsapp if not already there
  await advanceCollectionStage(supabase, params.collection_id, 'dunning_whatsapp', 'WhatsApp dunning sent', userId, tenantId)

  revalidatePath('/collections')
  return { ok: true, mode: result.mode, activity_id: data.id }
}

export async function markCollectionDisputed(
  collectionId: string,
  remark: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!remark.trim()) return { error: 'A remark is required when marking disputed' }
  const r = await advanceCollectionStage(ctx.supabase, collectionId, 'disputed', remark, ctx.userId, ctx.tenantId)
  revalidatePath('/collections')
  return r
}

export async function writeOffCollection(
  collectionId: string,
  remark: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!remark.trim()) return { error: 'A remark is required to write off' }
  const r = await advanceCollectionStage(ctx.supabase, collectionId, 'written_off', remark, ctx.userId, ctx.tenantId)
  if ('error' in r) return r
  // Also mark invoice written_off
  const { data: c } = await ctx.supabase.from('collection').select('invoice_id').eq('id', collectionId).single()
  if (c?.invoice_id) {
    await ctx.supabase.from('invoice').update({ status: 'written_off' }).eq('id', c.invoice_id)
  }
  revalidatePath('/collections')
  return { success: true }
}
