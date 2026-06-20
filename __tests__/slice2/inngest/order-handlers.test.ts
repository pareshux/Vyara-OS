/**
 * Unit tests for lib/inngest/order-handlers.ts
 * Covers: onQuoteWonCreateOrderTask (idempotency, order creation, notification, task)
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

// Capture the handler function registered via inngest.createFunction
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

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => mockSb) }))
vi.mock('@/lib/inngest/client', () => ({ inngest: mockInngest }))
vi.mock('@/lib/actions/reservations', () => ({
  attemptReserveOrderLinesService: vi.fn().mockResolvedValue({ results: [] }),
}))

// Import the handlers module so the createFunction calls are executed
import '@/lib/inngest/order-handlers'
import { attemptReserveOrderLinesService } from '@/lib/actions/reservations'

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

// ── onQuoteWonCreateOrderTask ─────────────────────────────────────────────────

describe('onQuoteWonCreateOrderTask (order-on-quote-won)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
    ;(attemptReserveOrderLinesService as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] })
  })

  const getHandler = () => {
    const handler = capturedHandlers.get('order-on-quote-won')
    if (!handler) throw new Error('Handler not registered')
    return handler
  }

  it('skips and warns when quote_id is missing from event', async () => {
    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { quote_id: '', order_value: 0 } }, logger })
    expect(result).toEqual({ skipped: true })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('skips when quote is not found', async () => {
    push(null, null)  // quote query → null
    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { quote_id: 'q-missing' } }, logger })
    expect(result).toEqual({ skipped: true })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('skips with skipped=order-exists when order already exists for this quote', async () => {
    push({
      id: 'q-1', quotation_number: 'VT-Q-001', project_id: 'p1', tenant_id: 't1', total: 50000, status: 'sent',
      project: { name: 'Township', owner_id: 'owner-1', buyer_firm_id: 'firm-1' },
      lines: [],
    })  // quote found
    push([{ id: 'existing-order' }])  // existing order check → has rows

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { quote_id: 'q-1' } }, logger })
    expect(result).toEqual({ skipped: 'order-exists' })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('already exists'), expect.any(Object))
  })

  it('returns error when order_stage confirmed not seeded', async () => {
    push({
      id: 'q-1', quotation_number: 'VT-Q-001', project_id: 'p1', tenant_id: 't1', total: 50000, status: 'sent',
      project: { name: 'Township', owner_id: 'owner-1', buyer_firm_id: 'firm-1' },
      lines: [],
    })
    push([])  // no existing order
    push(null, null)  // order_stage confirmed → null

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { quote_id: 'q-1' } }, logger })
    expect(result).toEqual({ error: 'order-stages-not-seeded' })
    expect(logger.error).toHaveBeenCalled()
  })

  it('creates order, lines, history, notification, task when quote is won', async () => {
    push({
      id: 'q-1', quotation_number: 'VT-Q-001', project_id: 'proj-1', tenant_id: 'tenant-1', total: 100000, status: 'sent',
      project: { name: 'Township Pavers', owner_id: 'owner-1', buyer_firm_id: 'firm-1' },
      lines: [
        { product_id: 'prod-1', product_name: 'Paver 60mm', sku_code: 'PAV-60', unit: 'sqm', quantity: 500, unit_price: 200, line_total: 100000, sort_order: 0, price_list_entry_id: null },
      ],
    })  // quote
    push([])  // no existing order (idempotency check)
    push({ id: 'stage-confirmed' })  // order_stage
    push({ id: 'order-new-1', order_number: 'VT-ORD-001' })  // sales_order insert
    push(null)  // order lines insert (via then)
    push(null)  // stage history insert (via then)
    push(null)  // quotation update accepted (via then)
    push(null)  // notification insert (via then)
    push(null)  // task insert (via then)
    // inngest.send and attemptReserveOrderLinesService are mocked

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { quote_id: 'q-1' } }, logger })
    expect(result).toEqual({ orderCreated: true, orderId: 'order-new-1', orderNumber: 'VT-ORD-001' })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('VT-ORD-001'), expect.any(Object))
  })

  it('attempts stock reservation after creating order', async () => {
    push({
      id: 'q-2', quotation_number: 'VT-Q-002', project_id: 'proj-1', tenant_id: 'tenant-1', total: 50000, status: 'sent',
      project: { name: 'Project B', owner_id: 'owner-1', buyer_firm_id: null },
      lines: [],
    })
    push([])  // no existing order
    push({ id: 'stage-confirmed' })
    push({ id: 'order-new-2', order_number: 'VT-ORD-002' })
    push(null)  // stage history
    push(null)  // quotation update
    push(null)  // notification
    push(null)  // task

    const logger = makeLogger()
    await getHandler()({ event: { data: { quote_id: 'q-2' } }, logger })
    expect(attemptReserveOrderLinesService).toHaveBeenCalledWith(
      mockSb,
      'order-new-2',
      'tenant-1',
      'owner-1'
    )
  })

  it('continues gracefully when stock reservation throws', async () => {
    ;(attemptReserveOrderLinesService as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('warehouse config missing'))

    push({
      id: 'q-3', quotation_number: 'VT-Q-003', project_id: 'proj-1', tenant_id: 'tenant-1', total: 30000, status: 'sent',
      project: { name: 'Project C', owner_id: 'owner-1', buyer_firm_id: 'firm-1' },
      lines: [],
    })
    push([])
    push({ id: 'stage-confirmed' })
    push({ id: 'order-new-3', order_number: 'VT-ORD-003' })
    push(null)
    push(null)
    push(null)
    push(null)

    const logger = makeLogger()
    const result = await getHandler()({ event: { data: { quote_id: 'q-3' } }, logger })
    expect(result).toEqual({ orderCreated: true, orderId: 'order-new-3', orderNumber: 'VT-ORD-003' })
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('non-fatal'), expect.any(Object))
  })

  it('emits order.created event on success', async () => {
    push({
      id: 'q-4', quotation_number: 'VT-Q-004', project_id: 'proj-1', tenant_id: 'tenant-1', total: 20000, status: 'sent',
      project: { name: 'Project D', owner_id: 'owner-1', buyer_firm_id: 'firm-1' },
      lines: [],
    })
    push([])
    push({ id: 'stage-confirmed' })
    push({ id: 'order-new-4', order_number: 'VT-ORD-004' })
    push(null)  // history
    push(null)  // quote update
    push(null)  // notification
    push(null)  // task

    const logger = makeLogger()
    await getHandler()({ event: { data: { quote_id: 'q-4' } }, logger })
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'order.created' })
    )
  })
})
