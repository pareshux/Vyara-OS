# Vyara OS — Project Memory

Vyara OS is a **modular Business Operating System** for manufacturing, contracting, distribution, and service companies — one system to run the **commercial and operational** side (sales → specification / scoping → samples / drawings → quotes → orders → operational inventory → dispatch → installation / commissioning → collections → service → AMC), with accounting and production integrated, not rebuilt. **Building-materials-first launch: Vyara Tiles Limited is customer #1.** Cross-industry by **configuration, not code fork** — the eight supported industries (building materials, electrical contractors, industrial manufacturers, HVAC, engineering, distributors, fabricators, service businesses; see Blueprint §0.4) share one architecture. Target customers per industry: **Tier 1 (₹100cr+) and Tier 2 (₹20–100cr)**. **The product is not** a CRM, not a full ERP, not a tools-and-features grab-bag — it owns the commercial+operational layer and integrates the rest.

**Year-1 success metric:** Vyara Tiles is delighted AND we can onboard a customer in a **different industry** in **under 8 weeks**. **Raj Avinsys Pvt. Ltd.** (electrical EPC + panel manufacturing + AMC, Gujarat) is the first cross-industry target. Two industries on one architecture, ≤8 weeks per onboarding, is the only honest test of *modular Business OS* vs *vertical SaaS in disguise*. (Positioning shifted from "vertical SaaS for building-materials manufacturers" to "modular Business OS, cross-industry by configuration" on 2026-06-22 — Constitution v2 → v3 amendment.)

**Vyara Tiles build is mature.** Slices 1 + 2 + 2.5 + 3 + 3.5 + 4 all in `main`. Sprint 1 Platform foundations all shipped (PLAT-004 through PLAT-011). Owner Dashboard (INT-014) shipped Slices 1+2+3+3.1+4; Slice 5 dropped 2026-06-21 (subsumed by INT-009 conversational agent).

## Read these first — they govern everything

- **@docs/PRODUCT-BLUEPRINT-v3.md — THE SOURCE OF TRUTH.** Eight locked capabilities + Status Tracker (§11) for every planned/in-progress/shipped item. Read this before any non-trivial work.
- @docs/CONSTITUTION.md (v3) — cross-industry positioning, product principles (immutable), technical assumptions (revisable). On any conflict, the Constitution wins on principles; the Blueprint wins on capability partitioning.
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
- **Platform discipline test:** for every new abstraction or schema decision, ask "does this work for an electrical-EPC tenant too, or am I encoding a Vyara-Tiles quirk?" Vyara-specific things are configured per tenant, never hardcoded. (Per Constitution v3, the test customer is no longer a hypothetical second tiles maker — it's Raj Avinsys, an explicitly different industry.)
- **No new top-level modules.** If a need doesn't fit into one of the eight capabilities, the answer is to extend the capability, not create a new one. See Blueprint §0.2.

## Foundational audit — run BEFORE building any feature, page, or module

Before writing code for any new surface, surface findings on these seven questions and let the user weigh in. Don't silently assume; don't build past unanswered foundational questions.

1. **Data inputs** — what entities does this read from? Do they exist + are populated? If a source needs to be built first, name it.
2. **Data outputs** — what gets written? Where?
3. **Master dependencies** — does this assume reference data (vendors, price lists, reason codes, tier names, territory codes, etc.) that should be tenant-configurable? If yes, do we have a master for it? Is it hardcoded or in a `*_master` table?
4. **CRUD completeness** — for every entity touched, is there Create / Read / Update / Delete via UI? If something's missing, is it intentional (snapshots are immutable per Principle #8) or a gap that will bite later?
5. **Action ↔ UI symmetry** — every server action should have a UI calling it; every UI surface should have a corresponding action. Asymmetry is how Slice 1 ended up with quote-creation that no UI invoked and notification-writes to nonexistent columns.
6. **Cross-module coupling** — any write to another module's tables? Any hidden read assumption? Convert to event-driven if possible (Principle #0).
7. **Customer-#2 readiness** — does this hardcode any Vyara-specific enum, label, or value? Per Constitution v3 year-1 success criterion (Raj Avinsys onboarding ≤8 weeks), the answer must be no. The Raj demo tenant is the live regression test for this.

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

**Vyara Tiles build mature.** Slices 1 + 2 + 2.5 + 3 + 3.5 + 4 all in `main` (Lead→Project→Sample→Quote, Order→Dispatch→Invoice→Collection, Dealer + portal, masters + configuration, Field Operations). Sprint 1 Platform foundations all shipped (PLAT-004 through PLAT-011: feature flags, tenant settings, masters, sensitive masking, TS types, observability, code-prefix consumers, tenant provisioning CLI). Owner Dashboard (INT-014) shipped Slices 1+2+3+3.1+4; Slice 5 dropped 2026-06-21 (subsumed by INT-009 conversational agent). See `docs/PRODUCT-BLUEPRINT-v3.md` §11 (Status Tracker) for the per-item ledger.

**Now in: Raj Avinsys cross-industry demo (Constitution v3's first cross-industry test).** Approach: provision `raj-avinsys` as a second tenant via the existing onboarding CLI; seed Raj-shaped masters (16-stage EPC pipeline, electrical activity-type vocabulary, industrial/consultant/OEM relationship types); seed mock data covering EPC + panel manufacturing + AMC motions; build the un-built capabilities Raj's motion requires (CS-001 complaint module, CS-009 AMC contracts, drawing-approval workflow gate, milestone-billing schedule); add a `/demo` landing page with two "Sign in as…" buttons for tenant switching. **Estimated ~3 weeks across slices.**

**The demo doubles as the Customer-#2 onboarding rehearsal** — same code path a real second customer would take. The first time we flip to the Raj tenant, Vyara-isms in copy / AI prompts / seed data will surface; each surfaced item is a Customer-#2 readiness gap fixed before a real customer hits it.

**Sprint 2 queue (post-Raj-demo, locked candidates):** CS-001 (complaint module — also a Raj-demo requirement, gets built now), CS-009 (AMC contracts — same), REV-006 (workflow engine wired or dropped), REL-007 (lead state model), FIN-005 (approval engine consumer wiring). INT-009 (conversational agent) is now positioned as the ONLY drill-down path on /owner since Slice 5 dropped.

## Slice 1 schema drift — RESOLVED

The three Slice 1 column-drift bugs (`notification.recipient_id`→`user_id`, `quotation.number`→`quotation_number`/`total_amount`→`total`, `sample_request.qty`→`quantity` + invalid status/activity enums) were all fixed in the post-Slice-2.5 gap-fix sprint. All Slice 1 actions now write/read the correct live-schema columns. Trigger-driven activity inserts replaced the manual duplicate inserts.
