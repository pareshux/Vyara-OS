/**
 * Unit tests for lib/gates.ts (Raj demo Phase 5a).
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
  const sb = { from: () => b }
  return { sb, push }
})

import { evaluateGatesForStage } from '@/lib/gates'

describe('evaluateGatesForStage', () => {
  it('returns empty array when no gates configured', async () => {
    push([])  // gate_requirement query returns no rows
    // @ts-expect-error our minimal mock matches the interface enough for the call
    const r = await evaluateGatesForStage(sb, 'stage-1', { project_id: 'p-1', fields: {} })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual([])
  })

  it('marks document gate satisfied when attachment present with matching type_key', async () => {
    push([{ id: 'g-1', label: 'Drawing pack', is_hard: true, required_document_type: 'drawing_approval_pack', required_field_name: null }])
    // attachment query
    push([{ kind: 'document', metadata: { type_key: 'drawing_approval_pack' } }])
    // @ts-expect-error minimal mock
    const r = await evaluateGatesForStage(sb, 'stage-1', { project_id: 'p-1', fields: {} })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toHaveLength(1)
      expect(r.data[0].satisfied).toBe(true)
      expect(r.data[0].kind).toBe('document')
    }
  })

  it('marks document gate unsatisfied when no matching attachment', async () => {
    push([{ id: 'g-1', label: 'Drawing pack', is_hard: true, required_document_type: 'drawing_approval_pack', required_field_name: null }])
    push([])  // no attachments
    // @ts-expect-error minimal mock
    const r = await evaluateGatesForStage(sb, 'stage-1', { project_id: 'p-1', fields: {} })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data[0].satisfied).toBe(false)
  })

  it('marks field gate satisfied when project field present', async () => {
    push([{ id: 'g-2', label: 'Order value captured', is_hard: true, required_document_type: null, required_field_name: 'order_value' }])
    // @ts-expect-error minimal mock
    const r = await evaluateGatesForStage(sb, 'stage-1', { project_id: 'p-1', fields: { order_value: 1500000 } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data[0].satisfied).toBe(true)
      expect(r.data[0].kind).toBe('field')
    }
  })

  it('marks field gate unsatisfied when field null/empty', async () => {
    push([{ id: 'g-2', label: 'Order value', is_hard: true, required_document_type: null, required_field_name: 'order_value' }])
    // @ts-expect-error minimal mock
    const r = await evaluateGatesForStage(sb, 'stage-1', { project_id: 'p-1', fields: { order_value: null } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data[0].satisfied).toBe(false)
  })

  it('handles mixed document + field gates in same stage', async () => {
    push([
      { id: 'g-1', label: 'Drawing pack', is_hard: true,  required_document_type: 'drawing_approval_pack', required_field_name: null },
      { id: 'g-2', label: 'Order value',  is_hard: false, required_document_type: null, required_field_name: 'order_value' },
    ])
    push([{ kind: 'document', metadata: { type_key: 'drawing_approval_pack' } }])
    // @ts-expect-error minimal mock
    const r = await evaluateGatesForStage(sb, 'stage-1', { project_id: 'p-1', fields: { order_value: 100 } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toHaveLength(2)
      expect(r.data.every((g) => g.satisfied)).toBe(true)
    }
  })
})
