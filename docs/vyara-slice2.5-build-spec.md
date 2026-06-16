# Vyara OS — Slice 2.5 Build Spec (for Claude Code)

> **Read first, every session:** `CONSTITUTION.md` (v2), `docs/vyara-vision-blueprint-v3.md` (vision), `docs/design.md` (UX), and `docs/vyara-slice2-build-spec.md` (immediate predecessor). This spec adds the **Operational Inventory** module on top of Slices 1 + 2.
>
> **Operating mode (same as 1 + 2):** Six build steps, in order, one at a time. After each: app runs, commit, then continue. Pause only for **genuinely blocking** decisions — max **3 blocking + 5 recommendations** per step, then proceed with a stated assumption. **Build Slice 2.5 only** — if it's not in scope here, it's out.
>
> **Platform discipline (new explicit test, per Constitution v2):** before merging anything in this slice, ask: *would this work for a similar Tier-1 / Tier-2 building-materials manufacturer ("customer #2") without code changes?* If the answer is no — because of a hardcoded enum, a Vyara-specific label, or non-configurable seed data — the design needs to change before merging, not in a future cleanup pass. The 8-week customer-#2 onboarding target is the year-1 success gate; every slice from here on either narrows or widens that gap.

---

## The slice

**Operational Inventory** — own stock visibility, movements, reservations, dispatch allocation, sample stock, transfers, adjustments, low-stock alerts. **Mehul's question #7** ("do we have stock to commit?") becomes answerable.

**The capability that must feel magic:** when inside-sales creates an order, the system shows — instantly, per line — *"available: 4,500 sqm of INTLK-300-GRY in Surat plant; reserved on this order"*. When the dispatch is delivered (POD captured), stock decrements automatically with a full audit trail. When a sample is dispatched, it draws from a separate sample-stock bucket so it doesn't poison commercial availability.

Today none of this exists — orders are accepted against unknown stock, dispatches "ship" without any inventory consequence, samples have no stock-side reality. This slice fixes the dishonesty at the foundation of the order→dispatch→invoice chain.

**Pilot-grade, not production-hardened** — real enough for Vyara's plant + dispatch + inside-sales team to use on live orders.

---

## Architecture: continues the modular monolith

Per Constitution Principle #0, this module owns its own tables (`inventory_*` and a few first-class ones: `warehouse`, `stock`, `stock_movement`, `stock_reservation`, `stock_adjustment`, `stock_transfer`). **No cross-module writes** — Orders / Dispatch / Samples *read* inventory and *publish events*; Inventory *listens* and adjusts its own state. Loose coupling, never hard dependency.

Cross-module event protocol:

- `order.confirmed` → Inventory tries to reserve; emits `stock.reservation.created` or `stock.reservation.failed`.
- `order.cancelled` → Inventory releases the reservation.
- `dispatch.delivered` → Inventory consumes the reservation (issues stock).
- `sample.dispatched` → Inventory issues from sample-stock bucket.
- `stock.low` → Inventory emits when min-level is breached; Tasks/Notifications module reacts.

Production-system integration is **read-only and deferred** (same pattern as Tally in Slice 2.5): a `ProductionMode` env-gated client returns "ready-date" stubs when no production system is configured, real values when it is.

---

## In scope

