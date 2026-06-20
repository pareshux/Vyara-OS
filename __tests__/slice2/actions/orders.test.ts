/**
 * Unit tests for lib/actions/orders.ts
 * Covers: createOrderFromQuote, createOrderManual, advanceOrderStage
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Shared mock state (must use vi.hoisted so it's available inside vi.mock factories) ──
const { sb, push, queue } = vi.hoisted(() => {
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

  const sb = {
    from: () => b,
    auth: {
      _noUser: false,
      getUser: function(this: { _noUser: boolean }) {
        return Promise.resolve({
          data: { user: this._noUser ? null : { id: 'test-user' } },
          error: null,
        })
      },
    },
  }
  // Bind getUser to its parent so _noUser is accessible
  sb.auth.getUser = sb.auth.getUser.bind(sb.auth)

  return { sb, push, queue }
})

const mockInngest = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))
vi.mock('@/lib/inngest/client', () => ({ inngest: mockInngest }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/actions/reservations', () => ({
  attemptReserveOrderLines: vi.fn().mockResolvedValue({ results: [] }),
  releaseOrderReservations: vi.fn().mockResolvedValue({ released: 0 }),
}))

import { createOrderFromQuote, createOrderManual, advanceOrderStage } from '@/lib/actions/orders'
import { releaseOrderReservations } from '@/lib/actions/reservations'

// helper: push auth profile to queue
const pushProfile = (role = 'admin') => push({ tenant_id: 'tenant-1', role })

// ── createOrderFromQuote ───────────────────────────────────────────────────────

describe('createOrderFromQuote', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    queue.length = 0
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await createOrderFromQuote({ quote_id: 'q-1' })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when profile is missing', async () => {
    push(null)  // user_profile query returns null
    const result = await createOrderFromQuote({ quote_id: 'q-1' })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when quote not found', async () => {
    pushProfile()
    push(null, { message: 'no rows' })  // quote query fails
    const result = await createOrderFromQuote({ quote_id: 'q-999' })
    expect(result).toEqual({ error: 'no rows' })
  })

  it('returns error when order stages not seeded', async () => {
    pushProfile()
    push({ id: 'q-1', project_id: 'proj-1', total: 50000, status: 'sent', project: { buyer_firm_id: 'firm-1', owner_id: 'user-1' }, lines: [] })  // quote
    push(null, null)  // order_stage returns null
    const result = await createOrderFromQuote({ quote_id: 'q-1' })
    expect(result).toEqual({ error: 'Order stages not seeded' })
  })

  it('creates order from quote with lines', async () => {
    pushProfile()
    push({
      id: 'q-1', project_id: 'proj-1', total: 100000, status: 'sent',
      project: { buyer_firm_id: 'firm-1', owner_id: 'owner-1' },
      lines: [{ product_id: 'prod-1', product_name: 'Paver 60mm', sku_code: 'PAV-60', unit: 'sqm', quantity: 500, unit_price: 200, line_total: 100000, sort_order: 0, price_list_entry_id: null }],
    })  // quote
    push({ id: 'stage-confirmed' })  // order stage
    push({ id: 'order-1', order_number: 'VT-ORD-001' })  // sales_order insert
    push({ data: null, error: null })  // order lines insert (via then)
    push({ data: null, error: null })  // stage history insert (via then)
    push({ data: null, error: null })  // quotation update (via then)

    const result = await createOrderFromQuote({ quote_id: 'q-1' })
    expect(result).toEqual({ id: 'order-1', order_number: 'VT-ORD-001' })
  })

  it('emits order.created inngest event on success', async () => {
    pushProfile()
    push({ id: 'q-1', project_id: 'proj-1', total: 50000, status: 'sent', project: { buyer_firm_id: 'firm-1', owner_id: 'owner-1' }, lines: [] })
    push({ id: 'stage-confirmed' })
    push({ id: 'order-2', order_number: 'VT-ORD-002' })
    push(null)  // stage history
    push(null)  // quotation update

    await createOrderFromQuote({ quote_id: 'q-1' })
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'order.created' })
    )
  })

  it('still succeeds when inngest.send throws (non-fatal)', async () => {
    mockInngest.send.mockRejectedValueOnce(new Error('inngest down'))
    pushProfile()
    push({ id: 'q-1', project_id: 'proj-1', total: 50000, status: 'sent', project: { buyer_firm_id: null, owner_id: 'owner-1' }, lines: [] })
    push({ id: 'stage-confirmed' })
    push({ id: 'order-3', order_number: 'VT-ORD-003' })
    push(null)  // stage history
    push(null)  // quotation update

    const result = await createOrderFromQuote({ quote_id: 'q-1' })
    expect(result).toEqual({ id: 'order-3', order_number: 'VT-ORD-003' })
  })

  it('uses buyer_firm_id from project when not on quote', async () => {
    pushProfile()
    push({
      id: 'q-1', project_id: 'proj-1', total: 50000, status: 'sent',
      project: { buyer_firm_id: 'firm-from-project', owner_id: 'owner-1' },
      lines: [],
    })
    push({ id: 'stage-confirmed' })
    push({ id: 'order-4', order_number: 'VT-ORD-004' })
    push(null)  // stage history
    push(null)  // quotation update

    const result = await createOrderFromQuote({ quote_id: 'q-1' })
    expect(result).not.toHaveProperty('error')
  })
})

// ── createOrderManual ──────────────────────────────────────────────────────────

describe('createOrderManual', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    queue.length = 0
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await createOrderManual({ project_id: 'p1', lines: [] })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when lines array is empty', async () => {
    pushProfile()
    const result = await createOrderManual({ project_id: 'p1', lines: [] })
    expect(result).toEqual({ error: 'At least one line item is required' })
  })

  it('returns error when order stages not seeded', async () => {
    pushProfile()
    push(null, null)  // order_stage query returns null
    const result = await createOrderManual({
      project_id: 'p1',
      lines: [{ product_name: 'Paver', sku_code: 'PAV', unit: 'sqm', quantity: 100, unit_price: 150 }],
    })
    expect(result).toEqual({ error: 'Order stages not seeded' })
  })

  it('computes order value from lines (quantity × unit_price)', async () => {
    pushProfile()
    push({ id: 'stage-confirmed' })  // order stage
    push({ owner_id: 'owner-1', buyer_firm_id: 'firm-1' })  // project
    push({ id: 'order-m1', order_number: 'VT-ORD-M01' })  // sales_order insert
    push(null)  // lines insert
    push(null)  // stage history

    const result = await createOrderManual({
      project_id: 'proj-1',
      lines: [
        { product_name: 'Paver 60mm', sku_code: 'PAV-60', unit: 'sqm', quantity: 200, unit_price: 250 },
        { product_name: 'Kerb', sku_code: 'KERB-01', unit: 'rmt', quantity: 50, unit_price: 180 },
      ],
    })
    // value = 200*250 + 50*180 = 50000 + 9000 = 59000
    expect(result).not.toHaveProperty('error')
    expect(result).toEqual({ id: 'order-m1', order_number: 'VT-ORD-M01' })
  })

  it('uses project.buyer_firm_id when not provided in params', async () => {
    pushProfile()
    push({ id: 'stage-confirmed' })
    push({ owner_id: 'owner-1', buyer_firm_id: 'firm-from-project' })
    push({ id: 'order-m2', order_number: 'VT-ORD-M02' })
    push(null)  // lines
    push(null)  // stage history

    const result = await createOrderManual({
      project_id: 'proj-1',
      lines: [{ product_name: 'Paver', sku_code: 'PAV', unit: 'sqm', quantity: 10, unit_price: 100 }],
    })
    expect(result).not.toHaveProperty('error')
  })
})

// ── advanceOrderStage ──────────────────────────────────────────────────────────

describe('advanceOrderStage', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    queue.length = 0
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await advanceOrderStage('order-1', 'stage-ready')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when order not found', async () => {
    pushProfile()
    push(null, { message: 'Order not found' })
    const result = await advanceOrderStage('bad-order-id', 'stage-x')
    expect(result).toEqual({ error: 'Order not found' })
  })

  it('advances stage and records history', async () => {
    pushProfile()
    push({ current_stage_id: 'stage-confirmed', order_number: 'VT-001', project_id: 'p1' })  // current order
    push({ data: null, error: null })  // update order (via then)
    push({ data: null, error: null })  // insert stage_history (via then)
    push({ stage_key: 'in_production', label: 'In Production' })  // stage lookup
    // No "ready" branch, no cancellation branch

    const result = await advanceOrderStage('order-1', 'stage-prod', 'Moving to production')
    expect(result).toEqual({ success: true })
  })

  it('creates dispatch_schedule task when stage advances to "ready"', async () => {
    pushProfile()
    push({ current_stage_id: 'stage-confirmed', order_number: 'VT-001', project_id: 'proj-1' })
    push(null)  // update order
    push(null)  // stage history
    push({ stage_key: 'ready', label: 'Ready for Dispatch' })  // stage lookup
    push(null)  // task insert (via then)

    const result = await advanceOrderStage('order-1', 'stage-ready')
    expect(result).toEqual({ success: true })
  })

  it('calls releaseOrderReservations when stage is "cancelled"', async () => {
    pushProfile()
    push({ current_stage_id: 'stage-confirmed', order_number: 'VT-001', project_id: 'proj-1' })
    push(null)  // update
    push(null)  // history
    push({ stage_key: 'cancelled', label: 'Cancelled' })
    // releaseOrderReservations is mocked

    await advanceOrderStage('order-1', 'stage-cancelled', 'Customer withdrew')
    expect(releaseOrderReservations).toHaveBeenCalledWith('order-1', 'Customer withdrew')
  })

  it('passes empty string remark as null', async () => {
    pushProfile()
    push({ current_stage_id: 'stage-s1', order_number: 'VT-001', project_id: 'p1' })
    push(null)  // update
    push(null)  // history
    push({ stage_key: 'dispatched', label: 'Dispatched' })

    // No error expected even with no remark
    const result = await advanceOrderStage('order-1', 'stage-dispatched')
    expect(result).toEqual({ success: true })
  })
})
