/**
 * Unit tests for the CSV row parser (parseCSVRow in invoices.ts).
 * The function is private; we replicate it here as a specification.
 */
import { describe, it, expect } from 'vitest'

/** Replication of the private parseCSVRow from lib/actions/invoices.ts */
function parseCSVRow(row: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const c = row[i]
    if (c === '"') {
      if (inQuotes && row[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = !inQuotes }
    } else if (c === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

describe('parseCSVRow', () => {
  describe('simple cases', () => {
    it('parses a plain comma-delimited row', () => {
      expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c'])
    })

    it('parses a single column with no commas', () => {
      expect(parseCSVRow('hello')).toEqual(['hello'])
    })

    it('handles empty fields', () => {
      expect(parseCSVRow('a,,c')).toEqual(['a', '', 'c'])
    })

    it('handles leading/trailing empty fields', () => {
      expect(parseCSVRow(',a,')).toEqual(['', 'a', ''])
    })

    it('handles a fully empty string', () => {
      expect(parseCSVRow('')).toEqual([''])
    })
  })

  describe('quoted fields', () => {
    it('strips quotes from a quoted field', () => {
      expect(parseCSVRow('"hello","world"')).toEqual(['hello', 'world'])
    })

    it('preserves commas inside quotes', () => {
      expect(parseCSVRow('"a,b",c')).toEqual(['a,b', 'c'])
    })

    it('handles escaped double-quotes inside a quoted field', () => {
      expect(parseCSVRow('"say ""hi""",world')).toEqual(['say "hi"', 'world'])
    })

    it('handles a quoted field containing a newline character', () => {
      expect(parseCSVRow('"line1\nline2",end')).toEqual(['line1\nline2', 'end'])
    })

    it('handles mix of quoted and unquoted fields', () => {
      expect(parseCSVRow('unquoted,"quoted, value",last')).toEqual(['unquoted', 'quoted, value', 'last'])
    })
  })

  describe('realistic invoice CSV row parsing', () => {
    it('parses a typical invoice row with external_invoice_number', () => {
      const row = 'VTL/2025-26/001,2025-04-01,2025-05-01,100000,18,0,Paver project'
      const cols = parseCSVRow(row)
      expect(cols[0]).toBe('VTL/2025-26/001')
      expect(cols[1]).toBe('2025-04-01')
      expect(cols[2]).toBe('2025-05-01')
      expect(cols[3]).toBe('100000')
      expect(cols[4]).toBe('18')
    })

    it('preserves numeric strings exactly', () => {
      const row = '1000000.50,18.5,2.5'
      const cols = parseCSVRow(row)
      expect(cols[0]).toBe('1000000.50')
      expect(Number(cols[0])).toBe(1000000.5)
    })

    it('handles notes column with commas in quotes', () => {
      const row = 'INV001,2025-04-01,2025-05-01,50000,18,0,"RA Bill, tranche 2"'
      const cols = parseCSVRow(row)
      expect(cols[6]).toBe('RA Bill, tranche 2')
    })
  })
})