- **`warehouse` master** — multi-warehouse from day one (Tier 1 has multiple plants); each has type (`own_plant` / `transit` / `samples` / `dealer_consignment`), city, address, manager, active flag. Tier 2 customers with a single warehouse get a streamlined view (hides the warehouse switcher).
- **`stock` entity** — per (warehouse, product) row tracking `available_qty`, `reserved_qty`, `in_transit_qty`, `sample_qty`, `min_level`, `max_level`, `updated_at`. Single source of truth for "what's where."
- **`stock_movement`** — append-only ledger of every change (receipt, issue, transfer_in, transfer_out, adjustment, sample_issue, reservation_in, reservation_out), with reason code, related entity (order/dispatch/sample/transfer/adjustment), actor, remark. *The audit trail for every grain of stock.*
- **`stock_reservation`** — explicit reservation rows linking (warehouse, product, qty) ↔ (order / sample_request); status (active/consumed/released/expired), expires_at, related entity. Atomic: reserving decrements `available_qty` and increments `reserved_qty` in one transaction.
- **`stock_adjustment`** — damage / count-difference / correction / other, with quantity_delta (signed), reason, status (pending/approved/rejected). Adjustments above a configurable threshold require manager approval; below the threshold, auto-approved with audit.
- **`stock_transfer`** + `stock_transfer_line` — schedule and execute warehouse-to-warehouse transfers; source becomes `in_transit_out`, destination becomes `in_transit_in`, on confirmation both clear and quantities settle.
- **Order ↔ Inventory wiring** — order create/confirm checks stock per line, reserves what's available, flags lines that are short ("back-order risk"). Order detail shows per-line reservation status. Order cancellation releases reservations.
- **Dispatch ↔ Inventory wiring** — POD capture (Slice 2 already emits `dispatch.delivered`) consumes reservation: reservation → consumed, stock decrements with a `dispatch_id`-linked movement row.
- **Sample ↔ Inventory wiring** — sample_request gets a `sample_qty` reservation against the samples-warehouse bucket; sample dispatch consumes it. Sample stock is its own bucket so samples can't drain commercial inventory invisibly.
- **Inngest cron `inventory-daily-check`** — for each (warehouse, product) where `available_qty < min_level`, create a `stock_low` task assigned to the warehouse manager + notification. Cooldown 24h per item.
- **Stock ledger view** — per SKU / per warehouse / both, every movement in reverse-chronological order with running balance. The "show me everything that touched this SKU" audit answer.
- **Warehouse staff tablet view** — extend the existing `/warehouse` page (currently dispatch-only) with a stock-receipt mode and an adjustments mode. Mobile-tolerant; ≥44px touch targets per design.md §7.
- **CSV import for opening stock** — bulk seed the `stock` table when a tenant is onboarded or when stock is being initialized for the first time. Idempotent (matched on warehouse + sku_code).
- **Configurable adjustment-approval threshold** — per-tenant setting (default ₹10,000 worth of stock); above threshold needs manager approval. Configurable, not hardcoded.

## Out of scope (do NOT build in this slice)

- **Bin-level location tracking** (warehouse → bin → SKU). Warehouse-level is sufficient for Tier 1 + Tier 2 building-materials operations; bin-tracking belongs to a later slice if a customer demands it.
- **Batch / lot / serial-number tracking** — vision lists this as "Future / vertical-specific." Real for marble cut-to-size and concrete batch traceability, but adds significant model complexity. Defer.
- **Cycle counting workflows** — adjustments cover the operational need; formal cycle counts are a year-2 feature.
- **Barcode / RFID / scanner integration** — manual entry + CSV import is enough for pilot.
- **ABC / inventory-optimization analytics** — out.
- **Procurement / PO generation / GRN against PO** — Constitution Principle #5 explicitly excludes procurement.
- **Production planning / MRP / "what to manufacture next"** — explicitly out.
- **Real-time WebSocket stock updates** — every screen revalidates on action; live push is later.
- **Stock-value reporting in money terms** — financial valuation is Tally's job (Principle #5). We track quantities; Tally tracks rupee value.

If something feels needed and isn't here, note it and move on.

---

## Minimal data model notes

- `warehouse` carries `tenant_id`, name, code (unique per tenant), city, type, manager_id (FK to user_profile), is_active, audit cols, deleted_at.
- `stock` is `(warehouse_id, product_id)` unique. Columns: `available_qty`, `reserved_qty`, `in_transit_qty`, `sample_qty`, `min_level`, `max_level`, `updated_at`. Initialized to zero; populated via movements/imports.
- `stock_movement` is **append-only** (`REVOKE UPDATE, DELETE`). Every change to stock writes a movement first; the stock row is updated by trigger from the movement.
- `stock_reservation` has UNIQUE constraint on `(related_entity_type, related_entity_id, product_id, status)` filtered to status='active' — prevents double-reserving the same order line.
- `stock_adjustment` has a `status` column and an `approval_workflow` driven by the existing approval engine (or a simple status transition if approval engine isn't wired yet — track as known-debt in this slice's commit).
- `stock_transfer` has stages: `draft → in_transit → completed | cancelled`. State machine identical pattern to `dispatch_stage` from Slice 2.
- Every table: `tenant_id`, audit columns, soft delete where appropriate (`stock_movement` is append-only so no soft delete). RLS by tenant.
- **Triggers handle the atomicity:** inserting a stock_movement updates `stock.*_qty` columns atomically. The application layer never touches `stock` directly — only through movements. This is the single load-bearing invariant of the module.

---

## Stack additions (on top of Slices 1 + 2)

- **None.** Inngest, Supabase, shadcn/ui all already in place. This slice is a pure data + UI + integration build.

---

## Build sequence (six incremental steps)

