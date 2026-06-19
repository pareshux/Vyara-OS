# Vyara Manufacturing Business OS — Vision Blueprint V3

> **This is the VISION (the destination), not the build plan (the route).** It can be expansive on purpose. It does **not** change the implementation slices — Slice 1 → 2 → 3 stay exactly as specified. A big vision does not mean a big build. This document answers "what is the whole product," so leadership and future customers can see the destination, while the build stays disciplined.

---

## Vertical positioning — who this is for

This is **vertical SaaS for made-to-order building-materials manufacturers** — companies whose operational shape resembles Vyara's: SKU-driven product catalog (not bespoke per-customer), made-to-order or made-to-stock (not made-to-print), heavy goods with dispatch logistics, multi-channel sales (architect / tender / contractor / dealer), B2B-only.

**In-scope product categories:** concrete pavers, kerbstones, flagstones, landscaping tiles, terrazzo, precast (panels, manhole covers, drainage), RCC products, cement bricks / hollow blocks, marble & granite cut-to-size.

**Out-of-scope (share the word "manufacturing" but not the operational shape):** Ready-Mix Concrete (hourly-perishable dispatch, no specification phase), Steel, Furniture, Paint, Chemical, FMCG, fashion / apparel, electronics. These need different platforms.

**Target customer tiers:**

| Tier | Profile | Revenue | Surface |
|---|---|---|---|
| **Tier 1** | Multi-plant, marquee projects, dealer network, tender wins, IPO-ready (Vyara, Nitco) | ₹100cr+ | Full — tenders, architect-specification, multi-plant inventory, board MIS |
| **Tier 2** | Single-plant regional player, dealer + contractor sales | ₹20–100cr | Simplified — tender/architect modules hidden, lighter MIS, same codebase |
| Tier 3 (out) | Small local block units | ₹2–20cr | Don't buy software — not addressable |

**Launch customer:** Vyara Tiles Limited (Tier 1). The platform passes the vertical test only if a **second similar manufacturer can be onboarded in under 8 weeks**. Until that is demonstrated, this is a one-customer build in a SaaS costume.

---

## The four commercial motions (the reason the vertical needs all the modules it does)

A Tier 1 building-materials manufacturer simultaneously runs four very different commercial motions. Most ERPs/CRMs serve one well and ignore the rest. The vision must serve all four; the build sequences them.

| Motion | Cycle | Pricing | Hero modules | Vyara example |
|---|---|---|---|---|
| **Architect-specified projects** | 6–24 months | Project-specific quotes, discount approval | Specification, Samples, Quotes | Nirma University, premium townships |
| **Government tenders** | 3–18 months | Tender pricing, EMD, BG, retention | Tenders, Documents, Compliance | Statue of Unity, municipal road work |
| **Direct contractor / developer** | Recurring | Negotiated rate cards, RA-bills | Orders, Dispatch, Collections | Palava City, Sky City |
| **Dealers / distributors** | Transactional | Dealer price lists, schemes, credit | Dealer portal, Orders, Collections | Bungalow + plotting-scheme retail |

Slices 1+2 serve motion 1 (architect-specified) end-to-end. Motions 2 (tender), 3 (contractor scheduling), and 4 (dealer) are sequenced after.

---

## The North Star — Mehul's day

The product is a **one-stop operating system for Vyara's commercial and operational side** if it reliably answers, from one place, every question the leadership asks in a normal business day:

1. Who is buying? · 2. What project is this for? · 3. Who specified us? · 4. What samples went out? · 5. What was quoted? · 6. What was ordered? · 7. Do we have stock to commit? · 8. What needs dispatch? · 9. What has been delivered? · 10. What money is outstanding? · 11. Which dealers are performing? · 12. What complaints are open? · 13. What should my team do today?

**Definition of "one-stop OS":** the system answers all 13 reliably from one place — even though accounting, production planning, and a few specialist functions remain *integrated*, not rebuilt. That is a stronger, more honest target than either a narrow CRM or a full ERP.

**Year-1 success metric.** Not just "Vyara is delighted." It is: **Vyara is delighted AND we can onboard a similar Tier-1 or Tier-2 building-materials manufacturer in under 8 weeks.** The second clause is the only thing that proves the platform thesis. Without it, however delighted Vyara is, we have built a one-customer product.

---

## Scope boundary — the line that keeps this buildable

**This is a commercial + operational OS. Not production. Not accounting.**

