# Vyara OS — Project Memory

Vyara OS is a **project-centric Manufacturing Revenue & Project OS** for Vyara Tiles (a Surat paver/landscaping manufacturer), built from scratch. Right now we are building **Slice 1 only**.

## Read these first — they govern everything

- @docs/CONSTITUTION.md — architecture law (project-centric model, integrate-don't-rebuild, tenant_id everywhere, etc.). On any conflict, the Constitution wins.
- @docs/design.md — UX/UI law (shadcn/ui, design tokens, device tiers). Set the design tokens as the theme **before** building any screen.
- @docs/vyara-slice1-build-spec.md — the current scope and the six build steps. This defines what we build now.

## How we work

- Build **Slice 1 only**. If a capability isn't in the slice spec's scope, it is out of scope — note it and move on. Do **not** scaffold orders, dispatch, invoices, collections, dealers, tenders, document OCR, a pricing engine, or a full workflow engine.
- Work the six build steps **in order, one at a time**. After each step: make sure the app runs, commit, then continue. Don't jump ahead.
- Pause only for **genuinely blocking** decisions — at most **3 blocking decisions + 5 recommendations** per step, then proceed with a clearly stated assumption.
- Don't over-design unknowns. Assume the architecture is ~80% right and build; let the rest emerge.

## Invariants (from the Constitution — repeated here because they're easy to violate)

- `tenant_id` on every table; Supabase RLS by tenant + territory/role.
- Margin, cost, and discount are **masked from `sales_engineer`** role.
- Tabular figures on all numbers; design every state (empty / loading / error / success).
- Pipeline stages are **data-driven**, never hardcoded — but don't build the full guard/SLA engine in this slice.
- Everything generates tasks; every change writes to the timeline and the append-only audit log.

## Stack

Next.js (App Router) · Supabase (Mumbai region — Postgres, Auth, RLS, Storage) · Tailwind + shadcn/ui · lucide-react · react-hook-form + zod · TanStack Table · Inngest (scheduled checks/notifications) · Vercel. Responsive PWA for the field-mobile layout (no React Native this slice).

## Terminology

- **Project** is the spine — the central object everything relates to.
- **Specifier** = architect/consultant who specifies our products. **Buyer** = contractor/developer/owner who orders. **Influencer** = site engineer etc.
- The **hero feature** is the **paving-stage follow-up**: when a specified project reaches the paving stage, auto-create a follow-up task + notification so we don't lose specs we've already won.

## Current step

Update this line as we go. → **Step 1: Foundation** (scaffold + auth + tenant/RLS + design-token theme + app shell + Inngest).
