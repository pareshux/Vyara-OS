'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  pullInvoices,
  pullReceipts,
  tallyMode,
} from '@/lib/tally/client'

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

export async function runTallyReconciliation(): Promise<
  | { ok: true; deferred?: boolean; drift_detected: number; log_id: string }
  | { error: string }
> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const started = Date.now()
  if (tallyMode() === 'deferred') {
    const { data: log, error } = await supabase
      .from('tally_sync_log')
      .insert({
        tenant_id: tenantId,
        direction: 'reconcile',
        trigger: 'manual',
        status: 'deferred',
        started_at: new Date(started).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        message: 'TALLY_URL not configured — sync deferred. Manual / CSV path remains the source of truth.',
        actor_id: userId,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    revalidatePath('/finance/tally')
    return { ok: true, deferred: true, drift_detected: 0, log_id: log.id }
  }

  // Live mode — pull + compare
  const invRes = await pullInvoices()
  const recRes = await pullReceipts()
  if (!invRes.ok || !recRes.ok) {
    const { data: log } = await supabase
      .from('tally_sync_log')
      .insert({
        tenant_id: tenantId,
        direction: 'reconcile',
        trigger: 'manual',
        status: 'failed',
        started_at: new Date(started).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        errors: [invRes.error, recRes.error].filter(Boolean),
        message: 'Tally pull failed',
        actor_id: userId,
      })
      .select('id')
      .single()
    return { error: 'Tally pull failed', ...(log ? {} : {}) }
  }

  // Detect drift: for each pulled invoice, find local match by external_invoice_number
  const { data: ours } = await supabase
    .from('invoice')
    .select('id, external_invoice_number, total, paid_amount, status')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)

  type LocalInv = { id: string; external_invoice_number: string | null; total: number; paid_amount: number; status: string }
  const oursByExt = Object.fromEntries(
    ((ours ?? []) as LocalInv[])
      .filter((i) => i.external_invoice_number)
      .map((i) => [i.external_invoice_number as string, i])
  )

  const driftRows: Array<{
    tenant_id: string
    entity_type: 'invoice'
    entity_id: string | null
    external_id: string
    field: string | null
    our_value: unknown
    tally_value: unknown
  }> = []

  for (const ti of invRes.invoices) {
    const local = oursByExt[ti.external_invoice_number]
    if (!local) {
      driftRows.push({
        tenant_id: tenantId,
        entity_type: 'invoice',
        entity_id: null,
        external_id: ti.external_id,
        field: null,
        our_value: null,
        tally_value: ti,
      })
      continue
    }
    if (Math.abs(Number(local.total) - Number(ti.total)) > 0.01) {
      driftRows.push({
        tenant_id: tenantId,
        entity_type: 'invoice',
        entity_id: local.id,
        external_id: ti.external_id,
        field: 'total',
        our_value: local.total,
        tally_value: ti.total,
      })
    }
    if (Math.abs(Number(local.paid_amount) - Number(ti.paid_amount)) > 0.01) {
      driftRows.push({
        tenant_id: tenantId,
        entity_type: 'invoice',
        entity_id: local.id,
        external_id: ti.external_id,
        field: 'paid_amount',
        our_value: local.paid_amount,
        tally_value: ti.paid_amount,
      })
    }
  }

  const { data: log } = await supabase
    .from('tally_sync_log')
    .insert({
      tenant_id: tenantId,
      direction: 'reconcile',
      trigger: 'manual',
      status: driftRows.length > 0 ? 'partial' : 'success',
      invoices_pulled: invRes.invoices.length,
      receipts_pulled: recRes.receipts.length,
      drift_detected: driftRows.length,
      started_at: new Date(started).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      actor_id: userId,
    })
    .select('id')
    .single()

  if (driftRows.length > 0 && log) {
    const rowsWithLog = driftRows.map((d) => ({ ...d, detected_in: log.id }))
    await supabase.from('tally_drift').insert(rowsWithLog)
  }

  revalidatePath('/finance/tally')
  return { ok: true, drift_detected: driftRows.length, log_id: log?.id ?? '' }
}

export async function resolveDrift(
  driftId: string,
  resolution: 'manual_review' | 'resolved' | 'ignored',
  notes?: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId } = ctx

  const { error } = await supabase
    .from('tally_drift')
    .update({
      status: resolution,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      notes: notes ?? null,
    })
    .eq('id', driftId)
  if (error) return { error: error.message }
  revalidatePath('/finance/tally')
  return { success: true }
}
