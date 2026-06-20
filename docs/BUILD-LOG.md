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

## 2026-06-20

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
