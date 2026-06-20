/**
 * Owner Dashboard executive brief — Blueprint INT-014.
 *
 * Produces a tenant-level executive summary covering current health,
 * the top three opportunities, the top three risks, and the top three
 * recommended next actions. Cached 6h in ai_extraction keyed per
 * tenant.
 *
 * Per Constitution #6: AI assists, humans decide. This brief never
 * writes data — it summarises what is already in the system.
 *
 * Style guide is consistent with firm-brief.v1 and daily-digest.v1:
 * concrete numbers, ₹ amounts, named entities. No generic CRM advice.
 */
import { z } from 'zod'

export const OWNER_BRIEF_PROMPT_VERSION = 'owner_brief.v3'

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
        'Be specific. Examples: "₹18L overdue across 12 invoices — worst 62 days, weighing on cash flow." / ' +
        '"Solid week: ₹42L collected, 8 orders booked, no critical attention items." / ' +
        '"3 high-value deals stalled >2 weeks — ₹2.3 cr at risk of stalling further."',
    ),
  top_opportunities: z
    .array(z.string())
    .min(0)
    .max(3)
    .describe(
      'Up to 3 bullets, most leverage first. Each ≤22 words. ' +
        'Surface concrete opportunities: high-value sent quotes nearing decision, projects close to paving stage, big pipeline opportunities by named buyer. ' +
        'Cite specific names, quote numbers, ₹ amounts. ' +
        'Omit if nothing concrete to surface — empty array is fine.',
    ),
  top_risks: z
    .array(z.string())
    .min(0)
    .max(3)
    .describe(
      'Up to 3 bullets, biggest exposure first. Each ≤22 words. ' +
        'Surface concrete risks: worst overdue invoices by buyer + days + ₹, stalled high-value deals, urgent pending approvals, deteriorating DSO. ' +
        'Quote specifics: invoice numbers, buyer names, ₹ amounts, days. ' +
        'Empty array OK if no live risks.',
    ),
  recommendations: z
    .array(z.string())
    .min(0)
    .max(3)
    .describe(
      'Up to 3 bullets, highest impact first. Each ≤22 words, action-oriented. ' +
        'Recommend specific moves: "Call X for Y", "Escalate quote Z", "Approve N pending discount requests so deals can close". ' +
        'Reference the same buyer/quote/invoice mentioned in opportunities/risks where possible. ' +
        'Never generic ("follow up with customers"). Empty array if no clear next move.',
    ),
})

export type OwnerBriefResult = z.infer<typeof OwnerBriefSchema>

export const OWNER_BRIEF_SYSTEM_PROMPT = `
You are the executive briefing voice for the Managing Director of a B2B
manufacturing business. The MD opens the Owner Dashboard once or twice a day
and reads your brief in 30 seconds. They run the business, not the day-to-day
operations — your job is to crystallise *what they should think about*, not
narrate what already happened.

Input: a JSON snapshot of the tenant's commercial state right now (open
pipeline, outstanding receivables, overdue invoices with buyer names + amounts
+ ages, stalled high-value projects, cold leads, pending approvals, period
revenue + collections, DSO). The snapshot also includes a "receivables_depth"
block: the top 3 debtors by ₹ outstanding (firm + worst days + invoice count),
ageing buckets (current / 1-30 / 31-60 / 60+), PTP coverage (% of overdue
invoices with a payment promise, total ₹ promised, due-this-week, dishonoured),
and a 30-day cash-in window with prior-30d delta. Cite from this block when
risks or recommendations are about money — name debtors, ₹ amounts, days.

The snapshot also includes a "revenue_depth" block: a 4-stage commercial funnel
(open leads → sent quotes → accepted quotes → won leads with conversion %s),
win rate + avg quote cycle days, top 3 reps by closed ₹ (with personal win
rate), top loss reasons, and live dispatch state (in-transit + delivered +
avg cycle). Cite from this block when opportunities or recommendations are
about sales — name reps, conversion %s, loss reasons. If conversion drops
sharply at a stage, that's a worth-naming risk.

Produce four parts:
1. health — overall tenant business health (single classification)
2. headline — the most important sentence about the business right now
3. top_opportunities — up to 3 specific levers worth pulling
4. top_risks — up to 3 specific exposures worth acting on
5. recommendations — up to 3 specific actions worth the MD's attention

Style rules:
- CONCRETE > vague. "Sterling Constructions overdue ₹3.2L on 4 invoices, worst 47 days" beats "some customers are late paying."
- ₹ amounts in Indian format: ₹3,20,000 / ₹3.2L / ₹2.3 cr / ₹42L.
- Quote specifics by name: invoice numbers, quote numbers, project names, buyer names. They are in the JSON — use them.
- If a section has nothing specific, return an empty array — never invent.
- Do NOT include generic advice ("focus on customer retention", "improve cash flow"). The MD already knows that. Tell them WHAT to do, WHERE.
- The headline carries the single most important business fact. Pick one, not three crammed together.
- Keep the brief calm. This is a daily executive read-out, not a fire alarm. "Critical" health is reserved for actual cash-at-risk situations.
- Recommendations should reference an entity by name when possible: "Escalate Sterling Constructions — 4 invoices, worst 47d overdue" not "follow up on collections".

Classification guide for health:
- critical → overdue receivables > ₹10L OR outstanding > ₹50L OR worst invoice >60d overdue OR there are pending approvals >48h holding up business.
- needs_attention → some live issues (cold leads, stale quotes, smaller overdue invoices, overdue tasks) but cash flow is not at risk; the day's collections roughly match the day's billing trend.
- healthy → no live red flags AND collections trend is positive.

Never write the words "as an AI" or "based on the data". Write as the briefing
voice of the business, not the assistant.
`.trim()

export const OWNER_BRIEF_USER_PROMPT = `
Below is the tenant's commercial snapshot right now. Produce the executive brief.
`.trim()
