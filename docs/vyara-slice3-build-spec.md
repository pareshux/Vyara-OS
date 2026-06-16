# Vyara OS — Slice 3 Build Spec (for Claude Code)

> **Read first, every session:** `CONSTITUTION.md` (v2), `docs/vyara-vision-blueprint-v3.md`, `docs/design.md`, and the predecessor specs `docs/vyara-slice2-build-spec.md` + `docs/vyara-slice2.5-build-spec.md`. This spec adds the **Dealer → portal → orders** capability on top of Slices 1 + 2 + 2.5.
>
> **Operating mode (same as 1 / 2 / 2.5):** Six build steps, in order, one at a time. After each: app runs, commit, then continue. Pause only for **genuinely blocking** decisions — max **3 blocking + 5 recommendations** per step, then proceed with a stated assumption. **Build Slice 3 only** — if it's not in scope here, it's out.
>
> **Platform discipline (carry-forward from Slice 2.5):** before merging anything in this slice, ask: *would this work for a similar Tier-1 / Tier-2 building-materials manufacturer ("customer #2") without code changes?* Every new schema, action, and UI piece must pass that test. Dealer flows in particular are the most "Vyara-specific-feeling" area of the platform; resist hardcoding scheme types, ledger conventions, or pricing structures that don't generalize.

---

## The slice

**Dealer → portal → orders** — the dealer / distributor commercial motion. Vyara's dealer network can now self-serve their basic operations (see ledger, place orders, see invoices, see schemes-in-progress) without calling the sales team.

**The capability that must feel valuable:** a dealer logs in to *their own* portal, sees in one screen *"₹X outstanding · Y orders this month · Z pending dispatch · current scheme progress"*, and places a new order from a simple SKU picker — never having to call Vyara's inside-sales desk. On the Vyara side, the team gets a "dealer performance" view that flags dormant accounts and ranks performers without anyone running a spreadsheet.

This is the wedge that **opens commercial motion #4** (dealer/distributor) and is what makes the platform commercially relevant beyond Vyara — most Tier-2 building-materials manufacturers are dealer-led, so dealer support is table-stakes for the second-customer onboarding test.

**Pilot-grade, not production-hardened** — real enough for ~10 active Vyara dealers to use on live orders.

---

## Architecture: continues the modular monolith, adds the multi-persona dimension

Per Constitution Principle #0, the Dealer module owns its own tables (prefix `dealer_*`). Cross-module communication via events; no cross-module writes.

**The new architectural concern in this slice is multi-persona access.** Two different *kinds* of users will share the same Supabase Auth + tenant:

| Persona | Existing in Slice 1+ | New in Slice 3 |
|---|---|---|
| **Internal Vyara staff** (admin / manager / sales_engineer / accounts) | ✓ | unchanged — sees full sidebar, all data scoped to tenant |
| **Dealer users** (one or more users per dealer firm) | — | NEW — sees `/dealer-portal/*`, all data RLS-scoped to *their* dealer_id |

**Implementation pattern:**
- New `dealer_user` table linking `auth.users` ↔ `dealer` (many-to-many — a dealer firm can have multiple users; an auth user is typically only one dealer)
- User JWT extends with `dealer_id` claim (via the same `auth.custom_access_token_hook` already wired in Slice 1)
- New role `dealer` in `user_profile.role` CHECK
- RLS policies: dealer rows visible to that dealer's users; non-dealer-related rows (other dealers' orders, other dealers' invoices) invisible
- App layout layer: a middleware-level check routes role=`dealer` users to `/dealer-portal/*` and blocks `/dashboard`/`/orders`/etc.

**Cross-module event protocol:**
- `dealer.onboarded` → notification module sends welcome (optional in this slice)
- `dealer.order.placed` → same `sales_order` table as internal orders, but with `created_via='dealer_portal'` flag for analytics
- `order.created` already wired (Slice 2) → continues to work; the order ledger entry lands in the dealer's ledger automatically
- `payment.received` already wired (Slice 2) → continues to credit dealer's ledger automatically

