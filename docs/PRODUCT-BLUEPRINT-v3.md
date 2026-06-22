# Vyara OS — Product Blueprint v3 (LOCKED)

> **This is the source of truth.** Architecture is frozen here. Future work routes through this document. Update the Status Tracker (§11) on every meaningful commit; append a one-line entry to [`BUILD-LOG.md`](./BUILD-LOG.md). Do not create new top-level capabilities. Do not reorganize the eight that exist.
>
> **Last updated:** 2026-06-23 (Procurement P4α shipped — Purchase Requisitions. The pre-procurement demand-capture step is live. DEL-015 flipped from 📋 P4 to ✅ Partial (PR→PO conversion to P4β; RFQ + CS to P4β/γ). Migration 0067 ships purchase_requisition + _line schema with sequence + render_tenant_code trigger + 3-band approval policies seeded for entity_type='purchase_requisition'. 6 server actions in `lib/actions/purchase-requisitions.ts` (create, submit-with-auto-approve-under-50k, sync, cancel, list, get + 3 form pickers). 3 routes: list with 7-status filter + 4-KPI strip; new form with project picker + dynamic line table + live total + threshold routing hint; detail with header + meta + justification + inline ApprovalCard + rejection/cancellation/PO-raised banners + 7-column line table + Submit/Cancel workflow island. Sample data (migration 0068): 3 PRs across draft / pending-mid-band-approval / approved states (Vyara pigment ₹1.80L + Raj Adani cables ₹4.20L + Raj L&T Schneider ₹2.80L). Procurement landing extended with "New requisition" CTA + Purchase requisitions tile showing live awaiting/approved count. The full procurement chain is now: **PR → PO → GRN → Vendor Bill (3-way matched) → Payment (with TDS) → AP ageing → MSME compliance → Reversal/Voucher/NEFT/MSME-1 exports** end-to-end (with PR→PO conversion still a manual handoff until P4β; RFQ + CS still TODO). Earlier in the day: Procurement P3β shipped — output formats: payment voucher PDF + NEFT bank-file CSV + posted-payment reversal + MSME-1 half-yearly CSV. Migration 0066 extends vendor_payment.status enum with 'reversed' + adds reversed_at/by/reason columns + indexes. `reverseVendorPayment` action mirrors postVendorPayment in reverse with atomic 3-step state advance (flip status; decrement bill.amount_paid + recompute outstanding + status per remaining payments; rollback on failure). Voucher PDF at `app/(print)/procurement/payments/[id]/voucher/page.tsx` follows the PO PDF + quote BOQ pattern — vendor + beneficiary-bank blocks, TDS breakdown card, money grid with red TDS line + emerald net-paid grand total, reversed-voucher banner. Two route-handler CSV exports: `/api/procurement/payments/export-neft?from=&to=` (date-range NEFT/RTGS batch in generic Indian-bank format with proper CSV-escaping; `<NeftExportButton>` dropdown on /procurement/payments with last-30-days default), `/api/procurement/ap-ageing/export-msme1` (MSME-1 form intent — vendor/PAN/UDYAM/bill/invoice/dates/amount/days/reason; "Export MSME-1 (N)" CTA on /procurement/ap-ageing only when breach_count > 0). Payment detail extended with "Print voucher" link (border-only button) + "Reverse payment" button (posted state) opening confirmation dialog with reason category + optional note. Payment list filter extended with 'reversed' state. FIN-021 still ✅ Partial pending Form 16A + 26Q quarterly (P3γ); FIN-022 now ✅ (only per-bank NEFT dialect strings remain — P3γ if asked). FIN-020 now fully ✅ (MSME-1 CSV ships; PDF format on demand). Architectural call: bank-file dialects deferred because schema captures everything; only column-order strings differ per bank. Per-bank format becomes a tenant.settings choice in P3γ. Earlier in the day: Procurement P3α shipped — Vendor payments + TDS engine. **The full procurement chain is now end-to-end walkable: PO → GRN → Vendor Bill (3-way matched) → Payment (with TDS) → bills auto-flip to partly_paid/paid → AP ageing updates.** FIN-021 (TDS) flipped from 📋 P3 to ✅ Partial (Form 16A + 26Q → P3β). FIN-022 (Payment scheduling) flipped from 📋 P3 to ✅ Partial (NEFT bank file export + voucher PDF → P3β). Migration 0064 ships vendor_payment + vendor_payment_allocation schema with sequence, render_tenant_code trigger, code templates VT-PAY-* / RA-PAY-*. `lib/procurement/tds-engine.ts` is the pure-function TDS suggestion engine (suggestTds + computeTds) extracted from the use-server action — pattern lock from P2α. Auto-suggests section based on vendor_type: supplier→194Q@0.1%, contractor→194C@1%, service→194J@10%, 'other'→manual. PAN-availability check triggers §206AA fallback rate (20% for C/J, 5% for Q) with reason string visible in the form. `lib/actions/vendor-payments.ts` ships 6 actions: createVendorPayment / postVendorPayment (atomic; flips bill.status to paid when outstanding=0, partly_paid otherwise) / cancelVendorPayment / listVendorPayments / getVendorPayment + 2 form pickers (listVendorsWithOutstanding, getBillsForPayment reusing ageing view for msme_flag + days_overdue context). 3 new pages + 1 detail extension: `/procurement/payments` list with KPI strip (net paid this month, TDS deducted, drafts) + status/mode filters; `/procurement/payments/new` two-mode (vendor picker + pre-bound) with multi-bill allocation checkboxes + per-line max + live gross/TDS/net preview; `/procurement/payments/[id]` detail with money tiles + vendor block (PAN or §206AA warning) + TDS deposit-by-7th reminder + allocations linking back to bills + Post/Cancel workflow; bill detail extended with "Pay vendor" CTA + Payments section. Sample data (migration 0065): VT-PAY-2026-0001 fully pays VT-VB-2026-0001 (₹1.30L gross, ₹130 TDS §194Q@0.1%, ₹1.29L net NEFT) → bill flips to `paid`; RA-PAY-2026-0001 backfills the legacy ₹3L on-account against RA-VB-2026-0007 (no TDS — pre-flow legacy entry, documented). Procurement landing's "Payment + TDS" marker swapped for a live link; remaining gaps: P3β follow-on (NEFT bank file + Form 16A + 26Q + MSME-1 PDF) and P5 (GSTR-2B). Earlier in the day: Procurement P2β shipped — AP ageing dashboard + MSME 45-day compliance signal. DEL-019 flipped from 📋 P2β to ✅ Partial (vendor-side dunning queued to P3 since Indian B2B doesn't auto-dun ourselves on payables — that direction belongs to the vendor). FIN-020 flipped to ✅ Partial (MSME-1 filing format queued — surface the signal first; the filing happens when a real tenant approaches the biannual cycle). Migration 0063 ships `vendor_bill_ageing_v` view with `security_invoker=true` (per the 0047 cross-tenant fix) + 5 backdated sample bills exercising every overdue bucket + MSME breach/warning states. `lib/read-models/ap-ageing.ts` aggregates over one view query: totals, 5-bucket rollup with stacked-bar percentages, top-10 vendor outstanding, MSME breach + warning lists. `/procurement/ap-ageing` page with 4-KPI strip (outstanding / overdue / MSME breach count / MSME approaching count), stacked-bar bucket visualization with clickable filter tiles (URL ?bucket=…), MSME compliance card with rose breach + amber warning sections (each row shows "X days past 45-day limit" or "X days to limit"), top-vendor card with MSME badge inline, filtered bills list at bottom. Procurement landing's "AP ageing + MSME 45-day" gap marker swapped for a live link; gaps now point to FIN-021/022 (P3 payment + TDS) and FIN-023 (P5 GSTR-2B). Architectural call: the bucket strip + top vendors + MSME sections always render the full universe regardless of bucket filter (mirrors /collections + /owner Slice 2) — clicking 1-30 doesn't make the other 4 buckets invisible. Sample data spread: Vyara has MSME breach (50d) + 1-30 overdue (25d) bills; Raj has MSME warning (35d) + 31-60 overdue (55d) + 61-90 overdue partly_paid (70d, ₹12.1L). Earlier in the day: Procurement P2α shipped — Vendor Bill core + 3-way match engine. DEL-018 flipped from 📋 P2 to ✅ Partial (P2β AP ageing + P3 payment are the only remainders). **Migrations 0061+0062** add vendor_bill + vendor_bill_line schema with purchase_order_line.qty_billed cumulative tracker, sequences + render_tenant_code triggers, code templates VT-VB-* / RA-VB-*, approval policies mirroring PO bands. Sample data: one clean-match approved bill on Vyara (₹1.30L matches VT-PO-2026-0004 exactly), one rate-mismatch submitted bill on Raj (vendor invoiced ₹1.85L/VFD vs PO ₹1.75L — engine flags it before submit). **3-way match engine** lives at `lib/procurement/match-engine.ts` as pure functions; extracted from `lib/actions/vendor-bills.ts` because Next.js requires every export in a `'use server'` module to be async. Per-line check precedence: qty_over (cap = qty_received − qty_billed across all bills) → rate_mismatch (strict equality) → gst_mismatch → hsn_mismatch (warn-not-fail when either side missing) → unlinked → matched. Bill-level aggregate goes 'mismatched' if any hard issue, 'under_review' if any unlinked, 'matched' otherwise. 6 server actions in `lib/actions/vendor-bills.ts`: createVendorBill / submitVendorBill (auto-approves sub-₹50k; calls applyApprovedBillEffects which increments po_line.qty_billed) / cancelVendorBill / listVendorBills / getVendorBill + 2 form pickers (getPoForBilling, listPosForBilling). UI shipped: `/procurement/bills` (list with status + match filter + KPI strip showing outstanding / overdue / mismatched / drafts), `/procurement/bills/new` (picker + pre-bound modes; live mismatch preview before submit), `/procurement/bills/[id]` (8-column match grid with side-by-side PO rate column + diagnostic notes per line + inline ApprovalCard + MSME 45-day reminder + money tiles with overdue tint). PO detail extended with "Book vendor bill" CTA + Vendor bills section. Procurement landing now shows Vendor bills as Live ✓. 4 routes (`/procurement/bills`, `/procurement/bills/new`, `/procurement/bills/[id]`, PO detail) verified compiling + 307 to /login for unauth. Architectural call: 3-way match runs server-side on create AND when displaying detail (cheap pure-function recheck); never blocks submit — even mismatched bills can be submitted with an extra confirm dialog, since real-world reality requires booking the invoice even when it disagrees with the PO (the approver sees the diagnostics). Earlier in the day: Procurement P1γ shipped — Return to Vendor + PO PDF + product-linked sample PO. DEL-017 flipped from "✅ (RTV → P1γ)" to fully ✅. **6 new server actions** in `lib/actions/return-to-vendor.ts` driving the RTV state machine that REVERSES the GRN post path (flip status → decrement po_line.qty_received → recompute parent PO status back down → write `movement_type='return_to_vendor'` stock movements; `recordVendorCreditNote` for the credit-note round trip). **3 new pages** under `/procurement/returns` + a new RTV form at `/procurement/grns/[id]/return`. GRN detail extended with the "Return to vendor" CTA + Returns section. **PO PDF** at `/procurement/orders/[id]/pdf` under the `(print)` route group (mirrors `/quotes/[id]/boq` pattern with bill-to/ship-to/vendor snapshots, IGST-vs-CGST+SGST split detected per PO, terms enumerated from header fields + standard Indian B2B clauses). PO detail header gets a "Print PDF" button. **Schema changes:** migration 0059 (`return_to_vendor` + `_line` tables, stock_movement.movement_type CHECK extended to admit `'return_to_vendor'`, new sequence + render_tenant_code-aware trigger, next_code_sequence RPC extended, per-tenant code templates seeded VT-RTV-* / RA-RTV-*). Migration 0060 (product-linked sample POs — VT-PO-2026-0006 200 sqft pavers + RA-PO-2026-0007 10 mtr LT cable, both sub-₹50k so user can walk submit → auto-approve → send → receive and finally **see stock_movement land on /inventory** — the previously-seeded POs were all ad-hoc text lines so the stock path was untested in P1β). `tsc --noEmit` clean; 4 new routes (`/procurement/returns`, `/procurement/grns/[id]/return`, `/procurement/orders/[id]/pdf`, `/procurement/orders/.../receive` already existed) all 307 to /login for unauth as expected. Architectural decision recorded: RTV is a separate entity (not a negative-qty GRN) because it represents the buyer's debit note in Indian accounting paradigm; the vendor's credit note is the round-trip captured via `recordVendorCreditNote`. Earlier in the day: Procurement P1β shipped — Goods Receipt Note end-to-end. DEL-017 flipped from "✅ Partial (schema)" to "✅" (RTV the only remainder, lifted to P1γ). 5 new server actions in `lib/actions/goods-receipt-notes.ts` driving the GRN state machine (draft → posted with atomic 4-step advance: GRN flip → po_line qty_received/qty_rejected increment → PO status recompute → stock_movement writes for product-linked lines via the existing polymorphic FK pattern); best-effort rollback on intermediate failure. 3 new pages: `/procurement/orders/[id]/receive` (heavy client form with per-line greedy-receive defaults, rejection reason required when rejected > 0, paperwork capture including e-way bill + QC status, save-as-draft vs save-and-post), `/procurement/grns` (list with 3-status filter), `/procurement/grns/[id]` (detail with status + QC pill + draft-only Post/Cancel client island). PO detail extended: "Receive goods" CTA gated on PO status + unfulfilled-qty test, new "Goods receipts" section listing GRNs against the PO, per-line "X/Y received" inline indicator under each line description. Procurement landing's DEL-017 gap marker replaced with a live link to `/procurement/grns`. Sample data: 1 fully-received GRN for VT-PO-2026-0004 → PO status now `received`; 1 partly-received GRN for RA-PO-2026-0005 → PO status now `partly_received` (received 1 of 2 VFDs + all 4 SFUs, bus duct still pending). Both demonstrate `stock_movement` would write rows when product_id is set (PO lines in the seed are ad-hoc text, so this exercise will repeat in P1γ with product-linked lines). `tsc --noEmit` clean; 3 new routes 307 to /login for unauthenticated curl as expected. Architectural call recorded: GRN posting uses the polymorphic `(related_entity_type, related_entity_id)` on `stock_movement` rather than adding po_id/grn_id FK columns — preserves the existing convention used by dispatch_issue / sample_issue / etc. Earlier in the day: Procurement P1α shipped — full operational PO backbone for Indian B2B. The user asked "how does procurement work in our inventory module + can the customer manage everything here?" → I audited the codebase honestly (we had `vendor` table as a thin master + stock-receipt with reason='purchase' but NO PO / GRN / AP — Constitution v3 §5 already broadened procurement into scope for industries that need it), mapped the complete 10-stage Indian procurement domain (PR → RFQ → CS → PO → advance → GRN → vendor invoice → 3-way match → TDS → payment → MSME/GSTR-2B), phased it into 6 phases, then PO-decided + built P1α as one slice. Rolled out: migrations 0054 (procurement schema — vendor KYC extensions adding PAN/MSME/bank/payment-terms/gst-state-code + `purchase_order` + `purchase_order_line` with full Indian GST line model + `goods_receipt_note` + `_line` schema for P1β consumer + sequences + auto-number triggers + `next_code_sequence` RPC extended) and 0055 (per-tenant `purchase_order` + `goods_receipt_note` code templates for both Vyara `VT-PO-*` and Raj `RA-PO-*`; approval policies seeded for both tenants with ₹50k-5L manager / ₹5L-25L manager+admin / ₹25L+ admin bands; sub-50k auto-approves). `lib/actions/purchase-orders.ts` ships 6 actions: create / submit / send / cancel / list / get plus 4 picker queries; the create action does the IGST vs CGST+SGST split server-side based on vendor.gst_state_code vs warehouse state via a 38-row STATE_CODES lookup; line-insert failure rolls back the PO header via soft-delete. UI shipped at `/procurement` (KPI strip + recent POs + honest "coming next" gap markers for GRN/AP/MSME), `/procurement/orders` (8-status filter chips + receive-% chip), `/procurement/orders/new` (multi-section form with live tax-split chip on every line as the user types qty/rate/discount/gst%), `/procurement/orders/[id]` (header + ApprovalCard inline + 9-column line table + IGST or CGST+SGST totals + terms + audit footer + MSME 45-day reminder when vendor is MSME). Vendor master form extended with 4 sections (tax+statutory / bank / contact / notes) + GSTIN + PAN regex validation. Sidebar new "Procurement" item under Delivery group. Tally vs Native AP architectural decision recorded: per-tenant `procurement.ap_master` feature flag, default `tally` (CRMOS does PO + GRN, Tally remains AP master), `native` flips it when a tenant has outgrown Tally — schema spot reserved in PLAT-028, full adapter lands with P2. 15 new Blueprint rows added: PLAT-028 · REL-016 · DEL-015..023 · FIN-019..023. **Deferred to P1β (next slice):** GRN consumer UI (schema lives in 0054; server actions + UI come next), RTV, PO PDF + WhatsApp/email send, open-PO read-model with vendor + category breakdowns. **Deferred to P2+:** vendor bills, 3-way match, AP ageing, MSME-1 reporting, TDS, GSTR-2B. All migrations applied to remote; `tsc --noEmit` clean; all 4 procurement routes compile cleanly via dev server; 307 redirects to /login for unauthenticated curl as expected. Earlier in the day (2026-06-23): Raj demo Phases 1+2+3+4+5a+6 ALL SHIPPED OVERNIGHT — 6 commits, 8 migrations applied, 26+ new tests passing, every commit gate green. Two real bugs fixed along the way: (a) cross-tenant data leak via PG views that ran with owner BYPASSRLS privileges (migration 0047 forced security_invoker=true on invoice_ageing_v + dealer_ledger_v); (b) all 5 auto-generated number triggers hardcoded VT-* prefix regardless of tenant (migration 0051 introduced render_tenant_code DB helper + rewrote all 5 triggers to read tenant.settings.codes.<kind> with VT-* fallback). CS-001 + CS-009 both ✅ shipped as real Sprint 2 items (not throwaway demo work) — full server actions + UI + tests + integration test scripts. Raj tenant fully populated (5 firms, 12 contacts, 8 electrical products, 4 projects, 4 quotations, 3 sales orders, 1 invoice, 3 complaints with 11 history transitions, 2 AMC contracts with 16 scheduled visits, gates for drawings_approved on both pipelines). User walk-through pending — see `OVERNIGHT-NOTES.md` for the punch list, open questions, deferred items, and recovery instructions. **Original ~3-week estimate compressed to overnight pass because the audit pattern shrunk each phase substantially.** Earlier in the day: Raj demo Phase 1 shipped (raj-avinsys tenant provisioned + Raj-shaped pipeline templates seeded + /demo landing page live). **Phase 1 deliverables in main:** migration 0045 (2 new system visit_purpose codes — drawing_review_meeting, fat_witness — broadly useful for any EPC/electrical/HVAC tenant per cross-industry-by-configuration principle); raj-avinsys tenant provisioned via `scripts/onboard-tenant.ts` (tenant UUID `aa1a50b2-24b7-441d-8708-6d91e750c4d3`, 10 feature flags with `enable_dealer_portal=false`, admin user `admin@rajavinsys.example`); 30 tenant-scoped pipeline_stage rows seeded via new `scripts/seed-raj-pipeline.ts` (18 EPC + 12 Panel — segments `epc_project` and `panel_order` since there's no `pipeline_template` table, segment IS the template proxy); `/demo` landing page (`app/demo/page.tsx` + `actions.ts`) with two "Sign in as…" cards. **Key discoveries during the audit:** (a) NO `pipeline_template` table exists — stages hang directly off tenant_id + segment TEXT; (b) all 3 relationship_types I planned for Raj (industrial_buyer / epc_consultant / oem_partner) already exist as system rows in `relationship_type_master` from migration 0031 — cross-industry vocabulary turned out to already cover EPC; (c) only 2 of 6 originally-planned visit_purpose codes were genuinely new (rest already in 0032's seed); (d) onboarding CLI's `.passthrough()` on features schema let stray `_comment_*` keys leak through and blow up the `tenant_feature` insert — fixed by removing comments from configs (script hardening deferred); (e) PostgREST `.upsert()` couldn't infer the partial unique index on `(tenant_id, segment, stage_key)`, switched to delete-then-insert pattern. **Walked end-to-end:** both /demo cards sign in cleanly; Vyara experience unchanged; Raj tenant empty as expected (Phase 2 = mock data). Phase 1 is also the first real test of the platform thesis — most of the audit findings reinforced that "configuration covers most industry variation" (existing system masters covered 80% of Raj's vocabulary without changes). **~3 days estimate → actual ~3 hours** (smaller than expected because the audit revealed most pieces already existed). **Phases 2–6 still planned:** mock data → CS-001 complaints → CS-009 AMC → drawing-approval gate → Vyara-isms hunt.)
> **Supersedes:** `vyara-vision-blueprint-v3.archived.md`
> **Constitution alignment:** [`CONSTITUTION.md`](./CONSTITUTION.md) v2 — Product Principles #0–#11 remain binding. This document refines the module partitioning referenced in Principle #0.

