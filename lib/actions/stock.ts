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

export type ReceiptReason = 'opening_balance' | 'production' | 'purchase' | 'transfer_in_external' | 'return_from_customer' | 'other'

/**
 * Record a stock receipt — generic wrapper that inserts a `receipt` movement
 * with the given reason. Stock-movement trigger updates the `stock` row.
 */
export async function recordReceipt(params: {
  warehouse_id: string
  product_id: string
  quantity: number
  reason_code: ReceiptReason
  remark?: string
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  if (params.quantity <= 0) return { error: 'Quantity must be greater than zero' }

  const { error } = await supabase.from('stock_movement').insert({
    tenant_id: tenantId,
    warehouse_id: params.warehouse_id,
    product_id: params.product_id,
    movement_type: 'receipt',
    quantity: params.quantity,
    reason_code: params.reason_code,
    actor_id: userId,
    remark: params.remark ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/inventory')
  revalidatePath(`/warehouses/${params.warehouse_id}`)
  revalidatePath('/inventory/ledger')
  return { success: true }
}

/**
 * Back-compat thin wrapper — opening balance is just a receipt with a fixed reason.
 */
export async function recordOpeningBalance(params: {
  warehouse_id: string
  product_id: string
  quantity: number
  remark?: string
}): Promise<{ success: true } | { error: string }> {
  return recordReceipt({
    ...params,
    reason_code: 'opening_balance',
    remark: params.remark ?? 'Opening balance',
  })
}

/**
 * CSV import for opening stock. Header: warehouse_code,sku_code,quantity,min_level,max_level,remark
 * Idempotent on (warehouse_id, product_id) — re-imports SKIP existing rows where available_qty > 0.
 */
export async function importOpeningStockCSV(csvText: string): Promise<
  | { imported: number; skipped: number; errors: string[] }
  | { error: string }
> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { error: 'CSV must contain a header row + at least one data row' }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const required = ['warehouse_code', 'sku_code', 'quantity']
  for (const r of required) if (!header.includes(r)) return { error: `Missing required column: ${r}` }
  const idx = (c: string) => header.indexOf(c)

  // Pre-load warehouse codes & product sku codes
  const { data: warehouses } = await supabase
    .from('warehouse')
    .select('id, code')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
  const { data: products } = await supabase
    .from('product')
    .select('id, sku_code')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
  const whByCode = Object.fromEntries((warehouses ?? []).map((w) => [w.code, w.id]))
  const prByCode = Object.fromEntries((products ?? []).map((p) => [p.sku_code, p.id]))

  const errors: string[] = []
  let imported = 0
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((c) => c.trim())
    const wCode = row[idx('warehouse_code')]
    const sCode = row[idx('sku_code')]
    const qty = Number(row[idx('quantity')])
    if (!wCode || !sCode || isNaN(qty) || qty <= 0) {
      errors.push(`Row ${i + 1}: invalid (warehouse=${wCode}, sku=${sCode}, qty=${row[idx('quantity')]})`)
      continue
    }
    const warehouseId = whByCode[wCode]
    const productId = prByCode[sCode]
    if (!warehouseId) { errors.push(`Row ${i + 1}: warehouse '${wCode}' not found`); continue }
    if (!productId)   { errors.push(`Row ${i + 1}: SKU '${sCode}' not found`); continue }

    // Idempotency: skip if stock already exists & is nonzero
    const { data: existing } = await supabase
      .from('stock')
      .select('id, available_qty')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', productId)
      .maybeSingle()
    if (existing && Number(existing.available_qty) > 0) { skipped++; continue }

    const { error: movErr } = await supabase.from('stock_movement').insert({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      product_id: productId,
      movement_type: 'receipt',
      quantity: qty,
      reason_code: 'opening_balance',
      actor_id: userId,
      remark: row[idx('remark')] ?? 'CSV opening balance',
    })
    if (movErr) { errors.push(`Row ${i + 1}: ${movErr.message}`); continue }

    // Set min/max if provided
    const minLevel = idx('min_level') >= 0 ? Number(row[idx('min_level')]) : NaN
    const maxLevel = idx('max_level') >= 0 ? Number(row[idx('max_level')]) : NaN
    if (!isNaN(minLevel) || !isNaN(maxLevel)) {
      const patch: Record<string, number> = {}
      if (!isNaN(minLevel)) patch.min_level = minLevel
      if (!isNaN(maxLevel)) patch.max_level = maxLevel
      await supabase
        .from('stock')
        .update(patch)
        .eq('warehouse_id', warehouseId)
        .eq('product_id', productId)
    }
    imported++
  }

  revalidatePath('/inventory')
  return { imported, skipped, errors }
}

export async function setStockLimits(params: {
  warehouse_id: string
  product_id: string
  min_level?: number | null
  max_level?: number | null
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, tenantId } = ctx

  // Ensure stock row exists
  await supabase
    .from('stock')
    .insert({
      tenant_id: tenantId,
      warehouse_id: params.warehouse_id,
      product_id: params.product_id,
    })
    .select('id')
    .maybeSingle()

  const { error } = await supabase
    .from('stock')
    .update({
      min_level: params.min_level ?? null,
      max_level: params.max_level ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('warehouse_id', params.warehouse_id)
    .eq('product_id', params.product_id)
  if (error) return { error: error.message }
  revalidatePath('/inventory')
  return { success: true }
}