The dealer ledger is **derived, not stored** — a SQL view that aggregates invoices (debits) + receipts (credits) + opening_balance + manual adjustments per dealer. This keeps the ledger always reconcilable with the invoice + receipt sources of truth (Constitution Principle #7: one source of truth, no duplicate data).

---

## In scope

- **`dealer` master** — each dealer record references a `firm` (Vyara dealers ARE firms — many already seeded with `type='dealer'`) and adds channel-specific attributes (tier, territory, credit_limit, credit_period_days, dealer_code, is_active, onboarded_at). One firm can be one dealer; not all firms are dealers.
- **`dealer_user`** — links auth users to dealers; supports multiple users per dealer firm.
- **`dealer_contact`** — additional contact records specific to the dealer relationship (different from generic firm contacts; might track e.g. accounts contact, primary salesperson, key decision-maker).
- **Dealer onboarding flow (Vyara-side)** — admin creates dealer record from a firm OR creates a new firm-and-dealer in one form; invites the first dealer user via email (Supabase Auth invite); the invited user signs up, gets `role='dealer'` + `dealer_id` claim.
- **Dealer ledger view** — derived SQL view (`dealer_ledger_v`) showing every transaction affecting the dealer's running balance: invoices (debit), receipts (credit), opening balance, manual adjustments. Always-on, never stale.
- **Dealer order placement (dealer-side)** — a lighter version of `/orders/new` accessible only inside the portal, prefilled with the dealer's identity. Creates a normal `sales_order` row with a new flag `created_via='dealer_portal'` so internal analytics can distinguish.
- **Dealer portal pages:**
  - `/dealer-portal/dashboard` — KPI cards (outstanding, this month's orders, pending dispatch, current scheme progress) + recent activity
  - `/dealer-portal/orders` — list of *only this dealer's* orders, with status; opens individual order detail
  - `/dealer-portal/orders/new` — order placement form
  - `/dealer-portal/invoices` — list of *only this dealer's* invoices, with status and outstanding
  - `/dealer-portal/ledger` — full running ledger view, downloadable as PDF/CSV later
  - `/dealer-portal/profile` — read-only company info + change-password
- **Vyara-team-facing dealer pages:**
  - `/dealers` — list of all dealers with last-order-date, outstanding, scheme status, dormancy flag
  - `/dealers/[id]` — full dealer detail with embedded ledger, recent orders, recent invoices, contact info, edit dealer-master fields
  - `/dealers/[id]/invite-user` — invite a new portal user for this dealer
- **Middleware-level routing rules** — dealer-role users blocked from `/dashboard` / `/orders` / `/inventory` / `/invoices` / `/collections` / `/dealers` and redirected to `/dealer-portal/dashboard`; internal users blocked from `/dealer-portal/*`.
- **Sidebar updates** — internal users get a new "Dealers" item; dealer users get a stripped-down sidebar (Dashboard, Orders, Invoices, Ledger, Profile).
- **RLS policies** for every dealer-touching table so a dealer user can only ever SELECT their own dealer's rows. Critical security boundary — test before declaring done.

## Out of scope (do NOT build in this slice)

- **Schemes / targets / claims engine.** Vision lists them, but the rules engine (target qty/value/period × reward type × eligibility filters) is its own ~3-week build. Defer to Slice 3.5 or later. The dealer dashboard shows a "Schemes" tile but it's a placeholder for now.
- **Dealer-specific pricing / per-dealer price lists.** Important but complex (price-list inheritance, discount cascades, effective dates, approval). Defer. Dealer orders use the same product `mrp` as internal orders for now.
- **Credit-limit enforcement** at order placement. Dealer master has `credit_limit` and the dashboard *shows* "outstanding vs credit limit," but the order-placement flow does not auto-block when limit is exceeded. Flag only.
- **Dealer-side WhatsApp notifications / order updates.** Use the existing in-app notification system; WhatsApp dealer comms is a later AiSensy expansion.
- **Distributor-of-distributor / multi-tier networks.** One dealer = one firm. Sub-dealers are out of scope.
- **Dealer mobile app.** Responsive web portal works on phone; no React Native.
- **Dealer-initiated complaints / service tickets.** Service module is its own slice.
- **Dealer KYC / GST verification.** Manual data entry only; no automated verification.
- **Razorpay payment collection from dealer portal.** Dealer can *see* outstanding but cannot pay online yet (deferred to a fast-follow with the existing Razorpay-pending integration).
- **Dealer-side reporting / BI / custom downloads.** Two fixed views (orders, ledger) only; no custom report builder.

If something feels needed and isn't here, note it and move on.

---

## Minimal data model notes

- `dealer` carries `tenant_id`, `firm_id` (FK to existing firm table; unique — one dealer per firm), `dealer_code` (auto VT-DLR-NNNN, unique per tenant), `tier` ('platinum' / 'gold' / 'silver' / 'bronze' — generic ladder, configurable later), `territory`, `credit_limit`, `credit_period_days`, `onboarded_at`, `is_active`, `dormancy_threshold_days` (configurable per dealer, default 90), audit + soft-delete columns.
- `dealer_user` is `(dealer_id, auth_user_id)` unique. Allows multi-user dealers and multi-dealer users (rare but supported).
- `dealer_contact` (optional in this slice if dealer + firm contacts suffice) — defer if simple.
- `dealer_ledger_v` (SQL view, not a table):
  - debit rows from `invoice` where buyer_firm_id = dealer.firm_id, with date = invoice_date
  - credit rows from `receipt` where invoice.buyer_firm_id = dealer.firm_id, with date = received_at
  - signed amount, running balance computed via window function over date
- `sales_order` gets a new optional column `created_via TEXT DEFAULT 'internal'` with CHECK in ('internal', 'dealer_portal'). Backwards compatible.
- `user_profile.role` CHECK gets 'dealer' added.
- RLS policies on `dealer`, `dealer_user`, `sales_order`, `invoice`, `receipt`, `dealer_ledger_v`: dealer-role users see only rows where the firm/dealer matches their `dealer_id` claim.
- Auth custom token hook is updated to inject `dealer_id` when user has role='dealer' (add to `setup-auth-hook.sql` doc; same pattern as Slice 1).

---

## Stack additions (on top of Slices 1 / 2 / 2.5)

- **None major.** Auth, RLS, multi-tenant patterns all already in place. This slice is primarily about:
  1. New schema (dealer + dealer_user + ledger view)
  2. RLS policy expansion for dealer-scope
  3. New role + middleware routing
  4. New UI surfaces (`/dealers` for Vyara, `/dealer-portal/*` for dealers)

- **One auth-hook update** in `docs/setup-auth-hook.sql` — must be applied manually in Supabase Dashboard (auth schema is restricted on hosted Supabase; same constraint as Slice 1). Action required from the operator after Step 1.

---

## Build sequence (six incremental steps)

**Step 1 — Schema + dealer master + RLS foundations.**
Migration `0011_dealer.sql`: `dealer`, `dealer_user`, `created_via` column on `sales_order`, `user_profile.role` CHECK extension, dealer-scoped RLS policies, `dealer_ledger_v` view. Update `setup-auth-hook.sql` so JWT includes `dealer_id` when role='dealer'. Seed 3 of Vyara's existing dealer-type firms as dealers. *Done when: dealer rows exist for the seeded firms, RLS prevents cross-dealer reads via the service-role check script, the auth hook documentation is updated.*

**Step 2 — Vyara-team dealer admin (list + detail + edit + invite user).**
`/dealers` list with last-order-date + outstanding + dormancy flag; `/dealers/[id]` detail with editable master fields and embedded recent orders + recent invoices + ledger snapshot; invite-user flow that creates an auth.users invite + a dealer_user link + a user_profile row with role='dealer'. *Done when: an admin can create a dealer, invite a portal user, and that user appears as pending in the dealer's detail page until accepted.*

**Step 3 — Dealer portal scaffold + dashboard + middleware routing.**
Middleware checks role and routes dealer users to `/dealer-portal/dashboard`, internal users away from `/dealer-portal/*`. Build a dealer-specific layout (stripped sidebar, dealer name in topbar). Dashboard with KPI tiles (outstanding, this-month orders count, pending dispatch count, schemes placeholder). *Done when: the invited dealer user from Step 2 can log in and see only their portal; attempting to visit `/dashboard` redirects to `/dealer-portal/dashboard`.*

**Step 4 — Dealer-side orders (my-orders + my-orders/new).**
`/dealer-portal/orders` list shows only this dealer's orders, RLS-enforced. `/dealer-portal/orders/new` is a stripped-down order placement form (project optional — defaults to a "general dealer" project per tenant, or allows dealer to pick a tag / job ref), creates `sales_order` with `created_via='dealer_portal'`. Order detail is shared with internal `/orders/[id]` but rendered without internal-only actions (stage advance, manual reservation override). *Done when: a dealer can place an order from the portal, it appears in the Vyara team's `/orders` list with a "via portal" badge, and the dealer can see its status update as Vyara progresses it.*

**Step 5 — Dealer-side invoices + ledger.**
`/dealer-portal/invoices` lists dealer's invoices with status + outstanding. `/dealer-portal/ledger` shows the full `dealer_ledger_v` for this dealer with running balance + filter by date range. Receipt records remain Vyara-side only (dealer cannot record their own receipts; that needs Razorpay or accounts confirmation — out of scope here). *Done when: the dealer sees a coherent ledger that matches what Vyara's accounts team sees on `/dealers/[id]`.*

**Step 6 — Dealer performance + polish + customer-#2 readiness check.**
`/dealers` list gains a "performance" toggle: this-period orders count, this-period revenue, change vs last period, dormancy flag (last_order_date > tenant.settings.dealer_dormancy_threshold_days ago). Dealer dashboard KPI tiles get real numbers. Empty/loading/error states across all 8 new surfaces. **Customer-#2 readiness checklist:** tier levels are generic (no Vyara-specific tier names); dealer roles and permission scoping work for a similar manufacturer without code changes; sidebar layout adapts when dealer module is disabled per-tenant. *Done when: Vyara team sees a meaningful dealer performance view AND a second similar manufacturer could plug in their dealer network with only schema seeds.*

---

## Definition of done for Slice 3

A pilot dealer can, end to end:

- Receive an email invite, complete signup, and land on the dealer portal automatically
- See their outstanding, recent orders, and ledger in one dashboard
- Place a new order from the portal in <2 minutes (pick SKUs, qty, submit) — and watch its status progress as Vyara fulfils it
- See every invoice raised to them, with current outstanding
- See a complete running-balance ledger that ties to Vyara's books

A Vyara admin can, end to end:

- Convert an existing dealer-type firm into a dealer record
- Invite a portal user for that dealer
- View dealer-by-dealer performance (orders, revenue, outstanding, dormancy)
- See dealer-placed orders interleaved with internal orders on `/orders`, distinguished by a "via portal" badge

**Mehul's question #11 ("which dealers are performing?") is now answerable** in one click via the `/dealers` performance view. The platform serves **3 of 4 commercial motions** with real operational depth (architect-specified ✓, direct contractor ~, dealer ✓, tenders still out).

Then: a focused **platform-readiness sprint** (see `docs/customer-2-readiness-audit.md`) — tenant onboarding UI, configurable seed packs, module-visibility flags, master-data importers. With Slice 3 + readiness sprint, the 8-week customer-#2 onboarding test becomes attemptable.

---

## What this slice deliberately does NOT promise

- No schemes / targets / claims engine — placeholder UI only. Real implementation is its own slice.
- No dealer-specific pricing. Same MRP as internal orders. Dealer-specific pricing is a multi-week build with its own approval and effective-date logic; deferred.
- No credit-limit enforcement at order time. Display only.
- No dealer payment collection (Razorpay integration deferred).
- No dealer mobile-native app. Responsive web works on phones; that's enough.
- No automated WhatsApp dealer alerts. Manual or via in-app only.
- No dealer-side reporting beyond the two fixed views.
- The customer-#2 8-week onboarding is **still gated** on the parallel readiness sprint — Slice 3 narrows the gap (dealer is one of the larger missing capabilities) but does not by itself close it.