---

## 0. Foundations (locked)

### 0.1 What we are building

A modular **Business Operating System** for manufacturing, contracting, distribution, and service companies. Industry behavior comes from **configuration + masters + activity types** — never from new top-level modules.

### 0.2 The eight capabilities (locked, do not rename, do not reorganize)

| # | Capability | One-line purpose |
|---|---|---|
| 1 | **Relationship** | Manage people and organisations |
| 2 | **Revenue** | Generate business |
| 3 | **Delivery** | Fulfil commitments |
| 4 | **Field Operations** | Activity-based execution in the field |
| 5 | **Customer Success** | Post-sales — make customers stay |
| 6 | **Finance** | Business finance (not accounting ERP) |
| 7 | **Intelligence** | Business intelligence + AI |
| 8 | **Platform** | Shared infrastructure |

### 0.3 The Module Design Rule (locked)

A top-level module corresponds to a **business capability**, never to a **department, persona, or relationship type**. "Dealer," "Vendor," "Architect," "Engineer," "Field Sales" are *not* modules. They are types within capabilities.

### 0.4 Industries this architecture must support — without any architectural change

- Building Materials (Vyara — launch customer)
- Electrical Contractors
- Industrial Manufacturers
- HVAC
- Engineering Companies
- Distributors
- Fabricators
- Service Businesses

Industry-specific behavior is absorbed through:
- `relationship_type` master vocabulary
- Pipeline templates + stages + gates
- `field_activity_type` master vocabulary
- Outcome vocabularies
- Approval policies + thresholds
- Dashboard layouts + alert rules
- Custom fields (when introduced)

Same schema. Same modules. Different configuration.

---

## 1. Existing → capability map

Every artefact in the codebase placed under one of the eight. Where the placement is exact, it stays; where it's awkward, the smallest reframing is noted.

### 1.1 Tables (current 29 migrations)

| Existing artefact | Capability | Reframing? |
|---|---|---|
| `tenant`, `user_profile`, `audit_log`, `current_tenant_id()`, `current_actor_role()` | Platform | — |
| `workflow_template`, `workflow_instance`, `workflow_transition_log` | Platform | — |
| `pipeline_stage`, `pipeline_substage`, `gate_requirement` | Platform (Workflow) | — |
| `task`, `task_type_master` | Platform (Tasks) | — |
| `activity`, `activity_type_master` | Platform (Activity timeline) | — |
| `notification` | Platform (Notifications) | — |
| `tenant_feature` | Platform (Feature Flags) | — |
| `attachment` (planned) | Platform (Attachments) | — |
| `ai_extraction`, `ai_extraction_row` | Platform (AI plumbing) + Intelligence (consumers) | — |
| `firm`, `contact` | Relationship | — |
| `lead`, `lead_stage`, `lead_source`, `lead_loss_reason`, `lead_stage_history` | Relationship | — |
| `dealer`, `dealer_user`, `dealer_tier` | Relationship | **Reframe:** dealer = a firm with `relationship_type=dealer` |
| `vendor` | Relationship | **Reframe:** vendor = a firm with `relationship_type=vendor` |
| `dealer_order` | Revenue | Dealer-channel sales order |
| `project`, `project_stakeholder`, `project_stage_history` | Revenue | — |
| `specification`, `sample_request` | Revenue | — |
| `product`, `price_list`, `price_list_line`, `tax`, `payment_term`, `line_price_source`, `invoice_tax_pt_snapshot` | Revenue (Catalog + Pricing) | — |
| `quotation`, `quotation_line` | Revenue | — |
| `sales_order`, `order_stage`, `transporter` | Revenue | — |
| `warehouse`, `stock_location`, `stock_movement`, `stock_adjustment`, `stock_reservation` | Delivery (Inventory) | — |
| `dispatch`, `dispatch_line` | Delivery | — |
| `invoice`, `invoice_line`, `tally_sync_log` | Finance | — |
| `collection`, `payment_promise`, `payment` | Finance | — |
| `field_attendance`, `field_visit`, `field_call` | Field Operations | — |
| `vehicle`, `vehicle_assignment_history`, `vehicle_type`, `fuel_type`, `vehicle_reimbursement_rate` | Field Operations | — |
| `visit_purpose`, `visit_outcome` | Field Operations | **Reframe:** `visit_purpose` becomes the entry point for `field_activity_type` |
| `territory` | Platform (Masters) — consumed broadly | — |
| `daily_digest` | Intelligence | — |

### 1.2 Existing actions (~30 files)

| Action files | Capability |
|---|---|
| `leads.ts`, `dealers.ts`, `dealer-tiers.ts`, `dealer-orders.ts`, `vendors.ts`, `contacts.ts`, `business-card.ts` | Relationship |
| `projects.ts`, `specifications.ts`, `samples.ts`, `sample-consumption.ts`, `quotations.ts`, `orders.ts`, `price-lists.ts`, `masters.ts`, `reservations.ts` | Revenue |
| `dispatches.ts`, `dispatch-diary.ts`, `stock.ts`, `transfers.ts`, `adjustments.ts`, `warehouses.ts` | Delivery |
| `invoices.ts`, `invoice-photo.ts`, `collections.ts`, `tally.ts`, `whatsapp-ptp.ts` | Finance |
| `field-attendance.ts`, `field-visits.ts`, `field-team.ts`, `vehicles.ts`, `vehicle-types.ts`, `fuel-types.ts`, `vehicle-rates.ts`, `odometer-photo.ts`, `voice-visit-note.ts` | Field Operations |
| `daily-digest.ts`, `ai-playground.ts` | Intelligence |
| `tasks.ts`, `territories.ts` | Platform |

### 1.3 Reframings that require explicit work

Only three reframings need any actual change. Each is small.

1. **`firm` becomes the relationship spine.** Add `relationship_type` master with values that include `customer`, `architect`, `contractor`, `developer`, `dealer`, `distributor`, `vendor`, `government`, `partner`, `consultant`. Existing `firm.type` CHECK gets promoted to a master row reference. `dealer` and `vendor` tables become 1:1 extensions of `firm`, not parallel objects. (Item `REL-006`.)
2. **`visit_purpose` becomes `field_activity_type`.** Rename master (with backwards-compat alias) and broaden the seed list. (Item `FLD-009`.)
3. **Sidebar grouping refactor (cosmetic only, ~1 day).** Group nav under capability headers. URLs and underlying data stay identical.

Everything else is already in the right place — it just gets re-described.

---

## 2. Capability specifications

Each capability is documented to the same depth: Purpose · Sub-capabilities · Existing footprint · Personas · Journeys · Masters · Workflows · Permissions · AI · Edge cases · Integrations · Events · KPIs · Industry variations.

### 2.1 Relationship

**Purpose.** Manage every person and organisation the business interacts with — across every relationship type, across full history.

**Business problems solved.** Single record per organisation regardless of role; full interaction history; lead → customer conversion without re-keying; manager visibility into coverage; industry-specific relationship types without new modules.

**Sub-capabilities.** Organisation registry · People registry · Relationship state machine (lead → prospect → customer → inactive) · Relationship intelligence · Interaction history · Relationship-network graph · Custom relationship-type registry.

**Existing footprint.** `firm`, `contact`, `lead*`, `dealer*`, `vendor`, business-card OCR. Lead Kanban UI. Activity timeline.

**Personas.** Field Executive, Inside Sales, Manager, Executive, Admin.

**Journeys.**
- *Field Executive — lead capture at exhibition:* snap card → AI extracts → resolve to existing firm or create both → tag relationship type → save → lead + activity logged + 48h follow-up task.
- *Manager — coverage audit:* filter by territory + relationship-type + last-touched > 90d → reassign in bulk.
- *Executive — relationship portfolio review:* top accounts by ₹, top specifiers, dormant high-value drill-downs.

**Masters.** `relationship_type` (system + tenant), `lead_stage`, `lead_source`, `lead_loss_reason`, `dealer_tier`, `customer_segment`, `contact_role`.

**Workflows.** Lead state machine via workflow engine; lead → project promotion on win; relationship merge on duplicate detection (admin + audit).

**Approvals.** Reassignment above value threshold; relationship merge; mass updates.

**Permissions.** Field Exec — own territory; Manager — reporting line; Admin — tenant + merge + taxonomy. Sensitive fields (credit limit, margin commitment) gated.

**AI.** Business-card OCR ✅ · duplicate detection · lead scoring · relationship intelligence brief · auto-segment suggestion · voice-note → contact extraction ✅ · conversational search.

**Notifications.** New lead assigned · reassigned away · high-value dormant 60d+ · specifier introduced new project (Architect-segment hero).

**Edge cases.** Multi-role contact across firms · firm rename/merge/acquisition · duplicate false-positives · contact left firm · multi-script names · GSTIN reuse.

**Offline.** Capture offline; queue extraction; sync. Local cache of 90d activity.

**Integrations.** Email-thread attachment (future) · WhatsApp (AiSensy) interaction log · LinkedIn enrichment (future, industry-pack).

**Events.** `relationship.created` / `updated` / `merged` / `type_changed` / `reassigned` / `touched` / `gone_dormant`, `lead.captured` / `qualified` / `won` / `lost`.

**KPIs.** Active relationships per rep · lead → won conversion · days to first touch · coverage % · dormant high-value count · architect spec → win funnel.

**Industry variations.** Vocabulary in `relationship_type` master varies; core schema unchanged.

---

### 2.2 Revenue

**Purpose.** Generate business — opportunity → confirmed order with full commercial controls.

**Business problems solved.** Pricing consistency · margin protection · quote-to-order traceability · project-level commercial view · approval discipline · forecast accuracy.

