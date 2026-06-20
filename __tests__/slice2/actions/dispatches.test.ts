/**
 * Unit tests for lib/actions/dispatches.ts
 * Covers: scheduleDispatch (over-dispatch guard), advanceDispatchStage, recordPOD
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { sb, push } = vi.hoisted(() => {
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
      getUser(this: { _noUser: boolean }) {
        return Promise.resolve({ data: { user: this._noUser ? null : { id: 'test-user' } }, error: null })
      },
    },
  }
  sb.auth.getUser = sb.auth.getUser.bind(sb.auth)
  return { sb, push, queue }
})

const mockInngest = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))
vi.mock('@/lib/inngest/client', () => ({ inngest: mockInngest }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { scheduleDispatch, advanceDispatchStage, recordPOD, createTransporter } from '@/lib/actions/dispatches'

const pushProfile = (role = 'admin') => push({ tenant_id: 'tenant-1', role })

// ── scheduleDispatch ───────────────────────────────────────────────────────────

describe('scheduleDispatch', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await scheduleDispatch({ sales_order_id: 'o1', scheduled_at: '2026-07-01', lines: [] })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when scheduled stage not seeded', async () => {
    pushProfile()
    push(null, null)  // dispatch stage query → null
    const result = await scheduleDispatch({ sales_order_id: 'o1', scheduled_at: '2026-07-01', lines: [] })
    expect(result).toEqual({ error: 'Dispatch stages not seeded' })
  })

  it('returns error when order not found', async () => {
    pushProfile()
    push({ id: 'stage-scheduled' })  // dispatch stage
    push(null, null)  // order not found
    const result = await scheduleDispatch({ sales_order_id: 'bad-order', scheduled_at: '2026-07-01', lines: [] })
    expect(result).toEqual({ error: 'Order not found' })
  })

  it('creates dispatch successfully with no lines', async () => {
    pushProfile()
    push({ id: 'stage-scheduled' })  // dispatch stage
    push({ project_id: 'proj-1', owner_id: 'owner-1' })  // order
    push({ id: 'disp-1', dispatch_number: 'VT-D-001' })  // dispatch insert + select
    push(null)  // dispatch stage history
    // No line insert (empty lines)

    const result = await scheduleDispatch({
      sales_order_id: 'order-1',
      scheduled_at: '2026-07-15',
      lines: [],
    })
    expect(result).toEqual({ id: 'disp-1', dispatch_number: 'VT-D-001' })
  })

  it('creates dispatch with lines (no over-dispatch check when sales_order_line_id is absent)', async () => {
    pushProfile()
    push({ id: 'stage-scheduled' })
    push({ project_id: 'proj-1', owner_id: 'owner-1' })
    push({ id: 'disp-2', dispatch_number: 'VT-D-002' })
    push(null)  // lines insert
    push(null)  // stage history

    const result = await scheduleDispatch({
      sales_order_id: 'order-1',
      scheduled_at: '2026-07-15',
      lines: [
        { product_name: 'Paver', sku_code: 'PAV', unit: 'sqm', quantity: 100 },
      ],
    })
    expect(result).toEqual({ id: 'disp-2', dispatch_number: 'VT-D-002' })
  })

  it('blocks over-dispatch when cumulative quantity exceeds ordered', async () => {
    pushProfile()
    push({ id: 'stage-scheduled' })  // dispatch stage
    push({ id: 'stage-cancelled' })  // cancelled stage (for exclusion)
    push({ project_id: 'proj-1', owner_id: 'owner-1' })  // order
    // over-dispatch guard queries:
    push([{ id: 'disp-prev-1' }])  // prior dispatches (via then)
    push([{ sales_order_line_id: 'line-1', quantity: 300 }])  // prior shipped qty (via then)
    push([{ id: 'line-1', quantity: 300, sku_code: 'PAV-60', unit: 'sqm' }])  // order lines

    const result = await scheduleDispatch({
      sales_order_id: 'order-1',
      scheduled_at: '2026-07-15',
      lines: [
        {
          sales_order_line_id: 'line-1',
          product_name: 'Paver 60mm',
          sku_code: 'PAV-60',
          unit: 'sqm',
          quantity: 50,  // would exceed: 300 already shipped, 300 ordered, can't add 50 more
        },
      ],
    })
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('cannot dispatch')
    expect((result as { error: string }).error).toContain('PAV-60')
  })

  it('allows partial dispatch within ordered quantity', async () => {
    pushProfile()
    push({ id: 'stage-scheduled' })
    push({ id: 'stage-cancelled' })
    push({ project_id: 'proj-1', owner_id: 'owner-1' })
    // guard: prior dispatches exist
    push([{ id: 'disp-prev' }])
    push([{ sales_order_line_id: 'line-1', quantity: 100 }])  // 100 already shipped
    push([{ id: 'line-1', quantity: 500, sku_code: 'PAV-60', unit: 'sqm' }])  // 500 ordered
    // Now create the dispatch (100 shipped, 400 remaining, requesting 200)
    push({ id: 'disp-3', dispatch_number: 'VT-D-003' })
    push(null)  // lines
    push(null)  // history

    const result = await scheduleDispatch({
      sales_order_id: 'order-1',
      scheduled_at: '2026-07-15',
      lines: [{ sales_order_line_id: 'line-1', product_name: 'Paver 60mm', sku_code: 'PAV-60', unit: 'sqm', quantity: 200 }],
    })
    expect(result).toEqual({ id: 'disp-3', dispatch_number: 'VT-D-003' })
  })
})

// ── advanceDispatchStage ────────────────────────────────────────────────────────

describe('advanceDispatchStage', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await advanceDispatchStage('disp-1', 'delivered')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when stage key not found', async () => {
    pushProfile()
    push(null, null)  // stage lookup returns null
    const result = await advanceDispatchStage('disp-1', 'in_transit')
    expect(result).toEqual({ error: 'Stage in_transit not found' })
  })

  it('marks dispatch as delivered and stamps delivered_at', async () => {
    pushProfile()
    push({ id: 'stage-delivered' })  // stage lookup
    push({ current_stage_id: 'stage-in-transit', sales_order_id: 'o1', project_id: 'p1', dispatch_number: 'VT-D-001' })  // dispatch
    push(null)  // update dispatch (via then)
    push(null)  // stage history (via then)
    // inngest send for dispatch.completed (mocked)
    push(null)  // task insert for POD pending (via then)

    const result = await advanceDispatchStage('disp-1', 'delivered')
    expect(result).toEqual({ success: true })
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'dispatch.completed' })
    )
  })

  it('advances to in_transit without creating task', async () => {
    pushProfile()
    push({ id: 'stage-transit' })
    push({ current_stage_id: 'stage-scheduled', sales_order_id: 'o1', project_id: 'p1', dispatch_number: 'VT-D-002' })
    push(null)  // update
    push(null)  // history

    const result = await advanceDispatchStage('disp-1', 'in_transit')
    expect(result).toEqual({ success: true })
    // No inngest call expected for in_transit
    expect(mockInngest.send).not.toHaveBeenCalled()
  })
})

// ── recordPOD ──────────────────────────────────────────────────────────────────

describe('recordPOD', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await recordPOD({ dispatch_id: 'd1', pod_url: 'path/pod.jpg' })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when pod_uploaded stage is missing', async () => {
    pushProfile()
    push(null, null)  // stage lookup → null
    const result = await recordPOD({ dispatch_id: 'd1', pod_url: 'path/pod.jpg' })
    expect(result).toEqual({ error: 'pod_uploaded stage missing' })
  })

  it('records POD and advances stage', async () => {
    pushProfile()
    push({ id: 'stage-pod' })  // stage lookup
    push({ current_stage_id: 'stage-delivered', project_id: 'p1', delivered_at: '2026-07-01T08:00:00Z' })  // dispatch
    push(null)  // update dispatch (via then)
    push(null)  // stage history (via then)
    push(null)  // mark POD task done (via then)
    // inngest.send mocked

    const result = await recordPOD({
      dispatch_id: 'd1',
      pod_url: 'tenant-1/disp-1/pod.jpg',
      signature_name: 'Ramesh Kumar',
    })
    expect(result).toEqual({ success: true })
  })

  it('stamps delivered_at when dispatch has none yet', async () => {
    pushProfile()
    push({ id: 'stage-pod' })
    push({ current_stage_id: 'stage-in-transit', project_id: 'p1', delivered_at: null })  // no delivered_at
    push(null)  // update
    push(null)  // history
    push(null)  // task update

    const result = await recordPOD({ dispatch_id: 'd1', pod_url: 'path/pod.jpg' })
    expect(result).toEqual({ success: true })
  })
})

// ── createTransporter ──────────────────────────────────────────────────────────

describe('createTransporter', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await createTransporter({ name: 'Fast Trucks' })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('creates transporter successfully', async () => {
    pushProfile()
    push({ id: 'trans-1' })  // transporter insert

    const result = await createTransporter({ name: 'Fast Trucks', phone: '+919876543210', vehicle_count: 10 })
    expect(result).toEqual({ id: 'trans-1' })
  })
})
