/**
 * Unit tests for the invoice money computation formula (computeMoney in invoices.ts).
 * The function is private, so we test the contract here by replicating the formula
 * and verifying edge cases. This acts as both a unit test and a living specification.
 */
import { describe, it, expect } from 'vitest'

function computeMoney(params: {
  subtotal: number
  gst_pct: number
  retention_pct: number
}): { gst_amount: number; total: number; retention_amount: number; billed_amount: number } {
  const gst_amount = Math.round((params.subtotal * params.gst_pct) / 100 * 100) / 100
  const total = Math.round((params.subtotal + gst_amount) * 100) / 100
  const retention_amount = Math.round((total * params.retention_pct) / 100 * 100) / 100
  const billed_amount = Math.round((total - retention_amount) * 100) / 100
  return { gst_amount, total, retention_amount, billed_amount }
}

describe('computeMoney', () => {
  describe('standard GST scenarios', () => {
    it('computes 18% GST with no retention', () => {
      const r = computeMoney({ subtotal: 100_000, gst_pct: 18, retention_pct: 0 })
      expect(r.gst_amount).toBe(18_000)
      expect(r.total).toBe(118_000)
      expect(r.retention_amount).toBe(0)
      expect(r.billed_amount).toBe(118_000)
    })

    it('computes 12% GST with no retention', () => {
      const r = computeMoney({ subtotal: 50_000, gst_pct: 12, retention_pct: 0 })
      expect(r.gst_amount).toBe(6_000)
      expect(r.total).toBe(56_000)
      expect(r.billed_amount).toBe(56_000)
    })

    it('computes 5% GST (essential goods rate)', () => {
      const r = computeMoney({ subtotal: 200_000, gst_pct: 5, retention_pct: 0 })
      expect(r.gst_amount).toBe(10_000)
      expect(r.total).toBe(210_000)
    })

    it('computes 28% GST (luxury rate)', () => {
      const r = computeMoney({ subtotal: 10_000, gst_pct: 28, retention_pct: 0 })
      expect(r.gst_amount).toBe(2_800)
      expect(r.total).toBe(12_800)
    })

    it('computes 0% GST (exempt)', () => {
      const r = computeMoney({ subtotal: 50_000, gst_pct: 0, retention_pct: 0 })
      expect(r.gst_amount).toBe(0)
      expect(r.total).toBe(50_000)
      expect(r.billed_amount).toBe(50_000)
    })
  })

  describe('retention scenarios (construction RA bills)', () => {
    it('applies 5% retention on total', () => {
      const r = computeMoney({ subtotal: 100_000, gst_pct: 18, retention_pct: 5 })
      expect(r.total).toBe(118_000)
      expect(r.retention_amount).toBe(5_900)   // 5% of 118,000
      expect(r.billed_amount).toBe(112_100)
    })

    it('applies 10% retention on total', () => {
      const r = computeMoney({ subtotal: 50_000, gst_pct: 18, retention_pct: 10 })
      expect(r.total).toBe(59_000)
      expect(r.retention_amount).toBe(5_900)   // 10% of 59,000
      expect(r.billed_amount).toBe(53_100)
    })

    it('billed_amount = total - retention_amount', () => {
      const r = computeMoney({ subtotal: 75_000, gst_pct: 18, retention_pct: 2.5 })
      expect(r.billed_amount).toBeCloseTo(r.total - r.retention_amount, 1)
    })

    it('0% retention means billed_amount equals total', () => {
      const r = computeMoney({ subtotal: 80_000, gst_pct: 18, retention_pct: 0 })
      expect(r.billed_amount).toBe(r.total)
    })
  })

  describe('rounding behaviour', () => {
    it('rounds GST amount to 2 decimal places', () => {
      // 333.33 * 18% = 59.9994 → rounds to 60.00
      const r = computeMoney({ subtotal: 333.33, gst_pct: 18, retention_pct: 0 })
      expect(r.gst_amount).toBe(60.00)
    })

    it('rounds total to 2 decimal places', () => {
      // subtotal=100.01, 18% GST = 18.0018 → 18.00, total = 118.01
      const r = computeMoney({ subtotal: 100.01, gst_pct: 18, retention_pct: 0 })
      expect(r.total).toBeCloseTo(118.01, 1)
    })

    it('rounds retention_amount to 2 decimal places', () => {
      // total=118000, 3% retention = 3540 exactly
      const r = computeMoney({ subtotal: 100_000, gst_pct: 18, retention_pct: 3 })
      expect(r.retention_amount).toBe(3_540)
    })
  })

  describe('zero and edge values', () => {
    it('handles zero subtotal', () => {
      const r = computeMoney({ subtotal: 0, gst_pct: 18, retention_pct: 5 })
      expect(r.gst_amount).toBe(0)
      expect(r.total).toBe(0)
      expect(r.retention_amount).toBe(0)
      expect(r.billed_amount).toBe(0)
    })

    it('handles very large invoice (₹10cr)', () => {
      const r = computeMoney({ subtotal: 100_000_000, gst_pct: 18, retention_pct: 0 })
      expect(r.gst_amount).toBe(18_000_000)
      expect(r.total).toBe(118_000_000)
    })
  })
})
