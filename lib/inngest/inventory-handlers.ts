/**
 * Inventory module Inngest handlers — Slice 2.5 Step 5.
 *
 * - onDispatchCompletedConsumeReservation: listens for dispatch.completed
 *   (already emitted by Slice 2 recordPOD), finds the active reservation
 *   per dispatch line, writes a dispatch_issue movement, marks the
 *   reservation consumed. Idempotent — checks for an existing
 *   dispatch_issue movement linked to the same dispatch.
 *
 * - inventoryDailyCheck: cron, 09:00 IST. For each (warehouse, product)
 *   where available_qty < min_level, creates a stock_low task assigned
 *   to the warehouse manager + notification. 24h cooldown per stock row.
 */
import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'

type Logger = {
  info: (msg: string, meta?: unknown) => void
  warn: (msg: string, meta?: unknown) => void
  error: (msg: string, meta?: unknown) => void
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const onDispatchCompletedConsumeReservation = inngest.createFunction(
  { id: 'inventory-on-dispatch-completed', triggers: [{ event: 'dispatch.completed' }] },
  async ({ event, logger }: { event: { data: { dispatch_id: string } }; logger: Logger }) => {
    const supabase = sb()
    const dispatchId = event.data.dispatch_id
    if (!dispatchId) return { skipped: true }

    // Idempotency check
    const { data: prior } = await supabase
      .from('stock_movement')
      .select('id')
      .eq('related_entity_type', 'dispatch')
      .eq('related_entity_id', dispatchId)
      .eq('movement_type', 'dispatch_issue')
      .limit(1)
    if (prior && prior.length > 0) {
      logger.info('Already consumed for this dispatch', { dispatchId })
      return { skipped: 'already-consumed' }
    }

    const { data: dispatch } = await supabase
      .from('dispatch')
      .select(
        `id, tenant_id, sales_order_id,
         lines:dispatch_line(id, sales_order_line_id, product_id:product_name, sku_code, quantity)`
      )
      .eq('id', dispatchId)
      .single()
    if (!dispatch) {
      logger.warn('Dispatch not found', { dispatchId })
      return { skipped: 'no-dispatch' }
    }

    // dispatch_line stores product_name + sku_code as snapshot, but not product_id directly.
    // Resolve product_id via the sales_order_line link.
    type DLine = { id: string; sales_order_line_id: string | null; sku_code: string; quantity: number }
    const lines = (dispatch.lines ?? []) as unknown as DLine[]
    let consumed = 0
    const errors: string[] = []

    for (const dl of lines) {
      if (!dl.sales_order_line_id) {
        errors.push(`Dispatch line ${dl.id}: no sales_order_line link`)
        continue
      }
      // Find the active reservation for this order line
      const { data: res } = await supabase
        .from('stock_reservation')
        .select('id, warehouse_id, product_id, quantity, status')
        .eq('related_entity_type', 'sales_order_line')
        .eq('related_entity_id', dl.sales_order_line_id)
        .eq('status', 'active')
        .maybeSingle()
      if (!res) {
        errors.push(`Order line ${dl.sales_order_line_id}: no active reservation — direct_issue path not yet implemented`)
        continue
      }

      const consumeQty = Math.min(Number(res.quantity), Number(dl.quantity))

      // Write dispatch_issue movement (decrements reserved_qty via trigger)
      const { error: movErr } = await supabase.from('stock_movement').insert({
        tenant_id: dispatch.tenant_id,
        warehouse_id: res.warehouse_id,
        product_id: res.product_id,
        movement_type: 'dispatch_issue',
        quantity: consumeQty,
        reason_code: 'dispatch',
        related_entity_type: 'dispatch',
        related_entity_id: dispatchId,
        remark: `Consumed via dispatch`,
      })
      if (movErr) {
        errors.push(`${dl.sku_code}: ${movErr.message}`)
        continue
      }

      // Update or close reservation
      if (Number(res.quantity) <= consumeQty) {
        await supabase
          .from('stock_reservation')
          .update({ status: 'consumed', consumed_at: new Date().toISOString() })
          .eq('id', res.id)
      } else {
        await supabase
          .from('stock_reservation')
          .update({ quantity: Number(res.quantity) - consumeQty })
          .eq('id', res.id)
      }

      consumed++
    }

    logger.info('Dispatch consumption complete', { dispatchId, consumed, errors: errors.length })
    return { consumed, errors }
  }
)

export const inventoryDailyCheck = inngest.createFunction(
  { id: 'inventory-daily-check', triggers: [{ cron: '30 3 * * *' }] }, // 03:30 UTC = 09:00 IST
  async ({ logger }: { logger: Logger }) => {
    const supabase = sb()

    // Pull all low-stock rows (available < min_level)
    const { data: rows } = await supabase
      .from('stock')
      .select(
        `id, tenant_id, warehouse_id, product_id, available_qty, min_level, last_movement_at,
         warehouse:warehouse_id(id, code, name, manager_id),
         product:product_id(id, sku_code, name, unit)`
      )
      .not('min_level', 'is', null)
    if (!rows) return { checked: 0, created: 0 }

    type Row = {
      id: string
      tenant_id: string
      warehouse_id: string
      product_id: string
      available_qty: number
      min_level: number
      warehouse: { id: string; code: string; name: string; manager_id: string | null } | { id: string; code: string; name: string; manager_id: string | null }[] | null
      product: { id: string; sku_code: string; name: string; unit: string } | { id: string; sku_code: string; name: string; unit: string }[] | null
    }

    const lowRows = (rows as unknown as Row[]).filter((r) => Number(r.available_qty) < Number(r.min_level))
    logger.info(`Found ${lowRows.length} low-stock rows`)

    let created = 0
    for (const r of lowRows) {
      const wh = Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse
      const pr = Array.isArray(r.product) ? r.product[0] : r.product
      if (!wh || !pr) continue

      // Cooldown: skip if there's a stock_low task for this (warehouse, product) created in last 24h
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { data: recentTasks } = await supabase
        .from('task')
        .select('id')
        .eq('source_entity_type', 'stock')
        .eq('source_entity_id', r.id)
        .eq('type', 'stock_low')
        .gte('created_at', cutoff)
        .limit(1)
      if (recentTasks && recentTasks.length > 0) continue

      const { data: task } = await supabase
        .from('task')
        .insert({
          tenant_id: r.tenant_id,
          type: 'stock_low',
          title: `Low stock: ${pr.sku_code} at ${wh.code} (${Number(r.available_qty).toLocaleString('en-IN')} ${pr.unit}, min ${Number(r.min_level).toLocaleString('en-IN')})`,
          description: `${pr.name} has dropped below its minimum level at ${wh.name}. Replenish via receipt or transfer.`,
          priority: 'high',
          assignee_id: wh.manager_id,
          source_entity_type: 'stock',
          source_entity_id: r.id,
        })
        .select('id')
        .single()

      if (wh.manager_id) {
        await supabase.from('notification').insert({
          tenant_id: r.tenant_id,
          user_id: wh.manager_id,
          type: 'stock_low',
          title: `Low stock — ${pr.sku_code}`,
          body: `${pr.name} at ${wh.code}: ${Number(r.available_qty).toLocaleString('en-IN')} ${pr.unit} (min ${Number(r.min_level).toLocaleString('en-IN')}).`,
          entity_type: 'stock',
          entity_id: r.id,
        })
      }

      if (task) created++
    }

    return { checked: lowRows.length, created }
  }
)
