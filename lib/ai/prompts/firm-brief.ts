/**
 * Firm relationship health brief — Blueprint REL-011
 *
 * Surfaces urgent signals (overdue payments, stale quotes, stuck projects,
 * cold leads) as a glanceable summary on the Customer 360 Overview tab.
 *
 * Per Constitution #6: AI assists, humans decide. This brief never writes
 * data — it only summarises what is already in the system.
 */
import { z } from 'zod'

export const FIRM_BRIEF_PROMPT_VERSION = 'firm_brief.v1'

export const FirmBriefSchema = z.object({
  health: z
    .enum(['healthy', 'needs_attention', 'critical'])
    .describe(
      'healthy = no open issues or everything touched recently; ' +
        'needs_attention = 1–2 items that need a follow-up (sent quote >7d, project stale >14d, minor overdue); ' +
        'critical = overdue invoice >45 days OR outstanding >₹5L OR 3+ concurrent issues.',
    ),
  headline: z
    .string()
    .describe(
      'One sentence (≤16 words) capturing the most important thing to know about this firm right now. ' +
        'Examples: "Invoice #47 overdue ₹3.2L — 42 days with no payment." / ' +
        '"Healthy relationship — last contact 2 days ago, no open issues." / ' +
        '"Quote VT-QT-2026-0014 sent 18 days ago; no response yet."',
    ),
  bullets: z
    .array(z.string())
    .min(0)
    .max(5)
    .describe(
      'Up to 5 bullets, most urgent first. Each ≤16 words. ' +
        'Include specific amounts (₹), dates, invoice numbers, project names, stage names. ' +
        'Omit bullets when there is genuinely nothing to surface. ' +
        'Do NOT repeat the headline. Do NOT give generic advice ("follow up", "call the customer").',
    ),
})

export type FirmBriefResult = z.infer<typeof FirmBriefSchema>

export const FIRM_BRIEF_SYSTEM_PROMPT = `
You write a relationship health brief for a sales or accounts manager viewing a
firm's profile in a B2B manufacturing SaaS. You will be given a JSON summary of
everything the system knows about this firm today.

Produce:
1. health: "healthy" | "needs_attention" | "critical"
2. headline: one specific sentence (≤16 words)
3. bullets: up to 5 bullets, most urgent first (each ≤16 words)

Classification guide:
- critical   → any invoice overdue >45 days OR outstanding >₹5,00,000 OR 3+ concurrent open issues
- needs_attention → sent quote with no reply >7d, OR active project stale >14d,
                    OR invoice overdue ≤45d, OR lead not moved >3d
- healthy    → none of the above; if last_touched_at is within 3 days say so

Style:
- Concrete, not vague. "Invoice #47 overdue ₹3.2L, 42 days" beats "payment overdue".
- Quote amounts in Indian ₹ format (e.g. ₹3,20,000 or ₹32L for large amounts).
- Reference invoice numbers, quote numbers, project names when present.
- If no issues exist, say so plainly in the headline and leave bullets empty.
- Do NOT invent data. If a field is empty / null, ignore it.
- Do NOT give generic CRM advice. Surface facts; the manager does the deciding.
`.trim()

export const FIRM_BRIEF_USER_PROMPT = `
Below is everything our system knows about this firm right now.
Produce the relationship health brief.
`.trim()
