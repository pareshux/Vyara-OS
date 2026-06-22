'use server'

// Capability: Delivery (procurement)
// Job-work challan — when materials go out for processing (cutting,
// coating, assembly) but remain on our books. Quarterly ITC-04 return
// to GSTN reports all challans + receipts within a quarter.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function getActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return {
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id as string,
    role: profile.role as string,
  }
}

export type JobWorkStatus = 'sent' | 'partly_received' | 'fully_received' | 'cancelled'

export type JobWorkRow = {
  id: string
  challan_number: string
  challan_date: string
  job_worker_id: string
  job_worker_name: string
  job_worker_gstin: string | null
  description: string
  hsn_code: string | null
  unit: string
  qty_sent: number
  rate: number | null
  process_nature: string
  expected_return_date: string | null
  qty_received_back: number
  qty_scrap: number
  qty_pending: number
  received_back_at: string | null
  status: JobWorkStatus
  notes: string | null
}

export async function createJobWorkChallan(params: {
  job_worker_id: string
  description: string
  hsn_code?: string | null
  unit?: string
  qty_sent: number
  rate?: number | null
  process_nature: string
  expected_return_date?: string | null
  notes?: string | null
}): Promise<{ ok: true; id: string; challan_number: string } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!params.job_worker_id) return { ok: false, error: 'Job worker is required' }
  if (!params.description?.trim()) return { ok: false, error: 'Description is required' }
  if (!(params.qty_sent > 0)) return { ok: false, error: 'Qty sent must be greater than 0' }
  if (!params.process_nature?.trim()) return { ok: false, error: 'Process nature is required' }

  // Snapshot vendor GSTIN at challan time (vendor master can change later;
  // ITC-04 needs the GSTIN as it was on the challan date)
  const { data: vendor } = await actor.supabase
    .from('vendor')
    .select('gstin')
    .eq('id', params.job_worker_id)
    .eq('tenant_id', actor.tenantId)
    .single()

  const { data, error } = await actor.supabase
    .from('job_work_challan')
    .insert({
      tenant_id: actor.tenantId,
      job_worker_id: params.job_worker_id,
      job_worker_gstin: (vendor as { gstin: string | null } | null)?.gstin ?? null,
      description: params.description.trim(),
      hsn_code: params.hsn_code?.trim() || null,
      unit: params.unit || 'nos',
      qty_sent: params.qty_sent,
      rate: params.rate ?? null,
      process_nature: params.process_nature.trim(),
      expected_return_date: params.expected_return_date || null,
      notes: params.notes?.trim() || null,
      status: 'sent',
      created_by: actor.userId,
    })
    .select('id, challan_number')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not create challan' }
  revalidatePath('/procurement/job-work')
  return { ok: true, id: data.id, challan_number: data.challan_number }
}