**Sub-capabilities.** Opportunity / Project · Specifications · Catalog + variants + bundles · Pricing (list + discount + contract + dealer matrix) · Quotation lifecycle · Order lifecycle (direct + dealer) · Sales contracts · Commercial approvals · Forecasting + pipeline analytics.

**Existing footprint.** `project`, `specification`, `sample_request`, `product`, `price_list`, `tax`, `payment_term`, `quotation*`, `sales_order`, `dealer_order`. Scannable project header. BOQ print.

**Personas.** Inside Sales, Estimation, Sales Engineer, Sales Manager, COO, Executive.

**Journeys.**
- *Inside Sales — quote build:* pick lines → auto-price from list+segment → adjust discount → margin chip → over-threshold triggers approval → generate PDF + share + follow-up task.
- *Sales Manager — approval queue:* see margin impact + customer history → decide.
- *Executive — pipeline view:* by stage + segment + owner; weighted forecast.

**Masters.** Catalog + variants + bundles, `price_list`, `tax`, `payment_term`, `discount_policy`, `quote_template`, `quotation_loss_reason`, `commercial_approval_policy`, `contract_type`.

**Workflows.** Quotation: draft → submitted → approved → sent → won/lost. Order: created → confirmed → reserved → ready → released. Workflow engine wired (biggest unfinished platform wiring).

**Approvals.** Margin/discount above policy · credit-period extension · special pricing · order cancellation post-confirmation · contract sign-off.

**Permissions.** Sensitive: base_price, discount_pct, order_value, margin_pct masked per Constitution. Field Exec — own; Inside Sales — assigned; Manager — team; Executive — read all.

**AI.** Quote optimisation · spec → quote draft · win probability · competitor price intelligence · voice → quote line ✅ · sample ROI rollup.

**Notifications.** Quote awaiting approval · viewed by customer · about to expire · order confirmed · won/lost.

**Edge cases.** Multi-currency (future) · partial wins · amendments after partial accept · retention pricing · GST rate change mid-deal · scope change · value erosion.

**Offline.** Spec capture + quote draft offline.

**Integrations.** Print/PDF · WhatsApp · email (future) · CPQ (future) · Tally on order won.

**Events.** `project.created` / `stage_changed`, `specification.*`, `sample.*`, `quote.created` / `submitted_for_approval` / `approved` / `sent` / `won` / `lost`, `order.created` / `confirmed` / `released_to_delivery`.

**KPIs.** Pipeline value by stage · conversion rates · win rate per source/owner/segment · ASP · margin avg · days-to-win · quote → order cycle time · sample ROI · spec → quote rate.

**Industry variations.** Building materials = spec-driven, dealer+direct · Electrical = BOQ-heavy + retention · Industrial = contract + repeat · HVAC = AMC-tied · Distribution = pricing matrix · Fabrication = drawing → quote → fab order · Service = T&M with quoted estimates.

---

### 2.3 Delivery

**Purpose.** Fulfil commitments — order → reserve stock → schedule → dispatch → POD → received.

**Business problems solved.** Stock visibility per warehouse · allocation discipline · dispatch scheduling against committed dates · POD trail · returns/damages.

**Sub-capabilities.** Operational inventory · Sample stock · Dispatch planning + scheduling · Multi-tranche dispatches · Transporter management · Vehicle/load planning · POD · Returns + damages · Last-mile tracking (future).

**Existing footprint.** `warehouse`, `stock_location`, `stock_movement`, `stock_adjustment`, `stock_reservation`, `dispatch`, `dispatch_line`, `transporter`. Warehouse tablet view. Dispatch diary AI capture.

**Personas.** Warehouse Supervisor, Dispatch Manager, Field Executive (POD), Transporter (external, future).

**Journeys.**
- *Warehouse Supervisor:* daily ready-for-dispatch tablet view → pick → confirm count → print challan.
- *Dispatch Manager:* queue + priority → assign transporter + vehicle → consolidate loads → communicate ETA.
- *Field Executive — receive at site:* POD photo + signature on mobile; note damages.

**Masters.** `warehouse`, `transporter`, `vehicle` (shared with Field Ops), `material_type`, `movement_type`, `return_reason`, `transport_mode`, `damage_type`.

**Workflows.** Dispatch: scheduled → loaded → in-transit → delivered → received. Returns: initiated → approved → received → restocked / written-off. Reservation lifecycle.

**Approvals.** Stock adjustments above threshold · cross-warehouse transfers · damage write-offs · return acceptance.

**Permissions.** Warehouse role (new) — RLS-scoped. Dispatch Manager — tenant-wide. Field Exec — POD only.

**AI.** Dispatch diary OCR ✅ · receipt damage detection from photo · optimal load planning (future) · ETA prediction.

**Notifications.** Order ready · dispatch delayed · POD captured · damage reported · return approved.

**Edge cases.** Partial dispatch · rejected at gate · damaged in transit · transporter no-show · vehicle breakdown · multi-state e-way bill expiry.

**Offline.** Warehouse tablet — counts, ready marks, challan generation offline.

**Integrations.** E-way bill (mandatory in India for ₹50k+ interstate) · FASTag (future) · GPS trackers (Field Ops shares infrastructure).

**Events.** `order.released_to_delivery`, `dispatch.scheduled` / `loaded` / `in_transit` / `delivered` / `pod_captured`, `return.initiated` / `received`, `stock.movement` / `reservation` / `released`.

**KPIs.** OTIF · damage rate · return rate · dispatch cycle · transporter performance · stock turn · reservation hygiene.

**Industry variations.** Building materials = heavy, multi-tranche · Electrical = serialised + BOM · Industrial = batch/lot · Distribution = high SKU velocity · Fabrication = project assemblies · Service = spares to ticket · HVAC = equipment + spares cycle.

---

### 2.4 Field Operations

This is the most cross-industry capability and the one most often misunderstood as "Field Sales." It is **activity-based execution** — any structured task done on location, by any role.

**Purpose.** Execute work in the field across all activity types and all field-going roles — capture proof, time, location, expense, outcome.

**Business problems solved.** Visibility into who's doing what, where, with what proof · reimbursement honesty · manager triage · rep accountability · eliminating paper logs and end-of-month chaos.

**Sub-capabilities.** Day lifecycle · Attendance + presence · Work planning (PJP) · Activity execution (configurable types) · GPS / location stamping · Voice, photo, document, signature capture · Expense + travel + reimbursement claim · Manager dashboard + drill-down · Live status + attention queue · Offline operation · Approvals · AI assistance.

**Existing footprint.** `field_attendance`, `field_visit`, `field_call`, `vehicle*`, `visit_purpose`, `visit_outcome`, `vehicle_reimbursement_rate`. Steps 1–6 + UX patches. Voice + photo AI. Manager team view.

**Personas (configurable via permissions).** Field Executive (any role with structured field work — Sales rep, Service engineer, Supervisor, Auditor, Collections officer, Inspector, Procurement officer), Field Manager, Operations Manager, Executive, Admin.

**Journeys.**
- *Field Executive — start of day:* `/field` → ranked list (planned + AI-suggested) → "Start day" → odometer + GPS + (optional photo).
- *Field Executive — activity lifecycle:* Travel started → Arrived (GPS + odometer) → Activity begins → Completed → outcome form (type-specific: sales → interest + next step; inspection → checklist + photos; audit → finding + severity; service → resolved + parts) → auto follow-up tasks → next activity.
- *Field Executive — end of day:* "End day" → odometer + photo + summary → auto-claim → submit.
- *Field Manager — live team:* `/field/team` rollups · per-rep card with status, plan vs done, running km, live location → Google Maps · stale indicator · drill-down.
- *Field Manager — claim approval queue:* approve / reject; above threshold → multi-level.

**Masters.** `field_activity_type` (renamed from `visit_purpose`) — sales visit, site visit, inspection, audit, survey, collection visit, complaint visit, installation, maintenance, service visit, vendor visit, project review, training, demo, custom. `field_activity_outcome` per type. `field_subject_type` (replaces polymorphic FK enum). `vehicle_type`, `fuel_type`, `vehicle_reimbursement_rate`, `vehicle`. `expense_category` (shared with Finance). `field_day_status` (on_duty / wfh / leave / holiday). `approval_policy` (shared). `geofence` (opt-in). Working hours per tenant.settings.

**Workflows.** Day: not-started → on-duty → ended. Activity: planned → travel_started → arrived → in_progress → completed → closed (gate: outcome + required fields). Claim: draft → submitted → approved / rejected → exported.

**Approvals.** Claim above threshold; visit edit after 24h lock; activity cancellation after start; GPS mismatch override; leave / WFH request.

**Permissions.** Field Exec — own only (RLS by user_id). Field Manager — team. Operations Manager — cross-team. Executive — rollup. Admin — masters, geofence, working hours.

**AI.** Voice → completion fields ✅ · Odometer photo OCR ✅ · Activity prep brief (next big win) · Live coaching (future) · Auto follow-up draft · Anomaly detection (impossible travel, GPS spoof, fake meeting) · Route suggestion · Outcome quality check.

**Notifications.** Activity assigned · plan updated · approval needed · claim approved/rejected · alert (stale, missed visit, GPS anomaly).

**Edge cases.** Visit spans midnight · customer location changes · executive reassignment mid-day · late check-in · check-out without check-in · multiple devices · app crash mid-visit · low battery · no GPS · no network · time-zone drift · emergency leave mid-day.

**Offline.** All actions queue locally (IndexedDB) · replay on reconnect with idempotency keys · LWW on non-numeric, additive merge on km/expense · out-of-sync indicator · local copy of today's plan + last 7 days + critical masters.

**Integrations.** Map provider (Google Maps deep-link ✅; native deferred) · Background GPS (opt-in, v2) · Camera, microphone · AiSensy follow-up draft · Finance claim export.

**Events.** `day.started` / `ended` · `activity.planned` / `travel_started` / `arrived` / `started` / `completed` / `cancelled` / `outcome_recorded` / `followup_created` / `closed` · `expense.captured` · `claim.submitted` / `approved` / `rejected` · `gps.point_recorded` (future) · `gps.anomaly_detected` · `alert.raised`.

**KPIs.** Per rep — activity completion %, planned vs done, conversion (sales subtype), travel efficiency, days-active %, expense compliance, CSAT (future). Per manager — team productivity, approval cycle, alert volume.

**Industry variations (same engine, different vocabularies).** Building materials = sales/site/dealer/architect visits · Electrical = survey/inspection/install/commissioning/AMC · Industrial mfg = customer/vendor audit/internal audit/training · HVAC = install/AMC/breakdown/survey · Engineering = design review/commissioning/training · Distribution = beat/merchandiser/dealer review/stock audit · Fabrication = inspection/install/handover · Service = ticket-driven/AMC schedule/breakdown.

---

### 2.5 Customer Success

**Purpose.** Keep customers — resolve issues, deliver service, manage warranty/AMC, track satisfaction.

**Business problems solved.** Complaint resolution speed · service quality · warranty tracking · AMC profitability · customer retention.

**Sub-capabilities.** Complaint management · Service ticket / work order · Installation management · Warranty + claim handling · AMC management + scheduling · Escalation engine · Customer feedback / NPS / CSAT · Light asset management.

**Existing footprint.** None yet. Schema, actions, UI all to be built.

**Personas.** Service Engineer (Field Ops user), Service Manager, Customer Service rep, Customer (future portal), Executive.

**Journeys.**
- *Service rep — complaint intake:* customer calls/WhatsApps → create complaint (type + severity + asset) → auto-assign by territory + skill → engineer notified.
- *Service Engineer — on-site:* Field Ops planned activity of type service_visit → prep brief: complaint + asset + warranty → resolution form (root cause + parts + photos + signature) → complaint state advances.
- *Service Manager — SLA dashboard:* open complaints by age vs SLA · escalations · engineer scorecard.

**Masters.** `complaint_type`, `complaint_root_cause`, `severity_level`, `service_priority`, `warranty_terms`, `amc_plan`, `escalation_policy`, `resolution_code`, `asset_type` (industry-pack).

**Workflows.** Complaint: logged → triaged → assigned → in_progress → resolved → verified → closed. Escalation by SLA breach. AMC schedule generated from contract.

**Approvals.** Free replacement under warranty · compensation · refund · write-off.

**Permissions.** Service Engineer — own assigned · Service Manager — team · Customer (future) — own complaints.

**AI.** Complaint classification from text · root cause from photo/description · engineer routing · AMC renewal probability · CSAT prediction.

**Notifications.** New complaint assigned · SLA approaching breach · escalation triggered · customer feedback submitted.

**Edge cases.** Complaint on product never bought from us · multiple complaints on same asset · root cause disputed · parts not in stock · contract expired during open complaint · customer relocated.

**Offline.** Engineer captures resolution offline; syncs on return.

**Integrations.** Field Ops (visits = service execution) · Delivery (parts dispatch) · Finance (warranty cost, AMC billing) · Relationship (customer context) · WhatsApp.

**Events.** `complaint.logged` / `triaged` / `assigned` / `escalated` / `resolved` / `reopened` / `closed` / `sla_breached` · `service_ticket.*` · `warranty.expired` · `amc.due` / `renewed` · `feedback.received`.

**KPIs.** First-response time · resolution time · SLA compliance · reopen rate · CSAT/NPS · engineer productivity · AMC renewal % · warranty cost per unit sold.

**Industry variations.** HVAC/engineering = AMC is core · Electrical = warranty + service period · Industrial mfg = install + commissioning + AMC · Building materials = complaints shallow, no service depth · Distribution = dealer-mediated · Service businesses = this IS the entire business.

---

### 2.6 Finance

**Purpose.** Business finance — receivables, payables, expense, claims, credit, targets, incentives. **Not accounting ERP**; accounting integrates (Tally today; pluggable later).

**Business problems solved.** Cash flow visibility · collection discipline · expense control · claim hygiene · credit risk · target tracking · incentive transparency.

**Sub-capabilities.** Invoice management (manual + AI-photo + Tally) · Collections (ageing + dunning + PTP + receipt) · Expense management (multi-category, multi-level approval, receipts) · Claim management · Credit limit + risk · Approvals (commercial — escalates from Revenue) · Targets · Incentives + commissions · Financial dashboards.

**Existing footprint.** `invoice`, `invoice_line`, `tally_sync_log`, `collection`, `payment_promise`, `payment`, invoice-photo AI, WhatsApp PTP AI. Strong collections engine.

**Personas.** Accounts officer, Collections officer, Field Executive (claims, expenses), Field Manager (approval), Finance Head, Executive, Auditor (read-only).

**Journeys.**
- *Accounts — invoice raising:* order delivered → invoice draft → tax/payment-term auto-fill → PDF + WhatsApp share + Tally sync.
- *Collections — dunning queue:* ageing buckets ranked by ₹×days → WhatsApp template / call → PTP → auto-task on PTP date → receipt → close.
- *Field Executive — multi-category expense:* from visit → "log expense" → category + amount + receipt photo → tagged to current visit + day's claim.
- *Field Manager — approval queue:* auto vs manual flags · bulk under threshold · individual above.
- *Executive — financial health:* DSO · ₹ outstanding · ageing · expense vs budget · cash forecast.

**Masters.** `tax`, `payment_term`, `expense_category`, `expense_policy` (per-role per-category), `approval_policy`, `credit_policy`, `target_type`, `incentive_scheme`, `bad_debt_reason`.

