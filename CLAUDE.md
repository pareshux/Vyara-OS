# Vyara OS — Project Memory

Vyara OS is a **project-centric Manufacturing Revenue & Project OS** for Vyara Tiles (a Surat paver/landscaping manufacturer), built from scratch. **Slice 1 + Slice 2 are complete**; Slice 3 (Dealer → portal → orders) is the next vertical.

## Read these first — they govern everything

- @docs/CONSTITUTION.md — architecture law (project-centric model, integrate-don't-rebuild, tenant_id everywhere, etc.). On any conflict, the Constitution wins.
- @docs/design.md — UX/UI law (shadcn/ui, design tokens, device tiers). Set the design tokens as the theme **before** building any screen.
- @docs/vyara-slice1-build-spec.md — Slice 1 spec (Lead → Project → Sample → Quote → Task → Timeline → Notification). Status: complete.
- @docs/vyara-slice2-build-spec.md — Slice 2 spec (Order → Dispatch → Invoice → Collection). Status: complete.

## How we work

- Build one slice at a time. If a capability isn't in the current slice spec, it is out of scope — note it and move on.
- Work the build steps **in order, one at a time**. After each step: make sure the app runs, commit, then continue. Don't jump ahead.
- Pause only for **genuinely blocking** decisions — at most **3 blocking decisions + 5 recommendations** per step, then proceed with a clearly stated assumption.
- Don't over-design unknowns. Assume the architecture is ~80% right and build; let the rest emerge.

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

- **Project** is the spine — the central object everything relates to.
- **Specifier** = architect/consultant who specifies our products. **Buyer** = contractor/developer/owner who orders. **Influencer** = site engineer etc.
- Slice 1 hero: **paving-stage follow-up** (won spec → auto-task + notify owner so we don't lose it).
- Slice 2 hero: **collections engine** (automated WhatsApp dunning + ageing buckets + PTP + receipts → working-capital + IPO-readiness story).

## Slice 2 surfaces

`/orders` · `/orders/[id]` · `/dispatches` · `/dispatches/[id]` · `/warehouse` (tablet) · `/invoices` · `/invoices/new` · `/invoices/import` · `/invoices/[id]` · `/collections` · `/finance` · `/finance/tally`.

Inngest jobs: `paving-stage-daily-check`, `order-on-quote-won`, `dispatch-on-order-created`, `collection-on-invoice-synced`, `collection-daily-check` (10:00 IST cron).

## Current step

Slice 2 complete (commits up through `feat(slice2/finance)`). Next: **Slice 3 — Dealer portal** (read `docs/vyara-slice3-build-spec.md` when added).

## Known Slice 1 schema drift (flagged for review)

- `app/(app)/layout.tsx` queries `notification.recipient_id` but the live schema uses `notification.user_id` (the unread-count likely returns 0).
- `lib/actions/quotations.ts` writes to `quotation.number` / `quotation.total_amount`, but the live schema has `quotation.quotation_number` (auto-set by trigger) and `quotation.total`. `app/(app)/projects/[id]/page.tsx` selects the same wrong columns, so the Quotes tab probably shows blank fields.
- All Slice 2 code uses the correct live-schema column names. Fix the Slice 1 drift independently when convenient.
