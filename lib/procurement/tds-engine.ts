/**
 * TDS auto-suggestion engine (Indian Income Tax Act sections).
 *
 * Pure logic, no DB writes — lives outside `lib/actions/*` because
 * Next.js requires every export in a 'use server' module to be async.
 *
 * Sections supported v1:
 *   194Q — Buyer's TDS on purchase of goods. Applies when buyer
 *          turnover > ₹10cr AND aggregate purchase from same vendor
 *          > ₹50L in FY. Rate 0.1% (5% without PAN). Default for
 *          vendor_type='supplier'.
 *   194C — Works contractor. 1% (individual) or 2% (firm).
 *          Default for vendor_type='contractor'.
 *   194J — Professional / technical services. 10% (2% for certain
 *          IT-enabled). Default for vendor_type='service'.
 *   194I — Rent (land/building 10%, machinery 2%). User-selected
 *          only — no auto-suggest (rare in B2B procurement).
 *
 * Mehul / accountants override per payment if needed.
 *
 * P3β follow-on:
 *   - 26AS reconciliation (Form 26AS govt portal)
 *   - Form 16A certificate generation per vendor per FY
 *   - 26Q quarterly return CSV
 *   - PAN-availability check → 20% non-PAN rate fallback
 */

export type TdsSection = '194Q' | '194C' | '194J' | '194I'

export type TdsSuggestion = {
  section: TdsSection | null
  pct: number
  reason: string
}

export function suggestTds(vendor: {
  vendor_type: string
  msme_status?: string | null
  pan?: string | null
}): TdsSuggestion {
  // No PAN on file → 20% across the board (Income Tax Act §206AA)
  // V1: we surface this as a comment; user picks higher pct manually.
  // The vendor master may not have PAN captured (legacy vendors);
  // we leave the suggestion + add a comment.

  switch (vendor.vendor_type) {
    case 'supplier':
      return {
        section: '194Q',
        pct: vendor.pan ? 0.1 : 5,
        reason: vendor.pan
          ? 'Goods purchase from supplier — §194Q @ 0.1% (rate when PAN on file).'
          : 'Goods purchase — §194Q + no PAN on vendor → §206AA fallback @ 5%.',
      }
    case 'contractor':
      return {
        section: '194C',
        pct: vendor.pan ? 1 : 20,
        reason: vendor.pan
          ? 'Works contract — §194C @ 1% (individual / firm default).'
          : 'Works contract — §194C + no PAN → §206AA @ 20%.',
      }
    case 'service':
      return {
        section: '194J',
        pct: vendor.pan ? 10 : 20,
        reason: vendor.pan
          ? 'Professional / technical services — §194J @ 10%.'
          : 'Professional services — §194J + no PAN → §206AA @ 20%.',
      }
    case 'other':
    default:
      return {
        section: null,
        pct: 0,
        reason: 'Vendor type "other" — TDS section not auto-suggested. Pick manually if applicable.',
      }
  }
}

export function tdsRateForSection(section: TdsSection | null, hasPan: boolean): number {
  if (!section) return 0
  if (!hasPan) return 20  // §206AA fallback
  switch (section) {
    case '194Q': return 0.1
    case '194C': return 1
    case '194J': return 10
    case '194I': return 10  // land/building default; machinery would be 2 (user override)
  }
}

export function computeTds(grossAmount: number, pct: number): { tds: number; net: number } {
  const tds = Math.round((grossAmount * pct) / 100 * 100) / 100   // round to paise
  const net = Math.round((grossAmount - tds) * 100) / 100
  return { tds, net }
}
