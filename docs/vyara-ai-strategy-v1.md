# Vyara OS — AI Strategy v1

> Companion to `CONSTITUTION.md` and `vyara-vision-blueprint-v3.md`. **Strategy, not authorization.** This document maps *where* AI fits in Vyara OS and *in what order* it should ship. It does not authorize implementation — each capability is a discrete build whose green-light is a separate decision.

---

## The frame

Vyara's users work where the OS isn't: a warehouse register, a dispatcher's diary, a printed invoice, a WhatsApp voice note, an architect's PDF. **AI's job in Vyara is to bridge paper / voice / image (where work happens) and the database (where the OS lives) — not to make decisions.**

Per **Constitution Principle #6** ("AI assists; humans decide"), every AI surface in Vyara MUST:

- Render as an editable **suggestion card** (`design.md` §9) with Accept · Edit · Reject.
- Have a **non-AI fallback** (the manual form path that already exists).
- Never act autonomously on money, customer-facing messages, or stage transitions.
- Log every Accept / Edit / Reject to the `ai_action_log` event (already defined in `lib/inngest/events.ts`) so we can measure accuracy.

## Three archetypes — every AI surface fits one

| Archetype | What it does | Vyara examples |
|---|---|---|
| **Extract** | Photo / voice / PDF → structured Zod-typed fields → suggestion card | Dispatch diary → dispatches, paper invoice → invoice, voice note → quote |
| **Suggest** | Computed proposal a human accepts/edits | Price recommendation, next-action recommendation, escalation suggestion |
| **Summarize** | Many rows → one sentence / paragraph | Project status header, board MIS narrative, daily digest |

## Use-case map — ranked by demo impact × business value

| # | Module | Capability | Archetype | Why it lands |
|---|---|---|---|---|
| 1 | **Dispatch** | Photo of dispatch diary → `dispatch` + `dispatch_line[]` records | Extract | Highest "this is magic" reaction. Closes the gap between warehouse reality and schema. Failure is recoverable (wrong dispatch row). |
| 2 | **Invoices** | Photo / PDF of invoice → `invoice` + lines + retention + GST | Extract | Real time saved for accounts team. Leverages existing CSV-import path as fallback. |
| 3 | **Quotations** | Voice note → quote draft with matched SKUs | Extract | Field engineer never types a quote. Compounds with existing BOQ importer. |
| 4 | **Samples** | Voice "Mr Patel approved Antique finish" → `outcome_positive` + outcome_notes | Extract | Closes the "no outcome recorded" gap that the `staleSampleCheck` cron was built to surface. |
| 5 | **Collections** | WhatsApp reply paste → PTP draft on the right invoice | Extract | Accounts team currently reads WhatsApp manually and types into PTP dialog. |
| 6 | **Specifications** | Photo of architect's drawing / BOQ page → spec + linked contact | Extract | Highest *strategic* leverage — this is what Vyara's whole business runs on (architect-specified). |
| 7 | **Projects (status)** | Latest 10 activities → one-paragraph project summary | Summarize | Renders on project header + Mehul's daily dashboard. |
| 8 | **Pricing** | Product + project segment → suggested unit price with confidence | Suggest | Helps inside sales not undersell when contractors push back. |
| 9 | **Reporting / Board MIS** | "Why is DSO worse this month?" → narrative + chart | Summarize | IPO-readiness story. Periwal / independent-director surface. |
| 10 | **Complaints** | Photo of defective paver → root-cause class + batch lookup | Extract+Suggest | Closes quality loop; later-slice but huge for the "Manufacturing Business OS" claim. |
| 11 | **Inventory** | Photo of stock-count sheet → `stock_adjustment` proposals | Extract | Replaces a CSV path nobody uses. |

**Explicitly NOT AI-ified** (yet): order auto-creation, payment posting, stage advancement, contract reading. Money / state changes need a human.

## Sequencing — phases, not a flat backlog

### Phase 0 — Platform plumbing (week 1, one-time)

Ships before any capability so phases 1+ stop being one-offs:

- `lib/ai/client.ts` — thin wrapper around `@anthropic-ai/sdk` (NOT a generic provider abstraction). One model: Claude Sonnet 4.6 for vision/extraction, Claude Opus 4.7 only when explicitly opted in. Structured outputs via JSON mode + Zod parse.
- `lib/ai/extract.ts` — generic `extract<T>(image | audio | pdf, schema, prompt)` helper that returns `{ data: T, confidence: Record<keyof T, number>, raw: string }`.
- `ai_extraction` table — append-only log of every extraction attempt (input ref, model, raw output, parsed output, user decision: accepted/edited/rejected, time). Drives the `ai.action_logged` event that's already in the event catalog.
- Supabase Storage bucket `ai-uploads` — raw photos/audio, signed URLs, 90-day TTL.
- A reusable `<AISuggestionCard />` shadcn component (border accent, sparkle glyph, Accept/Edit/Reject row).

### Phase 1 — Demo proof (weeks 2–3)

Two extractions that prove the platform pattern + give the demo a "wow":

1. **Dispatch diary → records** (`/warehouse` → "Photo entry" button). Tablet camera, photo, extract → list of suggestion cards → each Accept reuses the existing `scheduleDispatch` server action with the over-dispatch guard you already shipped.
2. **Invoice photo → invoice** (`/invoices/new` → "Capture invoice" button). Photo or PDF upload, extract → pre-fills the existing `NewInvoiceForm`, user reviews, submits via `createInvoiceManual`.

**Goalpost**: both paths work end-to-end on Vyara's real diaries / invoices, with at least 70% accept rate (raw extraction, no edits) on a 20-sample test set per surface. If we don't hit it, fix the prompt before fanning out.

### Phase 2 — Field-mobile (weeks 4–5)

3. **Voice → quote**: PWA mic button on `/projects/[id]` → Sarvam STT (already in stack) → Claude maps to catalog SKUs → opens the existing Create Quote sheet pre-filled.
4. **Voice → sample outcome**: same Sarvam → Claude flow, on the samples tab; pre-fills the outcome dialog we just added.

### Phase 3 — Back office (weeks 6–7)

5. **WhatsApp reply → PTP**: paste into a textarea in the collections row actions, AI extracts `{ amount, promise_date, contact_name }`, opens the existing PTP dialog pre-filled.
6. **Daily digest for Mehul**: Inngest cron at 06:00 IST summarizes yesterday's activity for each manager-role user → notification with a one-paragraph headline and 3 action links.

### Phase 4 — Depth (post customer-#2)

7. **MIS narrative on `/finance`**: "Why is DSO worse this month?" → narrative + comparative chart.
8. **Specification extraction from architect PDFs**.
9. **Project status auto-summary on the header** (the project-progress read-model gains a `narrative` field).
10. **Complaint root-cause classification**.

## Cost model (back-of-envelope, Vyara scale)