**Workflows.** Invoice: drafted → sent → partly-paid → paid / written-off. Collection: due → pre-due → overdue → dunning → PTP → received / disputed. Expense: draft → submitted → approved → rejected → exported. Claim: same shape.

**Approvals.** Discount/credit (from Revenue) · write-offs · expense above policy · claim above threshold · salary/incentive override.

**Permissions.** Field Exec — own. Manager — team approval. Accounts — tenant AR. Finance Head — full. Executive — read-only. Sensitive: salary, incentive payout, margin commitments — gated.

**AI.** Invoice photo OCR ✅ · receipt photo OCR · WhatsApp PTP capture ✅ · collection prioritisation · credit risk scoring · anomaly detection · cash forecast · dunning message drafting.

**Notifications.** Invoice overdue · PTP due today · claim approved/rejected · expense over budget · credit limit breach · target progress.

**Edge cases.** Bad debt vs disputed · partial payment · advance receipt · retention release across months · currency change · GST rate change mid-month · e-invoicing mandatory (₹5cr+).

**Offline.** Receipt + expense + PTP capture offline; sync.

**Integrations.** Tally ✅ · pluggable accounting (Zoho Books, QuickBooks, SAP — future) · AiSensy dunning + PTP ✅ · E-invoicing portal · Bank statement import (future) · Razorpay (future) · Payroll (claim/incentive export).

**Events.** `invoice.created` / `sent` / `synced` / `overdue` · `payment.received` / `promised` · `dunning.sent` · `expense.captured` / `submitted` / `approved` / `rejected` / `exported` · `claim.*` · `target.set` / `achieved` · `incentive.calculated`.

**KPIs.** DSO · ageing-bucket health · collection efficiency · expense compliance · claim approval cycle · budget vs actual · on-time invoicing · target achievement.

**Industry variations.** Building materials = retention + RA bills · Distribution = dealer credit + channel financing · Industrial mfg = long credit + contract billing · Service = T&M + AMC pre-paid · All = e-invoicing at scale (India).

---

### 2.7 Intelligence

**Purpose.** Make the data speak. Dashboards, AI, alerts, recommendations, business health.

**Business problems solved.** Information overload · surfacing what matters · predictive (vs reactive) management · AI as operational uplift.

**Sub-capabilities.** Manager/Executive dashboards · Parametric reports + exports · **Attention Centre** (ranked queue) · Daily digest (AI narrative + focus items) · Alerts (rule-based + AI anomaly) · AI assistants (distributed across capabilities) · Business health scoring · Forecasting + recommendations.

**Existing footprint.** `daily_digest` table + Inngest cron + AI narrative. AI extraction framework. Field-team rollup pages.

**Personas.** Manager, Executive, Field Manager, Admin (rule config).

**Journeys.**
- *Executive — morning ritual:* 30-second daily digest → drill any item → business-health card.
- *Manager — attention centre throughout day:* ranked queue: blocked deals, dormant high-value, claim approval pending, SLA at risk, GPS anomaly → action inline / snooze / resolve.
- *Manager — ad-hoc report:* pick capability + dimension + range → pre-built + custom saved views → CSV/PDF.

**Masters.** `alert_rule` (manager-tunable) · `report_template` · `dashboard_layout` (per-role) · `health_signal_threshold` · `forecast_model_config`.

**Workflows.** Alert: raised → acknowledged → snoozed → resolved. Digest generation → review → drill.

**Approvals.** Alert rule edits (admin) · dashboard layout changes (admin).

**Permissions.** Dashboards scoped by role + reporting line. Reports respect sensitive-field masking. Attention Centre — own + team (if manager).

**AI.** Daily digest narrative ✅ · attention ranking · anomaly detection across all events · recommendation engine · conversational query · forecasting.

**Notifications.** Drives notifications platform-wide (transport owned by Platform).

**Edge cases.** Empty-state digest · single-rep tenant · data too stale · AI provider outage (graceful degradation).

**Offline.** Local cache of last digest + key KPIs; "last updated" indicator.

**Integrations.** Reads from every capability via read-models · pluggable AI provider (Anthropic today).

**Events.** `digest.generated` / `viewed` · `alert.raised` / `acknowledged` / `resolved` · `forecast.computed` · `recommendation.served` / `actioned`.

**KPIs.** Digest read-through · attention-centre resolution time · alert false-positive rate · AI accuracy (extraction accept rate) · recommendation actioned %.

**Industry variations.** Dashboards vary; schema doesn't. Industry packs ship default layouts.

---

### 2.8 Platform

**Purpose.** Everything every capability needs. No business logic — substrate only.

**Sub-capabilities** (mapped to tables / status):

| Sub-capability | Tables / Files | Status |
|---|---|---|
| Multi-tenancy | `tenant`, `current_tenant_id()` | ✅ |
| RBAC | `user_profile`, role CHECK | ✅ (evolves to data) |
| Workflow engine | `workflow_template`, `workflow_instance`, `workflow_transition_log` | Built, **underused** — decide wire-or-drop |
| Pipeline + Gates | `pipeline_stage`, `pipeline_substage`, `gate_requirement` | ✅ |
| Tasks | `task`, `task_type_master` | ✅ |
| Activity timeline | `activity`, `activity_type_master` | ✅ |
| Audit log | `audit_log` | ✅ table; ⚠️ underwritten by app code |
| Notifications (storage) | `notification` | ✅ |
| Notification transport | — | ❌ to build (in-app + email + WhatsApp + push) |
| Attachments | `attachment` | ❌ to build |
| Approvals (generic) | `approval_policy`, `approval_request`, `approval_step` | ❌ to build |
| Feature flags | `tenant_feature` | ✅ |
| Tenant settings + Zod schema | `tenant.settings`, `lib/tenants/*` | ✅ |
| Code-prefix templates | `tenant.settings.codes` + renderer | ✅ |
| Masters registry (meta) | — | Defer until 20+ masters |
| Configuration | `tenant_feature`, `tenant.settings` | ✅ |
| AI plumbing | `ai_extraction`, `ai_extraction_row`, `lib/ai/*` | ✅ |
| Event bus | Inngest | ✅ |
| Observability | — | ❌ to build (Sentry) |
| Sensitive-column masking | — | ❌ to build (helper) |
| TS types from DB | — | ❌ to build |
| Custom fields | — | Future (when first customer asks) |
| Module registry | — | Future (when 3+ tenants) |

**Personas.** Tenant Admin, Super Admin (future), Developer.

**Workflows.** Tenant onboarding · user invite · role assignment · feature toggle · integration setup.

**Permissions.** Admin role for most Platform surfaces.

**AI.** AI explainability · setting-suggestion.

**Edge cases.** RLS bypass attempt · session hijack · replay attack · JWT-claim tampering.

**Events.** `tenant.created` / `suspended` · `user.invited` / `activated` · `role.changed` · `feature.toggled` · `integration.connected` / `failed` · `policy.updated`.

**KPIs.** Auth uptime · RLS coverage % · audit write coverage · integration health · feature-flag adoption.

---

## 3. Cross-capability architecture

Capabilities are independent but cooperate via:

1. **Events (loose coupling)** — every capability publishes domain events; subscribers in other capabilities react. **No direct cross-module writes** (Constitution #0).
2. **Read-models (cross-capability views)** — `project-progress` is the prototype. New: `customer-360`, `sales-day` / `field-day`, `executive-scorecard`, `territory-health`. All computed; never copies of source-of-truth.
3. **Shared masters** — territory, vehicle, expense_category, approval_policy, attachment, notification owned by Platform.
4. **Workflow engine** — owned by Platform, used by Revenue (project + lead stages), Customer Success (complaint), Field Operations (activity lifecycle).
5. **AI plumbing** — owned by Platform; consumed by every capability with an extraction surface.

---

## 4. Industry variation strategy

| Variation lever | How it works | Where it lives |
|---|---|---|
| Relationship vocabulary | `relationship_type` master per tenant | Platform (Masters) |
| Pipeline templates | `pipeline_template` + stages + gates | Platform (Workflow) |
| Activity types | `field_activity_type` master | Platform (Masters) |
| Outcome vocabularies | `field_activity_outcome` per activity-type | Platform (Masters) |
| Approval thresholds | `approval_policy` | Platform |
| Notification rules | `alert_rule`, `notification_template` | Intelligence + Platform |
| Custom fields | `custom_field_definition` (future) | Platform |
| Code prefixes | `tenant.settings.codes.*` | Platform ✅ |
| Dashboard layouts | `dashboard_layout` per role | Intelligence |
| Tax / GST / locale | `tax`, locale settings | Finance + Platform |
| Currency | `tenant.settings.currency` (future) | Platform |

**Industry pack = pre-configured bundle.** Architect for it; populate when industry #2 deal arrives. Do not build the industry-pack engine yet.

---

## 5. Governing principles (locked)

1. **The eight capabilities are locked.** A new top-level capability requires evidence from three customers, not one feature request.
2. **Modules group by capability, never by department / persona / relationship type.**
3. **Industry variation comes from configuration + masters + activity types**, not new code paths.
4. **Tenant scoping non-negotiable.** `tenant_id` + RLS on every table.
5. **Events between capabilities; read-models for cross-capability views; never direct cross-module writes.**
6. **Soft-delete + audit + append-only state transitions** on every business entity.
7. **Sensitive data masked through helpers**, not convention.
8. **Backwards compatibility on every migration.** Additive only.
9. **Customer success beats theoretical correctness.** When in doubt, ship what the next customer asks; build the abstraction at the third request.
10. **Defer complexity until evidence forces it.** Every speculative platform abstraction answers: "what specific customer demand proves this is needed?" If "future ones," wait.
11. **Untracked code is dead code.** No working features live outside git.
12. **The Field Operations capability is for ALL field-going roles**, not just sales.

---

## 6. What this document means in practice

**For development:**
- Any new server-action file gets a capability tag in its header.
- Any new table gets a capability tag in its migration header.
- Any new UI route gets a sidebar-group decision (under which capability).
- Any "we should add module X" proposal → "which capability does it live under?" If no clean answer, the answer is "no module."

**For sales / product conversations:**
- "Do you do dealer management?" → "Dealer is a relationship type within our Relationship capability. Here's how it works."
- "Can you support our service business?" → "Yes. Same Field Operations engine; service activities are configured as a field activity type. Customer Success owns the complaint/service workflow."
- "We need a new module for X." → "X likely lives in capability Y. Let's understand the requirement."

**For roadmap discussion:**
- Roadmap items are tagged to capability + priority tier in the Status Tracker.
- "When do you build X?" → look at the row in §11.
- "Why not earlier?" → governing principle #9 or #10.

---

## 7. Cross-capability priority matrix (high-level)

### MUST HAVE before Customer #2 (Sprint 1 — in progress)
PLAT-004, PLAT-005, PLAT-006, PLAT-007, PLAT-008, PLAT-009, PLAT-010, ARCH-003, ARCH-004, REL-006, FLD-009.

### MUST HAVE shortly after Customer #2 (Sprint 2)
FIN-005, FIN-006, FIN-007, CS-001, CS-002, FLD-014, FLD-015, FLD-011, REV-006.

### SHOULD HAVE (3–6 months)
INT-004, REL-009, FIN-011, FIN-010, INT-008, FIN-008, CS-005, PLAT-018, mobile bottom-nav.

### NICE TO HAVE (6–12 months)
Custom fields, contract management, warranty + AMC, light fraud detection, scorecards, territory health, regional manager role, reporting framework, conversational query.

### FUTURE
Offline-first, live GPS, native map, predictive analytics, industry-pack engine, multi-currency, pluggable accounting, module registry, master-data engine, native mobile, white-label.

### Intentionally NOT building
Generic rules DSL, workflow visual builder, native procurement suite, native marketing automation, asset management beyond Customer Success needs, HR/payroll, full ERP.

---

## 8. Reconciliation with existing implementation

What needs to change, minimally, to align existing code to this blueprint.

### 8.1 Zero-touch
Most existing code is already aligned. No change needed beyond sidebar grouping:
- `project`, `quotation`, `order`, `dispatch`, `invoice`, `collection`, `inventory` — fine
- `lead`, `firm`, `contact` — fine
- `field_attendance`, `field_visit`, `field_call`, `vehicle*` — fine
- `tenant`, `user_profile`, `tenant_feature`, `task_type_master`, `activity_type_master` — fine
- All Inngest events, all AI surfaces — fine

### 8.2 Small renames (data, not code)
- `visit_purpose` → broaden to `field_activity_type` vocabulary. Keep table name. (Item FLD-009.)
- `firm.type` CHECK → `relationship_type_master`. Existing values become system rows. (Item REL-006.)

### 8.3 Light extensions
- `dealer` table stays; logical view "firm with `relationship_type=dealer`" for Relationship dashboards.
- `vendor` stays; same pattern.
- Sidebar grouping cosmetic refactor.

### 8.4 New work — per Status Tracker §11

### 8.5 Things explicitly NOT touched
- Workflow engine: decided in Sprint 1 or 2 — wire it for project/lead or drop. Either is fine; staying half-built is not.
- `audit_log` writes: increase coverage incrementally; do not refactor existing actions.
- Any UI URL: no breaking URL changes.

---

## 9. Process for keeping this document fresh

This blueprint is a **living lock**. The eight capabilities and the principles are immutable. The Status Tracker (§11) and the [Build Log](./BUILD-LOG.md) update on every meaningful commit.

### Before any non-trivial work
1. Find the Blueprint item ID for your change in §11 (e.g., `PLAT-007`).
2. If no item exists, propose adding one in a small PR ahead of the work.
3. Confirm the priority tier matches your sprint.
4. Confirm your work belongs to one capability — if it spans more, name the primary.

### Within the commit message
Include the Blueprint item ID(s) the change tracks (`Tracks: PLAT-007`). The first line of every migration and major action file includes a capability tag in a comment.

### On every meaningful commit
1. Update the Status Tracker row(s):
   - `📋 Planned` → `🚧 In Progress` when you start work
   - `🚧 In Progress` → `✅ Shipped` on merge to main
   - Add the short commit SHA to the row
   - Update the "Last updated" line at the top of this document
2. Append a one-line entry to [`BUILD-LOG.md`](./BUILD-LOG.md) under today's date.

### When new ideas appear
- Run them through §0.2 (the eight capabilities). Which one owns it?
- Run them through §5 (governing principles). Does it violate any?
- Run them through §7 (priority matrix). Where does it tier?
- If it survives all three, add a new ID to §11 with `💭 Considered` status.
- Do not start building until a decision lifts it to `📋 Planned`.

### What this document is NOT
- It does not prescribe implementation details — those stay in slice specs and code reviews.
- It does not freeze tactics — Sprint plans, build sequences, and sub-capability priorities can shift. The eight capabilities cannot.

---

## 10. Status legend

| Marker | Meaning |
|---|---|
| ✅ | Shipped and in production |
| 🚧 | In progress this sprint |
| 📋 | Planned for an upcoming sprint (committed) |
| ⚠️ | Built but underused / problematic — needs decision |
| 💭 | Considered (discussed but not committed) |
| ❌ | Not building (explicitly out of scope) |

---

## 11. Status Tracker

Authoritative item-by-item state. **Updated on every commit.**

### 11.1 Platform (PLAT)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| PLAT-001 | RBAC + multi-tenancy | Foundation | ✅ | Slice 1 baseline |
| PLAT-002 | Tasks + activity timeline + audit log table | Foundation | ✅ | Slice 1 |
| PLAT-003 | Workflow engine (template / instance / transition log + atomic RPC) | Foundation | ⚠️ Built-Unused | Decide wire-or-drop in Sprint 2 |
| PLAT-004 | Per-tenant feature flags | Must-have C#2 | ✅ | `203239d` (Sprint 1.1) |
| PLAT-005 | Tenant settings Zod schema + code-template renderer | Must-have C#2 | ✅ | `56c8dde` (Sprint 1.2) |
| PLAT-006 | task_type_master + activity_type_master (de-CHECK) | Must-have C#2 | ✅ | `d2c9115` (Sprint 1.3) |
| PLAT-007 | Sensitive-column mask helper | Must-have C#2 | ✅ | `b155898` (Sprint 1.4) · helper shipped; no current consumer required migration (sensitive columns happen to already be omitted from existing SELECTs) — future consumers wrap returns via `maskRow` / `maskRows`. |
| PLAT-008 | TS types generated from DB schema | Must-have C#2 | ✅ | `fd44182` (Sprint 1.5) · `database.ts` generated + browser client typed. Server client + `db:types` npm script deferred (server.ts and package.json have outstanding WIP; will land in a follow-up commit alongside that work). |
| PLAT-009 | Sentry + Inngest observability baseline | Must-have C#2 | ✅ | `6e41977` (Sprint 1.6) · `lib/observability/` chokepoint shipped (`captureError`, `captureMessage`, `withCapture`, PII `scrub`). AI extract wired (both image + text paths). Today's transport = structured stderr; Sentry SDK swap is a single-file edit documented in `lib/observability/README.md`. SDK install + `sentry.*.config.ts` + Inngest onFailure wiring deferred (waits for `package.json` WIP). |
| PLAT-010 | Code-prefix configuration — wire consumers (replace triggers) | Must-have C#2 | ✅ | `8af733a` (Sprint 1.7) · hybrid path: RPC `next_code_sequence(kind)` + `lib/codes/next-code.ts` helper. Triggers stay as safety net. Wired into `createQuotation` (quotation_number now comes from `tenant.settings.codes.quotation` template). Other 5 entities (sales_order, invoice, dispatch, dealer, lead) migrate opportunistically as their actions are touched. |
| PLAT-011 | Tenant lifecycle (create + seed) + subdomain routing | Must-have C#2 | ✅ Partial | Provisioning CLI shipped (Sprint 2.1a): `scripts/onboard-tenant.ts`. Idempotent on slug, JSON config, Zod-validated, creates tenant + features + admin user. Subdomain middleware deferred (UX improvement; not strictly blocking — JWT already carries tenant_id). |
| PLAT-012 | Notification transport (in-app + WhatsApp + email) | Must-have post-C#2 | 📋 | — |
| PLAT-013 | Attachment framework | Must-have post-C#2 | ✅ | `d114708` (FO-2) · Migration 0033 + `lib/actions/attachments.ts` + `components/attachment/{upload-button,list,signature-pad}.tsx`. Polymorphic `attachment` table (entity_type TEXT + entity_id UUID), 5 kinds (photo/document/voice_note/signature/receipt). Reuses existing `ai-uploads` bucket via path prefix `<tenant>/attachment/<entity_type>/yyyy/mm/`. RLS = tenant isolation only; per-entity parent-readability lives in `canAccessParent` (Option C — admin/manager always; field_visit ⇒ owner). First consumer: `54865a3` (FO-3) wires it into visit completion. Old TEXT[] photo_urls columns stay one slice for backwards-compat. |
| PLAT-014 | Generic Approval engine | Must-have post-C#2 | ✅ | `422de80` (FO-4) · Migration 0034 (4 tables: `approval_policy`, `approval_policy_step`, `approval_request`, `approval_step_action`) + `lib/actions/approvals.ts` + `/approvals` queue page + `<ApprovalCard>` for inline rendering. Multi-level by design — both **sequential** (step 1 → 2 → 3) and **parallel** (all open at once, with `require_all_parallel` toggle for all-N vs any-1). Step approvers resolve via `role` (any active user with that role) or `specific_user`. `requestApproval()` finds the matching policy by `(entity_type + amount band)`; `autoApproveIfNoPolicy` defaults true so small-value cases don't clog the queue. **Deferred:** auto-escalation cron (Inngest), reports_to-based step resolution (needs `user_profile.reports_to_user_id`), seeded policies (consumers seed per-tenant as they ship). First real consumer wires in FO-5 (expense claims). |
| PLAT-015 | Audit log writer (broader coverage) | Should-have | 📋 | — |
| PLAT-016 | Module registry | Future | 💭 | When 3+ tenants |
| PLAT-017 | Master Data Engine | Future | 💭 | When 20+ masters |
| PLAT-018 | Custom fields (narrow) | Nice-have | 💭 | — |
| PLAT-019 | Push notifications | Should-have | 📋 | — |
| PLAT-020 | Super Admin role + cross-tenant access | Future | 💭 | — |
| PLAT-021 | Pluggable AI provider abstraction | Future | 💭 | — |
| PLAT-022 | Tenant admin UI for `tenant.settings` (no SQL needed) | Should-have post-C#2 | 💭 | Surfaced by ARCH-003 §3.1. Cumbersome SQL today. |
| PLAT-023 | Self-service user invite UI (`/admin/users`) | Should-have post-C#2 | 💭 | Surfaced by ARCH-003 §6. SQL-only today. |
| PLAT-024 | Per-tenant integration credentials (Tally, AiSensy, AI provider) in `tenant.settings.integrations` | Should-have post-C#2 | 💭 | Surfaced by ARCH-003 §7. Env-only today. |
| PLAT-025 | CSV importers for masters + initial entities | Should-have post-C#2 | 💭 | Surfaced by ARCH-003 §5. Ad-hoc SQL today; tenant-#5+ will demand. |
| PLAT-026 | Pipeline / gate editor UI | Should-have post-C#2 | 💭 | Surfaced by ARCH-003 §4.1. SQL-only today. |
| PLAT-027 | Logo upload + brand-colour tenant settings UI | Nice-have | 💭 | Surfaced by ARCH-003 §2.1. Manual S3 + JSON edit today. |
| PLAT-028 | `procurement.ap_master` feature flag + Tally AP adapter | Must-have post-C#2 | 📋 | Two modes: `native` (CRMOS owns AP) and `tally` (Tally is master, CRMOS read-through). Default `tally` per PO decision. Schema spot reserved; full wiring lands with Phase 2 vendor bills (FIN-019). |

### 11.2 Relationship (REL)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| REL-001 | firm + contact spine | Foundation | ✅ | Slice 1 |
| REL-002 | Lead module (table + Kanban + actions) | Foundation | ✅ | `c0f6d9b` (committed this session) |
| REL-003 | Dealer + dealer-portal + dealer-orders | Foundation | ✅ | Slice 3 |
| REL-004 | Vendor master | Foundation | ✅ | Slice 3.5 |
| REL-005 | Business-card OCR | Foundation | ✅ | `d28302b`, `e68187e` |
| REL-006 | firm.type → relationship_type_master (broader vocabulary) | Must-have C#2 | ✅ | Sprint 2.1b · Migration 0031 — new master with 12 system rows (7 existing + customer/consultant/distributor/partner/vendor). firm.relationship_type_id FK backfilled from text match. CHECK dropped. Sync trigger keeps firm.type TEXT and FK in lockstep so existing call sites keep working. Tenants add custom types via INSERT — no migration needed. |
| REL-007 | Lead state model (lead → prospect → customer → inactive) | Must-have post-C#2 | 📋 | — |
| REL-008 | Duplicate detection on phone / GSTIN | Must-have post-C#2 | 📋 | — |
| REL-009 | Customer 360 read-model | Should-have | ✅ Partial | Slice 1 · `9fc3b7e` · `lib/read-models/customer-360.ts` + `/customers/[firmId]` page. Header card (firm + relationship type + phone/email/GSTIN/address + primary contact + contact count) + Projects section (top 10 by `updated_at` DESC, with `firm_role: 'buyer' \| 'architect'` resolved per row from `buyer_firm_id` / `architect_firm_id`). Single `.or()` query for projects so dedup + total count are exact. Entry point: `View customer 360 →` links on project-detail Buyer + Architect rows. **Slice 1.5** · `810025d` · `/firms` discovery surface — single page lists every firm with relationship-type filter (driven by `relationship_type_master` from REL-006) + multi-field search (name / city / phone / GSTIN); each row deep-links to Customer 360. Sidebar entry "Firms" added under Relationship between Leads and Contacts. **Slice 1.6** · `821085d` · page restructured — header card stays as identity; `<Tabs>` below: Overview (default, KPI strip + AI-insights placeholder for REL-011 + Notes) · Projects (the existing list) · Contacts (full table — solves the "View all 3 sends me away" pain). Read-model extended with `contacts[]` (capped 100) + `kpis: { total_estimated_value, active_project_count, last_touched_at }`. Two project queries: one limited for the list, one lightweight aggregate (no joins, no limit) for KPIs. **Slice 2.1** · `44e3806` · Orders tab. New `Customer360Order` type + `orders` field with limited list + aggregate (`total_value`, `active_count`). Queried via `sales_order.buyer_firm_id` direct. UI: tab between Projects and Contacts, card rows linking to `/orders/[id]`. **Slice 2.2** · `b3f3231` · Invoices tab. Read-model extended to two-phase: Phase 1 runs 6 parallel queries (adds invoice limited + invoice agg uncapped); Phase 2 runs quotes + collections in parallel using project IDs and invoice IDs from Phase 1. New types: `Customer360Invoice`, `Customer360Quote`, `Customer360Collection`. Invoice tab: stats (total · overdue count · outstanding), card rows (number mono, status badge, date, due date red if overdue, total + outstanding). Links to `/invoices/[id]`. **Slice 2.3** · `8796971` · Quotes tab. Stats (total · open · total value), card rows (quotation_number mono, status badge, project name, created date, valid_until with amber warning). Links to `/projects/[id]` (no standalone quotes page). **Slice 2.4** · `3189691` · Collections tab. Stage badge (color from collection_stage master), overdue badge, next_action_at, outstanding vs billed. Collections agg derived from invoiceAggRows (no extra query). Tab trigger shows overdue count in red. Links to `/invoices/[id]`. **Slice 3 will add** Visits + Activities tabs + inline AI insights in Overview (replacing the placeholder); may scope the firms list to "true customers" once REL-007 lead-state model lands. |
| REL-010 | Dormancy alerts | Should-have | 📋 | — |
| REL-011 | AI relationship intelligence brief | Should-have | ✅ | `82b5d76` · /firms list: 4 bulk signal queries (overdue invoice, stale sent quote >7d, stuck project >14d, stale lead >3d) → colored chips per row + city/state/attention filters. Customer 360 Overview: <FirmBrief> server component (health: healthy|needs_attention|critical, headline, up to 5 bullets), cached 24h in ai_extraction (migration 0043). |
| REL-012 | Relationship-network graph view | Nice-have | 💭 | — |
| REL-013 | Lead scoring | Nice-have | 💭 | — |
| REL-014 | Conversational search | Nice-have | 💭 | — |
| REL-015 | Email-thread integration | Future | 💭 | — |
| REL-016 | Vendor master KYC depth (PAN, MSME, bank, payment terms, GST state code) | Must-have post-C#2 | ✅ | Procurement P1α · migration 0054 extends `vendor` with `pan`, `msme_status`, `msme_udyam_no`, `bank_account_no`, `bank_ifsc`, `bank_name`, `payment_terms_days`, `gst_state_code` (auto-derived from GSTIN[0:2]). Form-side validation in `lib/actions/vendors.ts` enforces GSTIN + PAN regex; vendor-form (`app/(app)/admin/vendors/vendor-form.tsx`) gets a 4-section dialog (tax+statutory / bank / contact / notes). Drives IGST vs CGST+SGST routing on PO lines (DEL-016) and unblocks MSME 45-day compliance reporting in Phase 2 (FIN-020). |

### 11.3 Revenue (REV)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| REV-001 | Project + spec + sample | Foundation | ✅ | Slice 1 |
| REV-002 | Catalog + pricing + tax + payment terms | Foundation | ✅ | Slice 3.5 |
| REV-003 | Quotation lifecycle | Foundation | ✅ | Slice 1 |
| REV-004 | Order lifecycle (direct + dealer) | Foundation | ✅ | Slices 2 + 3 |
| REV-005 | Pipeline + Gates engine | Foundation | ✅ | Slice 1 |
| REV-006 | Workflow engine wired to project + lead stages (or dropped) | Must-have post-C#2 | 📋 | Decision in Sprint 2 |
| REV-007 | Commercial approval engine | Must-have post-C#2 | 📋 | Depends on PLAT-014 |
| REV-008 | Margin policy master | Must-have post-C#2 | 📋 | — |
| REV-009 | Contract management | Should-have | 📋 | — |
| REV-010 | Quote version diff UI | Should-have | 📋 | — |
| REV-011 | Forecast read-model | Should-have | 📋 | — |
| REV-012 | Win-probability scoring | Nice-have | 💭 | — |
| REV-013 | Competitor-price capture | Nice-have | 💭 | — |
| REV-014 | Customer-specific pricing | Nice-have | 💭 | — |
| REV-015 | Multi-currency | Future | ❌ | Until customer asks |
| REV-016 | CPQ tooling | Future | ❌ | — |

### 11.4 Delivery (DEL)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| DEL-001 | Stock + reservations + adjustments | Foundation | ✅ | Slice 2.5 |
| DEL-002 | Dispatch + POD + transporter | Foundation | ✅ | Slice 2 |
| DEL-003 | Dispatch diary AI capture | Foundation | ✅ | `67b3f38`, `d28302b` |
| DEL-004 | Warehouse tablet view | Foundation | ✅ | Slice 2.5 |
| DEL-005 | Return workflow + reasons | Must-have post-C#2 | 📋 | — |
| DEL-006 | Damage tracking | Must-have post-C#2 | 📋 | — |
| DEL-007 | E-way bill capture field on dispatch | Must-have post-C#2 | 📋 | — |
| DEL-008 | Batch / serial tracking | Should-have (industry pack) | 📋 | — |
| DEL-009 | Load optimization | Should-have | 📋 | — |
| DEL-010 | Transporter scorecard | Should-have | 📋 | — |
| DEL-011 | E-way bill API integration | Nice-have | 💭 | — |
| DEL-012 | FASTag tracking | Nice-have | 💭 | — |
| DEL-013 | ETA prediction | Future | 💭 | — |
| DEL-014 | Native vehicle tracking | Future | ❌ | — |
| DEL-015 | Procurement: Purchase Requisition (PR / Indent) | Should-have | ✅ Partial (PR→PO conversion → P4β) | Procurement P4α · migration 0067 ships purchase_requisition + purchase_requisition_line schema with sequence + render_tenant_code trigger + next_code_sequence whitelist + approval policies seeded for entity_type='purchase_requisition' (mirrors PO bands: ₹50k-₹5L manager / ₹5L-₹25L manager+admin / ₹25L+ admin) + code templates VT-PR-* / RA-PR-*. Header carries project_id (optional), cost_center (free text v1), requested_by, required_by_date, justification, estimated_value (computed from lines), 6-state status enum (draft / submitted / approved / rejected / cancelled / po_raised), approval_request_id, linked_po_id (set by P4β PR→PO conversion). Lines carry product_id (optional — ad-hoc allowed), description + hsn + unit + quantity + estimated_rate + estimated_value + preferred_vendor_id (optional suggestion) + specifications. `lib/actions/purchase-requisitions.ts` ships 6 actions: createPurchaseRequisition (validates + computes estimated_value), submitPurchaseRequisition (raises approval via PLAT-014; auto-approves under ₹50k), syncPrFromApproval (read-time reconciliation mirroring expenses.ts pattern), cancelPurchaseRequisition (draft-only), listPurchaseRequisitions + getPurchaseRequisition, plus 3 form pickers (projects, products, vendors). UI: `/procurement/requisitions` list with 7-status filter + 4-KPI strip (drafts / awaiting / approved / total in flight) + per-row chips for status + project + requester + linked-PO when applicable. `/procurement/requisitions/new` form with project picker + cost center + required-by + justification + dynamic line table (product picker pre-fills description/unit; HSN + unit dropdown + qty + estimated rate + preferred vendor + specifications) + live total with "above ₹50k → routes to X approval" hint. `/procurement/requisitions/[id]` detail with status pill + meta grid (project/requester/need-by) + justification card + inline ApprovalCard when pending + rejection/cancellation/PO-raised banners + 7-column line table (#/item+specs/HSN/qty/rate/value/preferred vendor) + "Ready to raise PO" hint card on approved PRs pointing at P4β + Submit/Cancel workflow buttons via small client island. Sample data (migration 0068): 3 PRs — Vyara VT-PR-2026-0001 draft (₹1.80L pigment top-up), Raj RA-PR-2026-0001 submitted with pending mid-band approval request (₹4.20L cables for Adani EPC), Raj RA-PR-2026-0002 approved (₹2.80L Schneider components for L&T). Procurement landing page header gets "New requisition" CTA alongside "New purchase order"; coming-next card adds Purchase requisitions tile with live awaiting/approved count. **Deferred to P4β:** PR → PO conversion flow ("Raise PO from this PR" pre-fills the existing PO form from PR lines + sets PR.linked_po_id + flips PR.status to po_raised on save). **Deferred to P4β/γ:** RFQ + Comparative Statement (the multi-vendor evaluation path between PR and PO — this is the "send to 3 vendors, compare quotes, pick L1, justify if not L1" piece). |
| DEL-016 | Procurement: Purchase Order (Indian GST + terms) | Must-have post-C#2 | ✅ Partial | Procurement P1α · migrations 0054 (schema) + 0055 (codes + approval seeds). `purchase_order` + `purchase_order_line` tables with full Indian GST line model (HSN/SAC, IGST vs CGST+SGST auto-split based on vendor GSTIN state code vs warehouse state, configurable GST rate from {0, 0.1, 0.25, 1, 3, 5, 6, 12, 18, 28}, taxable_value, amount_total, qty_received/qty_rejected GRN-progress columns). Address snapshots on PO header (vendor / bill-to / ship-to) so future PDF rendering is stable. Workflow state machine: draft → pending_approval → approved → sent → partly_received → received → closed (cancelled is terminal anywhere before received). Per-tenant code templates seeded (Vyara `VT-PO-{yyyy}-{nnnn}`, Raj `RA-PO-{yyyy}-{nnnn}`). `next_code_sequence` RPC extended; safety-net DB trigger reads `render_tenant_code` (0051). Server actions: `createPurchaseOrder` (validates inputs, computes GST split + line totals, inserts atomically with rollback on line-insert failure), `submitPurchaseOrder` (raises approval via PLAT-014; auto-approves under ₹50k policy band), `sendPurchaseOrder` (status flip), `cancelPurchaseOrder` (reason-required), `listPurchaseOrders`, `getPurchaseOrder`, plus 4 picker queries (vendors / warehouses / products / projects). UI: `/procurement` (4-card KPI strip + recent POs + Coming-next gap markers), `/procurement/orders` (list with 8 status filter chips + receive-% chip when partial), `/procurement/orders/new` (multi-section form: vendor + warehouse + project + dates + payment terms + dynamic line items with live tax-split chip + totals card + terms card), `/procurement/orders/[id]` (header + ApprovalCard inline when pending + line table + totals + terms + snapshots + audit footer). **Sidebar:** new "Procurement" item under Delivery group. **Deferred to P1β:** PR/Indent (lifted to P4), PO PDF + WhatsApp/email send, GRN UI (schema lives here; consumer in P1β), RTV. |
| DEL-017 | Procurement: Goods Receipt Note (GRN) + RTV | Must-have post-C#2 | ✅ | Procurement P1α (schema) + P1β (GRN consumer) + P1γ (RTV reverse flow + PO PDF + product-linked sample). GRN path documented in P1β notes above. **P1γ adds:** migration 0059 (RTV schema — `return_to_vendor` + `_line` tables, optional vendor_credit_note_no/_at on header for the credit-note round trip; stock_movement.movement_type CHECK extended with `'return_to_vendor'`; new sequence + render_tenant_code-aware auto-number trigger; next_code_sequence whitelist + tenant code templates seeded as VT-RTV-* / RA-RTV-*). `lib/actions/return-to-vendor.ts` ships 6 actions: `createReturnToVendor` (validates GRN is posted, per-line caps qty_returned at qty_accepted minus prior-posted RTV qty for the same GRN line — race-aware, required per-line reason), `postReturnToVendor` (atomic 4-step REVERSE of GRN post: flip RTV.status → decrement po_line.qty_received guarded against negative → recompute parent PO status back down through received → partly_received → sent as appropriate → write stock_movement with `movement_type='return_to_vendor' + reason_code='rtv' + related_entity_type='return_to_vendor'` for product-linked lines), `cancelReturnToVendor` (draft-only), `recordVendorCreditNote` (post-hoc updates credit-note no + date on a posted RTV), `listReturnsToVendor`, `getReturnToVendor`, `getGrnForReturn` (form picker — returns per-line qty_returnable = qty_accepted − sum(posted RTVs for that GRN line)). UI: `/procurement/grns/[id]/return` (server shell + client form, defaults qty_returned to 0 so user opts in per line, per-line reason required when qty > 0), `/procurement/returns` (list with status filter + credit-note ✓ badge), `/procurement/returns/[id]` (detail with status + linked GRN + PO + warehouse, lines table with `GRN accepted` column for context + `Returned` highlighted in rose, draft-only Post/Cancel via `<RtvWorkflowActions>` island, and a `<RecordCreditNoteForm>` island shown only when status='posted' and credit_note_no IS NULL). GRN detail extended: "Return to vendor" CTA (rose accent, gated on GRN status='posted' AND accepted-minus-prior-returns > 0) + Returns section listing RTVs against the GRN. PO PDF: `/procurement/orders/[id]/pdf` lives under the existing `(print)` route group (mirrors `/quotes/[id]/boq` pattern — re-uses `PrintButton` client component; CSS-in-style with print color-adjust; A4-friendly width). Renders bill-to / ship-to / vendor address blocks from PO snapshots so the document is stable across master mutations; meta-row with PO date + expected delivery + payment terms + currency; lines table with HSN + GST split column header detecting IGST vs CGST+SGST per PO; totals + terms section enumerated from PO header fields + standard Indian B2B clauses (e-way bill mention, rejection-pickup-7-days, computer-generated disclaimer); signature blocks for buyer + vendor acknowledgement. PO detail header gets a "Print PDF" button opening the print route in a new tab. Procurement landing's coming-next card adds a live link to `/procurement/returns`. **Product-linked sample data (migration 0060)** adds one draft PO per tenant whose lines reference a real product master row (Vyara `VT-PO-2026-0006` → 200 sqft INTLK-300-GRY pavers; Raj `RA-PO-2026-0007` → 10 mtr CBL-LT-150 cable). Both sized under ₹50k auto-approve so the user can walk submit → auto-approve → send → receive → see stock_movement land on `/inventory` and the per-product stock balance update. |
| DEL-018 | Procurement: Vendor Bill (AP) + 3-way match | Must-have post-C#2 | ✅ Partial (P2α — payment in P3) | Procurement P2α · migrations 0061 (vendor_bill + _line schema with bill_number sequence + render_tenant_code-aware auto-number trigger + next_code_sequence whitelist extended + code templates VT-VB-* / RA-VB-* + approval policies mirroring PO bands + purchase_order_line.qty_billed cumulative tracker; UNIQUE (tenant_id, vendor_id, vendor_invoice_no) enforces vendor's GST-unique invoice number constraint) + 0062 (sample bill data — one clean-match approved bill on Vyara, one rate-mismatch submitted-for-approval bill on Raj). **3-way match engine** lives in `lib/procurement/match-engine.ts` as pure functions (`matchBillLine`, `aggregateBillMatch`) — extracted from the `use server` module because Next.js requires every export in a server module to be async. Per-line check order (worst-wins): qty_over → rate_mismatch → gst_mismatch → hsn_mismatch → unlinked → matched. Qty cap is `qty_received − qty_billed` from the PO line (catches over-billing including against prior bills); rate is strict equality (PO amendment is the right path for genuine rate changes); HSN is warn-not-fail when either side is missing. Bill-level aggregate: any hard mismatch → 'mismatched'; any unlinked → 'under_review'; all matched → 'matched'. **Server actions** (`lib/actions/vendor-bills.ts`): createVendorBill (validates vendor + PO match + per-line qty/rate inputs, pulls PO line snapshot, computes GST, runs the match engine, inserts header + lines, address snapshots from tenant.settings.company), submitVendorBill (raises approval via PLAT-014; auto-approves under ₹50k; calls applyApprovedBillEffects which increments po_line.qty_billed), cancelVendorBill (draft-only — approved bills require RTV + credit-note flow), syncBillFromApproval (read-time approval reconciliation mirrors purchase-orders.ts pattern; applies qty_billed effects when approval lands), listVendorBills + getVendorBill (with status + match_status filters + due-date overdue surfacing), getPoForBilling (form picker: returns PO + lines with qty_billable = qty_received − qty_billed), listPosForBilling (eligible POs for the new-bill picker). **UI**: `/procurement/bills` list with 7-status filter + 4-match filter + KPI strip (outstanding total, overdue count + value, mismatched count, drafts) + per-row match badge with icon (✓ matched / ⚠ mismatched / 👁 under_review) + overdue red due-date. `/procurement/bills/new` two-mode: picker (no PO param) lists POs with billable headroom; pre-bound (?po=X) auto-fills lines from PO snapshot with qty=qty_billable + PO rate/HSN/GST as defaults; user edits to reflect what the vendor invoice actually says; live preview lists exact warnings the 3-way match will flag on submit (qty over, rate drift with delta amount, GST drift). `/procurement/bills/[id]` detail with status + match-status pills, money tiles (Total / Paid / Outstanding / Due with overdue rose tint), vendor + PO + GRN linkage, inline ApprovalCard, MSME 45-day reminder when applicable, **8-column line table with per-line match badge + diagnostic + side-by-side PO rate/HSN columns showing the delta when there's drift**. Cancel + Submit workflow buttons via `<BillWorkflowActions>` client island; submit on a 'mismatched' bill triggers an extra confirm dialog. PO detail extended with "Book vendor bill" CTA (sky-blue, gated on partly_received/received status + unbilled qty) + Vendor bills section listing bills against the PO with status + match-status + invoice number. Procurement landing's coming-next card: Vendor bills tile now Live ✓; AP ageing/MSME demoted to a P2β gap marker; Payment + TDS as P3 gap marker. **Deferred to P2β:** AP ageing dashboard (mirror of /collections), MSME 45-day report (FIN-020), dunning queue for vendors with overdue bills. **Deferred to P3:** payment scheduling, TDS, NEFT/RTGS export, Form 16A, MSME-1. **Deferred to P2γ:** `procurement.ap_master` flag implementation (Tally adapter + native-mode toggle) — schema is ready, only the adapter wiring + Tally sync code missing. |
| DEL-019 | Procurement: AP ageing + dunning (mirror of AR) | Must-have post-C#2 | ✅ Partial (dunning queued P3) | Procurement P2β · migration 0063 ships `vendor_bill_ageing_v` view mirroring `invoice_ageing_v` (0006) with `security_invoker=true` per the 0047 cross-tenant fix. View filters to status IN (approved, partly_paid) AND amount_outstanding > 0, exposes `days_overdue` + `days_since_receipt` + `msme_flag` (ok / warning / breach / not_applicable derived from days_since_receipt vs 45-day rule) + 5-bucket `ageing_bucket` (current / 1-30 / 31-60 / 61-90 / 90+) matching the existing `invoice_ageing_v` shape. `lib/read-models/ap-ageing.ts` reads the view once and aggregates: totals (outstanding, overdue, MSME breach+warning counts/values), per-bucket rollup with stacked-bar percentages, top-10 vendors by outstanding ₹ with oldest-bill citation, MSME compliance sorted by days_since_receipt DESC. When a bucket filter is active the page re-queries to get filtered bills but keeps the bucket strip + top vendors + MSME sections rendering the full universe (per /collections + /owner Slice 2 pattern). UI: `/procurement/ap-ageing` page with 4-KPI strip (outstanding / overdue / MSME breach count / MSME approaching count), 5-bucket card with stacked-bar visualization + clickable bucket tiles that toggle the URL `?bucket=` filter, MSME compliance card (rose-tinted breach section with 45-day-past indicator + amber-tinted warning section with "days to limit" counter — only renders when relevant), top-vendor card with MSME badge inline, and a filtered bills list at the bottom showing the active bucket's contents. Sample data extends 0062 with 5 backdated bills (Vyara: MSME breach via Surat Pigments + 1-30 overdue via Ambuja; Raj: MSME warning via Surya Copper + 31-60 via Schneider + 61-90 via Crompton with partly_paid status). Procurement landing's coming-next card swaps "AP ageing + MSME 45-day" gap marker for a live link; gaps now point to FIN-021/022 (P3) and FIN-023 (P5). **Dunning queue** (vendor-side auto-WhatsApp for our own AP — vendor reminds us, not the other direction) deferred to P3 because Indian B2B norms have us doing the reminding to *customers* and the *vendor* dunning us; we don't auto-remind ourselves to pay. The dashboard makes the cash-out side legible, which is the actual ask. |
| DEL-020 | Procurement: RFQ + Comparative Statement | Should-have | 📋 P4 | RFQ to multiple vendors + side-by-side CS + L1/L2/L3 designation + override justification. Naturally pairs with PR (DEL-015). |
| DEL-021 | Procurement: Job Work + ITC-04 | Nice-have | 💭 P6 | Job-work challan, ownership-stays-with-us flow, quarterly ITC-04 return. Common in fabrication / EPC. |
| DEL-022 | Procurement: Blanket PO + Rate Contract + Release Orders | Nice-have | 💭 P6 | "Buy N per year at this rate, draw as needed." Common in EPC for steel / cement / cables. |
| DEL-023 | Procurement: Import procurement (Bill of Entry, FX, customs) | Nice-have | 💭 P6 | BoE instead of GRN; customs duty + IGST; LC management. |

### 11.5 Field Operations (FLD)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| FLD-001 | Attendance day lifecycle (check-in/out, claim) | Foundation | ✅ | Slice 4 Step 3 |
| FLD-002 | Vehicle assignment + reimbursement (incl. matrix + admin CRUD) | Foundation | ✅ | Slice 4 Step 2 |
| FLD-003 | Planned visits + per-leg km + activity events | Foundation | ✅ | Slice 4 Step 4 |
| FLD-004 | Voice → completion form AI | Foundation | ✅ | Slice 4 Step 5 |
| FLD-005 | Odometer photo OCR | Foundation | ✅ | Slice 4 Step 5 |
| FLD-006 | Manager team view + claim approval | Foundation | ✅ | Slice 4 Step 6 |
| FLD-007 | Per-vehicle claim auto-compute | Foundation | ✅ | Slice 4 Step 3 |
| FLD-008 | Role-aware UX + manager gap fixes | Foundation | ✅ | `2c57297` |
| FLD-009 | visit_purpose → field_activity_type (broader vocabulary) | Must-have C#2 | ✅ | Sprint 2.1c · Migration 0032. visit_purpose now supports system rows (tenant_id NULL); 16 seeds across 7 categories (sales, finance, service, installation, audit, training, other). Existing Vyara tenant rows untouched. **Table not renamed** — conceptual mapping to "field_activity_type" lives in the Blueprint; data model stays `visit_purpose` to avoid the FK column rename ripple. |
| FLD-010 | Polymorphic subject → data-driven `field_subject_type` master | Must-have post-C#2 | 📋 | — |
| FLD-011 | Mandatory outcome on activity close | Must-have post-C#2 | 📋 | — |
| FLD-012 | Visit edit lock with manager override | Must-have post-C#2 | 📋 | — |
| FLD-013 | AI activity prep brief | Should-have | ✅ | `93d9ccc` (FO-8) · Migration 0036 adds `visit_prep_brief` to `ai_extraction.entity_kind`. `lib/ai/prompts/visit-prep-brief.ts` (Zod schema: headline / bullets / caution) + `lib/actions/visit-prep-brief.ts` (assembles context: subject info, last 8 activities, open tasks, recent quotes for projects, last 3 prior visits → JSON → Claude → parsed). Cached at the ai_extraction layer (same `(tenant_id, entity_kind, source_storage_path)` key) so re-renders are free. `<VisitPrepBrief>` component renders inline on the in-progress visit card AND the Visit Hub (cached on subsequent loads). Per Principle #6: read-only. First Vyara copilot surface — the next ones (call recap, outcome quality check) reuse the same plumbing. |
| FLD-014 | Visit Hub (book order / log expense / log complaint from visit) | Must-have post-C#2 | ✅ Partial | `82a06fc` (FO-6) · `/field/visits/[id]` page + `lib/read-models/visit-detail.ts` assembler (cross-capability reads: field_visit + contact + subject + attachments + expenses + activity + tasks). UI sections: header (subject, contact, state, location), proof gallery, expenses (FO-5), follow-up tasks, activity timeline. Quick actions wired: add photo, attach file, signature, log expense. Completed-visit cards on `/field` deep-link in. **Deferred:** book order from visit (needs the order-create-with-prefill flow), log complaint (CS-001 not built yet). Both unlock once their owners ship — the read-model is ready for them. |
| FLD-015 | Sales Day / Field-Activity Day read-model | Must-have post-C#2 | ✅ | `84c0446` (FO-7) · `lib/read-models/field-day.ts` assembles user + attendance + visit-counts + expenses + KPIs (visits done, planned-open count, distance, on-duty minutes, vehicle claim, expense total, pending expenses). Consumed by `/field` (rep self-view) AND `/field/team/[userId]` (manager drill-down) so the day reads the same on both surfaces. Reusable `<FieldDayKpiStrip>` component. Manager team-detail now shows the expense list too. |
| FLD-016 | Multi-category Expense consumer surface | Should-have | ✅ | FO-5 · `<LogExpenseSheet>` wired into `/field` (in-progress visit card). End-of-day catchall lives at `/expenses`. |
| FLD-017 | Attention Centre v1 surfacing field signals | Should-have | 📋 | Built by INT-004 |
| FLD-018 | Live team last-known location (Google Maps deep-link) | Should-have | ✅ Partial | `2c57297` |
| FLD-019 | Light fraud detection (heuristics from stamps) | Nice-have | 📋 | — |
| FLD-020 | Activity playbooks | Nice-have | 💭 | — |
| FLD-021 | Outcome quality check (AI) | Nice-have | 💭 | — |
| FLD-022 | Offline-first | Future | ❌ | Until customer demands |
| FLD-023 | Live GPS tracking | Future | ❌ | Privacy + battery |
| FLD-024 | Native map (Mapbox / Google) | Future | ❌ | Deep-link is 90% |
| FLD-025 | Route optimization | Future | ❌ | — |
| FLD-026 | Live AI coaching mid-visit | Future | ❌ | — |
| FLD-027 | Native mobile apps | Future | ❌ | PWA covers 95% |
| FLD-028 | Mobile bottom-nav for sales-rep role | Should-have | 📋 | — |
| FLD-029 | `visit_purpose` / `visit_outcome` admin UI | Should-have post-C#2 | 💭 | Surfaced by ARCH-003 §4.2. Cheap; SQL today. |

### 11.6 Customer Success (CS)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| CS-001 | Complaint module (entity + workflow + UI) | Must-have post-C#2 | ✅ | `206d9d9` (Raj demo Phase 3, overnight 2026-06-22→23) · Migrations 0048+0049 (severity_master, complaint_type_master, complaint_stage, complaint, complaint_stage_history; activity trigger + type extensions; ai_extraction.complaint_classification entity kind). lib/actions/complaints.ts: 6 server actions (createComplaint, advanceComplaintStage, assignComplaint with auto-advance, recordComplaintResolution, closeComplaint, rejectComplaint, listComplaints). UI: /complaints list + /complaints/[id] detail with stage-advance form actions. Sidebar: new "Customer Success" group. 13 unit + 11 integration tests pass. **Deferred for v2 (recorded in OVERNIGHT-NOTES.md):** mobile field-engineer surface, Inngest event emissions, per-user RLS scoping (engineer-sees-own / manager-sees-team). |
| CS-002 | Field Operations as service-visit execution | Must-have post-C#2 | 📋 | — |
| CS-003 | Basic SLA + escalation engine | Must-have post-C#2 | 📋 | — |
| CS-004 | Severity master | Must-have post-C#2 | 📋 | — |
| CS-005 | Service ticket + work order | Should-have | 📋 | — |
| CS-006 | Warranty tracking | Should-have | 📋 | — |
| CS-007 | Resolution code master | Should-have | 📋 | — |
| CS-008 | Engineer scorecard | Should-have | 📋 | — |
| CS-009 | AMC management + scheduling | Nice-have | ✅ | `850d4ad` (Raj demo Phase 4, overnight 2026-06-22→23) · Migration 0050 (amc_contract with 5-state lifecycle + visit_frequency enum + parent_contract_id for future renewals; amc_visit_schedule with status enum; complaint.amc_contract_id FK; activity triggers + type extensions). lib/actions/amc.ts: createAmcContract (auto-generates evenly-spaced visit schedule from frequency + period), markAmcVisitDone, cancelAmcContract (cascades visits to cancelled), listAmcContracts (computes visits_done/scheduled/overdue + days_to_expiry). UI: /amc list page with KPI strip + visit-progress chips + days-to-expiry warning. 7 unit + 11 integration tests pass. **Deferred for v2:** /amc detail page (mark visit done from UI), renewAmcContract action, Inngest task-generation for upcoming visits, AMC-specific billing schedule. |
| CS-010 | Asset register | Nice-have | 💭 | — |
| CS-011 | CSAT / NPS capture | Nice-have | 💭 | — |
| CS-012 | Customer portal | Future | 💭 | — |
| CS-013 | AI complaint classification | Future | 💭 | — |
| CS-014 | Predictive maintenance | Future | ❌ | — |

### 11.7 Finance (FIN)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| FIN-001 | Invoice + Tally sync | Foundation | ✅ | Slice 2 |
| FIN-002 | Collection + PTP + dunning | Foundation | ✅ | Slice 2 |
| FIN-003 | WhatsApp PTP AI capture | Foundation | ✅ | `d28302b` |
| FIN-004 | Invoice photo OCR | Foundation | ✅ | `d28302b`, `67b3f38` |
| FIN-005 | Approval engine consumed (claim approval as first consumer) | Must-have post-C#2 | 📋 | Built by PLAT-014 |
| FIN-006 | Multi-category Expense module | Must-have post-C#2 | ✅ | `82dcba4` (FO-5) · Migration 0035 — `expense` + `expense_category` master (12 system seeds: fuel/tolls/food_self/food_client/taxi/train_air/accommodation/mobile_recharge/gift/sample_courier/site_supplies/other). `lib/actions/expenses.ts` (create / submit / cancel / list / get) + `<LogExpenseSheet>` (bottom sheet, 2-step capture → receipt) + `/expenses` page with status rollups. Consumes FO-4 — submit raises an `approval_request` when amount hits a policy band; auto-approves when no policy. Consumes FO-2 — receipts via `(entity_type='expense', kind='receipt')`. Wired into the in-progress visit card so an expense can be tied to a visit (`subject_type='field_visit'`). |
| FIN-007 | Expense policy master | Must-have post-C#2 | ✅ Partial | FO-5 · Approval policy is the expense policy — `approval_policy` rows with `entity_type='expense'` and amount bands ARE the policy. No separate table needed. Per-tenant policy CRUD UI deferred (admin seeds via SQL today; lifts to UI when tenant #2 needs to differentiate). |
| FIN-008 | E-invoicing (mandatory ₹5cr+ India) | Should-have | 📋 | — |
| FIN-009 | Credit limit + risk scoring | Should-have | 📋 | — |
| FIN-010 | Target engine (per-rep per-period) | Should-have | 📋 | — |
| FIN-011 | Multi-level approval chains | Should-have | 📋 | — |
| FIN-012 | Incentive / commission engine | Nice-have | 📋 | — |
| FIN-013 | Cash forecast | Nice-have | 📋 | — |
| FIN-014 | Pluggable accounting adapter | Nice-have | 💭 | Zoho Books / QuickBooks / SAP |
| FIN-015 | Multi-currency | Future | ❌ | — |
| FIN-016 | Bank reconciliation | Future | 💭 | — |
| FIN-017 | Payment gateway (Razorpay) | Future | ❌ | — |
| FIN-018 | AiSensy template registry per tenant | Should-have | 💭 | Surfaced by ARCH-003 §7.2. Template names hardcoded today. |
| FIN-019 | Accounts Payable (native or Tally-mode) | Must-have post-C#2 | 📋 P2 | Two modes via PLAT-028 feature flag. Native: full AP ledger in CRMOS. Tally-mode (default): CRMOS shows AP read-through; Tally remains master for vendor invoices + payments. |
| FIN-020 | MSME 45-day compliance + MSME-1 filing | Must-have post-C#2 | ✅ (MSME-1 CSV export shipped; PDF format in P3γ if asked) | Procurement P2β · the dashboard signal is live. `vendor_bill_ageing_v` exposes `msme_flag` (breach when days_since_receipt > 45; warning when ≥ 30; ok when < 30; not_applicable for non-MSME vendors). `/procurement/ap-ageing` surfaces breach + warning sections with per-vendor breakdowns + "X days past 45-day limit" / "X days to limit" indicators. KPI tiles count + value MSME bills in each state. **MSME-1 half-yearly filing report** (PDF / CSV export of >45-day dues per the prescribed format) deferred to a follow-on slice — the dashboard makes the *compliance signal* legible, which is what an accountant needs daily; the filing format lands when the first tenant approaches a real filing window (the Apr/Oct biannual cycle). |
| FIN-021 | TDS computation (194Q/194C/194J/194I) + Form 16A + 26Q | Must-have post-C#2 | ✅ Partial (Form 16A + 26Q → P3γ) | Procurement P3α · `lib/procurement/tds-engine.ts` ships pure-function `suggestTds(vendor)` that returns section + pct + reason based on vendor_type (supplier→194Q@0.1%, contractor→194C@1%, service→194J@10%; 'other' = manual) plus PAN-availability check (no PAN → §206AA fallback @ 20% for C/J or 5% for Q). User can override at payment-create time. TDS computed at payment level (uniform across allocations v1) — stored on vendor_payment.tds_section / tds_pct / tds_amount with net_amount = gross − tds. Surfaces in 4 places: payment-create form (auto-fills + edit-allowed dropdown + live net preview), payment detail (TDS pill + breakdown card + "deposit by 7th of next month" reminder), payments list (TDS chip per row), KPI tile on /procurement/payments shows TDS deducted this month. **Form 16A** (annual certificate per vendor per FY) + **Quarterly 26Q return CSV** + **26AS reconciliation** deferred to P3β — same engine, output format only. |
| FIN-022 | Vendor payment scheduling + NEFT/RTGS export | Must-have post-C#2 | ✅ (per-bank dialects in P3γ) | Procurement P3α + P3β · P3α shipped the lifecycle (createVendorPayment, postVendorPayment, atomic bill update, TDS engine, list/new/detail UI, sample data). P3β shipped the **output side**: (1) **Payment voucher PDF** at `app/(print)/procurement/payments/[id]/voucher/page.tsx` mirroring the PO PDF pattern — vendor + beneficiary bank blocks from snapshots, TDS breakdown section with "deposit by 7th" reminder, money grid with red TDS deduction line + emerald net-paid grand total, bank ref block, signature blocks, reversed-voucher banner when applicable. (2) **NEFT bank-file CSV export** at `/api/procurement/payments/export-neft?from=…&to=…` — generic Indian-bank format (Sl/Beneficiary/Bank/IFSC/A-c/Amount/Mode/Reference/Value Date/Remarks columns) with proper CSV-escaping. Posted NEFT + RTGS only; reversed payments excluded. UI: `<NeftExportButton>` dropdown on `/procurement/payments` with date-range picker (default last 30 days) triggering download via Content-Disposition. (3) **Posted-payment reversal** flow: schema 0066 extends status enum with `'reversed'` + adds reversed_at/by/reason columns. `reverseVendorPayment` action mirrors postVendorPayment in reverse — atomic 3-step (flip status posted→reversed; decrement bill.amount_paid + recompute amount_outstanding + status per allocation, reading current bill state to handle concurrent payments; best-effort rollback on failure). Detail page workflow buttons extended: posted-state shows "Reverse payment" button → confirmation dialog with category select (cheque_bounce / neft_failed / vendor_refund / accounting_correction / other) + optional note. Reversed banner on detail. (4) **MSME-1 half-yearly CSV export** at `/api/procurement/ap-ageing/export-msme1` — filters vendor_bill_ageing_v by msme_flag='breach' and joins vendor for PAN + UDYAM, returns CSV per MSME-1 form intent (vendor/PAN/UDYAM/bill/invoice/dates/amount/days/reason). "Export MSME-1 (N)" CTA on /procurement/ap-ageing header, only renders when breach_count > 0. **Deferred to P3γ:** per-bank NEFT dialects (HDFC/ICICI/SBI specific column orderings — schema captures everything needed, only the format string differs). | · vendor_payment + vendor_payment_allocation schema in migration 0064, sequence + render_tenant_code trigger, code templates VT-PAY-* / RA-PAY-*. 6 server actions in `lib/actions/vendor-payments.ts`: createVendorPayment (validates vendor + per-allocation bill ownership + bill.amount_outstanding cap + TDS bounds, computes net via lib/procurement/tds-engine, inserts header + allocations atomically with soft-delete rollback), postVendorPayment (atomic: re-validates outstanding hasn't decreased since draft, flips status, increments bill.amount_paid + recomputes bill.amount_outstanding + status to partly_paid/paid per allocation), cancelVendorPayment (draft-only — posted reversal is v2), listVendorPayments + getVendorPayment + listVendorsWithOutstanding (picker) + getBillsForPayment (reuses vendor_bill_ageing_v for days_overdue + msme_flag context). UI: `/procurement/payments` list with status + mode filters + 4-KPI strip (net paid this month, TDS deducted, drafts, total). `/procurement/payments/new` two-mode: vendor picker shows vendors with outstanding bill counts + ₹ + MSME badge + PAN flag; pre-bound (?vendor=X / ?bill=Y) shows the vendor's outstanding bills with checkboxes + per-bill allocation inputs + max button + MSME breach/warning chips inline (sourced from ageing view); TDS section + rate dropdowns auto-fill from suggestTds with manual override; live preview of gross / TDS / net at the bottom. `/procurement/payments/[id]` detail with 4 money tiles (gross / TDS / net / allocation count), vendor block with PAN-or-§206AA-warning, TDS deposit reminder card, allocations table linking back to bills, draft Post + Cancel workflow buttons. Bill detail extended with "Pay vendor" CTA (emerald, gated on status=approved/partly_paid + amount_outstanding > 0) + Payments section listing all payments allocated to the bill with status + mode + TDS + net chips. Procurement landing's "Payment + TDS" gap marker swapped for a live link. **NEFT/RTGS bank file export** (HDFC / ICICI / SBI / generic-CSV formats per Indian bank specs), **payment voucher PDF**, and **multi-step payment release approval** (PLAT-014 wiring for >₹X bands) deferred to P3β. |
| FIN-023 | GSTR-2B reconciliation + ITC tracking | Should-have | 📋 P5 | Monthly upload of 2B → match against booked vendor bills → ITC eligibility flag. IRN validation on incoming invoices. |

### 11.8 Intelligence (INT)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| INT-001 | Daily digest (cron + AI narrative + dashboard card) | Foundation | ✅ | `73af063` |
| INT-002 | Manager dashboards (project + field team) | Foundation | ✅ | Slices 1–4 |
| INT-003 | AI extraction framework | Foundation | ✅ | `e68187e` |
| INT-004 | Attention Centre v1 (computed from existing data) | Should-have | 📋 | — |
| INT-005 | Per-capability rollup dashboards | Should-have | 📋 | — |
| INT-006 | Alert rule engine (configurable) | Should-have | 📋 | — |
| INT-007 | Report framework + CSV/PDF exports | Should-have | 📋 | — |
| INT-008 | Activity prep brief (AI) | Should-have | ✅ | Built by FLD-013 (FO-8) |
| INT-009 | Conversational query — tool-use agent over read-models | Should-have | 📋 | Full planning conversation locked in [`docs/int-009-chat-planning.md`](./int-009-chat-planning.md) — six open design questions (UI surface, audience, query scope, tool design, multi-turn, output format) with recommendations per question. Locked baseline: tool-use agent (not raw LLM-to-SQL); read-only v1; mandatory "I don't have that" path; tenant + role scoped at the tool layer; cache by `(tenant_id, normalised_query)` for 5-10 min; `chat_log` audit table; Sonnet for v1 with a Haiku route for cheap Tier-1 lookups. **Do not start building until Q1–Q6 in the planning doc are locked by Paresh.** |
| INT-010 | Forecasting (revenue, cash, churn) | Nice-have | 💭 | — |
| INT-011 | Recommendation engine | Nice-have | 💭 | — |
| INT-012 | AI accuracy dashboard | Nice-have | 💭 | — |
| INT-013 | Predictive analytics | Future | 💭 | — |
| INT-015 | Visit → closed ₹ attribution | Nice-have | 💭 | Cross-capability rollup. Cross-reference `field_visit` subjects (lead.won_at via visit.lead_id, project terminal stage via visit.project_id, dealer wins via visit.dealer_id) against accepted quotations to estimate revenue attribution per field visit. Open design question: attribution rule (last-visit-before-win? all-visits-credited equally? time-decay weighted?) — no single right answer; needs Paresh decision before build. Lifted from a sloppy "saved for Slice 5" gap marker on the Owner Dashboard rep scorecards (INT-014 Slice 4) — should have been tracked from day one per Blueprint workflow rule. Currently surfaced as an honest gap marker on /owner §13. |
| INT-014 | Owner Dashboard (`/owner`) — admin-only executive surface | Should-have | ✅ Final (Slices 1+2+3+3.1+4) · Slice 5 ❌ dropped (subsumed by INT-009) | Subsumes INT-004 (Attention Centre v1) + INT-005 (per-capability rollup) for an executive consumer. **Slice 1** (`8ae1175`)**:** Section 1 Business Health (revenue / collections / orders / outstanding / open pipeline / DSO with prev-period deltas + today/week/month/quarter/year selector) + Section 2 Attention Centre (ranked feed: critical collections, high-value stalled deals, pending approvals, overdue tasks, paving stage, cold leads, stale quotes + gap markers for CS-001 / DEL-007 / REL-016) + AI Owner Brief (health + top_opportunities + top_risks + recommendations, cached 6h in ai_extraction). New read-model `lib/read-models/owner-overview.ts` (2-phase parallel queries, follows project-progress / customer-360 / field-day pattern). Migration 0044 adds `owner_brief` entity_kind. **Slice 2 — Finance depth (re-orders Blueprint plan per "money first" executive-surface feedback):** Section 3 Receivables ageing (4-bucket horizontal stacked bar + per-bucket cards with count + ₹ + %; drills to `/collections?bucket=X` matching the existing filter contract). Section 4 Top debtors (top 10 firms by outstanding ₹ from `invoice_ageing_v` grouped by buyer_firm_id; rows show worst days + invoice count + worst-invoice label; deep-link → Customer 360). Section 5 Cash movement (fixed 30d window; cash IN with payment-mode split (cheque/neft/upi/cash split via `payment_mode`), best-day fact, prior-30d delta; cash OUT rendered as honest gap marker → FIN-014 — outflow ledger not yet tracked). Section 6 PTP coverage (% of overdue invoices with an open `promise_to_pay` + total ₹ promised + due-this-week count + dishonoured-30d flag; coverage_pct is honestly null when denominator is 0). **Read-model extended:** 2 new queries (`receipts` 30d w/ payment_mode + received_at; `promise_to_pay` open + dishonoured), buyer-name resolution merged for overdue + top debtors (no extra query — same fetch covers both). 4 new section types: `Ageing`, `TopDebtor[]`, `CashMovement`, `PtpCoverage`. **AI brief context extended** with `receivables_depth` block (top 3 debtors, ageing buckets, PTP coverage, cash-in 30d) — prompt v1 → v2 with cache key now including prompt version (`inline_text:owner_brief:<tenant>:<version>`) so v1 cached briefs auto-invalidate. **Page layout:** Brief → Business Health → Ageing → Debtors → Cash → PTP → Attention Centre (ranked action list comes LAST so the read ends on "what should I do next?"). **Honest gaps:** ageing bucket boundaries hardcoded in `invoice_ageing_v` (not tenant-configurable — pre-existing Customer-#2 readiness limitation; not refactored in this slice). Cash OUT gap → FIN-014. **Slice 3 (`d702fcc` is Slice 2; Slice 3 is pending commit) — Revenue + Operations:** Section 7 Pipeline funnel (4-stage period-coupled — open leads → sent quotes → accepted quotes → won leads; conversion %s shown as chips between stages, can exceed 100% on short windows when wins predate the window — surfaced not capped, transparent to the reader). Section 8 Win rate + cycle (accepted vs rejected ratio with ₹, avg quote→close cycle days from `accepted_at − sent_at` for accepted-in-period quotes, top 3 loss reasons from `lead.lost_reason_id` joined to `lead_loss_reason` master, "losses without reason" hygiene flag rendering only when non-zero). Section 9 Top reps (top 5 by closed ₹ in period, attribution via `quotation.created_by`; each rep also shows personal win rate from `wins/sent` denom; trophy/award icons for top 3). Section 10 Operations (dispatch counts in period + currently in-transit + delivered in period; avg `scheduled_at → delivered_at` cycle; by-stage chips from live `dispatch_stage` rows — not hardcoded; **honest gap markers:** on-time % requires DEL-007 (`dispatch.expected_delivery_at`), stock-at-risk requires a `safety_stock` / `reorder_level` column on `stock_location` that doesn't exist yet — both rendered as visible "not tracked yet" panels with FIN-014/DEL-007 chips per Constitution Principle #11). **Read-model adds 11 new queries** to the Promise.all (open leads count head, won/lost leads in period, sent/accepted/rejected quotes in period with `created_by`+`sent_at`+`accepted_at` for cycle calc, dispatch_stage master for labels, dispatches/delivered/in-transit, lead_loss_reason master). Rep-name resolution via a new `user_profile` `.in()` query after Promise.all. **Facts extended** with: open_leads_count / sent_quotes_in_period / accepted_quotes_in_period / won_leads_in_period / win_rate_pct / avg_quote_cycle_days / top_rep_label / in_transit_dispatches / delivered_in_period / top_loss_reason. **AI brief context** extended with `revenue_depth` block (funnel + conversions + win rate + top reps + ops). System prompt v2 → v3 with cache-key versioning. **Slice 3.1 — AI brief redesign (pending commit):** User feedback after walking Slice 3: the brief's 3-column wall (~250 words across opportunities/risks/recommendations) was too dense for a 30-second exec read. Replaced with a tighter shape — severity chip + one-sentence headline + up to 3 action chips. Each chip is a Link with verb-first label (e.g. "Call Surat Muni · ₹9.9L · 85d overdue") + `target` enum (collections/quotes/projects/leads/tasks/approvals/firms) + optional `search` substring; component computes `/<target>?q=<search>` so chips drill to the existing list pages with the right filter pre-applied. Schema fields removed: `top_opportunities[]`, `top_risks[]`, `recommendations[]`. Schema fields added: `actions[]` (max 3). Prompt v3 → v4 with explicit good/bad chip examples ("Call Surat Muni · ₹9.9L" GOOD vs "Follow up on collections" BAD). System prompt rewritten to demand verb-first ≤10-word chips and forbid duplicating the headline in chips. Cache key versioning means v3 cached briefs auto-invalidate. Net: ~80% less text on the brief; the deeper "tell me more" path is reserved for the conversational agent (**INT-009** lifted from 💭 Considered to 📋 Planned in the same turn — natural complement to the trimmed brief). **Slice 4 — Field + People (pending commit):** Section 11 Today's field activity (point-in-time, NOT period-coupled — the owner reading at 11am wants now-state not 30-day-avg): 4-status strip (on-duty/WFH/leave/no-record) + 3 KPI tiles (visits done today, total team km, total expense today). "No record" turns amber when non-zero (coaching signal). Section 12 Team roster (live per-rep list, sorted: on-duty by check-in time first, then wfh, then leave/holiday, then no-record-today; each row shows status dot + name + role + "On duty since X" / "WFH" / "No record today" + visit count + last check-in location label + km if checked out; deep-links to `/field/team/[userId]`). Section 13 Rep scorecards (period-coupled top 5 by visits-with-outcome — ranked, with trophy/award icons for top 3; rows show visits-completed-of-opened + km + ₹ expense + on-duty days + completion-% chip (Strong/Patchy/Thin tone). **Two honest gap markers in a dashed companion card:** (1) live GPS / continuous location → FLD-023 (won't build — privacy + battery); (2) visit → closed-₹ attribution → no FK from field_visit to quotation, ranking by visits-with-outcome only, saved for Slice 5 (would need subject-traversal via lead.won_at / project terminal stage). **Read-model adds 6 new queries** (field-eligible reps with role IN (sales_engineer, manager), today's attendance + visits + expenses, period attendance + visits + expenses rollups). 3 new types: `FieldToday`, `RosterEntry[]` + `RosterStatus`, `RepScorecard[]`. **Facts extended** with `on_duty_now_count`, `visits_completed_today`, `top_field_rep_label`. **Slice 5 DROPPED (decision recorded 2026-06-21 — pending commit):** I started Slice 5.1 (drill-down filters: territory / role / rep selects, with `OwnerFilters` type extending `getOwnerOverview`, `allowedRepIds` hoisted into Section 9, people-section rollups intersected with allowedRepIds, new `owner-filter-bar.tsx` client component, dashed "applies to / unfiltered" scope hint) and got it to a working state in the working tree. Before commit, user pushed back: *"I feel the filters are not required.. the chat would cover this part so lets drop the slice 5?"* **Honest agreement** — INT-009 (conversational agent) is the stronger drill-down path on a twice-a-day executive surface: filters force the owner to *operate* the dashboard (poke-around motion), chat lets them *interrogate* it (specific-answer motion). The trimmed brief's action chips (Slice 3.1) already cover the Quick-Actions need (5.2). Saved views (5.3) only matter if filters exist, so they fall away too. **Trade-off acknowledged:** the page loses the "pin the whole view to one territory" affordance — that becomes a chat turn instead of URL state. For an executive surface read twice a day, the right call; would be wrong for a dashboard people live in 8 hours a day. **Revert executed:** read-model `OwnerFilters` + `FilterScope` types removed; `getOwnerOverview` signature restored to `(period)` only; `allowedRepIds` hoisting removed from Section 9; Section 9 / 11 / 13 rollups restored to tenant-wide; today's-expense query select restored (had been extended to include `user_id`); `owner-filter-bar.tsx` deleted; `page.tsx` searchParams parsing + filter bar render + scope hint + parallel rep-list fetch removed; page header comment + footer text updated to record the drop decision. **Drop sharpens INT-009's mandate** — chat is no longer described as a "natural complement to the brief"; it's the ONLY drill-down path on /owner. Worth flagging in the INT-009 planning doc next time it's touched. **INT-014 is now ✅ final at Slices 1+2+3+3.1+4.** |

### 11.9 Cross-cutting (ARCH)

| ID | Item | Tier | Status | Commit / Notes |
|---|---|---|---|---|
| ARCH-001 | Lib/ai infrastructure committed | Foundation | ✅ | `e68187e` |
| ARCH-002 | Inngest event bus + events catalogue | Foundation | ✅ | Slice 2 |
| ARCH-003 | Customer #2 onboarding runbook | Must-have C#2 | ✅ | `docs/customer-onboarding-runbook.md` · draft 1 · sharpens after first real onboarding |
| ARCH-004 | Tenant lifecycle + subdomain routing | Must-have C#2 | ✅ Partial | Tracks PLAT-011 (same scope). Tenant lifecycle CLI shipped; subdomain routing deferred. |
| ARCH-005 | Industry-pack engine (concrete artefacts) | Future | 💭 | When industry #2 |
| ARCH-006 | SLA + support agreement template | Should-have | 💭 | Surfaced by ARCH-003 §2.3. No SLA doc exists yet. |
| ARCH-007 | Training videos / customer-facing docs | Should-have | 💭 | Surfaced by ARCH-003 §6.3. Live sessions only today. |

---

## 12. Closing — the locked promise

**Eight capabilities. Same architecture for eight industries. Industry behaviour from configuration, not modules.**

When this document and reality disagree, the smallest possible adjustment lands in the next sprint. When new ideas appear, they fit *here* — or they don't fit at all.
