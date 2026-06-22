'use server'

// Capability: Delivery (procurement)
// Blanket PO = annual rate-contract. Releases land as regular POs that
// reference the blanket via purchase_order.blanket_po_id; this module
// owns the blanket header lifecycle. PO drawdown tracking lives in
// listBlanketPos which reads cumulative qty_released from child POs.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/observability/capture'

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

export type BlanketPoStatus = 'draft' | 'active' | 'exhausted' | 'expired' | 'cancelled'

export type BlanketPoListRow = {
  id: string
  bpo_number: string
  vendor_id: string
  vendor_name: string
  description: string
  unit: string
  qty_cap: number
  rate: number
  value_cap: number
  qty_released: number
  qty_remaining: number
  pct_consumed: number
  valid_from: string
  valid_to: string
  status: BlanketPoStatus
  release_po_count: number
}

export async function createBlanketPo(params: {
  vendor_id: string
  product_id?: string | null
  description: string
  hsn_code?: string | null
  unit?: string
  qty_cap: number
  rate: number
  valid_from: string
  valid_to: string
  payment_terms_days?: number | null
  delivery_terms?: string | null
  notes?: string | null
}): Promise<{ ok: true; id: string; bpo_number: string } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  const supabase = await createClient()

  if (!params.vendor_id) return { ok: false, error: 'Vendor is required' }
  if (!params.description?.trim()) return { ok: false, error: 'Description is required' }
  if (!(params.qty_cap > 0)) return { ok: false, error: 'Quantity cap must be greater than 0' }
  if (!(params.rate >= 0)) return { ok: false, error: 'Rate must be non-negative' }
  if (!params.valid_from || !params.valid_to) return { ok: false, error: 'Validity period is required' }
  if (params.valid_to < params.valid_from) return { ok: false, error: 'Valid-to must be on or after valid-from' }

  const { data, error } = await supabase
    .from('blanket_po')
    .insert({
      tenant_id: actor.tenantId,
      vendor_id: params.vendor_id,
      product_id: params.product_id ?? null,
      description: params.description.trim(),
      hsn_code: params.hsn_code?.trim() || null,
      unit: params.unit || 'nos',
      qty_cap: params.qty_cap,
      rate: params.rate,
      valid_from: params.valid_from,
      valid_to: params.valid_to,
      payment_terms_days: params.payment_terms_days ?? null,
      delivery_terms: params.delivery_terms?.trim() || null,
      notes: params.notes?.trim() || null,
      status: 'active',
      created_by: actor.userId,
    })
    .select('id, bpo_number')
    .single()

  if (error || !data) {
    captureError(error ?? new Error('Blanket PO insert returned no row'), {
      action_name: 'createBlanketPo',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
    })
    return { ok: false, error: error?.message ?? 'Could not create blanket PO' }
  }

  revalidatePath('/procurement/blanket-pos')
  revalidatePath('/procurement')
  return { ok: true, id: data.id, bpo_number: data.bpo_number }
}

export async function cancelBlanketPo(
  id: string,
  reason: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  if (!reason?.trim()) return { ok: false, error: 'Cancellation reason required' }
  const supabase = await createClient()

  const { error } = await supabase
    .from('blanket_po')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason.trim(),
    })
    .eq('id', id)
    .eq('tenant_id', actor.tenantId)
    .in('status', ['draft', 'active'])

  if (error) return { ok: false, error: error.message }
  revalidatePath('/procurement/blanket-pos')
  revalidatePath(`/procurement/blanket-pos/${id}`)
  return { ok: true }
}

