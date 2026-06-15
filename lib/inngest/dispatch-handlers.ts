/**
 * Dispatch module Inngest handlers.
 *
 * Listens on order.created to surface a "schedule dispatch" task (the
 * Slice-2 spec says Dispatch *may* schedule a delivery when the order
 * is confirmed — for the pilot we keep this human-gated).
 */
import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'

type Logger = {
  info: (msg: string, meta?: unknown) => void
  warn: (msg: string, meta?: unknown) => void
  error: (msg: string, meta?: unknown) => void
}

export const onOrderCreatedScheduleDispatchTask = inngest.createFunction(
  { id: 'dispatch-on-order-created', triggers: [{ event: 'order.created' }] },
  async ({ event, logger }: { event: { data: { order_id: string } }; logger: Logger }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: order } = await supabase
      .from('sales_order')
      .select('id, order_number, tenant_id, project_id, owner_id, expected_delivery_at')
      .eq('id', event.data.order_id)
      .single()

    if (!order) {
      logger.warn(`Order ${event.data.order_id} not found`)
      return { skipped: true }
    }

    // Don't duplicate if a schedule task already exists
    const { data: existing } = await supabase
      .from('task')
      .select('id')
      .eq('source_entity_type', 'sales_order')
      .eq('source_entity_id', order.id)
      .eq('type', 'dispatch_schedule')
      .eq('is_done', false)
      .limit(1)
    if (existing && existing.length > 0) {
      return { skipped: 'task-exists' }
    }

    const { data: task } = await supabase
      .from('task')
      .insert({
        tenant_id: order.tenant_id,
        project_id: order.project_id,
        type: 'dispatch_schedule',
        title: `Schedule dispatch for ${order.order_number}`,
        priority: 'high',
        assignee_id: order.owner_id,
        source_entity_type: 'sales_order',
        source_entity_id: order.id,
      })
      .select('id')
      .single()

    logger.info('Created dispatch_schedule task', { task: task?.id, order: order.id })
    return { taskCreated: !!task }
  }
)
