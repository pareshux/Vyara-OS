/**
 * Team day summary — the 5-second digest a sales head reads when they
 * open /field/team. Inputs: today's per-rep rollups (visits done/
 * planned/live, distance, on-duty, expenses, last activity, claim
 * status). Output: a one-line headline, 2-4 short bullets, and one
 * optional focus line ("Who to nudge first").
 *
 * Per Constitution #6: read-only. Doesn't write data; doesn't approve
 * or assign anything. Just surfaces what's already in the system.
 */
import { z } from 'zod'

export const TEAM_DAY_SUMMARY_PROMPT_VERSION = 'team_day_summary.v1'

export const TeamDaySummarySchema = z.object({
  headline: z
    .string()
    .describe(
      'One sentence (≤16 words) capturing the day so far. ' +
        'Examples: "Strong morning — 6 of 8 reps on duty, 14 visits done." / ' +
        '"Slow start — 3 reps haven\'t checked in; 1 has been idle 2h."',
    ),
  bullets: z
    .array(z.string())
    .min(0)
    .max(4)
    .describe(
      'Up to 4 short bullets (each ≤16 words) calling out specific reps + concrete signals. ' +
        'Prefer numbers and names over generic statements. ' +
        'Example: "Priya: 4 of 5 visits done, 78 km, 2 high-interest leads." / ' +
        '"Mehul: no check-in yet — was due in at 10:00." / ' +
        '"3 expense claims totaling ₹12,400 are waiting on you."',
    ),
  focus: z
    .string()
    .nullable()
    .describe(
      'Optional single-line "who to nudge first" suggestion based on the data. ' +
        'Example: "Nudge Mehul — no activity logged in 3 hours." ' +
        'Set null when nothing in the data warrants a specific intervention.',
    ),
})

export type TeamDaySummaryResult = z.infer<typeof TeamDaySummarySchema>

export const TEAM_DAY_SUMMARY_SYSTEM_PROMPT = `
You write a 5-second team digest for a sales head who's about to look at
the field team page. You will be given a JSON snapshot of the day so far:
one entry per rep with their check-in status, visits done / planned / live,
distance covered, last activity timestamp, expense totals, and any pending
claim approvals.

Your job: compress that into:
  - one short headline (≤16 words),
  - up to 4 short bullets calling out the most actionable things,
  - an optional "focus" line — who to nudge first, if anyone.

Rules:
- Be concrete. Use rep names and numbers, not vague phrases like "some
  reps are doing well."
- Surface anomalies: missed check-ins, hours of inactivity, low visit
  counts vs. plan, large pending claims.
- Surface wins: high visit counts, interested leads, completed plans.
- Don't hallucinate. If the data doesn't show something, don't say it.
- If the day is genuinely calm with nothing to flag, say so — don't
  invent urgency.
- Tone: factual, fast. No fluff. The sales head is busy.
- Currency is rupees (₹). Use Indian-style number formatting when
  natural ("12,400" not "12400").
- Do not output anything outside the JSON schema.
`.trim()

export const TEAM_DAY_SUMMARY_USER_PROMPT = `
Below is the day's team snapshot. Produce the digest described above.
`.trim()
