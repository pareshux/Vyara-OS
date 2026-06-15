/**
 * Order module Inngest handlers.
 *
 * The Order module listens for `quote.won` and may (per Slice 2 spec, "*may*
 * create an order") spawn a sales_order automatically — currently we only
 * surface a task and notify; explicit human action via the project page
 * creates the order. This keeps the flow auditable and gives the inside-sales
 * user a checkpoint to fill in expected delivery date / notes.
 */
import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'

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
      .select('id, quotation_number, project_id, tenant_id, project:project_id(name, owner_id)')
      .eq('id', quoteId)
      .single()

    if (!quote) {
      logger.warn(`Quote ${quoteId} not found`)
      return { skipped: true }
    }

    // Don't auto-create if an order already exists from this quote
    const { data: existing } = await supabase
      .from('sales_order')
      .select('id')
      .eq('quote_id', quoteId)
      .is('deleted_at', null)
      .limit(1)
    if (existing && existing.length > 0) {
      logger.info('Order already exists for this quote', { quoteId })
      return { skipped: 'order-exists' }
    }

    const project = (Array.isArray(quote.project) ? quote.project[0] : quote.project) as
      | { name: string; owner_id: string }
      | null

    // Create a follow-up task on the project + notify owner
    const { data: task } = await supabase
      .from('task')
      .insert({
        tenant_id: quote.tenant_id,
        project_id: quote.project_id,
        type: 'order_followup',
        title: `Convert quote ${quote.quotation_number} to sales order`,
        description: `Project: ${project?.name ?? ''}. Open the quote and click "Create order".`,
        priority: 'urgent',
        assignee_id: project?.owner_id ?? null,
        source_entity_type: 'quotation',
        source_entity_id: quote.id,
      })
      .select('id')
      .single()

    if (project?.owner_id) {
      await supabase.from('notification').insert({
        tenant_id: quote.tenant_id,
        user_id: project.owner_id,
        type: 'order_followup',
        title: 'Quote won — create the sales order',
        body: `${quote.quotation_number} has been won. Create the order so dispatch can begin.`,
        project_id: quote.project_id,
        entity_type: 'quotation',
        entity_id: quote.id,
      })
    }

    logger.info('Created order_followup task', { taskId: task?.id, quoteId })
    return { taskCreated: !!task }
  }
)
