/**
 * Unit tests for lib/actions/complaints.ts (CS-001 / Raj Phase 3).
 * Same mocking pattern as __tests__/slice2/actions/orders.test.ts —
 * queue-based supabase client + vi.hoisted for shared state.
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
      getUser: () => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null }),
    },
  }
  return { sb, push, queue }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  createComplaint,
  advanceComplaintStage,
  assignComplaint,
  recordComplaintResolution,
  rejectComplaint,
} from '@/lib/actions/complaints'

const pushProfile = () => push({ id: 'test-user', tenant_id: 'tenant-1', role: 'admin' })

// ─── createComplaint ────────────────────────────────────────────

describe('createComplaint', () => {
  beforeEach(() => { /* queue resets per test via pop() */ })

  it('rejects empty title', async () => {
    pushProfile()
    const r = await createComplaint({ title: '   ', type_code: 'breakdown', severity_code: 'high', firm_id: 'f-1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/title/i)
  })

  it('rejects missing firm_id', async () => {
    pushProfile()
    const r = await createComplaint({ title: 'X', type_code: 'breakdown', severity_code: 'high', firm_id: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/customer firm/i)
  })

  it('rejects unknown type code', async () => {
    pushProfile()
    push(null)  // type lookup returns null
    const r = await createComplaint({ title: 'X', type_code: 'unknown_type', severity_code: 'high', firm_id: 'f-1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown complaint type/i)
  })

  it('rejects unknown severity code', async () => {
    pushProfile()
    push({ id: 't-1' })             // type lookup succeeds
    push(null)                       // severity lookup returns null
    const r = await createComplaint({ title: 'X', type_code: 'breakdown', severity_code: 'extreme', firm_id: 'f-1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown severity/i)
  })

  it('happy path returns id + complaint_number', async () => {
    pushProfile()
    push({ id: 't-1' })                                   // type lookup
    push({ id: 's-1' })                                   // severity lookup
    push({ id: 'logged-stage-id' })                       // initial stage lookup
    push({ id: 'c-1', complaint_number: 'TEST-001' })     // insert
    push(null)                                            // history insert (then-style)
    const r = await createComplaint({
      title: 'Test', type_code: 'breakdown', severity_code: 'high', firm_id: 'f-1',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.id).toBe('c-1')
      expect(r.data.complaint_number).toBe('TEST-001')
    }
  })
})

// ─── advanceComplaintStage ──────────────────────────────────────

describe('advanceComplaintStage', () => {
  it('blocks close-before-resolved', async () => {
    pushProfile()
    push({ id: 'c-1', current_stage_id: 'in-progress-id', assignee_id: 'u-1', resolution_notes: null })
    push({ id: 'closed-stage-id' })
    const r = await advanceComplaintStage({ complaint_id: 'c-1', to_stage_key: 'closed' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/resolution notes/i)
  })

  it('blocks in_progress without assignee', async () => {
    pushProfile()
    push({ id: 'c-1', current_stage_id: 'triaged-id', assignee_id: null, resolution_notes: null })
    push({ id: 'in-progress-id' })
    const r = await advanceComplaintStage({ complaint_id: 'c-1', to_stage_key: 'in_progress' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/assignee/i)
  })

  it('rejects same-stage advance', async () => {
    pushProfile()
    push({ id: 'c-1', current_stage_id: 'triaged-id', assignee_id: 'u-1', resolution_notes: null })
    push({ id: 'triaged-id' })  // to_stage resolves to same id
    const r = await advanceComplaintStage({ complaint_id: 'c-1', to_stage_key: 'triaged' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/already in that stage/i)
  })

  it('rejects unknown to_stage_key', async () => {
    pushProfile()
    push({ id: 'c-1', current_stage_id: 'a', assignee_id: 'u-1', resolution_notes: null })
    push(null)  // stage lookup returns null
    const r = await advanceComplaintStage({ complaint_id: 'c-1', to_stage_key: 'nonsense' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unknown stage/i)
  })

  it('rejects complaint_id not found', async () => {
    pushProfile()
    push(null)  // complaint not found
    const r = await advanceComplaintStage({ complaint_id: 'missing', to_stage_key: 'triaged' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/not found/i)
  })
})

// ─── recordComplaintResolution ──────────────────────────────────

describe('recordComplaintResolution', () => {
  it('rejects empty resolution_notes', async () => {
    pushProfile()
    const r = await recordComplaintResolution({ complaint_id: 'c-1', resolution_notes: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/resolution notes are required/i)
  })
})

// ─── rejectComplaint ────────────────────────────────────────────

describe('rejectComplaint', () => {
  it('requires a non-empty reason', async () => {
    const r = await rejectComplaint({ complaint_id: 'c-1', remark: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/reason is required/i)
  })
})

// ─── assignComplaint ────────────────────────────────────────────

describe('assignComplaint', () => {
  it('rejects assignee not in tenant', async () => {
    pushProfile()
    push(null)  // assignee lookup returns null
    const r = await assignComplaint({ complaint_id: 'c-1', assignee_id: 'nobody' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/assignee not found/i)
  })
})
