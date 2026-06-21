# Vyara OS — Product Constitution (v3)

> **Read this first, every session, before any other instruction.**
> Vyara OS is a **modular Business Operating System** for manufacturing, contracting, distribution, and service companies — one system to run the **commercial and operational** side of the business (sales → specification / scoping → samples / drawings → quotes → orders → operational inventory → dispatch → installation / commissioning → collections → service → AMC). It does **not** rebuild accounting or production. **Building-materials-first launch: Vyara Tiles Limited is customer #1.** Cross-industry by **configuration, not code fork** — industry behaviour is absorbed via masters, pipeline templates, activity-type vocabularies, approval policies, and dashboard layouts. The eight supported industries (building materials, electrical contractors, industrial manufacturers, HVAC, engineering, distributors, fabricators, service businesses — see Blueprint §0.4) share one architecture. Target customers per industry are **Tier 1 (₹100cr+, multi-plant / multi-site, marquee projects, channel network) and Tier 2 (₹20–100cr regional players)**. This document governs every architectural and product decision. When a request conflicts with a **Product Principle**, surface the conflict rather than silently overriding it. **Technical Assumptions** may change as we learn from clients.
>
> **Year-1 success criterion (the only one that matters):** Vyara Tiles is delighted AND we can onboard a customer in a **different industry** in **under 8 weeks** — proving the platform thesis. **Raj Avinsys Pvt. Ltd.** (electrical EPC + panel manufacturing + AMC, Gujarat) is the first cross-industry target. Two industries on one architecture, ≤8 weeks per onboarding, is the only honest test of *modular Business OS* vs *vertical SaaS in disguise*.
>
> **v3 amendment (2026-06-22):** This Constitution supersedes v2. The positioning shifted from "vertical SaaS for building-materials manufacturers" to "modular Business OS, cross-industry by configuration" when pitching Raj Avinsys forced the recognition that the Blueprint (v3) was already shaped horizontally — the Constitution (v2) was the document out of sync. Principles #0–#11 stayed intact (they were always industry-neutral); §5 was rewritten to broaden in/out-of-scope language; §10 was rewritten to make cross-industry expansion an explicit year-1 design constraint (it was previously deferred). See `docs/BUILD-LOG.md` 2026-06-22 entry for the rationale; v2 is preserved in git history.

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

**5. Own the commercial + operational layer; integrate the rest.** Own sales→service and **operational inventory** (stock, reservations, transfers, dispatch allocation, sample stock, spares). **Integrate** financial postings / GST / ledgers (Tally / Zoho Books / QuickBooks — pluggable) and production status. **Never build** MRP, production planning / scheduling, HR, payroll, consumer e-commerce / D2C, third-party marketplace, manufacturing execution / machine telemetry, or treasury/banking beyond payment-gateway integration. Procurement / vendor PO tracking *is* in scope for industries that depend on it (EPC contractors, fabricators); deep MRP / production scheduling stays out. Industries with fundamentally different operational shapes (Ready-Mix Concrete's 90-minute perishable dispatch window is the canonical example) require a deliberate *"is this worth the architectural cost?"* decision before onboarding — the platform claim is **same architecture, configurable behaviour**, not **any industry trivially**.

**6. AI assists; humans decide.** No autonomous action where money or reputation is at stake; every AI skill has a non-AI fallback and a human checkpoint.

**7. One source of truth.** No duplicate data — reference, don't copy (except immutable snapshots like a quoted price).

**8. Every change is auditable.** Append-only audit; nothing silently mutated.

**9. Right device for the user.** Mobile-first field; desktop management/inside sales; tablet warehouse/dispatch.

**10. Simple beats clever; vision is big, build is sliced.** Build the minimum that serves the current slice. An expansive vision never authorizes a bigger build — only a clearer direction. Hold clean boundaries so future industries slot in via configuration — masters, pipeline templates, activity-type vocabularies, gate requirements — never code forks. Cross-industry expansion **is** a year-1 design constraint as of the v3 amendment (2026-06-22): Raj Avinsys (electrical EPC) is the first cross-industry customer; every new abstraction asks *"does this work for an EPC tenant too, or am I encoding a Vyara-Tiles quirk?"*

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

Vision = **modular Business OS** (see `docs/PRODUCT-BLUEPRINT-v3.md` for capability partitioning + status). Build to date for Vyara Tiles: **Slices 1 + 2 + 2.5 + 3 + 3.5 + 4 complete** (Lead→Project→Sample→Quote, Order→Dispatch→Invoice→Collection, Dealer + portal, masters + configuration, Field Operations). Sprint 1 platform foundations shipped (PLAT-004 through PLAT-011 — feature flags, tenant settings, masters, sensitive masking, TS types, observability, code-prefix consumers, tenant provisioning CLI). Owner Dashboard (INT-014) shipped Slices 1+2+3+3.1+4; Slice 5 dropped 2026-06-21 (subsumed by INT-009 conversational agent).

→ **Current: building the Raj Avinsys cross-industry demo** (Constitution v3's first cross-industry test). Approach: provision `raj-avinsys` as a second tenant via the existing onboarding CLI, seed Raj-shaped masters (16-stage EPC pipeline, electrical activity-type vocabulary, industrial/consultant/OEM relationship types), seed mock data covering EPC + panel manufacturing + AMC motions, build the un-built capabilities Raj's motion requires (CS-001 complaint module, CS-009 AMC contracts, drawing-approval workflow gate, milestone-billing schedule). The demo doubles as the **Customer-#2 onboarding rehearsal** — same code path a real second customer would take. Estimated 3 weeks across slices. **The first time we flip to the Raj tenant, Vyara-isms in copy / AI prompts / seed data will surface — each surfaced item is a Customer-#2 readiness gap we'd otherwise hit painfully during real onboarding. That's the value of doing it as a demo first.**