| OWN (build it) | INTEGRATE (sync, don't rebuild) | DON'T BUILD |
|---|---|---|
| Sales, specification, projects, samples, catalog, pricing, quotes, orders | Financial postings, accounting entries, GST, ledgers → **Tally** | MRP / material requirements planning |
| **Operational inventory** (stock, reservations, transfers, dispatch allocation, sample stock) | Production status / "ready date" → their production setup | Production planning & scheduling |
| Dispatch, logistics, collections (receivables ops) | Payment gateway (Razorpay) | Procurement optimization |
| Dealers, vendor records, service/complaints, marketing, reporting, admin | WhatsApp BSP (AiSensy), telephony (Exotel/Plivo), voice (Sarvam) | Full HR, payroll, fixed-asset management |
| Tender response (later slice) | — | Consumer e-commerce / D2C storefront |
| — | — | Third-party / multi-brand marketplace |
| — | — | Manufacturing execution / machine telemetry / SCADA |
| — | — | Treasury, banking, FX, beyond payment-gateway |
| — | — | Ready-Mix Concrete (different commercial model) |

> Inventory is **operational, not accounting** — we own stock movement and availability; Tally owns the financial valuation. This supersedes the old "inventory = integrate-only" assumption (a revisable technical assumption, now revised).
>
> **HR and Assets are explicitly excluded** — they are neither commercial nor operational sales functions and would be scope sprawl.

---

## Capability catalog

All capabilities inherit the **common spine** (timeline · tasks · documents · comments · activities · notifications · AI · audit) and the platform layer (auth · RBAC · workflow · approvals · search · reporting · custom fields). Only capability-specific notes are called out below. Each is a Layer-2 module on the generic Business-Object platform.

**1. Sales.** *Purpose:* capture and convert demand. *Users:* sales engineers, inside sales, sales manager, COO. *Workflows:* enquiry capture → qualify → assign by territory → activities/visits/meetings → pipeline → forecast. *Masters:* lead source, activity type, territory. *Own.*

**2. Specification Management.** *Purpose:* track where Vyara is specified and convert it. *Users:* engineers, manager. *Workflows:* record specification → competitor noted → design support → paving-stage tracking → conversion trigger. *Masters:* product, project stage. *Own.* The highest-ROI capability for Vyara.

**3. Architect & Influencer Management.** *Purpose:* own the relationship graph that drives specs. *Users:* engineers, manager. *Workflows:* contact/firm records, role tagging (specifier/buyer/influencer), specification history per architect, nurture. *Masters:* firm, contact, role. *Own.*

**4. Projects.** *Purpose:* the project lifecycle and its stakeholders. *Users:* engineers, manager, COO. *Workflows:* project → stakeholders → stage pipeline (per segment) → site photos/progress → competitors → completion. *Masters:* project type, `pipeline_template`, `pipeline_stage`, `pipeline_substage`, `gate_requirement` (per stage/substage), activity type. *Own.* (A module now — not the platform spine.)

> **Stage model — data-driven config, three levels deep.** Stages are not enums in code:
>
> - `pipeline_template` — e.g. "Tiles / Architect", "Tender", "Direct contractor", "Dealer order". Tenant-scoped; one per commercial motion.
> - `pipeline_stage` — ordered list per template (the macro stepper).
> - `pipeline_substage` — ordered list per stage (the sub-stepper that the Scannable Project Tracking header expands into when a stage is active).
>
> Each stage and sub-stage declares:
>
> - **Required documents** — document types that must be on file to satisfy the gate (drawings, approval letter, work order, POD, RA-bill, retention release, etc.).
> - **Required fields** — fields that must be populated on the project (e.g. "order_value before exiting Quote", "expected_completion_at before exiting Order").
> - **SLA in days** (`sla_days`) — if a project sits in this stage longer, the project's health flips amber.
> - **Back-flow** — which prior stages a record may legally return to, and the allowed reasons (`stage_transition_reason` master). Most stages forbid back-flow; some explicitly allow it (e.g. Dispatch → Reserve stock when a tranche is rejected).
>
> These declarations power the **Scannable Project Tracking** pattern (above) — they are what make a missing approval document render as a red gate on the header without any module-specific code.
>
> **Tiles / Architect pipeline (launch-customer reference).** The pipeline that the launch customer runs:
>
> `Specified → Tracking → Paving → Delivery → Closed`
>
> with **Paving** modelled as a sub-pipeline:
>
> `Quote → Order → Reserve stock → Dispatch → Laying → Billing`
>
> **Data-model consequences (record now, so later slices don't fight the schema):**
>
> - An **Order may have many Dispatch tranches.** Phased delivery is the norm for tile/paver projects, not the exception — a single order to a township covers many bungalows or many road sections, each dispatched separately as ground prep finishes. The Dispatch module's schema is one-to-many against Order; the header's "3 of 5" dispatch mini-bar reads from Dispatch tranche rows, not from a flag on Order.
> - **Invoices are partial.** Running bills (`is_running_bill`, `running_bill_seq`, `is_final_bill`) with `retention_pct` held back until project completion. The header's "₹25.2L of ₹42L · 60%" billing mini-bar reads sum of invoices vs order value, never a "billed" flag.
> - **Reservations are at line level.** A partially-reservable order (some lines on stock, some on back-order) is the common case; the header's reservation mini-bar reads lines-reserved vs lines-ordered.
>
> Other pipeline templates (Tender, Dealer order, Direct contractor) follow the same shape: stages + sub-stages + gates + SLA + back-flow, all data-driven. The header pattern renders correctly for all of them without modification.

**5. Samples.** *Purpose:* track samples to conversion + their stock. *Users:* engineers, inside sales, warehouse. *Workflows:* request → approve (if costly) → dispatch + track → outcome → ROI. *Masters:* sample type; links to **sample stock** (inventory). *Own.*

**6. Product Catalog.** *Purpose:* the SKU master and its attributes. *Users:* inside sales, estimation, admin. *Workflows:* category/SKU/finish/colour/size, images, documents, availability. *Masters:* category, SKU, brand, finish, colour, thickness, unit, packaging. *Own.*

**7. Pricing.** *Purpose:* consistent, controlled pricing. *Users:* estimation, manager, MD. *Workflows:* price lists (segment/region, effective-dated) → discount matrix → approval thresholds. *Masters:* price list, discount matrix, taxes, payment terms. *Own.*

**8. Quotations.** *Purpose:* fast, consistent quotes with control. *Users:* inside sales, estimation, engineers. *Workflows:* build from catalog+pricing → versions → approval → send (WhatsApp/email) → status/negotiation → won/lost. *Masters:* quote template, reason codes. *Own.*

**9. Orders.** *Purpose:* convert won business to fulfilment. *Users:* inside sales, dispatch, accounts. *Workflows:* quote→order (or direct) → confirm → margins → allocate stock → hand to dispatch. *Masters:* order status, reason codes. *Own.*

**10. Operational Inventory.** *Purpose:* know what we can commit and move. *Users:* warehouse, inside sales, dispatch, manager. *Workflows:* stock levels (available/reserved/in-transit) → movements → transfers → **reservations against orders** → sample stock → damages/adjustments → min levels → stock ledger. *Masters:* warehouse, stock type, movement type, reason codes. *Own (operational).* Financial valuation → Tally.

**11. Warehouse Visibility.** *Purpose:* per-location stock and dispatch readiness. *Users:* warehouse (tablet), dispatch. *Workflows:* location/bin stock, ready-to-dispatch, allocation. *Masters:* warehouse, storage location. *Own.*

**12. Dispatch & Logistics.** *Purpose:* get product delivered and proven. *Users:* dispatch, warehouse (tablet), engineers. *Workflows:* schedule → transporter/vehicle → delivery tracking → **POD** → returns. *Masters:* transporter, vehicle. *Own.*

**13. Dealers & Distributors.** *Purpose:* run the channel. *Users:* dealer-coordination, manager, dealers (portal). *Workflows:* onboarding → orders → ledger → schemes/targets/claims → performance → dormancy. *Masters:* dealer, scheme. *Own* (incl. dealer portal — later slice).

**14. Vendor Management** *(thin for Vyara).* *Purpose:* records for those who supply/serve us. *Users:* purchase/accounts, dispatch. *Scope:* transporters, suppliers, contractors, service vendors — mostly **reference data**, not a procurement suite. *Masters:* vendor, vendor type. *Own (light).*

**15. Collections.** *Purpose:* get paid systematically. *Users:* accounts, manager, MD, independent director (MIS). *Workflows:* invoices (from Tally/manual) → ageing → WhatsApp dunning → promise-to-pay → receipts → outstanding → credit limits. *Masters:* payment terms, credit limit. *Own (receivables ops);* postings → Tally.

**16. Customer Service & Complaints.** *Purpose:* close the loop after delivery. *Users:* service, quality, manager. *Workflows:* complaint → triage → site inspection → warranty/replacement → root cause → batch-quality link. *Masters:* complaint type. *Own.*

**17. Marketing** *(thin for Vyara).* *Purpose:* feed and attribute demand. *Scope:* campaigns, exhibitions, WhatsApp blasts, lead-source ROI — mostly **attribution**, not a campaign platform. *Masters:* lead source, campaign. *Own (light).*

**18. Reporting & MIS.** *Purpose:* answer Mehul's 13 questions + board/IPO reporting. *Users:* all leadership, independent director. *Workflows:* dashboards per persona (sales, projects, inventory, samples, dealer, collections, dispatch, management, board). *Own.* AI-assisted board narrative.

**19. Administration.** *Purpose:* configure the system. *Users:* admin (Mili's side). *Workflows:* users/roles, masters, templates, workflow config, approval matrix, settings. *Own.*

---

## Capability classification (as requested)

**1. Core — required for Vyara now/soon:** Sales, Specification, Architect/Influencer, Projects, Samples, Catalog, Pricing, Quotes, Orders, Operational Inventory, Warehouse, Dispatch, Collections, Service/Complaints, Reporting, Administration.

**2. Strategic reusable platform capabilities (the moat for future verticals):** the whole **Layer-1 spine** — Entity/Business-Object engine, Workflow engine, Task engine, Document engine, Communication engine, Approval engine, Notification engine, AI engine, Reporting engine, Permission engine, Custom-field engine. These are what make Steel/Furniture/Paint configurable later, not rebuilt.

**3. Future — *adjacent within the building-materials vertical*:** Design Services (Vyara), Tender management (govt-heavy customers — Tier 1 only), batch/lot tracking (concrete batch traceability, marble slab-level), dealer portal depth (schemes, claims, credit), adjacent-category packs **within the vertical** — RCC products, precast (manhole covers, drainage), cement bricks, marble cut-to-size. **Cross-industry packs (Steel / Furniture / Paint / Chemical) are out of scope** — they share the word "manufacturing" but not the operational shape, and serving them would force abstractions that hurt the vertical product.

**4. Remain external integrations:** Accounting/GL/GST/financial postings (Tally), production status, payment gateway (Razorpay), telephony (Exotel/Plivo), WhatsApp BSP (AiSensy).

---

## Masters layer (the previously-missing foundation)

- **Parties:** customer, architect, builder, contractor, dealer, vendor, transporter, consultant.
- **Geography:** country, state, city, territory, zone, branch.
- **Product:** category, SKU, brand, finish, colour, thickness, unit, packaging.
- **Commercial:** price list, discount matrix, taxes, payment terms, credit limits.
- **Inventory:** warehouse, stock type, movement type, reason codes (movement_reason).
- **Project:** project type, **`pipeline_template`**, **`pipeline_stage`** (with `sla_days` + allowed back-flow per stage), **`pipeline_substage`**, **`gate_requirement`** (required documents + required fields, per stage/substage), activity type.
- **Process reason codes (centralised, tenant-configurable):** `stage_transition_reason`, `dispatch_delay_reason`, `return_reason`, `complaint_root_cause`, `write_off_reason`, `payment_promise_broken_reason`. One master per reason; dropdowns across the platform consume them so no enum is hardcoded.
- **Administration:** role, permission, notification template, workflow template, approval matrix.

Every master is tenant-scoped from day one.

---

## Scannable Project Tracking — the project-header pattern

A project's header must let a viewer understand its **whole state at a glance**. The pattern encodes three things in one progress component, computed identically across the system and reused on the Project Detail header, the projects list (as a status dot), the dashboard, and the mobile Today view.

### 1. POSITION
A macro stepper rendered from the project's `pipeline_template` stages — **done / current / upcoming**. Stages are data-driven, never hardcoded; the same component renders correctly for an architect-specified project, a tender, a direct-contractor schedule, or a dealer order.

### 2. HEALTH
The current segment's colour reflects health, not just position:

- **on-track** (green)
- **needs-attention** (amber)
- **blocked** (red)

This rolls up into a **single status pill on the header** and a matching **status dot in list/dashboard views**, so a list of many projects is scannable — a manager looks only at amber/red rows. Health is one computed rule, evaluated in the read-model assembler:

| Condition | Health |
|---|---|
| Past the current stage's `sla_days` AND any **hard** gate is unsatisfied | **blocked** (red) |
| Open task on the project overdue (regardless of stage progress) | **needs-attention** (amber) |
| Past the current stage's `sla_days` with all hard gates satisfied (just stalled) | **needs-attention** (amber) |
| Else | **on-track** (green) |

The rule is deliberately tolerant of **end-of-stage gates that are naturally unsatisfied** while a stage is in progress — e.g., a "final RA bill" gate on Paving is supposed to be unsatisfied for most of Paving's life. Such gates show as red chips in the COMPLETENESS section (so the user can see what's outstanding) but **do not flip the pill to blocked until the stage runs past its SLA**. That's the difference between "you have work left to do here" and "you're stuck."

Edge cases (e.g. "always-active gate" that *should* block from day one, like "drawing on file before Tracking") can be expressed in the `gate_requirement` master via a future column — out of scope for now; the current rule covers the common case cleanly.

### 3. COMPLETENESS

**a) Sub-pipeline expansion.** The active stage expands into its sub-pipeline — a second, finer stepper showing the `pipeline_substage` rows for that stage. The macro stepper stays visible above; the sub-stepper sits inside the current segment.

**b) Gates.** Each stage and sub-stage declares **required documents** and **required fields** (the `gate_requirement` master). The component renders them as done / blocked chips. A missing required document shows as a blocked (red) gate — this is how **document presence becomes scannable** without forcing a user to click into the Documents tab to find out.

