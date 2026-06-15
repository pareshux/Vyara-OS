/**
 * Collection module Inngest functions.
 *
 *   - onInvoiceSyncedCreateCollection: ensures every invoice has a
 *     matching collection row in "due" state.
 *
 *   - dailyCollectionCheck (cron 09:30 IST = 04:00 UTC):
 *     for each open collection, advance state based on ageing and
 *     fire WhatsApp dunning (via AiSensy stub) when appropriate.
 */
import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp } from '@/lib/aisensy/client'

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

async function stageId(supabase: ReturnType<typeof sb>, key: string): Promise<string | undefined> {
  const { data } = await supabase
    .from('collection_stage')
    .select('id')
    .is('tenant_id', null)
    .eq('stage_key', key)
    .single()
  return data?.id as string | undefined
}

export const onInvoiceSyncedCreateCollection = inngest.createFunction(
  { id: 'collection-on-invoice-synced', triggers: [{ event: 'invoice.synced' }] },
  async ({ event, logger }: { event: { data: { invoice_id: string; source: string } }; logger: Logger }) => {
    const supabase = sb()
    const invoiceId = event.data.invoice_id

    const { data: existing } = await supabase
      .from('collection')
      .select('id')
      .eq('invoice_id', invoiceId)
      .maybeSingle()
    if (existing) {
      logger.info('Collection already exists', { invoiceId })
      return { skipped: 'exists' }
    }

    const { data: invoice } = await supabase
      .from('invoice')
      .select('id, tenant_id')
      .eq('id', invoiceId)
      .single()
    if (!invoice) return { skipped: 'no-invoice' }

    const dueId = await stageId(supabase, 'due')
    if (!dueId) return { error: 'due stage missing' }

    const { error } = await supabase.from('collection').insert({
      tenant_id: invoice.tenant_id,
      invoice_id: invoiceId,
      current_stage_id: dueId,
    })
    if (error) {
      logger.error('Failed to create collection', { error })
      return { error: error.message }
    }
    logger.info('Created collection', { invoiceId })
    return { created: true }
  }
)

/**
 * Daily ageing engine — runs once per day. Per Slice 2 spec:
 *   "Inngest scheduled jobs drive the cadence."
 */
