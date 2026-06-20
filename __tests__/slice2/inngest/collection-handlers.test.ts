/**
 * Unit tests for lib/inngest/collection-handlers.ts
 * Covers: onInvoiceSyncedCreateCollection, dailyCollectionCheck (ageing engine)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Hoisted mock state ────────────────────────────────────────────────────────
const { mockSb, push } = vi.hoisted(() => {
  const queue: { data: unknown; error: { message: string } | null }[] = []
  const pop = () => queue.shift() ?? { data: null, error: null }
  const push = (d: unknown, e: { message: string } | null = null) => queue.push({ data: d, error: e })

  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(pop()).then(resolve, reject),
    single: () => Promise.resolve(pop()),
    maybeSingle: () => Promise.resolve(pop()),
  }
  const chain = () => b
  ;['select','insert','update','delete','upsert','eq','neq','is','in','or','not','filter','limit','order','gte','lte','head'].forEach(k => { b[k] = chain })

  const mockSb = { from: () => b }

  return { mockSb, push, queue }
})

const capturedHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>())

const mockInngest = vi.hoisted(() => ({
  createFunction: vi.fn().mockImplementation(
    (meta: { id: string }, handler: (...args: unknown[]) => Promise<unknown>) => {
      capturedHandlers.set(meta.id, handler)
      return { id: meta.id }
    }
  ),
  send: vi.fn().mockResolvedValue(undefined),
}))

const mockSendWhatsApp = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true as const, messageId: 'msg-1', mode: 'stub' as const }))

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => mockSb) }))
vi.mock('@/lib/inngest/client', () => ({ inngest: mockInngest }))
vi.mock('@/lib/aisensy/client', () => ({ sendWhatsApp: mockSendWhatsApp }))

import '@/lib/inngest/collection-handlers'

const makeLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

// ── onInvoiceSyncedCreateCollection ───────────────────────────────────────────

describe('onInvoiceSyncedCreateCollection (collection-on-invoice-synced)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const getHandler = () => {
    const h = capturedHandlers.get('collection-on-invoice-synced')
    if (!h) throw new Error('Handler not registered')
    return h
  }

  it('skips when collection already exists for invoice', async () => {
    push({ id: 'existing-col' })  // maybeSingle check → found

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { invoice_id: 'inv-1', source: 'manual' } }, logger })
    expect(result).toEqual({ skipped: 'exists' })
    expect(logger.info).toHaveBeenCalled()
  })

  it('skips when invoice is not found', async () => {
    push(null)  // maybeSingle → no existing collection
    push(null, null)  // invoice single → null

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { invoice_id: 'inv-missing', source: 'manual' } }, logger })
    expect(result).toEqual({ skipped: 'no-invoice' })
  })

  it('returns error when due stage is not seeded', async () => {
    push(null)  // no existing collection
    push({ id: 'inv-1', tenant_id: 'tenant-1' })  // invoice found
    push(null, null)  // due stage → null

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { invoice_id: 'inv-1', source: 'manual' } }, logger })
    expect(result).toEqual({ error: 'due stage missing' })
  })

  it('creates collection row in due stage', async () => {
    push(null)  // no existing collection
    push({ id: 'inv-1', tenant_id: 'tenant-1' })  // invoice
    push({ id: 'stage-due' })  // due stage
    push(null)  // collection insert (via then)

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { invoice_id: 'inv-1', source: 'manual' } }, logger })
    expect(result).toEqual({ created: true })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Created collection'), expect.any(Object))
  })

  it('returns error when collection insert fails', async () => {
    push(null)  // no existing collection
    push({ id: 'inv-2', tenant_id: 'tenant-1' })
    push({ id: 'stage-due' })
    push(null, { message: 'unique constraint violation' })  // insert fails

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { invoice_id: 'inv-2', source: 'manual' } }, logger })
    expect(result).toHaveProperty('error', 'unique constraint violation')
    expect(logger.error).toHaveBeenCalled()
  })
})

// ── dailyCollectionCheck ───────────────────────────────────────────────────────

describe('dailyCollectionCheck (collection-daily-check)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
    mockSendWhatsApp.mockResolvedValue({ ok: true, messageId: 'msg-1', mode: 'stub' })
  })

  const getHandler = () => {
    const h = capturedHandlers.get('collection-daily-check')
    if (!h) throw new Error('Handler not registered')
    return h
  }

  it('returns error when stages are not seeded', async () => {
    push(null, null)  // pre_due_reminder stage → null
    push(null, null)  // overdue stage → null
    push(null, null)  // dunning stage → null

    const logger = makeLogger()
    const result = await getHandler()({ logger })
    expect(result).toHaveProperty('error', 'stages-missing')
    expect(logger.error).toHaveBeenCalled()
  })

  it('handles empty collection list gracefully', async () => {
    push({ id: 'stage-predue' })   // pre_due_reminder
    push({ id: 'stage-overdue' })  // overdue
    push({ id: 'stage-dunning' })  // dunning_whatsapp
    push([])  // open collections → empty

    const logger = makeLogger()
    const result = await getHandler()({ logger })
    expect(result).toEqual({ advanced: [], dunningSent: [], dunningFailed: [] })
  })

  it('skips paid invoices', async () => {
    push({ id: 'stage-predue' })
    push({ id: 'stage-overdue' })
    push({ id: 'stage-dunning' })
    push([{
      id: 'col-1', current_stage_id: 'stage-due', tenant_id: 't1', invoice_id: 'inv-1', last_dunning_at: null,
      invoice: { id: 'inv-1', invoice_number: 'INV-001', due_date: '2026-06-01', billed_amount: 50000, paid_amount: 50000, status: 'paid', buyer: null },
    }])  // paid invoice — should be skipped

    const logger = makeLogger()
    const result = await getHandler()({ logger })
    expect(result).toEqual({ advanced: [], dunningSent: [], dunningFailed: [] })
  })

  it('advances to pre_due_reminder when due within 3 days', async () => {
    // Simulate today's date relative to a due_date 2 days in the future
    const today = new Date()
    const dueDate = new Date(today.getTime() + 2 * 86_400_000)
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    push({ id: 'stage-predue' })
    push({ id: 'stage-overdue' })
    push({ id: 'stage-dunning' })
    push([{
      id: 'col-1', current_stage_id: 'stage-due', tenant_id: 't1', invoice_id: 'inv-1', last_dunning_at: null,
      invoice: { id: 'inv-1', invoice_number: 'INV-001', due_date: dueDateStr, billed_amount: 50000, paid_amount: 0, status: 'sent', buyer: { name: 'Acme', phone: '+919876543210' } },
    }])
    push(null)  // update collection to predue (via then)
    push(null)  // stage_history insert (via then)

    const logger = makeLogger()
    const result = await getHandler()({ logger }) as { advanced: Array<{ id: string; to: string }> }
    expect(result.advanced).toEqual([{ id: 'col-1', to: 'pre_due_reminder' }])
  })

  it('advances to overdue and emits invoice.overdue event when past due date', async () => {
    const today = new Date()
    const dueDate = new Date(today.getTime() - 5 * 86_400_000)  // 5 days ago
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    push({ id: 'stage-predue' })
    push({ id: 'stage-overdue' })
    push({ id: 'stage-dunning' })
    push([{
      id: 'col-1', current_stage_id: 'stage-due', tenant_id: 't1', invoice_id: 'inv-1', last_dunning_at: null,
      invoice: { id: 'inv-1', invoice_number: 'INV-001', due_date: dueDateStr, billed_amount: 100000, paid_amount: 0, status: 'sent', buyer: { name: 'Acme', phone: null } },
    }])
    push(null)  // update to overdue (via then)
    push(null)  // stage history (via then)
    // inngest.send for invoice.overdue is mocked
    // buyer has no phone → dunning fails silently

    const logger = makeLogger()
    const result = await getHandler()({ logger }) as { advanced: Array<{ id: string; to: string }>; dunningFailed: string[] }
    expect(result.advanced).toEqual([{ id: 'col-1', to: 'overdue' }])
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'invoice.overdue' })
    )
    expect(result.dunningFailed).toHaveLength(1)
    expect(result.dunningFailed[0]).toContain('no phone')
  })

  it('fires WhatsApp dunning when collection is 3+ days overdue and not recently dunned', async () => {
    const today = new Date()
    const dueDate = new Date(today.getTime() - 4 * 86_400_000)  // 4 days overdue
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    push({ id: 'stage-predue' })
    push({ id: 'stage-overdue' })
    push({ id: 'stage-dunning' })
    push([{
      id: 'col-1', current_stage_id: 'stage-overdue', tenant_id: 't1', invoice_id: 'inv-1', last_dunning_at: null,
      invoice: { id: 'inv-1', invoice_number: 'INV-001', due_date: dueDateStr, billed_amount: 75000, paid_amount: 0, status: 'sent', buyer: { name: 'ABC Corp', phone: '+919876543210' } },
    }])
    // Already overdue, no stage change needed (current = stage-overdue)
    // WhatsApp sends:
    push(null)  // collection_activity insert (via then)
    push(null)  // collection update last_dunning_at + stage (via then)
    push(null)  // stage history (via then)

    const logger = makeLogger()
    const result = await getHandler()({ logger }) as { dunningSent: string[]; advanced: Array<unknown> }
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+919876543210', template: 'vyara_dunning_v1' })
    )
    expect(result.dunningSent).toContain('INV-001')
  })

  it('skips dunning when last dunned less than 5 days ago', async () => {
    const today = new Date()
    const dueDate = new Date(today.getTime() - 10 * 86_400_000)  // 10 days overdue
    const dueDateStr = dueDate.toISOString().slice(0, 10)
    const recentDunning = new Date(today.getTime() - 2 * 86_400_000).toISOString()  // dunned 2 days ago

    push({ id: 'stage-predue' })
    push({ id: 'stage-overdue' })
    push({ id: 'stage-dunning' })
    push([{
      id: 'col-1', current_stage_id: 'stage-overdue', tenant_id: 't1', invoice_id: 'inv-1', last_dunning_at: recentDunning,
      invoice: { id: 'inv-1', invoice_number: 'INV-001', due_date: dueDateStr, billed_amount: 50000, paid_amount: 0, status: 'sent', buyer: { name: 'XYZ', phone: '+919876543210' } },
    }])
    // Already overdue and already dunned 2 days ago → no stage advance (current already overdue), no dunning

    const logger = makeLogger()
    const result = await getHandler()({ logger }) as { dunningSent: string[]; advanced: Array<unknown> }
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
    expect(result.dunningSent).toHaveLength(0)
  })

  it('records WhatsApp failure in dunningFailed when sendWhatsApp returns ok:false', async () => {
    mockSendWhatsApp.mockResolvedValueOnce({ ok: false, error: 'invalid phone number' })

    const today = new Date()
    const dueDate = new Date(today.getTime() - 5 * 86_400_000)
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    push({ id: 'stage-predue' })
    push({ id: 'stage-overdue' })
    push({ id: 'stage-dunning' })
    push([{
      id: 'col-1', current_stage_id: 'stage-overdue', tenant_id: 't1', invoice_id: 'inv-1', last_dunning_at: null,
      invoice: { id: 'inv-1', invoice_number: 'INV-001', due_date: dueDateStr, billed_amount: 30000, paid_amount: 0, status: 'sent', buyer: { name: 'Bad Corp', phone: 'invalid-phone' } },
    }])
    push(null)  // collection_activity (failed) insert (via then)

    const logger = makeLogger()
    const result = await getHandler()({ logger }) as { dunningFailed: string[] }
    expect(result.dunningFailed[0]).toContain('INV-001')
    expect(result.dunningFailed[0]).toContain('invalid phone number')
  })

  it('skips collections where outstanding is zero', async () => {
    const today = new Date()
    const dueDate = new Date(today.getTime() - 10 * 86_400_000)
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    push({ id: 'stage-predue' })
    push({ id: 'stage-overdue' })
    push({ id: 'stage-dunning' })
    push([{
      id: 'col-1', current_stage_id: 'stage-due', tenant_id: 't1', invoice_id: 'inv-1', last_dunning_at: null,
      invoice: { id: 'inv-1', invoice_number: 'INV-001', due_date: dueDateStr, billed_amount: 50000, paid_amount: 50000, status: 'sent', buyer: { name: 'Paid Corp', phone: '+919876543210' } },
    }])

    const logger = makeLogger()
    const result = await getHandler()({ logger }) as { dunningSent: string[] }
    expect(result.dunningSent).toHaveLength(0)
  })
})
