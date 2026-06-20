/**
 * Unit tests for lib/auth/mask.ts — PLAT-007 sensitive-column mask helper.
 * Pure functions; no mocking required.
 */
import { describe, it, expect } from 'vitest'
import { isMaskedRole, maskRow, maskRows, maskedColumnsFor } from '@/lib/auth/mask'

// ── isMaskedRole ──────────────────────────────────────────────────────────────

describe('isMaskedRole', () => {
  it('returns true for sales_engineer', () => {
    expect(isMaskedRole('sales_engineer')).toBe(true)
  })

  it('returns false for admin', () => {
    expect(isMaskedRole('admin')).toBe(false)
  })

  it('returns false for manager', () => {
    expect(isMaskedRole('manager')).toBe(false)
  })

  it('returns false for accounts', () => {
    expect(isMaskedRole('accounts')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isMaskedRole(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isMaskedRole(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isMaskedRole('')).toBe(false)
  })

  it('is case-sensitive (SALES_ENGINEER is not masked)', () => {
    expect(isMaskedRole('SALES_ENGINEER')).toBe(false)
  })
})

// ── maskRow ────────────────────────────────────────────────────────────────────

describe('maskRow', () => {
  it('masks base_price on product for sales_engineer', () => {
    const row = { id: 'p1', name: 'Paver', base_price: 450, sku: 'PAV-001' }
    const result = maskRow('sales_engineer', 'product', row)
    expect(result.base_price).toBeNull()
    expect(result.id).toBe('p1')
    expect(result.name).toBe('Paver')
    expect(result.sku).toBe('PAV-001')
  })

  it('masks discount_pct on quotation for sales_engineer', () => {
    const row = { id: 'q1', quotation_number: 'VT-Q-001', discount_pct: 10, total: 50000 }
    const result = maskRow('sales_engineer', 'quotation', row)
    expect(result.discount_pct).toBeNull()
    expect(result.total).toBe(50000)
  })

  it('masks discount_pct on quotation_line for sales_engineer', () => {
    const row = { id: 'ql1', line_total: 10000, discount_pct: 5, unit_price: 200 }
    const result = maskRow('sales_engineer', 'quotation_line', row)
    expect(result.discount_pct).toBeNull()
    expect(result.unit_price).toBe(200)
  })

  it('masks order_value on project for sales_engineer', () => {
    const row = { id: 'proj1', name: 'Township', order_value: 5000000 }
    const result = maskRow('sales_engineer', 'project', row)
    expect(result.order_value).toBeNull()
    expect(result.name).toBe('Township')
  })

  it('does NOT mask for admin role', () => {
    const row = { id: 'p1', base_price: 450 }
    const result = maskRow('admin', 'product', row)
    expect(result.base_price).toBe(450)
  })

  it('does NOT mask for manager role', () => {
    const row = { id: 'q1', discount_pct: 10 }
    const result = maskRow('manager', 'quotation', row)
    expect(result.discount_pct).toBe(10)
  })

  it('does NOT mask for null role', () => {
    const row = { id: 'q1', discount_pct: 10 }
    const result = maskRow(null, 'quotation', row)
    expect(result.discount_pct).toBe(10)
  })

  it('does NOT mask for tables with no sensitive columns (invoice)', () => {
    const row = { id: 'inv1', total: 99000 }
    const result = maskRow('sales_engineer', 'invoice', row)
    expect(result.total).toBe(99000)
  })

  it('returns row unchanged when it has no sensitive column keys', () => {
    const row = { id: 'p1', name: 'Tile' }
    const result = maskRow('sales_engineer', 'product', row)
    expect(result).toEqual({ id: 'p1', name: 'Tile' })
  })

  it('returns null unchanged', () => {
    expect(maskRow('sales_engineer', 'product', null as unknown as Record<string, unknown>)).toBeNull()
  })

  it('does not mutate the original row', () => {
    const row = { id: 'p1', base_price: 450 }
    const result = maskRow('sales_engineer', 'product', row)
    expect(row.base_price).toBe(450)   // original untouched
    expect(result.base_price).toBeNull()
  })
})

// ── maskRows ───────────────────────────────────────────────────────────────────

describe('maskRows', () => {
  it('masks all rows in the array for sales_engineer', () => {
    const rows = [
      { id: '1', base_price: 100 },
      { id: '2', base_price: 200 },
    ]
    const result = maskRows('sales_engineer', 'product', rows)
    expect(result).toHaveLength(2)
    expect(result[0].base_price).toBeNull()
    expect(result[1].base_price).toBeNull()
  })

  it('returns the same array reference for non-masked roles (fast-path)', () => {
    const rows = [{ id: '1', base_price: 100 }]
    const result = maskRows('admin', 'product', rows)
    expect(result).toBe(rows)
  })

  it('returns empty array for empty input', () => {
    expect(maskRows('sales_engineer', 'product', [])).toEqual([])
  })

  it('returns empty array for null input', () => {
    expect(maskRows('sales_engineer', 'product', null as unknown as [])).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(maskRows('sales_engineer', 'product', undefined)).toEqual([])
  })

  it('does not mask rows for unknown table even if role is masked', () => {
    const rows = [{ id: '1', value: 999 }]
    const result = maskRows('sales_engineer', 'firm', rows)
    expect(result[0].value).toBe(999)
  })
})

// ── maskedColumnsFor ───────────────────────────────────────────────────────────

describe('maskedColumnsFor', () => {
  it('returns [base_price] for product + sales_engineer', () => {
    expect(maskedColumnsFor('sales_engineer', 'product')).toContain('base_price')
  })

  it('returns [discount_pct] for quotation + sales_engineer', () => {
    expect(maskedColumnsFor('sales_engineer', 'quotation')).toContain('discount_pct')
  })

  it('returns [discount_pct] for quotation_line + sales_engineer', () => {
    expect(maskedColumnsFor('sales_engineer', 'quotation_line')).toContain('discount_pct')
  })

  it('returns [order_value] for project + sales_engineer', () => {
    expect(maskedColumnsFor('sales_engineer', 'project')).toContain('order_value')
  })

  it('returns empty array for admin on any table', () => {
    expect(maskedColumnsFor('admin', 'product')).toEqual([])
    expect(maskedColumnsFor('admin', 'project')).toEqual([])
  })

  it('returns empty array for null role', () => {
    expect(maskedColumnsFor(null, 'product')).toEqual([])
  })

  it('returns empty array for unknown table + masked role', () => {
    expect(maskedColumnsFor('sales_engineer', 'firm')).toEqual([])
    expect(maskedColumnsFor('sales_engineer', 'invoice')).toEqual([])
  })
})