Voice surfaces are a **two-step pipeline**: Sarvam transcribes audio → text (Claude can't do this — its vision handles images/PDFs only, not audio), then Claude maps that text to structured fields. The table below splits the two so the math is honest.

**Pricing reference**: Claude Sonnet 4.6 = $3 / M input tokens, $15 / M output tokens. Sarvam Saaras STT ≈ $0.006 / minute of audio.

| Surface | Step | Provider | Per-call cost | Volume / mo | $ / mo |
|---|---|---|---|---|---|
| Dispatch diary (1 photo) | image → structured | Claude vision | $0.012 (2k in, 400 out) | 1,500 | **$18** |
| Invoice photo / PDF | image → structured | Claude vision | $0.011 (1.8k in, 350 out) | 300 | **$3** |
| Voice → quote | (1) audio → text | Sarvam STT | $0.003 (~30s audio) | 400 | **$1.20** |
| | (2) text → structured | Claude | $0.005 (600 in, 250 out) | 400 | **$2** |
| Voice → sample outcome | (1) audio → text | Sarvam STT | $0.002 (~20s audio) | 300 | **$0.60** |
| | (2) text → structured | Claude | $0.002 (300 in, 80 out) | 300 | **$0.60** |
| WhatsApp → PTP | text → structured | Claude | $0.002 (250 in, 100 out) | 150 | **$0.30** |
| Daily digest | activity → narrative | Claude | $0.015 (3k in, 400 out) | 30 × 5 mgrs | **$2** |
| Supabase Storage | raw uploads (~3 GB) | Supabase | $0.07 / GB-month | — | **$0.20** |
| **All-in monthly** | | | | | **~$28** |

Customer-#2-ready scaling: 10× this volume is still ~$280 / month — a non-issue.

**What if Claude eventually accepts audio directly?** Anthropic hasn't shipped audio input as of 2026-02; if/when they do, the voice rows collapse to one Claude line each and Sarvam falls out of the stack. The wrapper in `lib/ai/extract.ts` should be shaped so swapping that is a one-file change, not a rewrite. Until then, two providers for voice, one for everything else.

## Tech approach (the boring bits)

- **Single model, single SDK** — `@anthropic-ai/sdk`, `claude-sonnet-4-6` for everything except hard reasoning (then `claude-opus-4-7`). **Not** a multi-provider abstraction; if the day ever comes to add Gemini/OpenAI, fork the wrapper.
- **Voice**: keep Sarvam (Indian-language STT, already in the stack). Sarvam → text → Claude for structuring.
- **Vision**: Claude vision direct on Supabase signed URLs. No OCR step (Claude handles handwritten Devanagari and English reliably; if it doesn't, *then* add a Tesseract pre-pass).
- **Structured outputs**: Zod schema → JSON-mode prompt → `zod.safeParse`. Reject low-confidence fields, don't pre-fill them.
- **Confidence**: ask the model to return a `confidence` map per field; render amber for `<0.7`.
- **Telemetry**: every Accept/Edit/Reject logs to `ai_extraction` + emits `ai.action_logged`. **Day-one analytics dashboard** at `/admin/ai-quality` (Phase 0, not later).
- **Caching**: prompt-cache the system prompt + catalog (for SKU matching). Saves 90% of input cost after the first call.
- **Fallback path**: every surface has a "Skip — fill manually" button that opens the existing form. **No AI surface is the only road.**

## Guardrails (Constitution-aligned)

- **Two-pass UX always**: original photo / audio on the left, structured fields on the right. Never one-tap "trust the AI."
- **Confidence-aware UI**: low-confidence fields render amber with the model's raw text shown.
- **Append-only audit**: `ai_action_log` activity rows on every entity touched (already in the activity.type enum: `'notification'`, `'system'`).
- **No autonomous money / customer actions**: AI never sends WhatsApp without a human Accept, never posts a receipt, never advances a stage.
- **Multi-tenant safety**: AI uploads stored under `<tenant_id>/...`; extractions run with the user's tenant context; never share extractions cross-tenant.
- **Vyara-specific configs stay configurable**: catalog SKU vocabulary for extraction lives in `tenant.settings.ai`, not hardcoded. Customer #2 brings their own.

## What this does NOT do

- It does not build a "Vyara AI assistant" chatbot. Mehul doesn't want to chat with his ERP; he wants quotes typed for him. Chatbots are an anti-pattern here.
- It does not replace the BOQ importer or CSV paths. They stay as the deterministic ground truth.
- It does not introduce an LLM abstraction layer. One provider, one SDK, one wrapper.

## Open questions to resolve before Phase 1

1. **Data labelling**: do we have 20 real dispatch-diary photos and 20 real invoices from Vyara to test against? If not, accuracy claims are vapor.
2. **Prompt ownership**: where do we version prompts? Recommend `lib/ai/prompts/` as plain `.md` files imported as strings, so prompt-tuning is a normal PR review.
3. **Anthropic billing**: which account funds the API key (separate from Vercel)? Set up before Phase 0.
4. **PII / DPDP posture**: Vyara stores customer GSTIN, phone, address. The Anthropic API doesn't train on inputs by default, but we should document that explicitly in the privacy notice before customer #2.
5. **Per-tenant model preference**: do Tier 2 customers want the same model, or a cheaper one? Probably same — cost is negligible — but worth flagging.

## Recommended first build

Ship **Phase 0 + dispatch-diary extraction** as the first AI slice. It validates the platform pattern (extract → suggestion card → existing server action → activity log), gives the demo a memorable moment, and the failure mode (wrong dispatch row, easily corrected) is the safest place to learn what good/bad extraction looks like in this domain.

Everything in this document is reversible. If Phase 1 doesn't hit the 70% accept-rate goalpost on real Vyara data, the answer is to fix the prompt or shrink the schema — not to broaden to more modules.
