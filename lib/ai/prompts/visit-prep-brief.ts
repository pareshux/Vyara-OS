/**
 * Visit prep brief — the 2-second context AI gives a rep as they
 * arrive at a visit. Inputs: the subject's recent activity timeline,
 * open tasks, status / stage. Output: one headline + 2–3 bullets +
 * an optional caution.
 *
 * Per Constitution #6: AI assists, humans decide. The brief never
 * changes any data — it just surfaces what's already in the system
 * in a glance-able shape.
 */
import { z } from 'zod'

export const VISIT_PREP_BRIEF_PROMPT_VERSION = 'visit_prep_brief.v1'

export const VisitPrepBriefSchema = z.object({
  headline: z
    .string()
    .describe(
      'One short sentence (≤14 words) capturing the most important thing to know walking in. ' +
        'Examples: "Won the spec but pending paving-stage follow-up since 2 weeks." / ' +
        '"Sent ₹4.2L quote; no response in 9 days." / ' +
        'If there is genuinely no signal say "No prior context — fresh conversation."',
    ),
  bullets: z
    .array(z.string())
    .min(0)
    .max(4)
    .describe(
      'Up to 4 short bullets (each ≤14 words). Order by recency / importance. ' +
        'Include facts the rep can act on: last contact date, open quote / amount, last stated objection, ' +
        'next promised step. Skip filler.',
    ),
  caution: z
    .string()
    .nullable()
    .describe(
      'Optional one-line caution if there is a real risk to flag — e.g. "Last visit closed with ' +
        'disappointment about late delivery." Set null if there is nothing to flag.',
    ),
})

export type VisitPrepBriefResult = z.infer<typeof VisitPrepBriefSchema>

export const VISIT_PREP_BRIEF_SYSTEM_PROMPT = `
You write a 2-second pre-visit brief for a field sales rep about to walk
into a customer meeting. The rep skims it on their phone right before
they enter. You will be given a JSON summary of everything our system
knows about the subject (project / lead / firm / dealer): subject info,
last activities, open tasks, open quotes, last visits, current stage.

Your job is to compress that into:
  - one short headline (≤14 words),
  - up to 4 short bullets (each ≤14 words),
  - an optional caution if there's a real risk to flag.

Guidelines:
- Be concrete. "Quote ₹4.2L sent 9 days ago, no response" beats "follow-up pending."
- Surface facts, not generic advice. Don't say "build rapport" or "ask for the order."
- Reference numbers and dates the rep can quote back to the customer.
- If a stage is stuck (no activity in 14+ days), say so.
- If there's an open promise / next step recorded, include it.
- Tone: matter-of-fact, no fluff. The rep does the persuading.
- Empty-context case: if there is nothing prior, say so plainly — do not invent context.
- Do not output anything outside the JSON schema.
`.trim()

export const VISIT_PREP_BRIEF_USER_PROMPT = `
Below is everything our CRM knows about this visit's subject right now.
Produce the brief described above.
`.trim()
