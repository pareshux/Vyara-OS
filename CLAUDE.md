# Vyara OS — Project Memory

Vyara OS is **vertical SaaS for made-to-order building-materials manufacturers** (pavers, kerbs, tiles, precast, RCC products, cement bricks, marble cut-to-size). Target: **Tier 1 (₹100cr+) and Tier 2 (₹20–100cr)** manufacturers. **Vyara Tiles Limited is the launch customer (customer #1)** — not the only customer. **The product is not** a horizontal manufacturing OS, not a CRM, not a full ERP. It is the **Manufacturing Business OS** — one system to run the **commercial and operational** side (sales → specification → samples → quotes → orders → operational inventory → dispatch → collections → service), with accounting/production integrated, not rebuilt.

**Year-1 success metric:** Vyara is delighted AND we can onboard a similar Tier-1 or Tier-2 manufacturer in **under 8 weeks**. The second clause is the only thing that proves the platform thesis.

**Slice 1 + Slice 2 are complete** (architect-specified commercial motion, order → dispatch → invoice → collection). Slice 2.5 (operational inventory) and Slice 3 (Dealer → portal → orders) are next candidates. Three other commercial motions — tenders, direct-contractor scheduling, dealer/distributor — are partially or not yet built; see vision blueprint.

## Read these first — they govern everything

- @docs/CONSTITUTION.md (v2) — vertical positioning, product principles (immutable), technical assumptions (revisable). On any conflict, the Constitution wins.
- @docs/vyara-vision-blueprint-v3.md — the destination: capability catalog, four commercial motions, Tier 1+2 depth modes, scope boundary. **Always read alongside the Constitution.**
- @docs/design.md — UX/UI law (shadcn/ui, design tokens, device tiers). Set the design tokens as the theme **before** building any screen.
- @docs/vyara-slice1-build-spec.md — Slice 1 spec. Status: complete.
- @docs/vyara-slice2-build-spec.md — Slice 2 spec. Status: complete.
- **Superseded / archive (do not read as authoritative):** `docs/vyara-industry-os-blueprint-v2.archived.md` (kept for history; replaced by v3).

## How we work

- Build one slice at a time. If a capability isn't in the current slice spec, it is out of scope — note it and move on. The vision is the destination, not a build authorization.
- Work the build steps **in order, one at a time**. After each step: make sure the app runs, commit, then continue. Don't jump ahead.
- Pause only for **genuinely blocking** decisions — at most **3 blocking decisions + 5 recommendations** per step, then proceed with a clearly stated assumption.
- Don't over-design unknowns. Assume the architecture is ~80% right and build; let the rest emerge.
- **Platform discipline test:** for every new abstraction or schema decision, ask "does this work for customer #2 in the vertical, or am I encoding a Vyara quirk?" Vyara-specific things are configured per tenant, never hardcoded.

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

**Slices 1 + 2 + 2.5 + 3 + 3.5 complete.** Slice 3.5 (Masters & Configuration) shipped six tenant-configurable masters that were previously hardcoded or missing: `tax_rate`, `payment_term`, `price_list` + `price_list_entry` (with `get_active_price()` resolution: segment+region > segment > region > tenant-default), `vendor`, `dealer_tier` (with `color`/`bg_color` replacing the hardcoded TIER_STYLES map), and hierarchical `territory`. Each has an `/admin/*` CRUD page gated to admin|manager. Wiring: quote + manual-order forms auto-fill unit_price from `get_active_price()` with "From DEFAULT_2026 · ₹450" microcopy + a "vs list +5%" delta when overridden; the new-invoice form auto-fills `gst_pct` from the tenant default tax, auto-fills `payment_terms_days` from `firm.default_payment_term_id` (falling back to tenant default), auto-derives `due_date`, and shows an amber "manual" tag on override. Snapshot FKs throughout (`quotation_line.price_list_entry_id`, `sales_order_line.price_list_entry_id`, `invoice.tax_rate_id`, `invoice.payment_term_id`) — informational, ON DELETE SET NULL, set only when saved values still match the master so manual overrides read as "manual" not stale attribution.

Admin surfaces (admin|manager only — "Settings" sidebar entry): `/admin` · `/admin/taxes` · `/admin/payment-terms` · `/admin/price-lists` · `/admin/price-lists/[id]` · `/admin/vendors` · `/admin/dealer-tiers` · `/admin/territories`.

Next: **Platform-readiness sprint** — tenant onboarding UI, module visibility flags (Principle #11), configurable seed packs, code-prefix config, subdomain routing, runbooks. CSV importers parallel/optional. Then the first real **customer-#2 onboarding attempt** — that test is what proves the platform thesis. Slice 4 (Tenders / Complaints / etc.) follows, driven by whatever the second customer needs.

The **customer-#2 onboarding test has not yet been attempted.** Currently estimated at **~2 months** (down from 3–4 post Slice 3 — Slice 3.5 closed most of the master-data debt). 8 weeks becomes honest if the readiness sprint ships and customer #2 accepts entering masters one-by-one via UI instead of bulk CSV. See `docs/customer-2-readiness-audit.md` for the full breakdown.

## Slice 1 schema drift — RESOLVED

The three Slice 1 column-drift bugs (`notification.recipient_id`→`user_id`, `quotation.number`→`quotation_number`/`total_amount`→`total`, `sample_request.qty`→`quantity` + invalid status/activity enums) were all fixed in the post-Slice-2.5 gap-fix sprint. All Slice 1 actions now write/read the correct live-schema columns. Trigger-driven activity inserts replaced the manual duplicate inserts.