**c) Phased mini-bars.** Progress for one-to-many work reads from **child records, not flags**:

- **Dispatch:** tranches delivered vs planned sections — e.g. "3 of 5"
- **Billing:** sum of invoices vs order value — e.g. "₹25.2L of ₹42.0L · 60%"
- **Reservation:** lines reserved vs lines ordered

The mini-bars are computed from the underlying records, so they're always correct without a denormalised "is_dispatched" boolean to maintain.

**d) Next-action banner.** The next action surfaces as a task banner inside the header: **who · what · due**. One project, one obvious next action.

### Architecture rule (load-bearing)

**All cross-module reads needed for the project header go ONLY through the project-progress read-model assembler.** The header component, the list-view status dot, the dashboard tile, and the mobile Today card all consume one assembled object — `{ macro_stages, current_stage, current_substages, gates, dispatch, billing, reservation, health, next_action, ... }`. No other component or module reads `sales_order`, `dispatch`, `invoice`, or their line/reservation tables on the project's behalf.

The assembler is implemented as a single server-side function (`lib/read-models/project-progress.ts`) — a pragmatic projection rather than an event-sourced materialised view. Upgrading to event sourcing later is additive: the consumer contract stays the same. See `docs/adr/0001-project-progress-read-model.md` for the full rule + the code-review checklist.