export async function listBlanketPos(filters?: {
  status?: BlanketPoStatus
}): Promise<BlanketPoListRow[]> {
  const actor = await getActor()
  if (!actor) return []
  const supabase = await createClient()

  let q = supabase
    .from('blanket_po')
    .select(
      `
      id, bpo_number, vendor_id, description, unit, qty_cap, rate, value_cap,
      qty_released, valid_from, valid_to, status,
      vendor:vendor_id ( name )
    `
    )
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .order('valid_from', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)

  const { data, error } = await q
  if (error) {
    console.error('[listBlanketPos]', error)
    return []
  }

  // Get release PO counts in one query
  const blanketIds = (data ?? []).map((b) => b.id)
  let releaseCountMap: Record<string, number> = {}
  if (blanketIds.length > 0) {
    const { data: countRows } = await supabase
      .from('purchase_order')
      .select('blanket_po_id')
      .eq('tenant_id', actor.tenantId)
      .in('blanket_po_id', blanketIds)
      .is('deleted_at', null)

    for (const row of countRows ?? []) {
      const bid = (row as { blanket_po_id: string }).blanket_po_id
      releaseCountMap[bid] = (releaseCountMap[bid] || 0) + 1
    }
  }

  return (data ?? []).map((b: Record<string, unknown>) => {
    const v = b.vendor as { name: string } | { name: string }[] | null
    const vName = Array.isArray(v) ? v[0]?.name ?? '' : v?.name ?? ''
    const qtyCap = Number(b.qty_cap)
    const qtyReleased = Number(b.qty_released)
    const qtyRemaining = Math.max(0, qtyCap - qtyReleased)
    const pct = qtyCap > 0 ? Math.round((qtyReleased / qtyCap) * 100) : 0
    return {
      id: b.id as string,
      bpo_number: b.bpo_number as string,
      vendor_id: b.vendor_id as string,
      vendor_name: vName,
      description: b.description as string,
      unit: b.unit as string,
      qty_cap: qtyCap,
      rate: Number(b.rate),
      value_cap: Number(b.value_cap),
      qty_released: qtyReleased,
      qty_remaining: qtyRemaining,
      pct_consumed: pct,
      valid_from: b.valid_from as string,
      valid_to: b.valid_to as string,
      status: b.status as BlanketPoStatus,
      release_po_count: releaseCountMap[b.id as string] || 0,
    }
  })
}

export async function getBlanketPo(id: string): Promise<{
  blanket: BlanketPoListRow
  release_pos: Array<{
    id: string
    po_number: string
    po_date: string
    total: number
    status: string
    qty_released_on_this_po: number
  }>
} | null> {
  const actor = await getActor()
  if (!actor) return null
  const supabase = await createClient()

  const { data: b, error } = await supabase
    .from('blanket_po')
    .select(
      `
      id, bpo_number, vendor_id, description, unit, qty_cap, rate, value_cap,
      qty_released, valid_from, valid_to, status,
      vendor:vendor_id ( name )
    `
    )
    .eq('id', id)
    .eq('tenant_id', actor.tenantId)
    .is('deleted_at', null)
    .single()

  if (error || !b) return null

  // Get release POs (POs that reference this blanket) + the qty drawn on each
  const { data: pos } = await supabase
    .from('purchase_order')
    .select(
      `
      id, po_number, po_date, total, status,
      lines:purchase_order_line ( quantity )
    `
    )
    .eq('tenant_id', actor.tenantId)
    .eq('blanket_po_id', id)
    .is('deleted_at', null)
    .order('po_date', { ascending: false })

  const release_pos = (pos ?? []).map((p: Record<string, unknown>) => {
    const lines = (p.lines as { quantity: number }[]) ?? []
    const qtyOnPo = lines.reduce((s, l) => s + Number(l.quantity || 0), 0)
    return {
      id: p.id as string,
      po_number: p.po_number as string,
      po_date: p.po_date as string,
      total: Number(p.total),
      status: p.status as string,
      qty_released_on_this_po: qtyOnPo,
    }
  })

  const v = b.vendor as { name: string } | { name: string }[] | null
  const vName = Array.isArray(v) ? v[0]?.name ?? '' : v?.name ?? ''
  const qtyCap = Number(b.qty_cap)
  const qtyReleased = Number(b.qty_released)

  return {
    blanket: {
      id: b.id as string,
      bpo_number: b.bpo_number as string,
      vendor_id: b.vendor_id as string,
      vendor_name: vName,
      description: b.description as string,
      unit: b.unit as string,
      qty_cap: qtyCap,
      rate: Number(b.rate),
      value_cap: Number(b.value_cap),
      qty_released: qtyReleased,
      qty_remaining: Math.max(0, qtyCap - qtyReleased),
      pct_consumed: qtyCap > 0 ? Math.round((qtyReleased / qtyCap) * 100) : 0,
      valid_from: b.valid_from as string,
      valid_to: b.valid_to as string,
      status: b.status as BlanketPoStatus,
      release_po_count: release_pos.length,
    },
    release_pos,
  }
}