**Step 1 — Schema + warehouse master.**
Migration `0009_inventory.sql`: `warehouse`, `stock`, `stock_movement`, `stock_reservation`, `stock_adjustment`, `stock_transfer`, `stock_transfer_line` + RLS + triggers. Seed two Vyara warehouses (`SURAT-PLANT-1` + `SAMPLES-SURAT`). Build `/warehouses` list + detail + create-warehouse sheet. *Done when: a logged-in user sees the two seeded warehouses and can create a third.*

**Step 2 — Stock visibility + ledger + CSV import.**
Stock entity wiring (read-only views first). Stock dashboard per warehouse (list of products with available/reserved/in-transit/sample). Stock-ledger view per (warehouse, product) showing every movement in reverse-chrono with running balance. Bulk CSV import for opening stock — idempotent on (warehouse_code, sku_code). Seed some opening stock for the existing 10 Vyara SKUs. *Done when: you can see "we have 4,500 sqm of INTLK-300-GRY at SURAT-PLANT-1" and click through to a full movement history.*

**Step 3 — Adjustments + transfers + sample stock.**
Stock-adjustment server action with configurable approval threshold (per-tenant setting; default ₹10k worth). Stock-transfer between warehouses (multi-step state machine: draft → in_transit → completed). Sample stock as its own warehouse type (`samples`) — sample requests draw from `SAMPLES-*` warehouses, not from `own_plant` warehouses. *Done when: you can adjust stock with an audit row, transfer stock between two warehouses, and see sample stock as a separate bucket.*

**Step 4 — Order ↔ Inventory wiring (the integration that makes Step 1–3 matter).**
Wire `order.confirmed` Inngest event → reservation attempt per line. Update order detail to show per-line reservation status (Reserved · Back-order · Partial). Add "fulfillment risk" badge on the order list. Order cancellation releases reservations. Allow manual reservation/release from the order detail page for edge cases. *Done when: confirming an order in the seeded scenario actually reserves stock and the order detail reflects it.*

**Step 5 — Dispatch + sample consumption + low-stock cron.**
Wire `dispatch.delivered` event → consume reservation + write `issue` movement. Wire sample dispatch (status change to `dispatched`) → consume sample-stock reservation + write `sample_issue` movement. Inngest cron `inventory-daily-check` at 09:00 IST: for each (warehouse, product) where `available < min_level`, create a `stock_low` task + notification (24h cooldown per item). *Done when: dispatching the seeded order actually decrements stock; setting a min_level on one SKU above its current available_qty triggers a task on the next cron run (or manual trigger).*

**Step 6 — Polish + per-persona view + customer-#2 readiness check.**
Warehouse-staff tablet view at `/warehouse` (extend the existing dispatch-only page with stock-receipt + adjustments modes). Inventory KPI tile on Finance dashboard (total reserved value placeholder + low-stock count). Empty/loading/error states for every new surface. **Customer-#2 readiness checklist:** verify no Vyara-specific terms in seeded data (warehouse types, movement types, reason codes are all generic); verify CSV import works for a non-Vyara product list; verify warehouse master is plain enough that a Tier 2 single-plant customer sees only one warehouse without UI clutter. *Done when: a Vyara warehouse staffer can run the full slice on a tablet AND we have an honest answer to "could a similar manufacturer onboard against this module in <8 weeks?" — even if the answer is "not yet."*

---

## Definition of done for Slice 2.5

A pilot user can, end to end:

- See Vyara's warehouses with current stock per SKU
- Import or adjust opening stock and see it in the ledger
- Create a project + an order, and see **per-line stock reservation** happen automatically when the order is confirmed
- Dispatch the order with POD and watch stock decrement
- Request a sample and see it draw from sample-stock (not commercial)
- Transfer stock between two warehouses with a full audit trail
- Receive a `stock_low` task when an SKU drops below its min_level

**Mehul's question #7 ("do we have stock to commit?") is now answerable in one click.** The order-to-dispatch flow is no longer dishonest. Sample stock is a real, bounded resource.

Then: Slice 3 (Dealer → portal → orders) opens the dealer/distributor commercial motion. The platform now serves **2 of 4 commercial motions** with real operational depth.

---

## What this slice deliberately does NOT promise

- Customer #2 will not be onboardable in 8 weeks after this slice alone — the platform-readiness work (tenant onboarding UI, configurable seed packs, module-visibility flags, per-tenant subdomain routing) is a separate stream that should run **in parallel** with Slices 3+ rather than waiting for a dedicated slice. Note it in CLAUDE.md after this slice ships.
- No financial valuation of inventory — that's Tally's job, by Constitution Principle #5.
- No production / MRP integration beyond a stubbed "ready-date" read — by design.
- No batch / lot tracking — explicit deferral.