export const dailyCollectionCheck = inngest.createFunction(
  { id: 'collection-daily-check', triggers: [{ cron: '30 4 * * *' }] }, // 04:30 UTC = 10:00 IST
  async ({ logger }: { logger: Logger }) => {
    const supabase = sb()

    const preDueId = await stageId(supabase, 'pre_due_reminder')
    const overdueId = await stageId(supabase, 'overdue')
    const dunningId = await stageId(supabase, 'dunning_whatsapp')

    if (!preDueId || !overdueId || !dunningId) {
      logger.error('Missing one of: pre_due / overdue / dunning_whatsapp stages')
      return { error: 'stages-missing' }
    }

    // Pull all open collections joined to invoice + buyer phone
    const { data: rows } = await supabase
      .from('collection')
      .select(
        `id, current_stage_id, tenant_id, invoice_id, last_dunning_at,
         invoice:invoice_id(id, invoice_number, due_date, billed_amount, paid_amount, status,
                            buyer:buyer_firm_id(name, phone))`
      )
      .is('deleted_at', null)
      .is('closed_at', null)

    type Row = {
      id: string
      current_stage_id: string
      tenant_id: string
      invoice_id: string
      last_dunning_at: string | null
      invoice: {
        id: string
        invoice_number: string
        due_date: string
        billed_amount: number
        paid_amount: number
        status: string
        buyer: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null
      } | { id: string; invoice_number: string; due_date: string; billed_amount: number; paid_amount: number; status: string; buyer: { name: string; phone: string | null } | null }[] | null
    }

    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const advanced: Array<{ id: string; to: string }> = []
    const dunningSent: string[] = []
    const dunningFailed: string[] = []

    for (const raw of (rows ?? []) as unknown as Row[]) {
      const inv = (Array.isArray(raw.invoice) ? raw.invoice[0] : raw.invoice) as
        | { id: string; invoice_number: string; due_date: string; billed_amount: number; paid_amount: number; status: string; buyer: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null }
        | null
      if (!inv) continue
      if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'written_off') continue
      if (Number(inv.billed_amount) - Number(inv.paid_amount) <= 0) continue

      const dueDate = new Date(inv.due_date)
      const msPerDay = 86_400_000
      const daysToDue = Math.floor((dueDate.getTime() - today.getTime()) / msPerDay)

      // 1) Stage transitions
      if (raw.current_stage_id !== overdueId && daysToDue < 0) {
        // overdue
        const { error: e } = await supabase
          .from('collection')
          .update({ current_stage_id: overdueId, updated_at: new Date().toISOString() })
          .eq('id', raw.id)
        if (!e) {
          advanced.push({ id: raw.id, to: 'overdue' })
          await supabase.from('collection_stage_history').insert({
            tenant_id: raw.tenant_id,
            collection_id: raw.id,
            from_stage_id: raw.current_stage_id,
            to_stage_id: overdueId,
            remark: `Auto-advanced (${Math.abs(daysToDue)}d past due)`,
          })
          await inngest.send({
            name: 'invoice.overdue',
            data: { invoice_id: inv.id, days_overdue: Math.abs(daysToDue) },
          })
        }
      } else if (raw.current_stage_id !== preDueId && raw.current_stage_id !== overdueId && raw.current_stage_id !== dunningId && daysToDue >= 0 && daysToDue <= 3) {
        // pre-due
        const { error: e } = await supabase
          .from('collection')
          .update({ current_stage_id: preDueId, updated_at: new Date().toISOString() })
          .eq('id', raw.id)
        if (!e) {
          advanced.push({ id: raw.id, to: 'pre_due_reminder' })
          await supabase.from('collection_stage_history').insert({
            tenant_id: raw.tenant_id,
            collection_id: raw.id,
            from_stage_id: raw.current_stage_id,
            to_stage_id: preDueId,
            remark: `Auto-advanced (${daysToDue}d to due)`,
          })
        }
      }

      // 2) Dunning trigger: if overdue >= 3 days and not dunned in last 5 days
      const shouldDun =
        daysToDue <= -3 &&
        (!raw.last_dunning_at || (today.getTime() - new Date(raw.last_dunning_at).getTime()) / msPerDay >= 5)

      if (shouldDun) {
        const buyer = (Array.isArray(inv.buyer) ? inv.buyer[0] : inv.buyer) as { name: string; phone: string | null } | null
        if (!buyer?.phone) {
          dunningFailed.push(`${inv.invoice_number}: buyer has no phone`)
          continue
        }
        const outstanding = (Number(inv.billed_amount) - Number(inv.paid_amount)).toLocaleString('en-IN')
        const msg = `Reminder: Invoice ${inv.invoice_number} for ₹${outstanding} is overdue (due ${inv.due_date}). Please settle to avoid interest.`

        const result = await sendWhatsApp({
          to: buyer.phone,
          template: 'vyara_dunning_v1',
          params: { invoice_number: inv.invoice_number, amount: outstanding },
          fallbackText: msg,
        })
        const outcome = result.ok ? 'sent' : 'failed'
        await supabase.from('collection_activity').insert({
          tenant_id: raw.tenant_id,
          collection_id: raw.id,
          channel: 'whatsapp',
          template_key: 'vyara_dunning_v1',
          outcome,
          external_id: result.ok ? result.messageId : null,
          notes: result.ok ? null : result.error,
          payload: { to: buyer.phone, today: todayStr, mode: result.ok ? result.mode : 'fail' },
        })
        if (result.ok) {
          dunningSent.push(inv.invoice_number)
          // Advance to dunning stage + record last_dunning_at
          await supabase
            .from('collection')
            .update({
              current_stage_id: dunningId,
              last_dunning_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', raw.id)
          await supabase.from('collection_stage_history').insert({
            tenant_id: raw.tenant_id,
            collection_id: raw.id,
            from_stage_id: raw.current_stage_id,
            to_stage_id: dunningId,
            remark: 'Auto-dunning fired',
          })
        } else {
          dunningFailed.push(`${inv.invoice_number}: ${result.error}`)
        }
      }
    }

    logger.info('Daily collection check complete', {
      advanced: advanced.length,
      dunningSent: dunningSent.length,
      dunningFailed: dunningFailed.length,
    })
    return { advanced, dunningSent, dunningFailed }
  }
)