Consequences:

- **New modules added later** (Complaints, Tenders, Service, batch/lot tracking) surface in the header by extending the assembler — one new query per module, not by adding direct table reads in UI components.
- The pattern is consistent with **Principle #0** (modules own their tables; communication is via events). The assembler is the *one place* where cross-module reads are sanctioned.
- Health, gates, mini-bars, and the next-action banner are computed in the read-model, not at render time. A single source of truth for "what state is this project in" across header, list dot, dashboard, and mobile Today.
- The health rule itself was refined during wiring: a project is **blocked** only when past the current stage's SLA AND a hard gate is unsatisfied (mid-stage projects with end-of-stage gates pending stay on-track — the chips show red, but the pill stays green until the stage stalls).

This pattern is canonical. Other large objects (Order, Invoice, Dealer, Complaint) follow the same three-encoding shape on their own headers when they grow that need — each gets its own read-model assembler.

---

## How this vision relates to the build (read this twice)

This vision is the **destination**. The **route** is unchanged:

- **Slice 1** (live): Lead → Project → Sample → Quote → Task → Timeline → Notification.
- **Slice 2:** Order → Dispatch → Invoice → Collection. *(Operational Inventory + Warehouse are the natural addition here, since orders need stock to commit — fold a thin inventory-visibility capability into Slice 2, full inventory management as Slice 2.5.)*
- **Slice 3:** Dealer → portal → orders.
- **Then, demand-driven:** Service/Complaints, Tenders, Marketing, deeper MIS, additional verticals.

**Nothing in this document authorizes building more, faster.** It authorizes building *toward a clear, ambitious destination, one slice at a time.* When tempted to expand the build to "match the vision," don't — the vision's job is direction, the slice's job is delivery.

---

## Constitution changes this triggers

The Constitution has been updated to match (v2): reframed as **vertical SaaS for made-to-order building-materials manufacturers** with Vyara as launch customer; added **Principle #0** (3-layer capability platform, generic Business-Object spine); fixed **"Project is the spine"** → Business Object is the spine, Project is a module; changed **inventory** from integrate-only to **own operational inventory, integrate financial**; added **Mehul's 13 questions** as the definition of done; added the **8-week customer-#2 success criterion**; expanded the **DON'T BUILD** list (RMC, consumer e-commerce, marketplace, MES/SCADA, treasury); added **Principle #11 (Tier 1+2 depth modes)**. Implementation slices are untouched.
