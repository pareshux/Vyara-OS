# Vyara OS — Build Log

> Chronological record of what shipped, when, against which [Product Blueprint v3](./PRODUCT-BLUEPRINT-v3.md) item.
>
> **Append one entry per meaningful commit.** Format below.

---

## Entry format

```
### YYYY-MM-DD — Short title (commit SHA)
- **Tracks:** BLUEPRINT-ID, BLUEPRINT-ID
- **Capability:** Name
- **Tier:** Foundation / Must-have C#2 / Must-have post-C#2 / Should-have / Nice-have / Future
- **Status change:** 📋 → ✅ (or whatever)
- **Notes:** one-line summary of what changed and why
```

---

## 2026-06-19

## 2026-06-23

### Procurement P1γ — Return to Vendor + PO PDF + product-linked sample (pending commit)
- **Tracks:** DEL-017 ✅ (flipped from "✅ RTV → P1γ" to fully ✅); DEL-016 extended with PDF render
- **Capability:** Delivery (procurement) + Platform (`stock_movement.movement_type` CHECK extended)
- **Tier:** Must-have post-C#2
- **Status change:** DEL-017 ✅ Partial → ✅ full
- **Notes:** Third slice of the procurement module. Closes out DEL-017 by adding the reverse-receipt path (RTV), gives the PO a print-friendly PDF render, and seeds one product-linked PO per tenant so the stock_movement path is finally walkable end-to-end (P1β samples were all ad-hoc text lines, so receipts correctly wrote no stock).

  **RTV state machine** (`lib/actions/return-to-vendor.ts`):
  - `createReturnToVendor` — opens an RTV against a posted GRN. Per-line qty_returned is capped at (qty_accepted on the GRN line) − (sum of qty_returned across **posted** RTVs for the same GRN line); the cap is recomputed at write time so two concurrent RTV creators don't double-spend the same accepted qty. Per-line reason is required.
  - `postReturnToVendor` — the atomic 4-step REVERSE of GRN post:
    1. Flip RTV status → posted (with rollback helper).
    2. For each line: `po_line.qty_received -= qty_returned`, guarded at zero.
    3. Refresh all PO lines, recompute parent PO status — all fulfilled → still `received`, any received > 0 → `partly_received`, all zero → back to `sent`.
    4. Write `stock_movement` rows with `movement_type='return_to_vendor'`, `reason_code='rtv'`, `related_entity_type='return_to_vendor'`, `related_entity_id=rtv.id` for each line where product_id is set. Ad-hoc product-null lines skip stock impact.
    Same best-effort rollback pattern as GRN post and complaints.ts.
  - `cancelReturnToVendor` — draft-only.
  - `recordVendorCreditNote` — posts the vendor's credit-note number + date onto a posted RTV. Captures the buyer's debit-note → vendor's credit-note round trip in one place; the credit note will feed into 3-way reconciliation when vendor bills land in P2.
  - `listReturnsToVendor`, `getReturnToVendor`, `getGrnForReturn`.

  **RTV UI:**
  - `/procurement/grns/[id]/return` — server shell + client form. Defaults qty_returned to 0 (user opts in per line), per-line reason mandatory when qty > 0. Shows for each line: accepted, already-returned, returnable, remaining-after.
  - `/procurement/returns` — list with status filter + emerald "credit note ✓" badge when the round trip is recorded.
  - `/procurement/returns/[id]` — detail with header card + linked GRN + PO + warehouse, lines table with GRN-accepted context + returned qty in rose, draft-only Post/Cancel buttons via `<RtvWorkflowActions>`, and a `<RecordCreditNoteForm>` shown only when status='posted' AND credit_note_no IS NULL.
  - GRN detail extended: "Return to vendor" CTA (rose accent, gated on `posted` GRN with accepted-minus-prior-returns > 0) + a Returns section listing RTVs against the GRN.

  **PO PDF** (`app/(print)/procurement/orders/[id]/pdf/page.tsx`):
  - Lives under the existing `(print)` route group (re-uses the auth layout); mirrors `app/(print)/quotes/[id]/boq/page.tsx` pattern.
  - Imports the existing `<PrintButton>` from the quote BOQ to avoid duplicating the trivial client component.
  - Renders address blocks from PO snapshots (`vendor_address_snapshot`, `bill_to_snapshot`, `ship_to_snapshot`) so the document is stable across master mutations.
  - Meta strip: PO date / expected delivery / payment terms / currency.
  - Lines table with HSN/SAC, qty/rate, taxable, GST%, total. Header columns adapt to interstate vs intrastate detection.
  - Totals card with IGST OR CGST+SGST split based on `lines.some(is_interstate)`.
  - Terms section enumerates from PO header fields (payment days, delivery, warranty, LD, retention, other) plus standard Indian B2B clauses (e-way bill mention, rejection pickup window, computer-generated disclaimer).
  - Signature blocks for buyer + vendor acknowledgement.
  - PO detail header gets a "Print PDF" button (border-only style to not compete with the existing emerald Receive button) opening the print route in a new tab.

  **Schema** (migration 0059):
  - `return_to_vendor` table (header — grn_id + po_id + vendor_id + warehouse_id, optional vendor_credit_note_no/_at, reason, notes, 3-state status: draft/posted/cancelled).
  - `return_to_vendor_line` table (rtv_id + grn_line_id + po_line_id, qty_returned > 0 enforced via CHECK, reason, remarks).
  - `stock_movement.movement_type` CHECK extended via DROP CONSTRAINT + ADD CONSTRAINT to admit `'return_to_vendor'`. Preserves all existing 10 movement types.
  - New `return_to_vendor_seq` + `set_return_to_vendor_number()` trigger reading `render_tenant_code` (0051 helper) with VT-RTV-* fallback.
  - `next_code_sequence()` RPC whitelist extended with `'return_to_vendor'`.
  - Per-tenant code templates seeded: Vyara `VT-RTV-{yyyy}-{nnnn}`, Raj `RA-RTV-{yyyy}-{nnnn}`. `CodeTemplatesSchema` Zod in `lib/tenants/settings-schema.ts` extended.

  **Product-linked sample data** (migration 0060):
  - `VT-PO-2026-0006` — Vyara, V-CEM-01 as supplier, 200 sqft × ₹180 of INTLK-300-GRY pavers, intra-state (CGST+SGST), ₹42,480 total (auto-approve).
  - `RA-PO-2026-0007` — Raj, V-CBL-01 (Polycab), 10 rmt × ₹2,200 of CBL-LT-150 cable, intra-state, ₹25,960 total (auto-approve).
  - Both draft. User can walk: submit → auto-approve → send → receive → watch `/inventory` and the per-warehouse stock balance shift on GRN post (the first product-linked GRN flow on the platform).

  **Architectural decisions recorded:**
  - **RTV is a separate entity, not a negative-qty GRN.** Matches Indian accounting paradigm where the buyer issues a debit note (RTV) and the vendor responds with a credit note. Easier audit, easier downstream reconciliation in P2.
  - **stock_movement.movement_type='return_to_vendor'** is added as a first-class type rather than reusing `adjustment_minus` with a reason code. Adjustment_minus means "we counted wrong / damage write-off"; RTV means "we sent it back to the vendor". Distinct semantic; worth the schema cost.
  - **PO PDF re-uses the (print) layout** instead of building a new route group. The (print) layout already gates on auth; no need to duplicate.
  - **PrintButton imported across print pages** rather than abstracting a shared component. The component is 12 lines and importing it directly is cheaper than refactoring; we'll lift to `components/print/print-button.tsx` if a 3rd print page is added.

  **Verification:**
  - `npx tsc --noEmit` clean.
  - All 4 new routes compile and 307 to `/login` for unauth as expected.
  - Migrations 0059 + 0060 applied to remote; NOTICE confirms seed.

  **What's still queued (none of these block P2):**
  - **AiSensy WhatsApp send for PO** — UI affordance exists implicitly (the PDF link), but the WA template + send path lands when other vendor-comms features land.
  - **RTV → vendor bill reconciliation** — the credit_note_no field is captured; matching against vendor invoices happens in P2 (DEL-018 / FIN-019).

### Procurement P1β — Goods Receipt Note end-to-end (pending commit)
- **Tracks:** DEL-017 (✅ — RTV the only remainder, lifted to P1γ)
- **Capability:** Delivery (procurement) + Platform (stock-movement integration via polymorphic FK)
- **Tier:** Must-have post-C#2
- **Status change:** ✅ Partial (schema) → ✅ (RTV → P1γ)
- **Notes:** Second slice of the procurement module. Picks up the GRN tables shipped in P1α (`goods_receipt_note` + `_line`) and wires the full consumer — server actions, UI, sample data — so a buyer can receive goods against a PO, see stock posting (where products are linked), and watch the PO state advance from `sent` → `partly_received` → `received` automatically. Per the phased-builds memory ([[feedback-phased-builds]]), I built this slice end-to-end before starting P2; not bundling P1β + P2 in one autonomous pass.

  **Server actions** (`lib/actions/goods-receipt-notes.ts`):
  - `createGoodsReceiptNote` — validates the PO is in a receivable state (approved / sent / partly_received), per-line validates qty + rejection-reason-when-rejected-positive, inserts header + lines, rolls back via soft-delete on line-insert failure, optional `post_immediately` skips the draft state.
  - `postGoodsReceiptNote` — the atomic 4-step state advance:
    1. Flip GRN status → posted (with rollback helper if any downstream step fails).
    2. For each GRN line: refresh parent PO line + update `qty_received += accepted` and `qty_rejected += rejected` (last-write-wins race is acceptable v1).
    3. Refresh all PO lines + recompute parent PO status — all fulfilled = `received`, any partial = `partly_received`, else fallback `sent` (defensive).
    4. Insert stock_movement rows for each accepted line where `product_id IS NOT NULL`: `movement_type='receipt'`, `reason_code='purchase'`, `related_entity_type='goods_receipt_note'`, `related_entity_id=grn.id`. Ad-hoc product-null lines skip stock impact silently.
    Same sequential-actions pattern as `lib/actions/complaints.ts` — Supabase JS doesn't expose transactions to the client; best-effort rollback on intermediate failure.
  - `cancelGoodsReceiptNote` — draft-only. Posted GRNs require RTV (P1γ).
  - `listGoodsReceiptNotes` (with status + po_id filters) + `getGoodsReceiptNote` (with PO line description join for context) + `getPoForReceive` (returns PO + lines with `qty_pending` computed, used by the create form).

  **UI:**
  - `/procurement/orders/[id]/receive` — server-rendered shell validates PO state, redirects on non-receivable status, surfaces an "all lines fulfilled" notice when there's nothing to receive. Client form (`form.tsx`) shows each PO line with `qty_ordered` / `qty_already_received` / `qty_pending`, defaults the editable `qty_received_now` to `qty_pending` (greedy receive — most realistic user behaviour), plus optional `qty_rejected` + required reason + batch/expiry/remarks. Live counters at the top of the line block ("X of N receiving · accepted · rejected"). Per-line "line will close" hint when the receipt fulfils the line. Paperwork section: challan / vendor-invoice / vehicle / transporter / e-way bill / QC status / QC notes. Two buttons: save-as-draft vs save-and-post. Over-receipt (qty_received > qty_pending) is allowed with an inline amber chip — buyer can choose to accept a vendor's over-shipment.
  - `/procurement/grns` — list with 3-status filter chips (drafts / posted / cancelled), each row shows GRN number + status pill + date + linked PO number + warehouse + line count + accepted/rejected qty rollup.
  - `/procurement/grns/[id]` — detail page with header card (status + QC pill + linked PO + warehouse), lines table with received/accepted/rejected columns + batch+expiry + remarks column showing rejection reasons in rose, paperwork card (challan/invoice/vehicle/transporter/e-way), QC + internal notes card. Draft-only Post + Cancel-with-reason buttons via small client island (`workflow-actions.tsx`).

  **PO detail extensions:**
  - "Receive goods" CTA in the header buttons row, visible when PO status ∈ (approved / sent / partly_received) AND any line has `qty_received < quantity`. Emerald accent to distinguish from the existing workflow buttons.
  - New "Goods receipts" section listing GRNs against this PO with status pill + date + line count + accepted/rejected qty.
  - Per-line "X/Y received" inline indicator under each line description (violet when partial, emerald when full); also shows rejected qty in rose when present. Visual signal that maps to the order list page's existing receive-% chip.
  - Procurement landing's DEL-017 gap marker replaced with a live link to `/procurement/grns` showing "Live ✓".

  **Architectural decision recorded.** GRN posting uses `stock_movement.related_entity_type='goods_receipt_note'` + `related_entity_id=grn.id` rather than adding po_id/grn_id FK columns to `stock_movement`. Preserves the existing polymorphic convention used by `dispatch_issue` / `sample_issue` / `transfer_out`. No schema change required to wire stock movement to a new entity type in future; just write the right enum string.

  **Sample GRN data** (migration 0058 — idempotent via fixed UUIDs):
  - **Vyara `VT-GRN-2026-0001`** — fully receives all 5,000 cartons from VT-PO-2026-0004 (Pack Industries, sent · ₹1.30L). PO status flipped from `sent` → `received`. QC status `accepted`, challan + vehicle + transporter + e-way bill all captured.
  - **Raj `RA-GRN-2026-0002`** — partial receipt against RA-PO-2026-0005 (L&T, sent · ₹12.30L · 3 lines). Receives 1 of 2 VFDs (batch L1-2026-VFD-A0231) + all 4 SFUs, leaves bus duct pending. PO status flipped from `sent` → `partly_received`. QC status `partial_accept`, full paperwork captured.
  - Both GRNs use ad-hoc PO lines (no product_id), so no `stock_movement` rows get written. That matches the action's correct behaviour (services / fabricated items don't impact warehouse stock). To exercise the stock-movement path in P1γ we'll seed a PO with product-linked lines.

  **Verification.**
  - `npx tsc --noEmit` clean across all new files.
  - Dev server compiles `/procurement/grns`, `/procurement/orders/[id]/receive`, `/procurement/grns/[id]` cleanly; all return 307 to `/login` for unauthenticated curl as expected.
  - Migration 0058 applied to remote; NOTICE confirms "VT-PO-2026-0004 → received (1 GRN). RA-PO-2026-0005 → partly_received (1 GRN)."
  - `scripts/check-procurement-seed.mjs` extended with GRN counts + per-row link to parent PO; output verifies both tenants now show 1 GRN each, PO statuses match.

  **Deferred (recorded in DEL-017 row):**
  - **P1γ:** RTV (Return to Vendor) for posted GRNs — counter-flow that reverses qty_received and writes a negative `stock_movement` ('return_to_vendor' reason). Different semantic from cancellation (which is a draft-only undo). Will also seed a product-linked PO so the stock-movement path is exercisable.
  - **P1γ:** PO PDF + WhatsApp/email send (AiSensy template, mirrors quote PDF pattern).
  - **P2:** vendor bill matching against GRN (the 3-way match) — needs `vendor_bill` schema first.

