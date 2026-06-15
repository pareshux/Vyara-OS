# Vyara OS — Slice 2 Build Spec (for Claude Code)

> **Read first, every session:** `CONSTITUTION.md`, `design.md`, and `docs/vyara-slice1-build-spec.md` (for context on what already exists). This spec adds the second vertical slice **on top of the platform Slice 1 established**.
>
> **Operating mode (same as Slice 1):** Work the build steps **in order, one at a time**; after each, ensure the app runs and commit. Pause only for **genuinely blocking** decisions — max **3 blocking + 5 recommendations** per step, then proceed with a stated assumption. Build **Slice 2 only** — if it's not in scope here, it's out.

---

## The slice

**Order → Dispatch → Invoice → Collection** — closing the loop from a won quote to cash, on desktop (office), tablet (warehouse), and mobile (field).

**The capability that must feel valuable:** the **collections engine** — systematic, automated payment follow-up that moves Vyara to the front of the contractor's payment queue and produces clean, on-demand receivables ageing. This is the working-capital win *and* the IPO-readiness story (the numbers Periwal will ask for).

**Pilot-grade, not production-hardened** — real enough for the accounts team and a few engineers to use on live orders.

---

## Architecture: this is where the platform proves itself

Per the capability-platform direction (Constitution Principle #0), build **Order, Dispatch, Invoice, and Collection as four independent modules**, each:

- **Owning its own tables** (prefixes `order_`, `dispatch_`, `invoice_`, `collection_`). **No cross-module writes.**
- **Inheriting the common spine** every Business Object gets: timeline, tasks, comments, documents, activities, notifications, audit. Don't re-implement these — reuse the platform capabilities from Slice 1.
- **Communicating only through events** — loose coupling, never hard dependency:
  - `quote.won` → the Order module *may* create an order (a quote can also be skipped — direct orders allowed).
  - `order.confirmed` → Dispatch *may* schedule a delivery.
  - `dispatch.delivered` / manual → Invoice *may* be raised (invoices can also exist without an order — direct billing).
  - `invoice.overdue` → Collection fires dunning.
  - `payment.received` → close-out + timeline + notification.

> **Consistency note:** Slice 2 assumes Slice 1's objects (Project, Contact, Quote…) were built on the generic Business-Object + common-spine pattern. If Slice 1 was built strictly project-centric, do a light refactor to the shared spine **before** adding these modules — it's cheap now, expensive later.

---

## In scope

- **Order module:** create from a won quote (via event) or directly; order list + detail; line items (snapshot from quote); status (Confirmed → In production → Ready → Dispatched → Delivered → Closed) via the data-driven stage model.
- **Dispatch module:** schedule delivery, assign transporter, track status, capture **POD** (proof of delivery — photo/signature). Warehouse **tablet** view: today's dispatches, scan-friendly, mark ready/dispatched/delivered.
- **Invoice module:** invoice entity linked to order/project/customer; **ingestion = manual/CSV first** (de-risks the pilot), **Tally two-way sync as the target** with reconciliation/drift logging; ageing computation; **retention money & running-bill** tracking (construction reality — partial billing across a project).
- **Collection module:** ageing dashboard (buckets: current / 1–30 / 31–60 / 60+), **automated WhatsApp dunning** (AiSensy) — pre-due reminder → overdue → escalation; **promise-to-pay** logging; **receipt recording**; per-customer account view. Inngest scheduled jobs drive the cadence.
- **Common spine usage:** auto-generated tasks ("schedule dispatch", "follow up payment"), timeline entries on every state change, notifications.
- **Finance dashboard / MIS:** DSO, total outstanding, ageing by bucket, collections performance — the investor/board-grade view.
- Tabular figures on all money; design every state; **margin/cost visible to managers & accounts, masked from `sales_engineer`**.

## Out of scope (do NOT build this slice)

Dealers / dealer portal (Slice 3) · tenders · complaints/service · document OCR/intelligence · full pricing engine · form builder · multi-tenant control plane · additional verticals · **production-system build** (read-only "ready date" only, if needed) · **online payment collection via Razorpay** (fast-follow — record receipts manually this slice) · **AI-voice collection escalation** (fast-follow — WhatsApp dunning is the core; wire Exotel/Plivo + Sarvam only after WhatsApp dunning works).

If it feels needed and isn't here, note it and move on.

---

## Minimal data model notes

- `order` (own tables) ← optionally created from `quote.won` event; `order_line` snapshots price; `order.stage` via data-driven stage model + `order_stage_history`.
- `dispatch` ← linked to order; `transporter` (simple master), delivery status, `pod` (document via Storage).
- `invoice` ← linked to order/project/customer; fields for total, retention %, running-bill sequence; `invoice_status` + ageing derived from due date. Source flag (`manual` / `csv` / `tally`).
- `receipt` / `promise_to_pay` ← linked to invoice; drive the collection state machine.
- `collection_activity` ← dunning attempts (channel, template, outcome) — feeds the timeline.
- Every table: `tenant_id`, audit columns, soft delete; RLS by tenant + role; **no cross-module foreign-key writes — reference via IDs + events.**
- Collection state machine (simple, not the full engine): `due → pre_due_reminder → overdue → dunning → promise_to_pay → (paid | disputed | written_off)`.

---

## Stack additions (on top of Slice 1)

AiSensy (WhatsApp dunning — now first-class) · Inngest scheduled jobs (ageing checks, reminder cadence) · Tally connector (two-way invoice/receipt sync + reconciliation) · Supabase Storage (POD images). Telephony (Exotel/Plivo + Sarvam) only if you reach the AI-voice fast-follow.

---

## Build sequence (six incremental steps)

**Step 1 — Order module.** Listen for `quote.won` → create order (and allow manual order creation). Order list + detail reusing the common spine. Data-driven order stages. *Done when: a won quote produces an order you can open and advance.*

**Step 2 — Dispatch module.** Schedule + transporter + status + POD capture. Warehouse tablet view. Emits `dispatch.delivered`. *Done when: an order can be dispatched and marked delivered with a POD, on a tablet layout.*

**Step 3 — Invoice module.** Invoice entity + manual/CSV ingestion + link to order/project/customer + ageing + retention/running-bill fields. *Done when: invoices exist, age correctly into buckets, and tie to their order/project.*

**Step 4 — Collection module (the hero).** Ageing dashboard + WhatsApp dunning via AiSensy (pre-due → overdue) on an Inngest cadence + promise-to-pay + receipt recording. *Done when: an overdue invoice triggers a WhatsApp reminder, a promise-to-pay is logged, and a receipt closes it out.*

**Step 5 — Tally sync.** Two-way invoice/receipt sync with reconciliation + drift logging. (If Tally access isn't ready, keep manual/CSV and mark this deferred — don't block the slice.) *Done when: invoices/receipts reconcile with Tally, or the manual path is solid.*

**Step 6 — Finance dashboard + polish.** DSO, outstanding, ageing-by-bucket, collections performance for the manager/board view; empty/loading/error states everywhere. Optional: begin AI-voice escalation. *Done when: a manager sees clean receivables MIS and the full order-to-cash loop is demoable.*

---

## Definition of done for Slice 2

A won quote flows to a sales order → gets dispatched with proof of delivery → is invoiced (with retention/running bills handled) → and is **collected through automated WhatsApp follow-up with clean ageing**, all visible on a finance dashboard that produces investor-grade receivables numbers on demand. Order, Dispatch, Invoice, and Collection each plugged in as independent modules without modifying Slice 1 — proving the capability platform works. Then: Slice 3 (Dealer → portal → orders).
