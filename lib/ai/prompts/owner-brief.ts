/**
 * Owner Dashboard executive brief — Blueprint INT-014.
 *
 * Slice 3.1 redesign: the brief used to render as a 3-column wall of
 * opportunities / risks / recommendations (~250 words, too dense for a
 * 30-second exec read). New shape:
 *
 *   - severity chip
 *   - one-sentence headline (the single most important business fact)
 *   - up to 3 action chips ("Call X · ₹Y · Nd overdue") that drill into
 *     the matching list page
 *
 * That's it. The deeper "tell me more" path is handled by the conversational
 * agent (INT-009), not by stuffing the brief.
 *
 * Per Constitution Principle #6: AI assists, humans decide. The brief never
 * writes data — every chip is a navigation hint.
 */
import { z } from 'zod'

export const OWNER_BRIEF_PROMPT_VERSION = 'owner_brief.v4'

/**
 * Where each action chip drills to. The component maps these to URLs:
 *   collections → /collections (optionally ?q=<search>)
 *   quotes      → /quotes
 *   projects    → /projects
 *   leads       → /leads
 *   tasks       → /tasks
 *   approvals   → /approvals
 *   firms       → /firms (supports ?q= for substring search across name/city/phone/GSTIN)
 */
export const OwnerActionTargetSchema = z.enum([
  'collections', 'quotes', 'projects', 'leads', 'tasks', 'approvals', 'firms',
])
export type OwnerActionTarget = z.infer<typeof OwnerActionTargetSchema>

export const OwnerActionSchema = z.object({
  label: z
    .string()
    .describe(
      'The action chip text. ≤10 words. Verb-first, name the entity, name the ₹/days. ' +
        'Good examples: "Call Surat Muni · ₹9.9L · 85d overdue" / ' +
        '"Push VT-QT-2026-0044 · Punyabhoomi · ₹40L stale" / ' +
        '"Unblock GETCO Rajkot · ₹1.25cr · 19d stalled" / ' +
        '"Review 3 pending discount approvals". ' +
        'Bad examples: "Follow up on collections" (no entity, no ₹) / ' +
        '"Improve customer relationships" (vague, not actionable).',
    ),
  target: OwnerActionTargetSchema.describe(
    'The list page this chip should navigate to. Pick the page where the user will actually do the work.',
  ),
  search: z
    .string()
    .nullable()
    .describe(
      'Optional substring the target page should pre-filter by — typically the firm name or invoice/quote number. ' +
        'Use null when the chip points at a queue rather than a specific entity (e.g., "Review 3 pending approvals" → null).',
    ),
})
export type OwnerAction = z.infer<typeof OwnerActionSchema>

export const OwnerBriefSchema = z.object({
  health: z
    .enum(['healthy', 'needs_attention', 'critical'])
    .describe(
      'Overall tenant business health. ' +
        'critical = overdue receivables > ₹10L OR outstanding > ₹50L OR worst invoice >60d overdue OR pending approval >48h with money on the line; ' +
        'needs_attention = some open issues (cold leads, stale quotes, overdue tasks, smaller overdue invoices) but cash flow not at risk; ' +
        'healthy = nothing urgent + collections keeping pace with billing.',
    ),
  headline: z
    .string()
    .describe(
      'One sentence (≤22 words) capturing the single most important thing for the owner right now. ' +
        'Be specific. Cite buyer name + invoice number + ₹ + days when relevant. Pick ONE story — do not cram three together. ' +
        'Good examples: ' +
        '"Surat Municipal\'s INV-2026-1006 is 85 days overdue at ₹87,544 — ₹9.9L total outstanding with no promise on record." / ' +
        '"Solid week: ₹42L collected, 8 orders booked, no critical attention items." / ' +
        '"3 high-value deals stalled >2 weeks — ₹2.3 cr at risk of slipping the quarter."',
    ),
  actions: z
    .array(OwnerActionSchema)
    .min(0)
    .max(3)
    .describe(
      'Up to 3 action chips, ranked by urgency — most urgent first. Each ≤10 words. ' +
        'Each chip MUST be a concrete action on a named entity, not a category. ' +
        'Avoid duplicating the headline — if the headline already named the chief issue, the chips are for the next actions, not the same one. ' +
        'Empty array OK when nothing urgent.',
    ),
})

export type OwnerBriefResult = z.infer<typeof OwnerBriefSchema>

export const OWNER_BRIEF_SYSTEM_PROMPT = `
You are the executive briefing voice for the Managing Director of a B2B
manufacturing business. The MD opens the Owner Dashboard once or twice a day
and reads your brief in 5 seconds. They are not going to read a paragraph.

Produce exactly three things:
1. health — overall tenant business health classification
2. headline — the one sentence that matters most right now
3. actions — up to 3 short action chips, each pointing at a specific entity

Input: a JSON snapshot of the tenant's commercial state right now (open
pipeline, outstanding receivables, overdue invoices with buyer names + amounts
+ ages, stalled high-value projects, cold leads, pending approvals, period
revenue + collections, DSO). The snapshot includes a "receivables_depth" block
(top 3 debtors, ageing buckets, PTP coverage, cash-in 30d) and a "revenue_depth"
block (funnel + conversions + win rate + top 3 reps + ops snapshot). Use these
to name concrete entities and ₹.

Style rules:
- CONCRETE > vague. Every action chip names a specific entity AND a ₹/days/count. Never "follow up on collections" — always "Call <firm> · ₹X · Yd overdue".
- ₹ amounts in Indian short format: ₹3.2L, ₹2.3 cr, ₹42L.
- Action chip labels: verb-first, ≤10 words, no full sentences. Example: "Call Surat Muni · ₹9.9L · 85d overdue".
- Headline: one sentence ≤22 words. Pick THE single most important fact — don't cram.
- The chips should be the NEXT actions, not a re-narration of the headline. If the headline already covers the worst overdue, chips can be about other things (a stalled deal, an approval queue, a stale quote).
- Pick the right "target" for each chip — the page where the user will actually act:
  collections, quotes, projects, leads, tasks, approvals, firms.
- If a chip points at a specific named entity (e.g., "Surat Muni" or "INV-2026-1006"), set "search" to the searchable identifier. If the chip is a queue ("Review 3 pending approvals"), set "search" to null.
- Empty actions array is fine when there's nothing urgent. Never invent.
- Never write "as an AI" or "based on the data". Write as the briefing voice of the business.

Classification guide for health:
- critical → overdue receivables > ₹10L OR outstanding > ₹50L OR worst invoice >60d overdue OR pending approvals >48h holding up business.
- needs_attention → some live issues (cold leads, stale quotes, smaller overdue invoices, overdue tasks) but cash flow is not at risk.
- healthy → no live red flags AND collections trend is positive.
`.trim()

export const OWNER_BRIEF_USER_PROMPT = `
Below is the tenant's commercial snapshot right now. Produce the executive brief.
`.trim()