### Procurement P1α — operational backbone (PO + GRN schema + vendor KYC) (pending commit)
- **Tracks:** REL-016 (✅), DEL-016 (✅ Partial), DEL-017 (✅ Partial schema-only); new IDs **registered as 📋** in §11: DEL-015, DEL-018..023, FIN-019..023, PLAT-028
- **Capability:** Delivery (procurement) + Relationship (vendor KYC) + cross-cutting Platform (approval seeds)
- **Tier:** Must-have post-C#2 across the lot
- **Status change:** New module — 15 Blueprint rows added. REL-016 + DEL-016 + DEL-017 flipped to ✅ (Partial); remaining 12 rows registered for P1β / P2 / P3 / P4 / P5 / P6.
- **Notes:** User asked: *"how does procurement work in our inventory + can the customer manage everything here?"* Honest audit answer: vendor table is a thin Rolodex; stock receipt has a `reason='purchase'` enum but no PO / GRN / AP linkage; Constitution v3 §5 (amended 2026-06-22) already brought procurement into scope for industries that need it. User followed up with *"first deeply understand the complete procurement module + Indian domain context, divide into phases, then build. Give both Tally and native options."* I mapped the complete 10-stage Indian procurement workflow (PR → RFQ → CS → PO → advance → GRN → vendor invoice → 3-way match → TDS → payment + GSTR-2B / MSME / e-invoice / e-way / job-work / blanket-PO / imports), phased into 6 phases (~32-37 dev-days for P1+P2+P3, the must-have backbone). Three blocking decisions raised; user replied *"act as product owner and take decisions on behalf of me and build it."* PO decisions taken:

  - **Q1 PR/Indent** — defer to P4 with RFQ. Tier-2 firms don't formalise PRs; bundling with RFQ/CS lands the demand-to-PO traceability more naturally.
  - **Q2 AP master mode** — default `tally` (CRMOS does PO + GRN, Tally remains AP master + tax + bank). Per-tenant feature flag `procurement.ap_master` from day one (PLAT-028); flip to `native` when a tenant outgrows Tally.
  - **Q3 Approval policy seeds** — seed sensible defaults (₹50k–₹5L manager / ₹5L–₹25L manager→admin / ₹25L+ admin; sub-₹50k auto-approves) for both Vyara + Raj. Tenants override at `/admin`.
  - **Scope** — built P1α today (the operational backbone), not all of P1. P1β + P2 land in follow-ups.

  **Shipped in this commit:**

  **Schema (migration 0054 — `0054_procurement_p1a.sql`).** Vendor master extended with 8 columns: `pan` + regex validation, `msme_status` (CHECK in {not_msme, micro, small, medium}), `msme_udyam_no`, `bank_account_no`, `bank_ifsc`, `bank_name`, `payment_terms_days` (default 30), `gst_state_code` (2 chars, backfilled from `gstin[0:2]`). New tables: `purchase_order` (header — vendor, project (optional), ship-to warehouse, dates, currency, 8-state status enum from draft → closed, money rollups, 6 terms columns (payment_terms_days / delivery / warranty / LD / retention_pct / other), workflow timestamps + actors, approval_request FK, audit + soft-delete), `purchase_order_line` (snapshot model — product_id nullable for ad-hoc, mandatory description, hsn_code, unit, quantity NUMERIC(14,3), rate, discount_pct, taxable_value, is_interstate BOOLEAN, gst_rate_pct CHECK in {0, 0.1, 0.25, 1, 3, 5, 6, 12, 18, 28}, igst_amount + cgst_amount + sgst_amount stored separately, amount_total, qty_received + qty_rejected for GRN-progress chips), `goods_receipt_note` (schema only — UI consumer in P1β; vendor + warehouse + challan/invoice/vehicle/transporter/e-way-bill capture, QC state machine, 3-state status, posted_at/by + cancelled_at/by audit), `goods_receipt_note_line` (po_line_id FK with CHECK qty_accepted+qty_rejected ≤ qty_received, batch_no, expiry_date, rejection_reason). Two new sequences + safety-net auto-number triggers reading `render_tenant_code` (0051); `next_code_sequence` RPC whitelist extended with `purchase_order` + `goods_receipt_note`. RLS = tenant isolation on every new table.

  **Settings + policy seed (migration 0055 — `0055_procurement_settings_and_policies.sql`).** Per-tenant code templates seeded: Vyara `VT-PO-{yyyy}-{nnnn}` / `VT-GRN-{yyyy}-{nnnn}`, Raj `RA-PO-{yyyy}-{nnnn}` / `RA-GRN-{yyyy}-{nnnn}`. Three approval policies + steps per tenant for `entity_type='purchase_order'` (₹50k.01-₹5L: 1-step manager; ₹5L.01-₹25L: 2-step manager→admin; ₹25L+ unbounded: 1-step admin). `tenant.settings.codes.{purchase_order,goods_receipt_note}` also added to `CodeTemplatesSchema` in `lib/tenants/settings-schema.ts` with VT-* defaults so the Zod validator round-trips cleanly.

  **Server actions.** `lib/actions/purchase-orders.ts` (full module): `createPurchaseOrder` (fetches vendor + warehouse + tenant.settings.company for address snapshots, computes `isInterstate` from a 38-row STATE_CODES lookup table vs vendor.gst_state_code, per-line GST split with last-paise allocation to SGST so cgst+sgst==tax even after rounding, atomic header-then-lines insert with soft-delete rollback on line failure), `submitPurchaseOrder` (reuses PLAT-014 — sub-₹50k auto-approve via `autoApproveIfNoPolicy: true`, else status → pending_approval with approval_request_id), `sendPurchaseOrder` (approved → sent status flip), `cancelPurchaseOrder` (reason-required, blocked on received/closed/cancelled), `listPurchaseOrders` + `getPurchaseOrder` (with `syncPOFromApproval` denormalisation pattern mirroring expenses.ts — reads approval_request.status at list/get time and reconciles PO status without Inngest). Plus 4 picker queries for the create form (vendors, warehouses, products, projects). `lib/actions/vendors.ts` extended with full KYC params + GSTIN + PAN regex validation; both create and update normalise GSTIN/PAN/IFSC to uppercase and derive `gst_state_code` from GSTIN[0:2].

  **UI.** `/procurement` (server component) — 4-card KPI strip (Open POs + open value, Awaiting approval, Receiving, Drafts), recent-POs list (top 5 with status badge), Coming-next card with 3 honest gap markers (DEL-017 P1β, DEL-019 P2, FIN-020 P2). `/procurement/orders` — status-filter chip row (8 statuses), receive-% chip when partial. `/procurement/orders/new` — heavy client form (`form.tsx`): vendor picker auto-fills payment terms from vendor master; vendor + warehouse selection triggers an `Inter-state · IGST` vs `Intra-state · CGST + SGST` chip; dynamic line table with per-line live taxable + tax + total inline below each row; aggregate totals card recalculates live; terms card with delivery / warranty / LD / retention / other; two save buttons (draft / submit). `/procurement/orders/[id]` — header card with status badge + workflow buttons (POWorkflowActions client island for Submit / Send / Cancel-with-reason-dialog), MSME 45-day reminder ribbon when vendor is MSME (with FIN-020 forward reference), inline `<ApprovalCard>` from PLAT-014 when `approval_request_id` is set, 9-column line table (line# / desc+unit / HSN / qty / rate / disc / taxable / GST% / amount), totals card (IGST or CGST+SGST detected from lines), terms card, address snapshots card (bill-to / ship-to / vendor), audit timestamps footer. Vendor form (`app/(app)/admin/vendors/vendor-form.tsx`) rewritten as a 4-section dialog (tax+statutory / bank / contact / notes); page.tsx `SELECT` extended for new columns; row-actions.tsx forwards them. Sidebar — new "Procurement" item under the Delivery group between header and Inventory.

  **Verification.** `npx tsc --noEmit` clean (one round of fixes — Supabase nested-select returned-as-array issue resolved with a 3-line `pickOne<T>()` helper). Dev server compiles `/procurement`, `/procurement/orders`, `/procurement/orders/new`, `/admin/vendors` cleanly in 535-1283ms each; all return 307 to /login for unauthenticated curl as expected. Both migrations applied via `supabase db push` against the linked remote; policy-seed NOTICEs confirmed for both vyara-tiles + raj-avinsys.

  **Deferred (intentional, recorded in respective Blueprint rows):**
  - P1β: GRN consumer UI (server actions + screens; schema lives in 0054 ready for it), RTV, PO PDF + WhatsApp/email send, open-PO read-model with by-vendor/by-category breakdowns, audit-log emission via `activity` for PO lifecycle events.
  - P2: vendor bills, 3-way match, AP ageing dashboard (native or Tally read-through), MSME 45-day compliance (FIN-020), GST ITC book-side ledger, `procurement.ap_master` adapter (PLAT-028).
  - P3: payment scheduling, TDS auto-classification, NEFT/RTGS export, Form 16A, MSME-1.
  - P4: PR/Indent + RFQ + Comparative Statement.
  - P5: GSTR-2B reconciliation, e-invoice IRN validation, e-way bill capture on GRN.
  - P6: Job Work + ITC-04, Blanket PO + Rate Contract + Release Orders, Import procurement (BoE + FX + customs), vendor performance scorecard, negotiation-savings tracker.

  **Tally vs Native AP — architectural call recorded.** Default is Tally-mode for both Vyara + Raj; CRMOS owns PO + GRN as the *operational* layer and Tally remains AP master (vendor bills + payments + tax filings + bank). Toggling to native-mode is a per-tenant flag (PLAT-028) — no code fork. This matches Constitution Principle #5 ("own the commercial + operational layer; integrate the rest") and means a customer who already runs Tally for ₹100cr+ AR can adopt CRMOS procurement without ripping out their accounting. The native-mode wiring (full vendor-bill + AP ledger UI in CRMOS) is one Sprint of work in P2 when a customer asks; the architecture is ready.

  **What this means for Raj:** the procurement story you'd pitch is now real, not a slide. Raj raises POs in CRMOS for their EPC + panel manufacturing flows (RA-PO-{yyyy}-{nnnn}), the IGST/CGST split happens automatically based on vendor location vs site warehouse, approvals route through the seeded ₹5L / ₹25L thresholds, and goods receipt + vendor billing remain in Tally where their accountant already lives — until they're ready to move it natively.

### Raj demo Phases 2 + 3 + 4 + 5a + 6 — ALL SHIPPED OVERNIGHT (490ad67 · 206d9d9 · 850d4ad · a62a06f · 4767b98)
- **Tracks:** CS-001 (✅), CS-009 (✅), cross-industry-by-configuration principle (live test); 8 migrations (0045–0051); 4 integration test scripts; 5 server-action files
- **Capability:** Cross-cutting (Customer Success + Platform fixes + AI prompt refactors)
- **Tier:** Must-have post-C#2 (CS-001) · Nice-have (CS-009)
- **Status change:** CS-001 📋 → ✅; CS-009 📋 → ✅; Constitution v3 cross-industry-by-config principle empirically validated on first non-trivial test
- **Notes:** User requested overnight autonomous build of Phases 2–6 of the Raj demo plan. Per CLAUDE.md "be careful with shared-state actions" + transparent-about-limits, surfaced upfront that real E2E browser walks weren't possible without Playwright/Puppeteer (not in env); offered vitest unit tests + service-role+anon-key integration scripts + curl page smokes as the testing layer; user accepted Option C ("all phases"). Phase commits + summaries:

  **Phase 2 (490ad67) — Mock data + cross-tenant view fix.** 64 mock rows for Raj (5 firms in chemicals/pharma/energy/infra, 12 contacts, 8 electrical products, 4 projects spanning both EPC + Panel pipelines, 4 quotations with varied statuses, 3 sales orders, 1 advance invoice). Migration 0046 extended project.segment CHECK to admit `'epc_project'` + `'panel_order'`. **Migration 0047 — CRITICAL security fix:** discovered during integration test that `invoice_ageing_v` + `dealer_ledger_v` views were leaking cross-tenant data — Raj admin could SELECT Vyara invoices through the view. Root cause: PG views run with OWNER privileges by default; the postgres superuser owner has BYPASSRLS. Fix: `ALTER VIEW … SET (security_invoker = true)` (PG 15+ feature) forces RLS evaluation as the calling user. Bug existed since Slice 2 (migration 0006); the Raj demo surfaced it exactly as the cross-industry rehearsal was supposed to. 26/26 integration assertions pass post-fix.

  **Phase 3 (206d9d9) — CS-001 minimum-viable complaint module.** Migration 0048 ships severity_master + complaint_type_master + complaint_stage (7 stages: logged → triaged → assigned → in_progress → resolved → closed + rejected as terminal) + complaint + complaint_stage_history + activity trigger + 8 new activity types + ai_extraction.complaint_classification entity_kind. Migration 0049 follow-up — activity_type_master seeds for complaint_* (0048 added to CHECK but missed the master seeds; trigger from 0029 validates against master). `lib/actions/complaints.ts` ships 6 server actions (createComplaint, advanceComplaintStage, assignComplaint with auto-advance, recordComplaintResolution, closeComplaint, rejectComplaint, listComplaints). UI: `/complaints` list with KPI strip (total/open/closed/unassigned) + open + closed sections; `/complaints/[id]` detail with header card + linkage + resolution + stage-advance forms + history. New "Customer Success" sidebar group. 3 seeded complaints for Raj (Surat critical breakdown in_progress assigned, Adani billing dispute logged unassigned, L&T VFD vibration resolved+closed with realistic 6-step history). 13 unit tests + 11 integration tests pass. 9 architectural decisions documented in OVERNIGHT-NOTES.md with cost-to-flip for each.

  **Phase 4 (850d4ad) — CS-009 AMC contracts.** Migration 0050 ships amc_contract (5-state lifecycle: draft / active / expired / renewed / cancelled; visit_frequency enum monthly/quarterly/bi_annual/annual/custom; parent_contract_id for future renewals; source_sales_order_id linkage) + amc_visit_schedule (one row per scheduled visit, 5 statuses) + complaint.amc_contract_id FK + activity triggers + 7 new activity types. `lib/actions/amc.ts` ships 4 server actions including createAmcContract that auto-generates evenly-spaced visit schedule from frequency × period using new helper `computeScheduleDates`. UI: `/amc` list page only (detail page deferred). 2 active AMC contracts seeded for Raj (Surat monthly ₹12L with 3 done + 9 scheduled; L&T quarterly ₹6L all scheduled for future August-2026 start), 16 visit_schedule rows total. Surat complaint #1 linked to Surat AMC contract demonstrating cross-module linkage. 7 unit + 11 integration tests pass.

  **Phase 5a (a62a06f) — Drawing-approval gate (data + read-only helper).** Seeded 2 gate_requirement rows (one per Raj pipeline template: epc_project drawings_approved + panel_order drawings_approved, both requiring drawing_approval_pack document). `lib/gates.ts` ships read-only `evaluateGatesForProject` + `evaluateGatesForStage` returning `{ id, label, kind, required, satisfied }` per gate. 6 unit tests pass. **Blocking enforcement on advanceProjectStage deliberately deferred** — would need careful integration with the existing project advance code path; recorded in OVERNIGHT-NOTES for follow-up.

  **Phase 6 (4767b98) — Vyara-isms hunt.** Largest single fix: migration 0051 introduces `render_tenant_code(tenant_id, kind, seq)` DB helper + rewrites all 5 auto-number triggers (quotation, sales_order, invoice, complaint, amc_contract) to read `tenant.settings.codes.<kind>` with COALESCE fallback to VT-* default. Raj's tenant.settings extended with complaint + amc code templates. Empirically verified: insert Raj complaint without pre-filled number → RA-CMP-2026-0004 (matches RA-CMP-{yyyy}-{nnnn} template) instead of the Vyara-shaped VT-CMP-*. AI prompt fixes: dispatch-diary.ts (industry examples broadened beyond pavers/tiles), invoice-photo.ts (header changed from "building-materials manufacturer" to "Indian B2B operating system"), daily-digest.ts (header comment industry-neutral), visit-prep-brief.ts (added AMC example, softened paving-stage specific phrasing). Page metadata fixes: layout.tsx description + login.tsx placeholder + login subtitle. Vyara-isms remaining (deferred + documented): is_paving_stage flag generalisation, next_code_sequence RPC extension for new kinds, per-page copy sweep across 30+ files.

  **Verification across all 5 phases:** 205 vitest tests pass (was 179 pre-overnight — +26 new). 4 integration test scripts (test-raj-mock-data, test-raj-complaints, test-raj-amc — total 48 assertions all green). tsc clean throughout. Every commit gate enforced before move-to-next. **The "Walked?" gap remains open** — I can render pages via curl + verify DB via service-role + dev-log read, but cannot click buttons in a real browser or visually inspect layouts. User morning walk through /demo → Raj sign-in → /complaints → /amc → /projects → sign-back-into-Vyara is the human validation no script substitutes for. **Time-vs-estimate:** original ~3-week plan (3 days/phase × 5 phases) compressed to one overnight pass because the audit pattern shrunk each phase substantially — most pieces (relationship_type_master vocabulary, visit_purpose system seeds, attachment infrastructure, approval engine, type masters, RLS patterns) already existed and just needed wiring.

  **Open questions for the morning** (also in OVERNIGHT-NOTES §"Open questions for you"): complaint state machine shape for Raj's actual motion · AMC visit frequency enum sufficiency · drawing-approval gate as blocking or read-only · code prefix preferences (RA-CMP vs alternatives) · AMC detail page priority.

## 2026-06-22

### Raj demo Phase 1 — tenant provisioned + pipelines seeded + /demo landing page (f2bf8ff)
- **Tracks:** governance (Raj demo build, not a Blueprint Status Tracker row — onboarding rehearsal); FLD-009 (new system visit_purpose codes); cross-industry-by-configuration principle test
- **Capability:** Cross-cutting (Platform + Relationship + Revenue + Field Ops touched via seeds)
- **Tier:** N/A (Raj demo, not a tracked Blueprint capability)
- **Status change:** Phase 1 of 6 done; Phases 2–6 still planned
- **Notes:** First cross-industry tenant successfully provisioned + seeded + signable-in. **Foundational audit findings** (Explore agent before code) shaped the design and were honest about what already existed:
  - NO `pipeline_template` table — stages hang directly off `tenant_id + segment` TEXT. Vyara uses `segment='architect'` for its 6-stage flow; Raj uses `segment='epc_project'` (18 rows) + `segment='panel_order'` (12 rows). The "two pipeline templates" decision lands as two segment values, not a new table.
  - All 3 relationship_types I had originally planned for Raj (industrial_buyer / epc_consultant / oem_partner) **already exist as system rows** in `relationship_type_master` from migration 0031 (`customer`, `consultant`, `partner`, `vendor`). **Zero new relationship_type seeds needed for Raj.** Cross-industry vocabulary turned out to already cover EPC.
  - Of 6 originally-planned visit_purpose codes for Raj, only 2 (`drawing_review_meeting`, `fat_witness`) were genuinely new — the other 4 (commissioning, amc_visit, installation, handover-as-`handover`, breakdown as `breakdown_response`) were already in migration 0032's seed. New ones land as SYSTEM rows (tenant_id NULL) since they benefit any future EPC/electrical/HVAC tenant per the cross-industry principle.
  - `is_paving_stage` flag is fully Vyara-specific (drives the Slice-1 paving-followup Inngest hero). Raj has no stage with `is_paving_stage=true` — Inngest job will silently no-op for Raj. Generalising to a per-tenant `is_hero_stage` with a tenant-configurable label is a Phase 6 decision (Vyara-isms hunt), not Phase 1.
  - Existing system masters already cover Raj's needs for: relationship_type (12 system rows cover EPC vocabulary), task_type (17 system seeds), activity_type (24 system seeds), most visit_purpose. The platform claim *"configuration covers most industry variation"* held up empirically — first cross-industry test confirms it.

  **Files shipped:**
  - `supabase/migrations/0045_raj_demo_visit_purposes.sql` — 2 new SYSTEM visit_purpose rows (tenant_id NULL = visible to all tenants). Applied to remote via `supabase db push`.
  - `scripts/onboard-tenant-config.raj.example.json` (committed) + `scripts/onboard-tenant-config.raj.json` (gitignored — holds the admin password). Codes prefix `RA-` (RA-QT/RA-SO/RA-INV/RA-DC/RA-LD); `enable_dealer_portal=false` (EPC sells direct to industrial customers, no dealer channel); admin email `admin@rajavinsys.example` / password `RajDemo@1234` (matches `/demo` page hardcode).
  - `scripts/seed-raj-pipeline.ts` — Raj-specific pipeline stage seed. Looks up `raj-avinsys` tenant by slug (separation of concerns from `onboard-tenant.ts`); idempotent via delete-then-insert (PostgREST `.upsert()` couldn't infer the partial unique index on `(tenant_id, segment, stage_key) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL` — partial-index inference is conservative). 30 rows inserted (18 EPC + 12 Panel).
  - `app/demo/page.tsx` — public landing page (no auth required). Two cards (Vyara Tiles, Raj Avinsys) with inline credentials shown for transparency. Each card has a `<form action={demoSignIn}>` with hidden email/password inputs.
  - `app/demo/actions.ts` — dedicated `demoSignIn(formData): Promise<void>` server action (existing `signIn` returns `{error}` for inline display which doesn't satisfy React's form-action-prop `Promise<void>` shape). Always redirects (success → /dashboard; failure → /demo?error=...).

  **Runtime hiccups + fixes** (recorded for future onboarding):
  - First run of `onboard-tenant.ts` blew up on `_comment_features` key inside the features block — the Zod schema's `.passthrough()` let the string value through and tried to UPSERT it as a `tenant_feature` row. Fixed by stripping `_comment*` keys from both example + raj configs. Hardening the script to filter `_`-prefixed keys at runtime is a deferred follow-up.
  - First run of `seed-raj-pipeline.ts` failed with *"no unique or exclusion constraint matching the ON CONFLICT specification"* — PostgREST `.upsert()` couldn't infer the partial unique index. Switched to delete-then-insert (safe because all rows are tenant-scoped to Raj only).
  - `tsx` doesn't auto-load `.env.local` — needs `--env-file=.env.local` flag. Worth adding to `scripts/README.md`.

  **Verification (service-role + anon-key test script):**
  - Raj admin signs in via public anon auth flow ✓
  - 37 pipeline_stage rows visible to signed-in Raj admin (30 Raj-scoped + 7 system inheritances from older migrations)
  - 18 EPC stages + 12 Panel stages confirmed
  - New visit_purpose system codes visible to Raj ✓
  - 10 feature flags applied (`enable_dealer_portal=false`, rest `true`) ✓

  **Walked in browser:** user confirmed Vyara experience unchanged + Raj sign-in works. No Vyara-isms flagged yet (the surface is mostly empty for Raj until Phase 2 mock data lands; deeper hunt happens after data is seeded).

  **Effort:** ~3 days estimate → ~3 hours actual. Most of the savings came from the audit revealing that existing system masters already cover Raj's vocabulary. **Phase 2 next (~3 days):** mock data — 5 firms (chemicals/pharma/energy/infra), 2 in-flight EPC projects at different stages, 1 panel order, quotations + 1 advance invoice. Walks the platform thesis with real-looking data.

### Constitution v2 → v3 amendment · cross-industry positioning · Raj demo plan locked (ca5f945)
- **Tracks:** governance (Constitution + CLAUDE.md + Blueprint Last-updated + memory)
- **Capability:** Cross-cutting / governance
- **Tier:** N/A (governance)
- **Status change:** "Year-1 success = onboard a similar Tier-1/Tier-2 building-materials maker in 8 weeks" → "Year-1 success = onboard a customer in a different industry (Raj Avinsys, electrical EPC) in 8 weeks"
- **Notes:** Two strategic decisions landed today, one drove the other.

  **(1) The Constitution had been stale.** Blueprint v3 (`docs/PRODUCT-BLUEPRINT-v3.md` §0.1–§0.4) was already shaped horizontally — "modular Business Operating System for manufacturing, contracting, distribution, and service companies; industry behaviour from configuration + masters + activity types; 8 supported industries share one architecture." Constitution v2 still said "vertical SaaS for made-to-order building-materials manufacturers" with §5 explicitly excluding RMC / Steel / Furniture / Paint / Chemical and §10 deferring cross-industry expansion as "not a year-1 design constraint." Per CLAUDE.md's tiebreaker rule (*"Constitution wins on principles; Blueprint wins on capability partitioning"*) the two documents could co-exist, but only because nobody had tested the friction with a real cross-industry customer.

  **(2) Pitching Raj Avinsys Pvt. Ltd. forced the recognition.** Raj is Gujarat's "premier electrical contracting company" (since 2004) running three motions: EPC project work (industrial customers — chemicals/pharma/energy/infra), panel manufacturing (MCC/PCC/PDB/APFC/PLC built-to-order), and AMC + breakdown maintenance ("73% retention" their headline metric). Honest research surfaced that the architecture *does* fit Raj — 6 of 8 capabilities map cleanly to their motions; the gaps are CS-001 complaints (unbuilt), CS-009 AMC contracts (unbuilt), drawing-approval gate (workflow extension), milestone-billing schedule (Finance extension), procurement tracking (Constitution §5 needed to broaden). User chose **Frame A** (cross-industry by design) over Frame B (one-off opportunistic): *"For us closing a customer based on their need and make the product adjust based on their requirement is a win."* That sentence IS the platform thesis stated plainly — recorded as a new feedback memory `feedback-cross-industry-by-configuration` so it doesn't drift.

  **Amendment scope (surgical, not a rewrite):**
  - `docs/CONSTITUTION.md` title bumped v2 → v3; top paragraph rewritten (positioning); year-1 success criterion rewritten (Raj named as first cross-industry target); v3 amendment note added at top documenting why + when; Principle #5 rewritten (in/out-of-scope language broadened — procurement IN for industries that depend on it; RMC-shape still requires deliberate cost decision; "Out-of-vertical" language replaced with "fundamentally different operational shapes"); Principle #10 rewritten (cross-industry expansion **is** a year-1 design constraint as of 2026-06-22; new abstractions must ask "does this work for an electrical-EPC tenant too?"); Current build section refreshed (Vyara Tiles build mature through Slice 4 + Sprint 1 + INT-014 Slices 1+2+3+3.1+4; INT-014 Slice 5 dropped on 2026-06-21; now in Raj demo build); Principles #0–#11 unchanged (always industry-neutral, only #5 and #10 had building-materials-specific language).
  - `CLAUDE.md` preamble: top tagline rewritten to "modular Business Operating System"; year-1 metric rewritten with Raj named; doc reference bumped to (v3); the "Slice 1 + Slice 2 are complete..." stale paragraph removed and replaced with current state; Platform discipline test now asks "does this work for an electrical-EPC tenant too?"; Foundational audit Q7 references Constitution v3 + the Raj demo tenant as the live regression test; Current step section completely rewritten to record Raj demo plan (~3 weeks across 5 phases: provision tenant + masters → mock data → CS-001 → CS-009 → drawing-approval + milestone billing). Sprint 2 queue updated.
  - `docs/PRODUCT-BLUEPRINT-v3.md` Last-updated line records the amendment + Raj plan; no §11 row changes (governance change, not a capability change).
  - `docs/BUILD-LOG.md` this entry.
  - `MEMORY.md` indexes new feedback memory `feedback-cross-industry-by-configuration`; `project-vyara-os.md` refreshed (positioning at top; build status reflecting current state); `project-current-state.md` snapshot reflects the amendment + Raj demo phasing.

  **The Raj demo doubles as the Customer-#2 onboarding rehearsal.** Same code path a real second customer would take. The first time we flip to the Raj tenant, Vyara-isms in copy / AI prompts / seed data will surface; each surfaced item is a Customer-#2 readiness gap fixed before a real customer hits it. Predicted surface area (recorded in `project-current-state` for the next session): AI prompts referencing "manufacturing" / "Surat" / "tiles"; dashboard / empty-state copy; the Slice-1 `paving_stage` hero is fully Vyara-specific and likely needs to generalize to a per-tenant "hero stage"; dealer module needs feature-flag hidden for Raj (PLAT-004 already supports this); field_activity_type seeds need broadening.

  **No code changes in this commit.** Docs-only. tsc / dev-server / runtime smoke unchanged. The Raj demo build begins as Phase 1 (provision tenant + Raj-shaped masters) in a separate commit after this one lands.

## 2026-06-21

### Owner Dashboard — INT-014 Slice 5 dropped after build-then-revert (f4e87d7)
- **Tracks:** INT-014 (✅ final at Slices 1+2+3+3.1+4); INT-009 (drop sharpens its mandate)
- **Capability:** Intelligence
- **Tier:** Should-have (slice originally planned; now dropped)
- **Status change:** "Slice 5 = drill-down filters + Quick Actions + saved views" → ❌ Slice 5 dropped, subsumed by INT-009
- **Notes:** Built Slice 5.1 (drill-down filters: territory / role / rep, URL-param-driven, applied to people-aware sections only — Top reps · Today's field · Roster · Scorecards; honest dashed scope hint when filters active; `OwnerFilters` + `FilterScope` types extending `getOwnerOverview`; `allowedRepIds` Set hoisted into Section 9; new `owner-filter-bar.tsx` client component). Got it to a working state in the working tree (`tsc --noEmit` clean, `/owner` compiled in 2.8s with 1843 modules, smoke 307 for unauthenticated curl on both bare and filtered URLs). **Before commit, user pushed back:** *"I feel the filters are not required.. the chat would cover this part so lets drop the slice 5?"* Honest agreement — the conversational agent (INT-009, lifted from 💭 to 📋 in Slice 3.1) is the stronger drill-down path on a twice-a-day executive surface: filters force the owner to *operate* the dashboard (poke-around motion), chat lets them *interrogate* it (specific-answer motion). The trimmed brief's action chips (Slice 3.1) already cover the Quick-Actions need (5.2). Saved views (5.3) only matter if filters exist, so they fall away too. **Trade-off acknowledged:** the page loses the "pin the whole view to one territory" affordance — that becomes a chat turn instead of URL state. For an exec surface read twice a day that's the right call; would be wrong for a dashboard people live in 8 hours a day. **Revert executed in the working tree:** `lib/read-models/owner-overview.ts` — `OwnerFilters` + `FilterScope` types removed; `getOwnerOverview(period)` signature restored; the filter normalisation block (territoryFilter / roleFilter / repFilter / anyFilterActive) removed; `fieldReps` IIFE wrapper unwrapped back to direct query (no narrowing); `allowedRepIds` Set + `inAllowed()` helper removed from Section 9; Section 9 quote-attribution loops restored (no `anyFilterActive` gate); today's-expense query select restored (was `user_id, amount, status` → back to `amount, status`); Section 11 + 12 + 13 rollups restored to tenant-wide; `filter_scope: FilterScope` field removed from `OwnerOverview`; return statement restored. `app/(app)/owner/owner-filter-bar.tsx` — deleted. `app/(app)/owner/page.tsx` — `parseFilters` helper removed; searchParams type narrowed back to `{ period?: string }`; parallel `allFieldReps` fetch removed; `repOptions` + `territoryOptions` derivations removed; filter bar render + dashed scope hint removed; `OwnerFilterBar` + `Filter` icon + `OwnerFilters` + `RepOption` imports removed; header comment + footer copy rewritten to document the drop decision (not pretend the slice never existed). **Smoke after revert:** `tsc --noEmit` clean; `/owner` back to 307 in 22ms; remaining "Slice 5" mentions in shipped code are intentional documentation of the drop decision in the page header / page footer / read-model header (so future contributors don't accidentally rebuild what was decided against). **Drop sharpens INT-009's mandate** — chat is no longer a "natural complement to the brief"; it's the ONLY drill-down path on /owner. Worth flagging in the INT-009 planning doc next time it's touched. **Lesson recorded as memory note** (see [[feedback-phased-builds]] / [[feedback-money-first-owner-view]] adjacency): even when the audit, sub-slicing, and code all hold up, the right answer can still be *"don't ship this"* — and that's faster to discover after building one slice end-to-end than after building all three. The phased-builds rule did its job: walking 5.1 before bundling 5.3 + 5.2 means the revert is ~3 hours of work, not ~3 days.

### Honest Blueprint correction — INT-015 added; FLD-023 stays ❌ (pending commit)
- **Tracks:** INT-015 (new, 💭 Considered)
- **Capability:** Intelligence
- **Tier:** Nice-have
- **Status change:** new row 💭 added; rep-scorecards gap-marker text corrected to point at INT-015 instead of pretending it was "saved for Slice 5"
- **Notes:** User asked whether the two gap markers on the Owner Dashboard rep scorecards (live GPS + visit attribution) were unbuilt or just deferred. Honest answer: (1) **FLD-023** live GPS is a documented `❌ Future / won't build` decision in §11.5 — privacy + battery + reps will turn it off; check-in stamps give ~90% of the value. Not a forgotten todo, an intentional Blueprint position. (2) **Visit → closed ₹ attribution was NOT in the Blueprint** at all. I described it as "saved for Slice 5" in my Slice 4 commit, which was sloppy — per the workflow rule in CLAUDE.md ("If no item exists for what you're about to build, stop and add it first"), I should have added it as a tracked Blueprint item before describing it as deferred. **Correction shipped:** new `INT-015` row added to §11.8 (Intelligence) with nice-have tier and 💭 Considered status; the rep-scorecards.tsx gap marker now references INT-015 explicitly and acknowledges the attribution rule (last-visit-before-win vs all-visits-credited vs time-decay) as an open design decision before any build. Read-model header comment updated for the same fix. **No feature code, no schema changes — purely a documentation honesty correction.** Build decision still open: do we lift INT-015 to 📋 + build in Slice 5, or keep it 💭 and finish drill-downs / filters / Quick Actions first?

### Owner Dashboard — INT-014 Slice 4 · Field + People (227d24d)
- **Tracks:** INT-014 (Slices 1+2+3+3.1+4 ✅)
- **Capability:** Intelligence (cross-capability reads: Field Operations, Finance, Platform)
- **Tier:** Should-have
- **Status change:** ✅ Slices 1+2+3+3.1 → ✅ Slices 1+2+3+3.1+4
- **Notes:** Three new sections wired between Operations (§10) and Attention Centre (which still sits last so the page ends on the ranked action list). **Foundational audit before code:** `field_attendance` has per-user-per-day status (on_duty/wfh/leave/holiday) + check_in/out + total_km + reimbursement; `field_visit` has user_id + visit_outcome_id + location_label + state + visited_at; `expense` has user_id + amount + status + expense_date; `user_profile.role` CHECK IN ('admin','manager','sales_engineer','dealer') — field-eligible filter = role IN ('sales_engineer','manager'). RLS on field_attendance allows admin/manager to see all rows so the owner view works without surgery. Two honest gaps surfaced as visible markers (per Constitution Principle #11): live GPS → FLD-023 (already ❌ "won't build" in Blueprint — privacy + battery); visit → closed-₹ attribution → no FK from field_visit to quotation, saved for Slice 5 because the traversal (lead.won_at via visit.lead_id, project terminal stage via visit.project_id, then quote → invoice chain) is its own slice of work. **Files shipped:** `lib/read-models/owner-overview.ts` — 3 new types (`FieldToday`, `RosterEntry` + `RosterStatus`, `RepScorecard`), 6 new queries (field-eligible reps, today's attendance, today's visits, today's expenses, period attendance rollup, period visits rollup, period expenses rollup — totalling 7 actually counting the field_reps query; both attendance + visits queries reused for today and period as separate Promise.all slots so the period selector drives scorecards without a re-query). Roster sort is statuses (on_duty first, then wfh, leave, holiday, no_record) then within on_duty by check-in time (earlier first). Today's field activity is intentionally NOT period-coupled — the owner reading at 11am wants now-state not a 30-day average; the period selector drives §13 scorecards. Top field rep computed off `rep_scorecards[0]` (the same data the user sees). `facts` extended with 3 new fields: `on_duty_now_count`, `visits_completed_today`, `top_field_rep_label`. **3 new components** under `app/(app)/owner/`: `field-today.tsx` (4-card status strip + 3-card activity strip + link to /field/team); `team-roster.tsx` (list with status dot + role chip + check-in time/location/visits inline + status badge on the right + deep-link to /field/team/[userId]); `rep-scorecards.tsx` (2-card layout: top-5 list with trophy/award icons for ranks 1–3 + completion-% tone chip; companion card with 2 dashed gap markers). All reuse `formatMoney` (Indian short) + tabular-nums + lucide + status-never-color-only pattern. **Page wiring** in `page.tsx` — 3 new section blocks inserted after Operations; footer updated to acknowledge Slices 1+2+3+4 and the FLD-023 / attribution gaps. **Smoke test:** `npx tsc --noEmit` clean. `/owner` compiles in 191ms (Fast Refresh — full build was 1832 modules). 307 to /login expected for unauthenticated curl. **No migrations** in this slice. **Slice 5 planned:** drill-down filters per section (territory / role overrides), Quick Actions, saved views, possibly visit→closed-₹ attribution.

### Owner Dashboard — INT-014 Slice 3.1 · AI brief redesign (6efafd5)
- **Tracks:** INT-014 (Slices 1+2+3+3.1 ✅), INT-009 (lifted 💭 → 📋)
- **Capability:** Intelligence
- **Tier:** Should-have
- **Status change:** brief schema redesign + INT-009 promoted from Considered to Planned
- **Notes:** User feedback after walking Slice 3 in the browser: "AI insights right now is too text heavy, very hard to focus on anything." The screenshot showed why — the existing brief was 1 headline + 9 bullets averaging 27 words = ~250 words in 3 columns. Three options offered (3-chip, tighter sections, headline-only); user picked the 3-chip option. **Schema change** (`lib/ai/prompts/owner-brief.ts`): removed `top_opportunities[]`, `top_risks[]`, `recommendations[]`; added `actions[]` (max 3) where each action = `{ label, target, search }`. `target` is an enum (collections/quotes/projects/leads/tasks/approvals/firms) — the page the user will actually act on. `search` is optional substring the target page can pre-filter by (firm name or invoice number). Prompt v3 → v4 with explicit good/bad chip examples ("Call Surat Muni · ₹9.9L · 85d overdue" GOOD vs "Follow up on collections" BAD); system prompt rewritten to demand verb-first ≤10-word chips and forbid duplicating the headline in chip text. **Component swap** (`app/(app)/owner/owner-brief-card.tsx`): dropped the 3-column grid + the `BriefList` sub-component; new layout = severity-icon + title + chip + freshness on one row, headline (larger, weight-medium) below, then a "What to do today →" label + a flex-wrap row of `<ActionChip>` Link components. Each chip computes `/<target>?q=<search>` (pages that don't support `q` ignore it gracefully). Skeleton also updated to match new shape. **Cache invalidation:** the cache key already includes prompt version (`inline_text:owner_brief:<tenant>:owner_brief.v4`) so v3 cached briefs auto-invalidate on next read; no DB sweep needed. **INT-009 lifted from 💭 Considered to 📋 Planned** in §11 — the conversational agent is now scheduled as the natural "tell me more" companion to the trimmed brief. Pattern locked: tool-use agent wrapping read-models, NOT raw LLM-to-SQL; read-only v1; mandatory "I don't have that" path; cache by `(tenant, normalised_query)`. **Smoke test:** `npx tsc --noEmit` clean. `/owner` recompiled in 433ms (1805 modules — same as Slice 3, no module count change since one component shrunk and another didn't grow). 307 to /login expected for unauthenticated curl. **No migrations, no read-model changes** in this slice — purely AI-surface refactor.

### Owner Dashboard — INT-014 Slice 3 · Revenue + Ops (887e1a2)
- **Tracks:** INT-014 (Slices 1+2+3 ✅)
- **Capability:** Intelligence (cross-capability reads: Revenue, Delivery, Platform)
- **Tier:** Should-have
- **Status change:** ✅ Slices 1+2 → ✅ Slices 1+2+3
- **Notes:** Four new sections added between PTP coverage and the Attention Centre, so the full page now reads: Brief → Health KPIs → § Ageing → § Debtors → § Cash → § PTP → § Funnel → § Win rate → § Top reps → § Operations → Attention Centre. **Foundational audit before code:** quotation has `status` CHECK enum (draft/sent/revised/accepted/rejected/expired — note the actual closure verbs are accepted/rejected, NOT won/lost) + `sent_at` + `accepted_at` (no `rejected_at`, so rejected-in-period approximated via `updated_at` window — flagged but workable for win-rate denominator). lead has `won_at`, `lost_at`, `lost_reason_id`, `created_at`. dispatch has `scheduled_at`/`dispatched_at`/`delivered_at` but NO `expected_delivery_at` → on-time % surfaced as honest gap marker → DEL-007. stock_location has NO `safety_stock`/`reorder_level` → stock-at-risk surfaced as honest gap marker (no Blueprint item yet — discoverable for future). `lead_loss_reason` master exists per-tenant for label resolution. **Files shipped:** `lib/read-models/owner-overview.ts` — 4 new types (`RevenueFunnel`, `WinRateCycle`, `TopRep`, `Operations`), 11 new queries to Promise.all (open leads head, won/lost leads in period, sent/accepted/rejected quotes in period with created_by + sent_at + accepted_at for cycle calc, dispatch_stage master, dispatches/delivered/in-transit, lead_loss_reason master). A 12th new query (user_profile rep names) runs after the Promise.all once rep IDs are known — same pattern as Slice 1's buyer-name fetch. Funnel conversions can exceed 100% on short windows when wins predate the window — we surface that rather than capping (calibration honesty). Cycle calcs use defensive `>=0` guard. `facts` block extended with 10 new fields including a citation-ready `top_rep_label` and `top_loss_reason`. **4 new components** under `app/(app)/owner/`: `revenue-funnel.tsx` (vertical 4-stage bars with proportional widths + conversion-% chips between rows, click any stage → underlying list); `win-rate.tsx` (headline % with Strong/Average/Below-par chip + 3-stat sub-strip (cycle / lost ₹ / won ₹) + top-3 loss-reason chips + amber "leads closed without reason" hygiene flag rendering only when non-zero); `top-reps.tsx` (top 5 list with trophy/award icons for ranks 1–3, personal win-rate inline); `operations.tsx` (2-card layout: live ops card with dispatch counts + in-transit + delivered + avg cycle + by-stage chips; gaps card with on-time % → DEL-007 chip + stock-at-risk reason). All four reuse the same `formatMoney` (Indian short format) + tabular-nums + lucide + status-never-color-only pattern from Slices 1+2. **Page wiring** in `page.tsx` — 4 new section blocks inserted after PTP coverage; footer copy updated to acknowledge Slices 1+2+3 and list the 5 gap markers (CS-001, DEL-007, REL-016, FIN-014, safety_stock). **AI brief context extended** (`lib/actions/owner-brief.ts`) with a `revenue_depth` block (funnel stages + conversions + win rate + accepted/rejected ₹ + top 3 loss reasons + top 3 reps with personal win rate + ops snapshot). System prompt v2 → v3 with cache-key versioning (cache key still includes prompt version so v2 cached briefs auto-invalidate). **Smoke test:** `npx tsc --noEmit` clean across all changes. `next dev` boots in 1.5s; `/owner` compiles in 1.9s (1805 modules — Slice 2 was 1808; -3 modules makes sense, some lucide icons reused across slices). 307 to `/login` for unauthenticated curl expected. **No migrations** in this slice. **Slices 4–5 planned:** S4 Field + People (rep scorecards, attendance rollup, who's on duty right now), S5 drill-down filters + Quick Actions + saved views.

### Owner Dashboard — INT-014 Slice 2 · Finance depth (d702fcc)
- **Tracks:** INT-014 (Slices 1+2 ✅)
- **Capability:** Intelligence (cross-capability reads: Finance, Relationship)
- **Tier:** Should-have
- **Status change:** 🚧 Slice 1 → ✅ Slices 1+2
- **Notes:** Reorders the Blueprint plan per "money first" executive-surface feedback (saved previous session): Finance depth lands before Revenue+Ops (was Blueprint's S3). Four new sections inserted between Business Health and Attention Centre, so the page now reads: Brief → Health KPIs → § Ageing → § Debtors → § Cash → § PTP → Attention Centre. The ranked Attention Centre intentionally stays last — money depth is "context for the day," ranked action list is "what to do next." **Foundational audit before code:** `invoice_ageing_v`, `receipt` (received_at + amount + payment_mode), `promise_to_pay` (open + dishonoured), `firm` for debtor names — all already exist. Two honest gaps surfaced: ageing bucket boundaries are hardcoded in the view (Customer-#2 readiness gap, pre-existing — not in scope to refactor); cash OUTflow needs an AP / expense-payment ledger that doesn't exist (FIN-014). Both rendered as visible gap markers, not silently absorbed. **Files shipped:** `lib/read-models/owner-overview.ts` — 4 new types (`Ageing` / `TopDebtor` / `CashMovement` / `PtpCoverage`), 2 new queries (receipts in 30+30d window w/ `payment_mode` + `received_at` for mode split + best-day; `promise_to_pay` open + dishonoured-30d), buyer-name resolution merged for the overdue + debtor sets in one `.in('id', buyerIds)` (no N+1, no extra round trip). Ageing bucket rollup and top-10 debtor groupby computed in-memory from the existing `ageingRows` fetch — zero extra queries for those two sections. Top-debtor `oldest_invoice_label` picks the worst-outstanding invoice per firm for citation. Cash movement uses a FIXED 30d window (not period-coupled) so the section is stable across the period selector — same reasoning as DSO. PTP `coverage_pct` is honestly null when no overdue invoices exist (rather than misleading 100%). `facts` block extended with `top_debtor_label / receipts_30d / receipts_prev_30d / ptp_total_promised / ptp_due_this_week / ptp_overdue_with_promise / ptp_overdue_without_promise` so the AI brief has concrete signals. **4 new components** under `app/(app)/owner/`: `finance-ageing.tsx` (horizontal stacked bar + 4-card grid with bucket icon + ₹ + count + %; each bucket clicks through to `/collections?bucket=X` matching the existing filter contract); `finance-debtors.tsx` (top 10 list with severity-colored days-late chip + worst-invoice citation, deep-links to Customer 360); `finance-cash-movement.tsx` (2-card layout: cash IN with mode split + best day + delta-chip; cash OUT rendered as honest gap marker w/ FIN-014 chip); `finance-ptp-coverage.tsx` (headline coverage % with tone chip Strong/Patchy/Thin + 3-stat sub-strip + dishonoured-30d flag rendered only when non-zero). All four components use the same `formatMoney` (Indian short format ₹L/cr), `tabular-nums`, lucide icons, status-never-color-only pattern as Slice 1. **Page wiring** in `page.tsx` — 4 new sections + reordered Attention Centre to the bottom + footer text updated to acknowledge Slices 1+2. **AI brief context extended** (`lib/actions/owner-brief.ts`) with a `receivables_depth` block (top-3 debtors, ageing buckets, PTP coverage, cash-in 30d). System prompt updated to reference the block and demand concrete debtor/PTP citations; prompt version bumped `owner_brief.v1` → `owner_brief.v2`; cache key now includes prompt version (`inline_text:owner_brief:<tenant>:<version>`) so v1 cached briefs naturally invalidate on next read without a DB sweep. **Smoke test:** `npx tsc --noEmit` clean across all changes. `next dev` boots in 1.5s; `/owner` compiles in 3s (1808 modules — Slice 1 was 1772; +36 from 4 new section components + 4 new lucide icon imports + 2 brief edits). 307 to `/login` for unauthenticated curl is expected. **No migrations** in this slice. **Slices 3–5 planned:** S3 Revenue+Ops (pipeline funnel, win-rate, top reps, dispatch on-time%), S4 Field+People (rep scorecards, attendance rollup), S5 drill-down filters + Quick Actions + saved views.

## 2026-06-20

### Owner Dashboard — INT-014 Slice 1 (8ae1175)
- **Tracks:** INT-014 (✅ Slice 1, 🚧 ongoing)
- **Capability:** Intelligence (with reads across Revenue, Finance, Relationship, Platform)
- **Tier:** Should-have
- **Status change:** new row 🚧 Slice 1
- **Notes:** Audit before code (per `feedback-foundational-audit.md`): three parallel Explore agents catalogued the existing intelligence stack (daily-digest engine, 4 read-models, 7 chip KPIs per firm, finance ageing buckets, field-team rollups, approvals queue, 10 AI prompts, `tabular-nums` everywhere) — finding ~60% of the spec already buildable with no schema work and identifying 11 honest data gaps (no chart lib, no date-range picker, no CS module, no dispatch SLA, no generic firm credit_limit, no pipeline probability, no org hierarchy, no visit planning, no territory/branch beyond `user_profile.territory`, no broadcast infra, no owner role). Three blocking decisions resolved with the user before code: (1) new `/owner` route + admin-only via `user_profile.role === 'admin'` check; (2) Slice 1 = Sections 1+2 only, walked end-to-end before continuing; (3) ship with empty-states for the gaps, no schema additions beyond the AI cache entity_kind. **Files shipped:** Migration 0044 (`ai_extraction.entity_kind` += `owner_brief`). `lib/read-models/owner-overview.ts` — 5th cross-capability assembler (after project-progress, customer-360, visit-detail, field-day). One Promise.all with 17 parallel reads: tenant, invoices×2 (current+prev period for revenue delta), receipts×2 (collections delta), sales_order×2 (orders delta), invoice_ageing_v (outstanding + worst-overdue list), open quotations (open pipeline), 30d billed (DSO denominator), 20 worst overdue invoices, 20 stalled high-value projects, all pending approvals, all overdue tasks, paving-stage projects (nested async IIFE: first fetches stage IDs then projects in those stages — PostgREST can't filter on a joined column), 50 cold leads, 50 stale sent quotes. Phase 2 (1 follow-up): bulk firm-name lookup for overdue invoice buyer names to avoid N+1. Returns shaped `BusinessHealth` (6 KPIs with per-period prev-period delta on the 3 period-sensitive ones; outstanding / open_pipeline / DSO point-in-time) + `AttentionItem[]` ranked by score (log10 of money × time-since), with 3 honest gap-marker rows that always sort to the bottom (`gap_complaint` → CS-001, `gap_dispatch_sla` → DEL-007, `gap_credit_exposure` → REL-016). `lib/ai/prompts/owner-brief.ts` — Zod schema (`health` + `headline` + `top_opportunities` ≤3 + `top_risks` ≤3 + `recommendations` ≤3, all bullets ≤22 words). System prompt is calibrated as "executive briefing voice of the business" — demands concrete `₹`/buyer-name/invoice-number citations, refuses generic CRM advice ("focus on customer retention"), uses Indian short-format `₹3.2L` / `₹2.3 cr`. `lib/actions/owner-brief.ts` — pulls context from `getOwnerOverview('week')` so the brief is provably consistent with the page; caches 6h in `ai_extraction` (shorter than firm-brief's 24h since business state shifts faster at owner level); admin-only enforcement. **UI:** `/owner/page.tsx` server component, `<Suspense>`-wraps the brief so the page paints fast while AI streams. `period-selector.tsx` URL-param-driven (today/week/month/quarter/year — defaults to month, no scrolling). `owner-kpi-strip.tsx` 6-card grid (md:grid-cols-3) with KPI + icon + DeltaChip (▲▼flat + percentage + green/red), each card is a `<Link>` to its capability page. `attention-centre.tsx` ranked rows with category-icon + severity-pill (critical/warning/info/gap, never color-only — every state has an icon AND label), money on right + count + drill arrow on hover. Gap rows render with dashed border + Blueprint ID chip. Empty-state ("All clear — rare, well done") for tenants with zero attention items. `owner-brief-card.tsx` async server component with three-column body (Opportunities · Risks · Recommendations). **Sidebar:** new `executive` group at top, gated to `roles: ['admin']` via a new role gate on `NavItem` (item with `roles` only renders for matching `userRole`); `userRole` was already plumbed in from the layout. **Reuse:** `Card size="sm"`, `Skeleton`, `Badge`, `cn`, `createClient`, `extractFromText`, `ai_extraction` cache key pattern (`inline_text:owner_brief:<tenant_id>`), `invoice_ageing_v`, the existing 6-KPI shape from `/finance`. **Smoke test:** dev server boots in 1.4s, `/owner` compiles in 1.98s (1772 modules), all sibling routes (`/dashboard`, `/firms`) still compile cleanly. `npx tsc --noEmit` clean across the new files. **Per Constitution Principle #11:** the gap markers are intentionally not dead code — they make missing data legible. **Slices 2–5 planned:** S2 Revenue+Operations · S3 Finance+Relationships · S4 Field+People · S5 drill-downs + filters + Quick Actions. **Migration 0044 must be applied to the remote DB** before the brief can write to `ai_extraction` with `entity_kind='owner_brief'` (until applied, the brief soft-fails with a discreet inline message and the rest of the page works).

### Customer 360 — Slice 2.4 · Collections tab (3189691)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Finance)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** Collections tab shows payment-tracking state per invoice: stage badge (color from collection_stage master), overdue badge, outstanding vs billed, next_action_at. Links to /invoices/[id]. Collections agg reuses invoiceAggRows from Phase 1 — no extra query. Tab trigger shows overdue count in red. Slice 3 (Visits + AI insights) is next after morning walkthrough.

### Customer 360 — Slice 2.3 · Quotes tab (8796971)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Revenue)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** Quotes tab: stats (total · open · value), card rows with quotation_number (mono), status badge (Won/Lost/Sent/Draft/Revised/Expired), project name link, created date, valid_until with amber warning for near-expiry. Links to /projects/[id] — no standalone /quotes/[id] page. No read-model change; Phase 2 quotes query already shipped in Slice 2.2 (b3f3231).

### Customer 360 — Slice 2.2 · Invoices tab (b3f3231)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Finance)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** Read-model restructured to two-phase (Phase 1: 6 parallel queries; Phase 2: quotes + collections conditional on ID lists). Invoice tab: stats (total · overdue · outstanding), card rows with invoice_number/external_invoice_number (mono), status badge, invoice date, due date (red + alert icon when overdue), total + outstanding. Links to /invoices/[id]. Sensitive-column check: invoice.total is not masked; only quotation.discount_pct and project.order_value are masked per PLAT-007.

### Customer 360 — Slice 2.1 · Orders tab (44e3806)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Revenue)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** First Slice 2 tab. Read-model extension follows the pattern locked in Slice 1.6: one limited query for the tab list + one lightweight aggregate (no joins, no limit) for totals. Orders queried by `sales_order.buyer_firm_id` direct (the cleanest path — `sales_order` has buyer_firm_id stored explicitly, no need to traverse projects). New shape: `orders: { items, total, showing, total_value, active_count }` with `active_count` computed from `pipeline_stage.is_terminal` (same heuristic as projects). New Customer360Order type carries order_number / value / order_date / expected_delivery_at / current_stage / project link. UI: tab between Projects and Contacts; stats line above the list shows total · active · total_value · "Showing X of Y" when truncated; card rows show order_number (mono font), stage badge, project name (link target), order date, expected delivery (if set), value right-aligned. Each row deep-links to `/orders/[id]`. Empty state copy explains how orders arrive. **Architectural payoff:** the page didn't need restructuring — adding the tab is `import` + `destructure` + `<TabsTrigger>` + `<TabsContent>`. Slice 2.2 (next tab) will follow the same pattern.

### Customer 360 — Slice 1.6 · Tab restructure + Contacts tab (821085d)
- **Tracks:** REL-009 (still ✅ Partial — structural pivot, not a new tier)
- **Capability:** Relationship
- **Tier:** Should-have
- **Status change:** ✅ Partial (Slice 1.5) → ✅ Partial (Slice 1.6 restructures)
- **Notes:** User feedback after walking Slice 1: "if a firm has 3 contacts, why does clicking 'View all' send me away to /contacts? show them here. And put tabs below the header so Slice 2 has somewhere to land." Right call. The page now has `<Tabs>` below the header: **Overview** (default) | **Projects** | **Contacts**. Header card narrows to identity (name, type, contact details, primary contact) — no more "View all N" link (the Contacts tab badge does that job). Overview tab carries a 4-card KPI strip (`projects.total`, `contact_count`, `kpis.total_estimated_value`, `kpis.last_touched_at`) + an AI insights placeholder (REL-011 destination — copy explains what's coming) + Notes section (renders only when firm.notes is set). Projects tab is verbatim what was below the card in Slice 1.5. Contacts tab is a new table showing every contact (capped at 100; "Primary" badge on row 0; tel:/mailto: links). **Read-model extension:** `contacts: Customer360Contact[]` (capped 100) added alongside `primary_contact` (which is now derived from `contacts[0]`); new `kpis` object with `total_estimated_value` + `active_project_count` (uses `pipeline_stage.is_terminal` to exclude won/lost) + `last_touched_at`. Two project queries now: one limited for the Projects list, one lightweight aggregate (no joins, no limit) for KPIs — keeps the page bounded as project count grows. **Architecturally the boundary held:** the page is still a dumb consumer of one assembled object. Slice 2 tabs (Quotes / Orders / Invoices / Collections) drop in by adding one query to the assembler + one `<TabsContent>` each.

### Customer 360 — Slice 1.5 · /firms discovery surface (810025d)
- **Tracks:** REL-009 (still ✅ Partial — extends the surface, doesn't change tier)
- **Capability:** Relationship
- **Tier:** Should-have
- **Status change:** ✅ Partial (Slice 1) → ✅ Partial (Slice 1.5 extends it)
- **Notes:** Single discovery page for every firm in the tenant — replaces the "you can only reach a firm via a project" constraint that Slice 1 closed with. `app/(app)/firms/page.tsx` (server) fetches all non-deleted firms + the `relationship_type_master` rows in parallel; `firms-client.tsx` is a single client component holding filter + search state. Filter dropdown is single-select, options are pulled from the master and tagged with per-tenant counts so the user sees which types have content without opening the menu. Search is client-side substring across name / city / phone / GSTIN (Vyara is well under 500 firms — server-side trgm becomes worthwhile around 5k+; deferred until then). Every row deep-links to `/customers/[firmId]` (Slice 1). Sidebar entry "Firms" sits between Leads and Contacts under Relationship (Firms = the org spine; Contacts = people in those orgs; ordering reflects the data hierarchy). Dealers continue to live at `/dealers` because they carry extra fields (tier, credit limit, code); a dealer is still findable here by filtering type=dealer, and clicks land on the same Customer 360 (not the dedicated dealer detail page — that asymmetry is intentional and can be revisited if it confuses anyone). Why no /firms list page existed before: there was never a daily-use case for "scan everyone" — discovery happened through Leads, Projects, or Contacts. Slice 1 (Customer 360) created the need: now that firms have a destination worth reaching, they need a discovery surface.

### Customer 360 — Slice 1 (9fc3b7e)
- **Tracks:** REL-009 (✅ Partial)
- **Capability:** Relationship
- **Tier:** Should-have
- **Status change:** 📋 → ✅ Partial
- **Notes:** Fourth cross-capability read-model after project-progress (Slice 2), visit-detail (FO-6), field-day (FO-7). `lib/read-models/customer-360.ts` is the assembler; `app/(app)/customers/[firmId]/page.tsx` is the dumb consumer. Header card surfaces firm name + relationship type (resolved via `relationship_type_master` from REL-006, falls back to title-cased `firm.type` for pre-REL-006 rows) + phone/email/website + city/state + GSTIN + primary contact (first contact by `created_at`) + total contact count with "View all N" link. Projects section is a single `.or(buyer_firm_id.eq.X,architect_firm_id.eq.X)` query so dedup + the "Showing 10 of N" count are exact; `firm_role` resolved per row by checking which FK matches. Entry point: project-detail Overview tab — buyer + architect firm names become `<Link>` to `/customers/<firmId>` with a chevron affordance. **Deliberately deferred to slice 2+:** Orders / Quotes / Invoices / Collections sections, Visits / Activities timeline, a `/customers` list page. Per the phased-builds feedback — walk slice 1 end-to-end before bundling slice 2. **Architecturally:** the read-model boundary is set the first time. New sections in slice 2 (Orders, Quotes, Invoices, Collections) extend the assembler with one query each; the page stays a dumb consumer. Slice 2 will not have to re-architect the header.

### Sprint 2.2 (Field Operations deep-build) — CLOSE
- **8/8 items shipped.** FO-1 (sidebar grouping), FO-2 (PLAT-013 attachments), FO-3 (visit proof), FO-4 (PLAT-014 approvals), FO-5 (FIN-006 expenses + FIN-007 partial + FLD-016), FO-6 (FLD-014 Visit Hub partial), FO-7 (FLD-015 day read-model), FO-8 (FLD-013 + INT-008 prep brief).
- **6 Blueprint capabilities touched:** Platform (PLAT-013, PLAT-014), Field Operations (FLD-013, FLD-014, FLD-015, FLD-016), Finance (FIN-006, FIN-007), Intelligence (INT-008), Relationship (touched via visit subject reads), Revenue (touched via project + quote reads).
- **10 Status Tracker rows flipped to ✅** (some Partial — FLD-014 needs book-order/log-complaint when their owners ship; FIN-007 needs a policy CRUD UI).
- **3 new cross-capability read-models** (after Slice 2's project-progress): visit-detail, field-day. The pattern holds.
- **Working examples in `main` ready for Vyara demo.** Sprint 2.3 picks up by either (a) extending Field Ops further (FLD-019 fraud detection, mobile bottom-nav) OR (b) starting Customer Success / CS-001 complaints so the Visit Hub gets its "log complaint from visit" affordance.

### FO-8 — AI visit prep brief (93d9ccc)
- **Tracks:** FLD-013 (✅), INT-008 (✅)
- **Capability:** Field Operations + Intelligence
- **Tier:** Should-have
- **Status change:** 📋 → ✅
- **Notes:** Migration 0036 adds `visit_prep_brief` to the `ai_extraction.entity_kind` CHECK. `lib/ai/prompts/visit-prep-brief.ts` defines a Zod schema (headline ≤14 words / up to 4 bullets / optional caution) + a system prompt that demands matter-of-fact specifics ("Quote ₹4.2L sent 9 days ago, no response" beats "follow-up pending"). `lib/actions/visit-prep-brief.ts` assembles per-subject context — subject summary, last 8 activities, open tasks, last 5 quotes (for projects), last 3 prior visits — serialises to JSON, calls `extractFromText` with the schema, and tags the row with `source_storage_path='inline_text:visit_prep_brief:<visit_id>'` so subsequent calls hit the cache by that key (no second AI call per visit). `<VisitPrepBrief>` renders inline on the in-progress card AND on the Visit Hub. Per Principle #6 read-only — never writes data. This is the first general-purpose Vyara "copilot" surface; the next ones (call recap, outcome quality check) reuse the same plumbing. **First Intelligence consumer of the AI extraction framework that isn't a data-extraction job** — it generates structured advice rather than parsing user-supplied input.

### FO-7 — Field-Activity Day read-model (84c0446)
- **Tracks:** FLD-015
- **Capability:** Field Operations
- **Tier:** Must-have post-C#2
- **Status change:** 📋 → ✅
- **Notes:** Third cross-capability read-model — `lib/read-models/field-day.ts` after `project-progress.ts` and `visit-detail.ts`. Assembles one rep + one date: attendance row, visit counts (completed + planned-open), distance, on-duty duration (computed from check-in/out), vehicle claim amount, expense rollup (total + pending count), and the expense line items themselves. `<FieldDayKpiStrip>` is the one shared component that renders the four KPI cards on both `/field` (the rep's own page) and `/field/team/[userId]` (the manager drill-down). Team-detail page also gains the expense list below the visit list — expense rows with `subject_type='field_visit'` deep-link into the Visit Hub. Rep `/field` shows the strip when checked-in OR checked-out (not on State 1/2/3 since there's no day yet). Why a read-model and not direct queries on each page: per Principle #0, the day's "story" needs to read the same regardless of which surface asks; one assembler keeps the shape stable as new pieces (FO-8 prep-brief stats? FLD-019 fraud signals?) get added — they slot in by extending the read-model. Visit counts use `count: 'exact', head: true` to avoid pulling rows; expense pull is bounded by `(user_id, expense_date)` so it stays cheap.

### FO-6 — Visit Hub (82a06fc)
- **Tracks:** FLD-014 (✅ Partial)
- **Capability:** Field Operations
- **Tier:** Must-have post-C#2
- **Status change:** 📋 → ✅ Partial
- **Notes:** `lib/read-models/visit-detail.ts` — the second cross-capability read-model (after `project-progress.ts`). Assembles the field_visit + contact + subject (project/lead/firm/dealer w/ href back) + attachments (FO-2) + expenses (FO-5) + activity timeline + follow-up tasks into one object. New page `/field/visits/[id]` consumes one assembled object — no cross-module reads in the UI. Sections: header card (subject, state, contact, location with Maps deep-link, outcome, notes, quick-actions row), proof gallery, expenses-on-this-visit list, follow-up tasks, activity timeline. Quick actions wired: add photo, attach file, signature, log expense (subject pre-filled). Completed-visit cards on `/field` now `<Link>` into the hub; in-progress card gets an "Open hub" affordance alongside Complete/Expense/Cancel. **Partial** because the FLD-014 spec also calls for "book order from visit" and "log complaint from visit" — both deferred to their owner capabilities (order action exists but no prefilled flow; complaint module CS-001 not yet built). Read-model is ready for both — they slot in by extending the assembler with one query each. Manager team-detail page deep-link wires when FO-7 (Field-Activity Day read-model) ships.

### FO-5 — Multi-category expense module (82dcba4)
- **Tracks:** FIN-006 (✅), FIN-007 (✅ Partial), FLD-016 (✅)
- **Capability:** Finance + Field Operations
- **Tier:** Must-have post-C#2 (FIN-006), Should-have (FLD-016)
- **Status change:** FIN-006 📋 → ✅; FIN-007 📋 → ✅ Partial; FLD-016 📋 → ✅
- **Notes:** Migration 0035 — `expense_category` master (system + tenant rows, same pattern as task_type / activity_type / relationship_type — 12 cross-industry seeds: fuel, tolls, food_self, food_client, taxi, train_air, accommodation, mobile_recharge, gift, sample_courier, site_supplies, other) + `expense` table (status state machine: draft → submitted → approved | rejected → exported; with `cancelled` and `subject_type/id` for tying an expense to a visit / project / lead / firm). RLS: reps see own, managers see team; rep can only update own *drafts*; managers/admins always. `lib/actions/expenses.ts` ships create / submit / cancel / list / get; on `submitExpense` the engine calls `requestApproval({ entityType: 'expense', amount })` — when a policy band matches it raises an approval request and the expense lands at `status='submitted'`; when no policy matches it auto-approves directly. `approval_request.status` is read-back at list time via `syncExpenseFromApproval` (cheap denormalisation; replaces the Inngest write-back that doesn't exist yet). `<LogExpenseSheet>` is a 2-step bottom sheet: capture (category grid, amount, date, notes) → receipt (snap via FO-2 AttachmentUploadButton kind='receipt'). Abandoned drafts soft-cancel on sheet close (no DB litter). `/expenses` page rolls up by status + groups by date. Sidebar gets a new "Expenses" item under Finance. Wired into `/field`'s in-progress visit card so an expense can be tied to the live visit via `subject_type='field_visit'`. **FIN-007 partial** because the approval_policy table IS the expense policy table — no new master needed; per-tenant policy CRUD UI deferred.

### FO-4 — Generic approval engine (422de80)
- **Tracks:** PLAT-014
- **Capability:** Platform
- **Tier:** Must-have post-C#2 (lifted into Sprint 2.2 so FO-5 has a real engine to consume)
- **Status change:** 📋 → ✅
- **Notes:** Migration 0034 — 4 tables: `approval_policy` (rules per entity_type + amount band), `approval_policy_step` (N ordered steps; `approver_via='role'|'specific_user'`), `approval_request` (one row per ask; status: pending/approved/rejected/cancelled; sequential mode tracks `current_step_order`, parallel leaves it NULL), `approval_step_action` (per-step decision log). Full **multi-level** by design — sequential (each step waits for prior) and parallel (all open at once; `require_all_parallel` toggles all-N vs any-1). A single rejection always closes the request. Approver resolution: role → any active user_profile with `role=X`; specific_user → that uid. Admin can act on any open step (escape hatch for stuck requests). `requestApproval` picks the policy by `(entity_type + amount in band)`; `autoApproveIfNoPolicy` defaults true so a ₹500 expense doesn't manufacture a queue item. `/approvals` page renders the actor-filtered queue (eligibility computed in the action, since RLS only does tenant isolation); `<ApprovalCard>` is a server component for inline rendering on the consumer's detail page (status pill + step ladder + decision history + Approve/Reject when pending). `DecideButtons` is the client island that captures a comment and calls `decideApproval`. **Deferred:** Inngest auto-escalation cron (schema has the column), `reports_to_user_id` on user_profile (the moment a customer asks for hierarchical chains), seeded policies (consumers seed per-tenant). entity_type detail-link resolver registered in `/approvals/page.tsx` — new consumers add one switch case.

### FO-3 — Visit completion: photos + documents + signature (54865a3)
- **Tracks:** PLAT-013 (consumer wiring)
- **Capability:** Field Operations
- **Tier:** part of Field Operations vertical (Sprint 2.2)
- **Status change:** PLAT-013 consumer "first wire" satisfied
- **Notes:** `app/(app)/field/complete-visit-button.tsx` wires the FO-2 primitives — adds a "Proof" section with 3 capture surfaces: photo (mobile camera default), document (PDF/image picker), signature (canvas dialog with `signerName` pre-filled from the contact). Uploads happen eagerly so a heavy photo doesn't block submit. `visits-section.tsx` threads `tenantId` through to the button (already had it at the page level). Attachments persist whether the dialog is submitted or just closed (rep can capture proof, walk to vehicle, come back, submit). What's deliberately NOT in this commit: rendering attachments on the manager's `/field/team/[userId]` cards — that needs a single-query rollup to avoid N+1; it lands with FLD-014 (Visit Hub / Visit Detail page). Cancelled visits leave orphan attachments today (visible to nobody; cleanup job uses the `attachment_tenant_kind_idx` index when built).

### FO-2 — Attachment framework (d114708)
- **Tracks:** PLAT-013
- **Capability:** Platform (substrate for every capability)
- **Tier:** Must-have post-C#2 (lifted into Sprint 2.2 because FO-3 needs it)
- **Status change:** 📋 → ✅
- **Notes:** Migration 0033 + `lib/actions/attachments.ts` + 3 reusable UI primitives (`upload-button`, `list`, `signature-pad`). Polymorphic `attachment` table — `(entity_type TEXT, entity_id UUID, kind)` plus storage_path / mime_type / size_bytes / title / notes / metadata. 5 kinds (photo/document/voice_note/signature/receipt). Bucket reused: `ai-uploads` with path prefix `<tenant_id>/attachment/<entity_type>/yyyy/mm/<ts>_<safename>`. RLS = tenant isolation only; per-entity readability lives in app-layer `canAccessParent` (Option C — admin/manager always; `field_visit` ⇒ owner-or-admin; `sample_request` ⇒ any same-tenant user). Three indexes: `(entity_type, entity_id, created_at DESC)` hot path, `(created_by, created_at DESC)` for "my recent uploads", `(tenant_id, kind, created_at DESC)` for storage cleanup. `SignaturePad` is canvas-based PNG capture; `AttachmentUploadButton` handles camera/file picker per kind; `AttachmentList` renders images as a thumb grid and other kinds as a row list with signed-URL open. Old TEXT[] `photo_urls` columns stay one slice for backwards-compat — new consumers (FO-3 onwards) write to attachment. `entity_type` whitelist gates known consumers (`field_visit` / `expense` / `complaint` / `dispatch` / `sample_request`); adding a new type = add a row to the whitelist + define the readability rule.

### Sprint 2.2 (Field Operations deep-build) — START
- **Strategy:** pick one capability and ship every realistic edge case before moving on. Field Operations chosen — most demo-able, forces the platform pieces (attachments, approval engine, expense module) into existence as their first consumer, becomes the customer-facing demo for C#2.
- **8 items planned, ~6 weeks:** FO-1 sidebar grouping (cosmetic) → FO-2 attachment framework (PLAT-013) → FO-3 visit photos/docs/signature → FO-4 generic approval engine (PLAT-014) → FO-5 multi-category expense module (FIN-006) → FO-6 Visit Hub wiring (FLD-014) → FO-7 Field-Activity Day read-model (FLD-015) → FO-8 AI prep brief (FLD-013).
- **Deferred (correctly out of scope):** offline (FLD-022 ❌), live GPS (FLD-023 ❌), native map (FLD-024 ❌), route optimization (FLD-025 ❌), live AI coaching (FLD-026 ❌), native mobile (FLD-027 ❌).

### FO-1 — Sidebar capability grouping (pending commit)
- **Tracks:** FLD-009 cosmetic follow-up (Blueprint §1.4 "sidebar grouping refactor")
- **Capability:** Cross-cutting (visible UX)
- **Tier:** part of Field Operations vertical
- **Status change:** 📋 → ✅
- **Notes:** components/app/sidebar.tsx now groups nav under capability headers: Dashboard + Field (home, no header) → Relationship (Leads/Contacts/Dealers) → Revenue (Projects/Orders) → Delivery (Inventory/Warehouses/Dispatches) → Finance (Invoices/Collections/Finance) → Tasks (utility, no header) → Admin (existing). Dealer moved from "channel-y last position" to Relationship per Blueprint reframing (dealer is a relationship type, not its own module). URLs unchanged; pure visual structure. Cosmetic-only — Blueprint §1.4 flagged as "~1 day".

### Sprint 2.1c — visit_purpose system rows + broader vocabulary (1b44972)
- **Tracks:** FLD-009
- **Capability:** Field Operations
- **Tier:** Must-have C#2
- **Status change:** 📋 → ✅
- **Notes:** Migration 0032 promotes `visit_purpose` from tenant-only to a system+tenant master, mirroring the type-master pattern from 0029 and 0031. Allows tenant_id NULL (system rows visible to all). Adds `category` column for industry-pack filtering hints. RLS updated to read-system-or-own. 16 system seeds across 7 categories (sales, finance, service, installation, audit, training, other) — covers the cross-industry vocabulary the Field Operations capability needs. Existing Vyara tenant rows untouched. Table NOT renamed to `field_activity_type` (the FK column ripple isn't worth it; the Blueprint already documents the conceptual mapping). **Closes the third and last Must-have-C#2 item — the runbook's ~8-day estimate to honest 8-week onboarding lands at ~7 days actual.**

### Sprint 2.1b — relationship_type_master (856785a)
- **Tracks:** REL-006
- **Capability:** Relationship
- **Tier:** Must-have C#2
- **Status change:** 📋 → ✅
- **Notes:** Migration 0031 promotes `firm.type` from CHECK enum to data-driven master, mirroring the task_type_master / activity_type_master pattern from 0029. Seeds 12 system rows in 5 categories (specifier / buyer / channel / supplier / other). `customer`, `consultant`, `distributor`, `partner`, `vendor` are new — extend the relationship spine for cross-industry tenants without further migrations. firm.type TEXT remains for backwards-compat; sync trigger keeps both columns in lockstep. Existing call sites that write `{ type: 'architect', ... }` work unchanged; unknown types now RAISE with a clearer message than the dropped CHECK ever did.

### Sprint 2.1a — Tenant provisioning CLI (ae50ac1)
- **Tracks:** PLAT-011, ARCH-004 (both partial)
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 📋 → ✅ Partial
- **Notes:** `scripts/onboard-tenant.ts` — Node CLI that replaces the manual SQL block in the onboarding runbook §3. Reads a JSON config (Zod-validated), provisions tenant row, UPSERTS 10 tenant_feature flags, creates auth admin user via service-role API (`auth.admin.createUser`), UPSERTS user_profile. Idempotent on tenant slug — safe to re-run after fixing a typo. Includes `scripts/onboard-tenant-config.example.json` template + `scripts/README.md` operational doc. `.gitignore` belt-and-braces: `scripts/*-config.*.json` excluded with negation for the example template so real configs (which contain admin passwords) can't be accidentally committed. **Deferred:** subdomain middleware (UX nicety, not blocking — JWT already carries tenant_id), tenant admin UI in `/admin` (Blueprint PLAT-022). Both deferrals documented in PLAT-011 row.

### Customer onboarding runbook · draft 1 (1f22b3b)
- **Tracks:** ARCH-003 (primary) · added PLAT-022, PLAT-023, PLAT-024, PLAT-025, PLAT-026, PLAT-027, FLD-029, FIN-018, ARCH-006, ARCH-007 (11 gaps surfaced)
- **Capability:** Cross-cutting (operational doc)
- **Tier:** Must-have C#2 (ARCH-003) · Should-have for the surfaced items
- **Status change:** 📋 → ✅ (ARCH-003); new items added as 💭 Considered
- **Notes:** `docs/customer-onboarding-runbook.md` — the operational playbook for onboarding a new tenant end-to-end. 12 phases, ~6–8 week wall-clock estimate, owner + time per phase, gap callouts where tooling is missing. Distinct from the existing `customer-2-readiness-audit.md` (which is a gap analysis — readiness asks *can we*?; runbook answers *how*). The runbook surfaced 11 gaps not yet tracked in the Blueprint; added them as 💭 in §11. The runbook itself revises after every real onboarding via §12 "Revisions". 8-week onboarding remains honest if PLAT-011, REL-006, FLD-009 ship in Sprint 2's first half (~8 dev-days).

### Sprint 1.7 — Code-prefix configuration consumers · hybrid path · first consumer: quotation (8af733a)
- **Tracks:** PLAT-010
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 🚧 → ✅
- **Notes:** Migration 0030 adds `next_code_sequence(p_kind TEXT)` RPC (whitelist of 7 known kinds; SECURITY DEFINER; GRANT to authenticated). `lib/codes/next-code.ts` combines the RPC with the tenant template (PLAT-005) + renderer to produce the next code string. Existing per-table triggers stay as safety net — actions that don't migrate keep getting the Vyara default. First consumer: `createQuotation` — `quotation_number` now comes from `tenant.settings.codes.quotation` (default `VT-QT-{yyyy}-{nnnn}`; Customer #2 can override). Other 5 entities migrate opportunistically. `lib/types/database.ts` doesn't yet know about the new RPC — documented cast in `next-code.ts` removes itself on next types regen (PLAT-008 follow-up). Per-tenant sequence isolation deferred to Sprint 2 (today sequences are global — fine for one tenant; honestly noted).

### Sprint 1.6 — Observability capture chokepoint + AI wiring (6e41977)
- **Tracks:** PLAT-009
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 🚧 → ✅
- **Notes:** `lib/observability/` ships the long-term capture API. `captureError` + `captureMessage` route through `scrub.ts` for PII redaction (phone / email / GSTIN / Aadhaar / PAN) and write structured JSON to stderr. `withCapture(actionName, fn, contextResolver?)` wraps server actions opt-in. AI extract (`extractFromImage` + `extractFromText`) wired as the first consumer — `parse_failed` is `captureMessage` (signal); unexpected throws are `captureError` (excluding mapped timeout/rate_limit). When the `@sentry/nextjs` SDK lands, swap path is a single-file edit to `capture.ts` per `lib/observability/README.md` — no caller changes. Deferred: SDK install (touches package.json WIP), `sentry.*.config.ts` files, Inngest `onFailure` wiring.

### Sprint 1.5 — TS types from DB schema · browser client typed; server + npm script deferred (fd44182)
- **Tracks:** PLAT-008
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 🚧 → ✅
- **Notes:** `lib/types/database.ts` generated from `supabase gen types typescript --linked` — 5,874 LOC of typed schema. Browser client (`lib/supabase/client.ts`) wired with `createBrowserClient<Database>`. README documents regeneration command. **Deferred:** server.ts wiring (file has outstanding non-blueprint WIP — try/catch wrap around `cookieStore.set`); package.json `db:types` script (file has outstanding WIP). Both will land in a follow-up commit alongside that work. Schema drift will now surface as TS errors in the browser client; same once server client is wired.

### Sprint 1.4 — Sensitive-column mask helper (b155898)
- **Tracks:** PLAT-007
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 🚧 → ✅
- **Notes:** `lib/auth/mask.ts` — `maskRow` / `maskRows` / `isMaskedRole` / `maskedColumnsFor`. Per-table sensitive-column registry mirroring Constitution §7. Shipped without an initial consumer migration: a sweep of `lib/actions/` confirmed no current SELECT returns the listed columns (`base_price`, `discount_pct`, `order_value`) to the client. The helper makes future leaks reviewable as missing call sites; mask.ts docstring documents the audit grep + the usage pattern.

### Product Blueprint v3 locked + status tracking process introduced
- **Tracks:** governance
- **Capability:** Cross-cutting / governance
- **Notes:** Eight capabilities frozen. Every existing artefact mapped (see Blueprint §1). Status Tracker (§11) becomes the per-item ledger. This Build Log becomes the chronological one. CLAUDE.md updated to require Blueprint read before non-trivial work and updates on every commit.

### Sprint 1.3 — task_type_master + activity_type_master (d2c9115)
- **Tracks:** PLAT-006
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 📋 → ✅
- **Notes:** Drops CHECK constraint sprawl on task.type and activity.type. Adds two master tables (system rows + tenant overrides), backfills FK columns, drops the CHECKs, installs sync triggers that resolve type → type_id automatically. New types are now data — an INSERT into the master, not a migration.

### Sprint 1.2 — Tenant config schema + code-template renderer (56c8dde)
- **Tracks:** PLAT-005
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 📋 → ✅
- **Notes:** tenant.settings is now Zod-validated. Code prefixes (quotation, invoice, dispatch, lead, dealer) become templates with `{yyyy}/{nnnn}/{nnnnn}` tokens; defaults match what's already in production triggers. First consumer migrated (field-attendance.ts) to prove the helper.

### Sprint 1.1 — Per-tenant feature flags (203239d)
- **Tracks:** PLAT-004
- **Capability:** Platform
- **Tier:** Must-have C#2
- **Status change:** 📋 → ✅
- **Notes:** `tenant_feature` table + `lib/auth/features.ts` helper + sidebar nav consumer. Smallest abstraction unblocking Customer #2 differentiation. Module Registry deferred until 3+ tenants.

### Untracked AI + leads + capture surfaces committed (multiple commits)
- **Commits:** `307aa44`, `5c0ae9b`, `e68187e`, `d28302b`, `73af063`, `67b3f38`, `c0f6d9b`, `e2b9568`
- **Tracks:** ARCH-001, REL-002, REL-005, FIN-003, FIN-004, INT-001, INT-003, DEL-003
- **Capability:** Multiple (Platform AI plumbing, Relationship, Finance, Intelligence, Delivery)
- **Tier:** Foundation
- **Status change:** untracked → ✅
- **Notes:** ~10k LOC of working features that had been untracked in the working tree got committed in 8 logical groups (option C from the commit-strategy decision). Includes lib/ai/ infrastructure, leads UI + actions, AI capture buttons for invoices/dispatches/warehouse, daily-digest module, AI playground, business-card OCR. Migrations 0021–0023 (ai_extraction, lead, daily_digest) committed at the same time (they were applied to the remote DB but never in version control).

### Field Sales Slice 4 — Step 6 patch (2c57297)
- **Tracks:** FLD-008, FLD-018
- **Capability:** Field Operations
- **Tier:** Foundation
- **Status change:** 🚧 → ✅
- **Notes:** Role-aware UX (admins land on /field/team, reps on /field). "Start my day" sheet on /field/team. Slim on-duty chip + tucked "End my day" button. Manager visibility gaps fixed: planned count, running km mid-day, Google Maps deep-link on every lat/lng, stale-activity flag.

### Field Sales Slice 4 — Step 6 (9809a69)
- **Tracks:** FLD-006
- **Capability:** Field Operations
- **Tier:** Foundation
- **Status change:** 📋 → ✅
- **Notes:** `/field/team` + `/field/team/[userId]` drill-down + claim approve/reject + date scrubbing. First manager view.

### Field Sales Slice 4 — Step 5 (af3410b)
- **Tracks:** FLD-004, FLD-005
- **Capability:** Field Operations
- **Tier:** Foundation
- **Status change:** 📋 → ✅
- **Notes:** Odometer photo OCR + voice → completion form. Web Speech API + Claude extraction. Migration 0027 extends `ai_extraction.entity_kind`.

### Field Sales Slice 4 — Step 4 + UX patch (b476c65, c2c620b)
- **Tracks:** FLD-003
- **Capability:** Field Operations
- **Tier:** Foundation
- **Status change:** 📋 → ✅
- **Notes:** Planned visits + per-leg km + activity events. Per-visit "arrive → meet → complete" lifecycle. Migration 0025 adds state column + lifecycle fields. UX patch simplifies check-in (no vehicle picker, last odometer pre-fill), renames CTAs, adds contact name/phone/interest signal in completion (migration 0026).

### Field Sales Slice 4 — Step 3 + patch (d5f7086, 48e3c87)
- **Tracks:** FLD-001, FLD-007
- **Capability:** Field Operations
- **Tier:** Foundation
- **Status change:** 📋 → ✅
- **Notes:** Mobile check-in/out + claim auto-compute + day status (WFH/leave/holiday). Patch removes vehicle picker (use assigned vehicle silently).

### Field Sales Slice 4 — Step 2 (348853f)
- **Tracks:** FLD-002
- **Capability:** Field Operations
- **Tier:** Foundation
- **Status change:** 📋 → ✅
- **Notes:** Vehicle module + admin CRUD. 4 admin pages (`/admin/vehicles`, vehicle-types, fuel-types, vehicle-rates). Reimbursement matrix with effective-dated rates.

### Field Sales Slice 4 — Step 1 (8fac5e5)
- **Tracks:** FLD-001 (foundation schema)
- **Capability:** Field Operations
- **Tier:** Foundation
- **Status change:** 💭 → ✅
- **Notes:** Migration 0024. 10 new tables, RLS, seed. Started the Field Operations capability.

### 2026-06-20 — REL-011: Firm health signals + AI relationship brief (82b5d76)
- **Tracks:** REL-011
- **Capability:** Relationship + Intelligence
- **Tier:** Should-have
- **Status change:** 💭 → ✅
- **Notes:** Two surfaces. /firms list: 4 bulk queries run in parallel (overdue invoices by buyer_firm_id, stale sent quotes >7d via project join, active projects not updated >14d, open leads not updated >3d) → per-firm signal map → color chips on each row (red overdue, amber quote awaiting, orange project stale, blue lead stale) + new City/State/Attention filters. Customer 360 Overview tab: <FirmBrief> async server component replaces "coming soon" placeholder; lib/actions/firm-brief.ts assembles 5-query context, calls Claude via extractFromText, caches in ai_extraction with 24h TTL (gte created_at guard); lib/ai/prompts/firm-brief.ts defines FirmBriefSchema (health enum + headline + bullets) and a prompt that demands concrete ₹ amounts, invoice numbers, days-overdue.
