# Vyara OS — Product Constitution (v2)

> **Read this first, every session, before any other instruction.**
> Vyara OS is **vertical SaaS for made-to-order building-materials manufacturers** (pavers, kerbs, tiles, precast, RCC products, cement bricks, marble cut-to-size). It is **not** a horizontal manufacturing OS — building materials is the vertical, adjacent verticals are *other building-materials categories*, not unrelated industries. Target customers are **Tier 1 (₹100cr+, multi-plant, marquee projects, dealer network) and Tier 2 (₹20–100cr regional players)** manufacturers. **Vyara Tiles Limited is the launch customer (customer #1).** The product is the **Manufacturing Business OS** — one system to run the **commercial and operational** side of the business (sales → specification → samples → quotes → orders → operational inventory → dispatch → collections → service). It does **not** rebuild accounting or production. This document governs every architectural and product decision. When a request conflicts with a **Product Principle**, surface the conflict rather than silently overriding it. **Technical Assumptions** may change as we learn from the client.
>
> **Year-1 success criterion (the only one that matters):** Vyara is delighted AND we can onboard a second similar manufacturer in **under 8 weeks**. The second clause is what enforces real platform discipline — without it, we are just building a one-customer fork in a vertical-SaaS costume.

---

## Definition of done — Mehul's day

The product succeeds when it answers, reliably and from one place, every question leadership asks in a normal day: who's buying · what project · who specified us · what samples went · what was quoted · what was ordered · do we have stock to commit · what needs dispatch · what's delivered · what's outstanding · which dealers perform · what complaints are open · what should my team do today. Accounting, production planning, and a few specialist functions stay integrated, not rebuilt.

---

## PRODUCT PRINCIPLES (immutable — never change)

**0. Capability platform, not feature toggles.** Three layers: (1) **Platform capabilities** (auth, permissions, workflow, tasks, timeline, documents, comments, activities, notifications, AI, reporting, search, audit, custom fields); (2) **independent Business Modules** (Lead, Project, Quote, Order, Inventory, Dealer, Vendor, Collection, Complaint, …); (3) **Industry configurations** (Tiles, Steel, …). Every module is independently installable/removable and communicates only through published interfaces and events. No module depends on another module's internal implementation.

**1. The spine is a generic Business Object.** Every object — Lead, Project, Order, Inventory Item, Dealer — inherits the common spine. **Project is a module, not the platform spine.**

**2. Every core Business Object carries the common spine:** Timeline · Tasks · Documents · Comments · Activities · Notifications · AI · Audit. *(Reference/master data does not.)*

**3. Everything generates tasks.** Projects, quotes, samples, collections, complaints, dispatches — anything that needs a human to act creates a task. Nobody should have to remember what's next.

**4. Everything configurable.** Pipelines, stages, rules, approvals, forms, and templates are **data, not code**. Industry behaviour lives in configuration, never in hardcoded forks.

**5. Own the commercial + operational layer; integrate the rest.** Own sales→service and **operational inventory** (stock, reservations, transfers, dispatch allocation, sample stock). **Integrate** financial postings / GST / ledgers (Tally) and production status. **Never build** MRP, production planning, procurement optimization, HR, payroll, asset management, consumer e-commerce / D2C, third-party marketplace, manufacturing execution / machine telemetry, or treasury/banking beyond payment-gateway integration. **Out-of-vertical** product categories (Ready-Mix Concrete with its hourly-perishable dispatch model, Steel, Furniture, Paint, Chemical) are not in scope — they share the word "manufacturing" but not the operational shape.

**6. AI assists; humans decide.** No autonomous action where money or reputation is at stake; every AI skill has a non-AI fallback and a human checkpoint.

**7. One source of truth.** No duplicate data — reference, don't copy (except immutable snapshots like a quoted price).

**8. Every change is auditable.** Append-only audit; nothing silently mutated.

**9. Right device for the user.** Mobile-first field; desktop management/inside sales; tablet warehouse/dispatch.

**10. Simple beats clever; vision is big, build is sliced.** Build the minimum that serves the current slice. An expansive vision never authorizes a bigger build — only a clearer direction. Hold clean boundaries so future *building-materials* product categories (RCC, precast, marble cut-to-size, eventually RMC) slot in without a rewrite. Cross-industry expansion is explicitly not a year-1 design constraint.

**11. Two-tier depth modes.** Tier 1 customers (Vyara-scale) see the full surface; Tier 2 (₹20–100cr regional players) see a **simplified surface** — tender, architect-specification, and multi-plant modules are hidden by default. The same codebase serves both via configuration, never via forks.

---

## TECHNICAL ASSUMPTIONS (revisable as we learn)

- **Modules own their tables** (prefixes: `lead_`, `project_`, `order_`, `inventory_`, `dealer_`…); **no cross-module writes**; communication via the event bus.
- **Multi-tenant from day one:** `tenant_id` on every table; Supabase RLS for tenant + territory isolation.
- **Margin, cost, discount masked** from the `sales_engineer` role.
- **Modular monolith** (engines are modules with hard boundaries, not services) until real multi-tenant scale demands extraction.
- **Stack:** Next.js (App Router) · Supabase (Mumbai, DPDP) · Tailwind + shadcn/ui · lucide · react-hook-form + zod · TanStack Table · Inngest (events/jobs) · AiSensy (WhatsApp) · Exotel→Plivo + Sarvam (voice, later) · Razorpay (later) · Vercel. Responsive PWA for field.
- **Integrations:** Tally (financial — two-way, reconciled), production (read-only), payment gateway, telephony, WhatsApp BSP.

*These can change after discovery with Vyara (e.g., if production genuinely needs writes). The Product Principles cannot.*

---

## Naming conventions

`snake_case` · singular tables · FK `<entity>_id` · join `<a>_<b>` · history `<entity>_history` · booleans `is_/has_` · timestamps `*_at`. Every table carries `tenant_id`, audit columns, soft-delete.

---

## Current build

Vision = **Manufacturing Business OS** (see `vyara-vision-blueprint-v3.md`). Build = vertical slices, unchanged: **Slice 1** (Lead→Project→Sample→Quote→Task→Timeline) → **Slice 2** (Order→Dispatch→Invoice→Collection, + operational inventory visibility) → **Slice 3** (Dealer→portal→orders) → **Slice 3.5** (Masters & Configuration: tax, payment terms, price lists, vendors, dealer-tier, territory). Update this line as we progress. → **Current: Slices 1 + 2 + 2.5 + 3 + 3.5 complete. Next is the platform-readiness sprint (tenant onboarding, module visibility flags, configurable seed packs, master CSV importers) before the first customer-#2 onboarding attempt. Customer-#2 test not yet attempted; ~2 months estimated post Slice 3.5.**