// Recompute qty_released by summing child PO line quantities.
// Called by createPurchaseOrder when a PO references a blanket;
// also exposed as an action for manual reconciliation.
export async function recomputeBlanketReleased(
  blanketId: string
): Promise<{ ok: true; qty_released: number } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }
  const supabase = await createClient()

  const { data: pos } = await supabase
    .from('purchase_order')
    .select('id, status, lines:purchase_order_line ( quantity )')
    .eq('tenant_id', actor.tenantId)
    .eq('blanket_po_id', blanketId)
    .is('deleted_at', null)

  let total = 0
  for (const p of pos ?? []) {
    if ((p as { status: string }).status === 'cancelled') continue
    const lines = ((p as { lines: { quantity: number }[] }).lines) ?? []
    for (const l of lines) total += Number(l.quantity || 0)
  }

  // Read blanket cap to decide whether to mark exhausted
  const { data: b } = await supabase
    .from('blanket_po')
    .select('qty_cap, status')
    .eq('id', blanketId)
    .eq('tenant_id', actor.tenantId)
    .single()

  const cap = Number((b as { qty_cap: number } | null)?.qty_cap ?? 0)
  const currentStatus = (b as { status: string } | null)?.status ?? 'active'
  const newStatus = currentStatus === 'cancelled'
    ? 'cancelled'
    : total >= cap
    ? 'exhausted'
    : currentStatus === 'exhausted' && total < cap
    ? 'active'
    : currentStatus

  const { error } = await supabase
    .from('blanket_po')
    .update({ qty_released: total, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', blanketId)
    .eq('tenant_id', actor.tenantId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/procurement/blanket-pos')
  revalidatePath(`/procurement/blanket-pos/${blanketId}`)
  return { ok: true, qty_released: total }
}

export async function listBlanketPosForPicker(): Promise<Array<{
  id: string
  bpo_number: string
  vendor_id: string
  vendor_name: string
  description: string
  unit: string
  rate: number
  qty_remaining: number
}>> {
  const rows = await listBlanketPos({ status: 'active' })
  return rows
    .filter((b) => b.qty_remaining > 0)
    .map((b) => ({
      id: b.id,
      bpo_number: b.bpo_number,
      vendor_id: b.vendor_id,
      vendor_name: b.vendor_name,
      description: b.description,
      unit: b.unit,
      rate: b.rate,
      qty_remaining: b.qty_remaining,
    }))
}

// Form-action wrapper: receives FormData from the create page form.
export async function createBlanketPoForm(formData: FormData): Promise<void> {
  const res = await createBlanketPo({
    vendor_id: formData.get('vendor_id') as string,
    description: formData.get('description') as string,
    hsn_code: (formData.get('hsn_code') as string) || null,
    unit: (formData.get('unit') as string) || 'nos',
    qty_cap: parseFloat(formData.get('qty_cap') as string),
    rate: parseFloat(formData.get('rate') as string),
    valid_from: formData.get('valid_from') as string,
    valid_to: formData.get('valid_to') as string,
    payment_terms_days: formData.get('payment_terms_days')
      ? parseInt(formData.get('payment_terms_days') as string, 10)
      : null,
    delivery_terms: (formData.get('delivery_terms') as string) || null,
    notes: (formData.get('notes') as string) || null,
  })
  if (!res.ok) {
    redirect(`/procurement/blanket-pos/new?error=${encodeURIComponent(res.error)}`)
  }
  redirect(`/procurement/blanket-pos/${res.id}`)
}
