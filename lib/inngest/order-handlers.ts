/**
 * Order module Inngest handlers.
 *
 * On `quote.won`: auto-creates a sales_order (with lines + stage history),
 * then creates an order_followup task and notifies the project owner.
 * Idempotent — skips if an order already exists for this quote.
 */
import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import { attemptReserveOrderLinesService } from '@/lib/actions/reservations'

type Logger = {
  info: (msg: string, meta?: unknown) => void
  warn: (msg: string, meta?: unknown) => void
  error: (msg: string, meta?: unknown) => void
}

export const onQuoteWonCreateOrderTask = inngest.createFunction(
  { id: 'order-on-quote-won', triggers: [{ event: 'quote.won' }] },
  async ({ event, logger }: { event: { data: { quote_id: string; order_value: number } }; logger: Logger }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const quoteId = event.data.quote_id
    if (!quoteId) {
      logger.warn('quote.won fired without quote_id')
      return { skipped: true }
    }

    const { data: quote } = await supabase
      .from('quotation')
      .select(`
        id, quotation_number, project_id, tenant_id, total, status,
        project:project_id(name, owner_id, buyer_firm_id),
        lines:quotation_line(product_id, product_name, sku_code, unit, quantity, unit_price, line_total, sort_order, price_list_entry_id)
      `)
      .eq('id', quoteId)
      .single()

    if (!quote) {
      logger.warn(`Quote ${quoteId} not found`)
      return { skipped: true }
    }

    // Idempotency — skip if order already exists
    const { data: existing } = await supabase
      .from('sales_order')
      .select('id')
      .eq('quote_id', quoteId)
      .is('deleted_at', null)
      .limit(1)
    if (existing && existing.length > 0) {
      logger.info('Order already exists for this quote — skipping', { quoteId })
      return { skipped: 'order-exists' }
    }

    const project = (Array.isArray(quote.project) ? quote.project[0] : quote.project) as
      | { name: string; owner_id: string; buyer_firm_id: string | null }
      | null

    // Resolve initial order stage (global seed, tenant_id IS NULL, stage_key = 'confirmed')
    const { data: initialStage } = await supabase
      .from('order_stage')
      .select('id')
      .is('tenant_id', null)
      .eq('stage_key', 'confirmed')
      .single()

    if (!initialStage) {
      logger.error('order_stage "confirmed" not seeded — cannot auto-create order')
      return { error: 'order-stages-not-seeded' }
    }

    // Create the sales_order
    const { data: order, error: orderErr } = await supabase
      .from('sales_order')
      .insert({
        tenant_id: quote.tenant_id,
        project_id: quote.project_id,
        quote_id: quote.id,
        buyer_firm_id: project?.buyer_firm_id ?? null,
        current_stage_id: initialStage.id,
        value: quote.total ?? 0,
        owner_id: project?.owner_id ?? null,
      })
      .select('id, order_number')
      .single()

    if (orderErr || !order) {
      logger.error('Failed to create sales_order', { error: orderErr?.message })
      return { error: orderErr?.message ?? 'order-insert-failed' }
    }

    logger.info(`Created order ${order.order_number}`, { orderId: order.id, quoteId })

    // Copy quote lines → order lines
    const lines = (quote.lines ?? []) as Array<{
      product_id: string | null
      product_name: string
      sku_code: string
      unit: string
      quantity: number
      unit_price: number
      line_total: number
      sort_order: number
      price_list_entry_id: string | null
    }>

    if (lines.length > 0) {
      const { error: lineErr } = await supabase.from('sales_order_line').insert(
        lines.map((l) => ({
          tenant_id: quote.tenant_id,
          sales_order_id: order.id,
          product_id: l.product_id,
          product_name: l.product_name,
          sku_code: l.sku_code,
          unit: l.unit,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.line_total,
          sort_order: l.sort_order,
          price_list_entry_id: l.price_list_entry_id ?? null,
        }))
      )
      if (lineErr) {
        logger.error('Failed to insert order lines', { error: lineErr.message })
      }
    }

    // Stage history
    await supabase.from('sales_order_stage_history').insert({
      tenant_id: quote.tenant_id,
      sales_order_id: order.id,
      from_stage_id: null,
      to_stage_id: initialStage.id,
      actor_id: project?.owner_id ?? null,
      remark: `Auto-created from won quote ${quote.quotation_number}`,
    })

    // Mark quote accepted
    await supabase
      .from('quotation')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', quote.id)
      .neq('status', 'accepted')

    // Notify project owner
    if (project?.owner_id) {
      await supabase.from('notification').insert({
        tenant_id: quote.tenant_id,
        user_id: project.owner_id,
        type: 'order_created',
        title: `Order created — ${order.order_number}`,
        body: `${quote.quotation_number} was won. Order ${order.order_number} (₹${(quote.total ?? 0).toLocaleString('en-IN')}) is now confirmed. Schedule dispatch next.`,
        project_id: quote.project_id,
        entity_type: 'sales_order',
        entity_id: order.id,
      })

      // Follow-up task — confirm order details (expected delivery, notes).
      // The dispatch_schedule task is created separately by the dispatch
      // handler on the order.created event, so we keep this distinct.
      await supabase.from('task').insert({
        tenant_id: quote.tenant_id,
        project_id: quote.project_id,
        type: 'order_followup',
        title: `Confirm expected delivery date for ${order.order_number}`,
        description: `Order ${order.order_number} was auto-created from won quote ${quote.quotation_number}. Open the order and set the expected delivery date + any notes before warehouse begins scheduling.`,
        priority: 'high',
        assignee_id: project.owner_id,
        source_entity_type: 'sales_order',
        source_entity_id: order.id,
      })
    }

    // Attempt to reserve stock for the new order's lines so the project header's
    // reservation mini-bar reflects reality immediately. Best-effort —
    // back-order / partial reservation is a valid outcome and surfaces in the UI.
    try {
      const res = await attemptReserveOrderLinesService(supabase, order.id, quote.tenant_id, project?.owner_id ?? null)
      if ('error' in res) {
        logger.warn('attemptReserveOrderLinesService returned error', { error: res.error })
      } else {
        const reserved = res.results.filter((r) => r.status === 'reserved').length
        const partial = res.results.filter((r) => r.status === 'partial').length
        const back = res.results.filter((r) => r.status === 'backorder').length
        logger.info('Stock reservation attempted', { orderId: order.id, reserved, partial, back })
      }
    } catch (e) {
      logger.warn('attemptReserveOrderLinesService threw (non-fatal)', { error: String(e) })
    }

    // Emit order.created so the dispatch handler can react
    try {
      await inngest.send({
        name: 'order.created',
        data: { order_id: order.id, quote_id: quote.id },
      })
    } catch (e) {
      logger.warn('inngest.send(order.created) failed (non-fatal)', { error: String(e) })
    }

    return { orderCreated: true, orderId: order.id, orderNumber: order.order_number }
  }
)
