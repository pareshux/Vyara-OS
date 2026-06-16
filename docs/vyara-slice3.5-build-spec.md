# Vyara OS — Slice 3.5 Build Spec (Masters & Configuration)

> **Read first, every session:** `CONSTITUTION.md` (v2), `docs/vyara-vision-blueprint-v3.md`, `docs/design.md`, and the predecessor specs (Slices 1 / 2 / 2.5 / 3). This slice adds the **Masters & Configuration** layer on top of Slices 1 + 2 + 2.5 + 3.
>
> **Operating mode (same as before):** Six build steps, in order, one at a time. After each: app runs, commit, then continue. Pause only for **genuinely blocking** decisions — max **3 blocking + 5 recommendations** per step, then proceed with a stated assumption. **Build Slice 3.5 only** — if it's not in scope here, it's out.
>
> **Foundational audit (from CLAUDE.md, applies to every step):** before writing code, surface findings on data inputs / outputs / master dependencies / CRUD completeness / action-UI symmetry / cross-module coupling / customer-#2 readiness. Let the user decide before building.

---

## The slice

**Masters & Configuration** — the tenant-configurable reference data that every customer-#2 manufacturer needs to set up before they can use the platform. Today these values are hardcoded throughout the codebase (GST is always 18%, payment terms always 30 days, dealer tiers free-text, vendor data missing entirely, every quote line is hand-priced). After this slice, a Vyara admin (or any future tenant's admin) configures these in one place; the rest of the platform reads them.

**The capability that must feel valuable:** inside-sales creates a quote → the system **auto-fills the unit price from the active price list for that customer's segment** instead of forcing a hand-typed value. Accounts creates an invoice → the system **auto-fills GST % and payment terms from the customer's profile** instead of defaulting to 18% / 30 days for everyone. Admin opens `/admin` → sees one screen with **Price lists · Taxes · Payment terms · Vendors · Tiers · Territories** and can edit each without engineering. That's "the system bends to the business" instead of the other way around.

**Pilot-grade, not production-hardened** — enough for Vyara to configure their own ladder + for a second similar manufacturer to plug in theirs in days, not weeks.

---

## Why this slice now

Per `docs/customer-2-readiness-audit.md` (post-Slice-3): the 8-week customer-#2 onboarding test is currently at **3–4 months**. The two largest unaddressed gaps are:

1. **Master data is hardcoded** — GST %, payment terms, dealer tiers, territories, code prefixes. A second manufacturer would need code changes to set their own values.
2. **No pricing system** — every quote is hand-typed. A second manufacturer can't "load their catalog and start quoting in week 1."

Slice 3.5 closes both. The platform-readiness sprint that follows can then focus on tenant onboarding + module visibility + master importers, not on retrofitting masters into already-built modules.

---

## In scope

- **Tax-rate master** — multiple GST/tax rates per tenant (e.g., 5% / 12% / 18% / 28%); one designated as default for invoice fallback; per-product-category overrides supported via a `default_tax_rate_id` on `product` (added in this slice, nullable).
- **Payment-terms master** — named terms ("Net 30", "Net 45", "Advance 50%/Balance on delivery"), `days` integer, optional `description`. Default tenant-wide; per-dealer override via `dealer.default_payment_term_id` (new column).
- **Vendor master (thin)** — generic vendor entity referencing `firm` (1:1 like `dealer`); vendor_type ('supplier' / 'transporter' / 'contractor' / 'service' / 'other'); lead_time_days; default_payment_term_id; notes. Not procurement — see "Out of scope".
- **Price-list master** — header (name, segment, region, effective_from/to, currency, is_default) + per-product entries (price, min_qty for tiered pricing, valid_from/to). One product can appear in multiple lists with different prices. Active price-list lookup at quote/order time picks the most-specific match: tenant default → segment → region → customer-specific override (later).
- **Dealer-tier master** — id, code, label, color, order_index. Replaces the free-text `dealer.tier` (existing values migrated). Tier becomes FK; UI uses dropdown sourced from this master.
- **Territory master** — id, code, label, parent_territory_id (for hierarchical regions), is_active. Replaces TEXT columns on `user_profile.territory`, `project.territory`, `dealer.territory` (existing values migrated to matching rows OR kept as TEXT alongside FK in transition — see Decision).
- **Admin Settings UI** — `/admin` sidebar entry visible to role=admin/manager only. Index page lists configurable areas; each area gets its own CRUD page (`/admin/taxes`, `/admin/payment-terms`, `/admin/vendors`, `/admin/price-lists`, `/admin/dealer-tiers`, `/admin/territories`).
- **Wiring:**
  - Quote creation: when picking a product, fetch the active price-list entry for that product; pre-fill `unit_price` (overridable). Show "from list X" indicator.
  - Internal order creation + dealer-portal order creation: same lookup.
  - Invoice creation: GST % auto-fills from product's `default_tax_rate_id` → tenant default; payment_terms_days auto-fills from customer/dealer's `default_payment_term_id` → tenant default.
