# Vyara OS — Project Memory

Vyara OS is **vertical SaaS for made-to-order building-materials manufacturers** (pavers, kerbs, tiles, precast, RCC products, cement bricks, marble cut-to-size). Target: **Tier 1 (₹100cr+) and Tier 2 (₹20–100cr)** manufacturers. **Vyara Tiles Limited is the launch customer (customer #1)** — not the only customer. **The product is not** a horizontal manufacturing OS, not a CRM, not a full ERP. It is the **Manufacturing Business OS** — one system to run the **commercial and operational** side (sales → specification → samples → quotes → orders → operational inventory → dispatch → collections → service), with accounting/production integrated, not rebuilt.

**Year-1 success metric:** Vyara is delighted AND we can onboard a similar Tier-1 or Tier-2 manufacturer in **under 8 weeks**. The second clause is the only thing that proves the platform thesis.

**Slice 1 + Slice 2 are complete** (architect-specified commercial motion, order → dispatch → invoice → collection). Slice 2.5 (operational inventory) and Slice 3 (Dealer → portal → orders) are next candidates. Three other commercial motions — tenders, direct-contractor scheduling, dealer/distributor — are partially or not yet built; see vision blueprint.

## Read these first — they govern everything

- **@docs/PRODUCT-BLUEPRINT-v3.md — THE SOURCE OF TRUTH.** Eight locked capabilities + Status Tracker (§11) for every planned/in-progress/shipped item. Read this before any non-trivial work.
- @docs/CONSTITUTION.md (v2) — vertical positioning, product principles (immutable), technical assumptions (revisable). On any conflict, the Constitution wins on principles; the Blueprint wins on capability partitioning.
- @docs/BUILD-LOG.md — chronological record of what shipped, when, against which Blueprint item.
- @docs/design.md — UX/UI law (shadcn/ui, design tokens, device tiers). Set the design tokens as the theme **before** building any screen.
- @docs/vyara-slice1-build-spec.md — Slice 1 spec. Status: complete.
- @docs/vyara-slice2-build-spec.md — Slice 2 spec. Status: complete.
- **Superseded / archive (do not read as authoritative):** `docs/vyara-industry-os-blueprint-v2.archived.md`, `docs/vyara-vision-blueprint-v3.archived.md` (kept for history; replaced by `PRODUCT-BLUEPRINT-v3.md`).

## Blueprint-driven workflow (locked)

This is a hard rule, not a suggestion. Every meaningful change touches the Blueprint.

**Before any non-trivial work:**
1. Find the item ID in the Blueprint Status Tracker (§11), e.g. `PLAT-007`, `FLD-014`.
2. Confirm the priority tier matches the current sprint focus.
3. If no item exists for what you're about to build, **stop and add it first** (status `💭 Considered` or `📋 Planned`) before starting work.
4. Confirm your change belongs to one capability — if it spans more, name the primary.

**During the work:**
- Update the Status Tracker row to `🚧 In Progress` when you start.
- In the commit message, include `Tracks: <ID>` for every Blueprint item the change affects.
- New migration files start with a capability tag comment.

**On commit:**
- Flip the Status Tracker row to `✅ Shipped` (or appropriate status).
- Add the short commit SHA to the row.
- Update the "Last updated" line at the top of the Blueprint.
- Append a one-line entry to `BUILD-LOG.md` under today's date, following the format shown there.

**When the conversation surfaces a new idea:**
- Don't start building. Run it through the Blueprint:
  - Which of the 8 capabilities owns it? (If none, the answer is "no module.")
  - Which priority tier? (Be honest — most new ideas are Nice-have or Future.)
  - Add the row to §11 with status `💭`.
- Only `📋` items get worked on. The lift from `💭` to `📋` is a deliberate decision, not a default.

**The eight capabilities are locked** (Relationship, Revenue, Delivery, Field Operations, Customer Success, Finance, Intelligence, Platform). A new top-level capability requires evidence from three customers, not one feature request. See Blueprint §0.2 and §5.

## How we work

- **Follow the Blueprint Status Tracker**, not free-form module thinking. Items in tier "Must-have C#2" come before "Should-have"; "Future" items wait. Pick the next `📋` item; update it to `🚧`; ship it; flip to `✅`.
- Work tasks **one at a time**. After each: make sure the app runs, commit, update the Blueprint + Build Log, then continue.
- Pause only for **genuinely blocking** decisions — at most **3 blocking decisions + 5 recommendations** per task, then proceed with a clearly stated assumption.
- Don't over-design unknowns. Assume the architecture is ~80% right and build; let the rest emerge.
- **Platform discipline test:** for every new abstraction or schema decision, ask "does this work for customer #2 in the vertical, or am I encoding a Vyara quirk?" Vyara-specific things are configured per tenant, never hardcoded.
- **No new top-level modules.** If a need doesn't fit into one of the eight capabilities, the answer is to extend the capability, not create a new one. See Blueprint §0.2.

## Foundational audit — run BEFORE building any feature, page, or module

Before writing code for any new surface, surface findings on these seven questions and let the user weigh in. Don't silently assume; don't build past unanswered foundational questions.

1. **Data inputs** — what entities does this read from? Do they exist + are populated? If a source needs to be built first, name it.
2. **Data outputs** — what gets written? Where?
3. **Master dependencies** — does this assume reference data (vendors, price lists, reason codes, tier names, territory codes, etc.) that should be tenant-configurable? If yes, do we have a master for it? Is it hardcoded or in a `*_master` table?
4. **CRUD completeness** — for every entity touched, is there Create / Read / Update / Delete via UI? If something's missing, is it intentional (snapshots are immutable per Principle #8) or a gap that will bite later?
5. **Action ↔ UI symmetry** — every server action should have a UI calling it; every UI surface should have a corresponding action. Asymmetry is how Slice 1 ended up with quote-creation that no UI invoked and notification-writes to nonexistent columns.
6. **Cross-module coupling** — any write to another module's tables? Any hidden read assumption? Convert to event-driven if possible (Principle #0).
7. **Customer-#2 readiness** — does this hardcode any Vyara-specific enum, label, or value? Per Constitution v2 year-1 success criterion, the answer must be no.

Format the findings as a short list ("here's what this depends on / here's what's missing / here's what I'd build vs defer"), let the user decide what's in/out, then build. This is the discipline that prevents the "wait, did we forget X?" loop.

## Invariants (from the Constitution — repeated here because they're easy to violate)

- `tenant_id` on every table; Supabase RLS by tenant + territory/role.
- Margin, cost, and discount are **masked from `sales_engineer`** role.
- Tabular figures on all numbers; design every state (empty / loading / error / success).
- Pipeline stages are **data-driven**, never hardcoded.
- Everything generates tasks; every change writes to the timeline and the append-only audit log.
- Modular monolith: each module **owns its tables** (prefixes `order_/dispatch_/invoice_/collection_`); cross-module **writes** are forbidden, communication is via Inngest events.

## Stack

Next.js (App Router) · Supabase (Mumbai region — Postgres, Auth, RLS, Storage) · Tailwind + shadcn/ui · lucide-react · react-hook-form + zod · TanStack Table · Inngest (events + scheduled checks) · AiSensy (WhatsApp dunning) · Vercel. Responsive PWA for the field-mobile layout.

## Terminology

- **Business Object** is the platform spine — every domain entity (Lead, Project, Order, Inventory Item, Dealer, …) inherits the common spine (timeline, tasks, documents, comments, activities, notifications, AI, audit). **Project is a module, not the spine** (this changed in v2 — earlier docs may say otherwise).
- **Specifier** = architect/consultant who specifies our products. **Buyer** = contractor/developer/owner who orders. **Influencer** = site engineer etc.
- **Four commercial motions** the platform serves: (1) architect-specified projects, (2) government tenders, (3) direct contractor/developer, (4) dealers/distributors. Slices 1+2 cover motion 1 end-to-end. Motions 2/3/4 are partial or pending.
- Slice 1 hero: **paving-stage follow-up** (won spec → auto-task + notify owner so we don't lose it).
- Slice 2 hero: **collections engine** (automated WhatsApp dunning + ageing buckets + PTP + receipts → working-capital + IPO-readiness story).

## Slice 2 surfaces

`/orders` · `/orders/[id]` · `/dispatches` · `/dispatches/[id]` · `/warehouse` (tablet) · `/invoices` · `/invoices/new` · `/invoices/import` · `/invoices/[id]` · `/collections` · `/finance` · `/finance/tally`.

Inngest jobs: `paving-stage-daily-check`, `order-on-quote-won`, `dispatch-on-order-created`, `collection-on-invoice-synced`, `collection-daily-check` (10:00 IST cron).

## Current step

**Slices 1 + 2 + 2.5 + 3 + 3.5 + 4 complete.** Slice 4 (Field Operations — formerly "Field Sales") shipped check-in/out, planned visits with per-leg km, voice + photo AI, manager team view, and claim approval. Steps 1–6 + UX patches all in `main`.

**Now in Sprint 1 — Platform foundations for Customer #2.** See `docs/PRODUCT-BLUEPRINT-v3.md` §11 (Status Tracker) for the per-item ledger. Sprint 1 deliverables in priority order:

- ✅ PLAT-004 — Feature flags (`203239d`)
- ✅ PLAT-005 — Tenant config schema + code renderer (`56c8dde`)
- ✅ PLAT-006 — task_type / activity_type masters (`d2c9115`)
- 🚧 PLAT-007 — Sensitive-column mask helper (in progress)
- 📋 PLAT-008 — TS types from DB
- 📋 PLAT-009 — Sentry observability
- 📋 PLAT-010 — Code-prefix configuration consumers (replace per-table triggers)
- 📋 PLAT-011 — Tenant lifecycle + subdomain routing

After Sprint 1 closes, **Customer #2 onboarding** is the gate. Sprint 2 begins post-Customer-#2 with the queue under "Must-have post-C#2" in §11.

The **customer-#2 onboarding test has not yet been attempted.** Currently estimated at **~2 months** post Sprint 1. The Platform foundations above are what makes 8 weeks honest.

## Slice 1 schema drift — RESOLVED

The three Slice 1 column-drift bugs (`notification.recipient_id`→`user_id`, `quotation.number`→`quotation_number`/`total_amount`→`total`, `sample_request.qty`→`quantity` + invalid status/activity enums) were all fixed in the post-Slice-2.5 gap-fix sprint. All Slice 1 actions now write/read the correct live-schema columns. Trigger-driven activity inserts replaced the manual duplicate inserts.