export async function recordJobWorkReturn(params: {
  id: string
  qty_received_back: number
  qty_scrap?: number
  received_back_at?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: existing } = await actor.supabase
    .from('job_work_challan')
    .select('qty_sent, qty_received_back, qty_scrap, status')
    .eq('id', params.id)
    .eq('tenant_id', actor.tenantId)
    .single()

  if (!existing) return { ok: false, error: 'Challan not found' }
  const e = existing as { qty_sent: number; qty_received_back: number; qty_scrap: number; status: string }
  if (e.status === 'cancelled') return { ok: false, error: 'Challan is cancelled' }

  const newReceived = e.qty_received_back + params.qty_received_back
  const newScrap = e.qty_scrap + (params.qty_scrap ?? 0)
  if (newReceived + newScrap > Number(e.qty_sent)) {
    return { ok: false, error: 'Received + scrap exceeds qty sent' }
  }

  const remaining = Number(e.qty_sent) - newReceived - newScrap
  const newStatus: JobWorkStatus = remaining <= 0.001 ? 'fully_received' : 'partly_received'

  const { error } = await actor.supabase
    .from('job_work_challan')
    .update({
      qty_received_back: newReceived,
      qty_scrap: newScrap,
      received_back_at: params.received_back_at || new Date().toISOString().slice(0, 10),
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('tenant_id', actor.tenantId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/procurement/job-work')
  revalidatePath(`/procurement/job-work/${params.id}`)
  return { ok: true }
}

export async function cancelJobWorkChallan(id: string, reason?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  const { error } = await actor.supabase
    .from('job_work_challan')
    .update({ status: 'cancelled', notes: reason ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', actor.tenantId)
    .in('status', ['sent', 'partly_received'])
  if (error) return { ok: false, error: error.message }
  revalidatePath('/procurement/job-work')
  return { ok: true }
}

export async function listJobWorkChallans(filters?: { status?: JobWorkStatus }): Promise<JobWorkRow[]> {
  const actor = await getActor()
  if (!actor) return []
  let q = actor.supabase
    .from('job_work_challan')
    .select(
      `
      id, challan_number, challan_date, job_worker_id, job_worker_gstin,
      description, hsn_code, unit, qty_sent, rate, process_nature,
      expected_return_date, qty_received_back, qty_scrap, received_back_at,
      status, notes,
      job_worker:job_worker_id ( name )
    `
    )
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .order('challan_date', { ascending: false })
  if (filters?.status) q = q.eq('status', filters.status)
  const { data } = await q

  return (data ?? []).map((r: Record<string, unknown>) => {
    const jw = r.job_worker as { name: string } | { name: string }[] | null
    const jwName = Array.isArray(jw) ? jw[0]?.name ?? '' : jw?.name ?? ''
    const qtySent = Number(r.qty_sent)
    const qtyRecv = Number(r.qty_received_back)
    const qtyScrap = Number(r.qty_scrap)
    return {
      id: r.id as string,
      challan_number: r.challan_number as string,
      challan_date: r.challan_date as string,
      job_worker_id: r.job_worker_id as string,
      job_worker_name: jwName,
      job_worker_gstin: (r.job_worker_gstin as string | null) ?? null,
      description: r.description as string,
      hsn_code: (r.hsn_code as string | null) ?? null,
      unit: r.unit as string,
      qty_sent: qtySent,
      rate: r.rate as number | null,
      process_nature: r.process_nature as string,
      expected_return_date: (r.expected_return_date as string | null) ?? null,
      qty_received_back: qtyRecv,
      qty_scrap: qtyScrap,
      qty_pending: Math.max(0, qtySent - qtyRecv - qtyScrap),
      received_back_at: (r.received_back_at as string | null) ?? null,
      status: r.status as JobWorkStatus,
      notes: (r.notes as string | null) ?? null,
    }
  })
}

export async function getJobWorkChallan(id: string): Promise<JobWorkRow | null> {
  const rows = await listJobWorkChallans()
  return rows.find((r) => r.id === id) ?? null
}

export async function listJobWorkersForPicker(): Promise<Array<{ id: string; name: string; gstin: string | null }>> {
  const actor = await getActor()
  if (!actor) return []
  const { data } = await actor.supabase
    .from('vendor')
    .select('id, name, gstin, is_active')
    .eq('tenant_id', actor.tenantId)
    .eq('is_active', true)
    .order('name')
    .limit(500)
  return (data ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    gstin: (v.gstin as string | null) ?? null,
  }))
}

// Form-action wrapper for the new challan page.
export async function createJobWorkChallanForm(formData: FormData): Promise<void> {
  const res = await createJobWorkChallan({
    job_worker_id: formData.get('job_worker_id') as string,
    description: formData.get('description') as string,
    hsn_code: (formData.get('hsn_code') as string) || null,
    unit: (formData.get('unit') as string) || 'nos',
    qty_sent: parseFloat(formData.get('qty_sent') as string),
    rate: formData.get('rate') ? parseFloat(formData.get('rate') as string) : null,
    process_nature: formData.get('process_nature') as string,
    expected_return_date: (formData.get('expected_return_date') as string) || null,
    notes: (formData.get('notes') as string) || null,
  })
  if (!res.ok) {
    redirect(`/procurement/job-work/new?error=${encodeURIComponent(res.error)}`)
  }
  redirect(`/procurement/job-work/${res.id}`)
}
