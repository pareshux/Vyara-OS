/**
 * Unit tests for lib/actions/amc.ts (CS-009 / Raj Phase 4).
 */
import { vi, describe, it, expect } from 'vitest'

const { sb, push } = vi.hoisted(() => {
  const queue: { data: unknown; error: { message: string } | null }[] = []
  const pop = () => queue.shift() ?? { data: null, error: null }
  const push = (d: unknown, e: { message: string } | null = null) => queue.push({ data: d, error: e })

  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(pop()).then(resolve, reject),
    single: () => Promise.resolve(pop()),
  }
  const chain = () => b
  ;['select','insert','update','delete','upsert','eq','neq','is','in','or','not','filter','limit','order','gte','lte','head'].forEach(k => { b[k] = chain })

  const sb = {
    from: () => b,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null }) },
  }
  return { sb, push }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createAmcContract, cancelAmcContract } from '@/lib/actions/amc'

const pushProfile = () => push({ id: 'test-user', tenant_id: 'tenant-1', role: 'admin' })

describe('createAmcContract', () => {
  const base = {
    title: 'AMC', firm_id: 'f-1',
    start_date: '2026-07-01', end_date: '2027-06-30',
    value: 100000, visit_frequency: 'quarterly' as const,
  }

  it('rejects empty title', async () => {
    pushProfile()
    const r = await createAmcContract({ ...base, title: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/title/i)
  })

  it('rejects missing firm_id', async () => {
    pushProfile()
    const r = await createAmcContract({ ...base, firm_id: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/customer firm/i)
  })

  it('rejects end_date <= start_date', async () => {
    pushProfile()
    const r = await createAmcContract({ ...base, start_date: '2026-07-01', end_date: '2026-07-01' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/end_date/i)
  })

  it('rejects unknown visit_frequency', async () => {
    pushProfile()
    // @ts-expect-error testing runtime check on unknown frequency
    const r = await createAmcContract({ ...base, visit_frequency: 'weekly' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown visit_frequency/i)
  })

  it('happy path inserts contract + schedule + returns visits count', async () => {
    pushProfile()
    push({ id: 'amc-1', contract_number: 'TEST-AMC-001' })  // contract insert
    push(null)  // visit_schedule insert (then-style)
    const r = await createAmcContract({ ...base, activate: true })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.id).toBe('amc-1')
      expect(r.data.contract_number).toBe('TEST-AMC-001')
      // 1 year × 4 visits/year = 4 scheduled visits
      expect(r.data.visits_scheduled).toBe(4)
    }
  })

  it('custom frequency with explicit dates honors only in-range dates', async () => {
    pushProfile()
    push({ id: 'amc-2', contract_number: 'TEST-AMC-002' })  // contract insert
    push(null)                                                // visit insert
    const r = await createAmcContract({
      ...base, visit_frequency: 'custom',
      custom_visit_dates: ['2026-08-15', '2027-01-01', '2028-01-01' /* out of range */],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.visits_scheduled).toBe(2)  // 3rd date excluded
  })
})

describe('cancelAmcContract', () => {
  it('rejects empty reason', async () => {
    pushProfile()
    const r = await cancelAmcContract({ contract_id: 'c-1', reason: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/reason is required/i)
  })
})