- **Seed data:** Vyara-specific defaults (3 tax rates, 3 payment terms, 2 dealer tiers, 4 territories, 1 default price list with all 10 SKUs). Migration explicit about being Vyara seeds, not platform defaults.

## Out of scope (do NOT build in this slice)

- **Discount matrix / scheme engine.** Per-customer discount tiers, volume discounts, scheme rewards. Big design; later slice.
- **Per-customer price-list override.** Only segment + region resolution in this slice; individual-customer overrides defer to a later slice.
- **Approval workflows on master changes.** Admin edits go live immediately; audit log captures who-changed-what. No multi-step approval.
- **Vendor procurement / PO module.** Vendor master is reference data only — no purchase orders, no GRN matching, no procurement optimisation (Constitution Principle #5).
- **Raw-material inventory tied to vendors.** Stays in finished-goods land; raw materials + vendor coordination is a future slice (Slice 5+ if it becomes needed).
- **Notification template master.** Tenants editing dunning copy from UI is deferred to readiness sprint.
- **Product attribute masters** (brand / finish / colour / thickness / packaging). TEXT columns continue to work; FK promotion is a later cleanup.
- **Tax-jurisdiction logic.** Single tax rate per product; no state-wise / interstate / IGST vs CGST/SGST split (Tally handles the accounting layer of this).
- **Bulk-edit / CSV import for masters.** Admin UI is one-row-at-a-time; CSV importers come in the readiness sprint.
- **Reason-code masters** (movement reasons, cancellation reasons). Current text-on-rows works; FK promotion is later.
- **Module visibility per tenant** (Constitution Principle #11). That's a readiness-sprint concern.

If something feels needed and isn't here, note it and move on.

---

## Minimal data model notes

- All master tables carry `tenant_id`, audit cols, soft-delete (`is_active`/`deleted_at`), and RLS by tenant. Single shape; no fancy inheritance.
- `tax_rate` (id, tenant_id, code, label, rate_pct, is_default, sort_order, is_active, audit). UNIQUE (tenant_id, code) WHERE deleted_at IS NULL.
- `payment_term` (id, tenant_id, code, label, days, description, is_default, sort_order, is_active, audit).
- `vendor` (id, tenant_id, firm_id UNIQUE, vendor_code auto VT-VND-NNNN, vendor_type CHECK, lead_time_days, default_payment_term_id, notes, is_active, audit). Same 1:1-to-firm pattern as `dealer`.
- `dealer_tier` (id, tenant_id, code, label, color, sort_order, is_active, audit). UNIQUE (tenant_id, code).
- `territory` (id, tenant_id, code, label, parent_territory_id REFERENCES territory(id), is_active, audit). Self-FK enables hierarchy.
- `price_list` (id, tenant_id, code, label, segment, region, currency DEFAULT 'INR', effective_from, effective_to, is_default, is_active, audit).
- `price_list_entry` (id, tenant_id, price_list_id, product_id, unit_price, min_qty DEFAULT 0, valid_from, valid_to, audit). UNIQUE (price_list_id, product_id, min_qty).
- **Wiring columns added to existing tables:**
  - `product.default_tax_rate_id UUID REFERENCES tax_rate(id)` (nullable)
  - `dealer.default_payment_term_id UUID REFERENCES payment_term(id)` (nullable)
  - `dealer.tier_id UUID REFERENCES dealer_tier(id)` (nullable; existing `tier TEXT` kept as fallback for one-slice transition window)
  - `firm.default_payment_term_id UUID REFERENCES payment_term(id)` (nullable; for non-dealer customers)
- **Price-list lookup helper** (SQL function): `get_active_price(p_tenant UUID, p_product UUID, p_segment TEXT, p_region TEXT, p_qty NUMERIC) RETURNS NUMERIC` — encapsulates the resolution logic so quote/order actions don't re-implement it.

---

## Stack additions (on top of prior slices)

- **None.** Pure schema + UI + wiring work. No new services, no new external dependencies.

---

## Build sequence (six incremental steps)

**Step 1 — Tax + Payment Terms masters + Admin Settings shell.**
Migration `0013_tax_payment_term.sql`: `tax_rate` + `payment_term` tables + audit columns + seed (Vyara's 3 GST rates + 3 standard payment terms). Add `product.default_tax_rate_id`, `dealer.default_payment_term_id`, `firm.default_payment_term_id` columns. `/admin` sidebar entry (admin/manager only). `/admin` index page listing all configurable areas. `/admin/taxes` + `/admin/payment-terms` CRUD pages. *Done when: admin can add a 12% tax rate, set it as default for a product, change a dealer's default payment terms.*

**Step 2 — Price-list schema + admin CRUD UI.**
Migration `0014_price_list.sql`: `price_list` + `price_list_entry` tables + `get_active_price()` SQL function with resolution logic. Seed: one tenant-default price list with all 10 Vyara SKUs at MRP. `/admin/price-lists` list page + `/admin/price-lists/[id]` detail page with entry CRUD (per-product price + min_qty + validity). *Done when: admin can create a "Dealer pricing — 2026" list, set special prices for top 5 SKUs, see it as the active list for segment='dealer'.*

**Step 3 — Vendor + Dealer-Tier + Territory masters.**
Migration `0015_vendor_tier_territory.sql`: `vendor` + `dealer_tier` + `territory` tables. Promote `dealer.tier_id` FK alongside existing TEXT. Seed: Vyara's 4 tiers (platinum/gold/silver/bronze) + 4 territories (Surat North/South/Ahmedabad/Other Gujarat). `/admin/vendors`, `/admin/dealer-tiers`, `/admin/territories` CRUD pages. Update `/dealers/[id]` edit dialog to use tier-master dropdown (TEXT fallback when no matching tier row). *Done when: tier in dealer edit is a dropdown sourced from the master; admin can add a new "Diamond" tier.*

**Step 4 — Price-list wiring (quotes + orders).**
Update `createQuotation`, `createOrderManual`, `createOrderFromQuote`, `placeDealerOrder` actions to call `get_active_price()` per line and pre-fill `unit_price`. Quote/order line UI gains a "Price from {list label}" indicator next to auto-filled prices; user can override (override is recorded in a per-line `price_override_reason` field — schema add). *Done when: creating a quote for a dealer-segment customer auto-fills prices from the dealer pricing list; a sales engineer can override with a reason logged.*

**Step 5 — Tax + Payment Terms wiring (invoices).**
Update `createInvoiceManual` action: resolve `gst_pct` from line's product `default_tax_rate_id` (use majority rate when mixed) → fallback to tenant default tax rate. Resolve `payment_terms_days` from buyer firm/dealer's `default_payment_term_id` → fallback to tenant default. `/invoices/new` form: show resolved defaults but allow override per invoice. *Done when: raising an invoice for "Shree Constructions" auto-fills 30-day terms (their default); raising for "Surat Pavers Distributors" auto-fills 45-day terms (their default).*

**Step 6 — Polish + readiness audit + admin navigation.**
Empty/loading/error states across all 6 admin pages. Admin sidebar gets a "Settings" group containing the 6 master entries. Update `docs/customer-2-readiness-audit.md` with post-Slice-3.5 findings (headline should narrow further). Update CLAUDE.md. *Done when: an admin can complete the full setup loop (create tax → create payment term → create price list → place a quote → it picks up all three master values) in under 10 minutes.*

---

## Definition of done for Slice 3.5

A Vyara admin can, end to end:
- Open `/admin` and see 6 configurable areas
- Add a new tax rate, mark it default for a product category
- Add a new payment term ("Advance 25% / Balance 60") and set it as a dealer's default
- Create a price list, add entries for 10 products, set effective dates
- Raise a quote for a dealer — prices auto-fill from the price list, GST auto-fills from the product, payment terms auto-fill from the dealer

A would-be **customer #2** can, end to end (hypothetical — actually tested in the readiness sprint):
- Get a fresh tenant with seed templates
- Use the admin UI to configure their own tax rates, payment terms, dealer tiers, territories
- Bulk-load their price list via the admin UI (one-row-at-a-time for now; CSV in readiness sprint)
- Start quoting on Day 5 instead of Day 30

After this slice, the **customer-#2 readiness audit headline should narrow to ~6-8 weeks** (down from 3-4 months) once paired with the readiness sprint that follows.

---

## What this slice deliberately does NOT promise

- Pricing rules engine (volume discounts, customer-specific overrides, time-based promotions). Single-rate-per-(list, product, min_qty) only.
- Notification template editing. Dunning copy is still in code.
- Approval workflow on master edits. Direct edits with audit log only.
- Module visibility per tenant. Comes in the readiness sprint.
- CSV importers for masters. One-row-at-a-time in this slice.
- Vendor procurement / raw material flow. Vendor master is reference data only.
- Reason-code or product-attribute masters. TEXT works for those.
- The customer-#2 8-week target by itself — Slice 3.5 narrows the gap significantly but **the readiness sprint that follows is still required** to fully close it (tenant onboarding UI, seed packs, module visibility, master CSV importers).
