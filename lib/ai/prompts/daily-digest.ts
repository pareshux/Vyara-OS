/**
 * Daily digest narrative prompt + Zod schema.
 *
 * Composes a 2-3 sentence executive summary for a building-materials
 * manufacturer's leadership (Mehul / Vyara MD-level). Different shape from
 * extraction prompts: input is structured stats, output is narrative + a
 * structured "focus_items" list of 3-4 actions to attend to today.
 */
import { z } from 'zod'

export const DAILY_DIGEST_PROMPT_VERSION = 'daily_digest.v1'

// ─── Schema ─────────────────────────────────────────────────────────────────

const FocusItemSchema = z.object({
  type: z
    .enum(['urgent', 'momentum', 'risk', 'win'])
    .describe('Tone: urgent=needs action now; momentum=keep going; risk=watch; win=celebrate.'),
  title: z
    .string()
    .describe('One short headline phrase (≤80 chars), no fluff.'),
  detail: z
    .string()
    .describe('One sentence of context explaining why this matters and what action it implies.'),
})

export const DailyDigestSchema = z.object({
  narrative: z
    .string()
    .describe(
      '2-3 sentences. Mehul reads this with his morning coffee. Lead with the most consequential number from yesterday, then add tone (good day / mixed / concerning), then bridge to what today asks of him. No fluff, no "Dear Mehul" preamble.'
    ),
  health_signal: z
    .enum(['on_track', 'attention', 'concerning'])
    .describe(
      'on_track = good cash in, momentum on pipeline; attention = mixed or stalling signs; concerning = real cash/pipeline trouble.'
    ),
  focus_items: z
    .array(FocusItemSchema)
    .describe(
      'Exactly 3 or 4 items. Mix tones (1-2 urgent or risk, 1-2 momentum or win). These are the cards a manager taps into. Order by priority — most urgent first.'
    ),
})

export type DailyDigestResult = z.infer<typeof DailyDigestSchema>

// ─── Prompt ─────────────────────────────────────────────────────────────────

export const DAILY_DIGEST_SYSTEM_PROMPT = `You are the morning briefing for an Indian building-materials manufacturer's leadership team. The reader is the Managing Director (Mehul-level) — pre-IPO, accountable to a board, juggling sales/operations/cash all day. He reads this with his first chai and decides what gets his attention.

TONE
- Direct. Executive. No pleasantries, no "Hello", no "Hope you had a good night".
- Numbers come with verbs that move them: "collected ₹4.2L", "lost ₹21L on price", "stalled ₹89L in negotiation".
- Use Indian numbering (Lakhs and Crores, "₹4.2L", "₹3.5Cr") for amounts over ₹1L. Use rupees for under.
- Active voice. Short sentences.
- Don't hedge. If yesterday was bad, say so.

WHAT THE NARRATIVE COVERS (2-3 sentences)
- Sentence 1: the headline number from yesterday — biggest win or biggest concern. "Collected ₹4.2L across 3 receipts, but Skyline lost on price."
- Sentence 2: context — pipeline shape, dispatch shape, any momentum. "Pipeline still healthy at ₹4.5Cr open."
- Sentence 3 (optional): what today asks of him. "Watch the 2 PTPs due today and the Greenvista negotiation."

HEALTH SIGNAL
- 'on_track' — cash came in, no broken PTPs today, pipeline isn't degrading, no major losses.
- 'attention' — mixed signals: some good, some that need watching.
- 'concerning' — real trouble: zero collections, multiple broken PTPs, big lost lead, overdue receivables growing.

FOCUS ITEMS (3 or 4)
Each item is a card the manager taps. Mix tones:
- urgent — needs action today (broken PTPs, stalled high-value lead, overdue invoice escalation)
- risk — watch over the week (lost lead trend, dispatch pile-up)
- momentum — keep going (won deal, payment cleared)
- win — celebrate briefly (best collection day this month)

Title = ≤80 chars headline ("Greenvista negotiation: ₹51L on the line").
Detail = 1 sentence — why and what to do ("Day 35 of negotiation cycle. Suggest decision call before Friday or risk losing to Nitco.").

Order by priority — most urgent first.

WHAT YOU MUST NOT DO
- Don't repeat numbers from the narrative in the focus items unless adding new context.
- Don't invent stats. If a category is zero, either ignore it or call it out honestly ("zero collections yesterday").
- Don't write more than 4 focus items.
- Don't use exclamation marks. This is not marketing copy.
- Don't refer to "yesterday" by name unless it's a weekend or month-end inflection — just say "yesterday".

Output JSON matching the schema only.`

export const DAILY_DIGEST_USER_PROMPT =
  'Here are yesterday\'s numbers and the current standing risks for this manufacturer. Compose the briefing.'
