# Vyara OS — Product Blueprint v3 (LOCKED)

> **This is the source of truth.** Architecture is frozen here. Future work routes through this document. Update the Status Tracker (§11) on every meaningful commit; append a one-line entry to [`BUILD-LOG.md`](./BUILD-LOG.md). Do not create new top-level capabilities. Do not reorganize the eight that exist.
>
> **Last updated:** 2026-06-20 (FO-4 generic approval engine shipped — sequential + parallel multi-level; PLAT-014 ✅. Expense claims (FO-5) is the first real consumer)
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
| PLAT-014 | Generic Approval engine | Must-have post-C#2 | ✅ | FO-4 · Migration 0034 (4 tables: `approval_policy`, `approval_policy_step`, `approval_request`, `approval_step_action`) + `lib/actions/approvals.ts` + `/approvals` queue page + `<ApprovalCard>` for inline rendering. Multi-level by design — both **sequential** (step 1 → 2 → 3) and **parallel** (all open at once, with `require_all_parallel` toggle for all-N vs any-1). Step approvers resolve via `role` (any active user with that role) or `specific_user`. `requestApproval()` finds the matching policy by `(entity_type + amount band)`; `autoApproveIfNoPolicy` defaults true so small-value cases don't clog the queue. **Deferred:** auto-escalation cron (Inngest), reports_to-based step resolution (needs `user_profile.reports_to_user_id`), seeded policies (consumers seed per-tenant as they ship). First real consumer wires in FO-5 (expense claims). |
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
| REL-009 | Customer 360 read-model | Should-have | 📋 | — |
| REL-010 | Dormancy alerts | Should-have | 📋 | — |
| REL-011 | AI relationship intelligence brief | Should-have | 💭 | — |
| REL-012 | Relationship-network graph view | Nice-have | 💭 | — |
| REL-013 | Lead scoring | Nice-have | 💭 | — |
| REL-014 | Conversational search | Nice-have | 💭 | — |
| REL-015 | Email-thread integration | Future | 💭 | — |

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
| FLD-013 | AI activity prep brief | Should-have | 📋 | First copilot move |
| FLD-014 | Visit Hub (book order / log expense / log complaint from visit) | Must-have post-C#2 | 📋 | — |
| FLD-015 | Sales Day / Field-Activity Day read-model | Must-have post-C#2 | 📋 | — |
| FLD-016 | Multi-category Expense consumer surface | Should-have | 📋 | Built by FIN-006 |
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
| CS-001 | Complaint module (entity + workflow + UI) | Must-have post-C#2 | 📋 | First Customer Success piece |
| CS-002 | Field Operations as service-visit execution | Must-have post-C#2 | 📋 | — |
| CS-003 | Basic SLA + escalation engine | Must-have post-C#2 | 📋 | — |
| CS-004 | Severity master | Must-have post-C#2 | 📋 | — |
| CS-005 | Service ticket + work order | Should-have | 📋 | — |
| CS-006 | Warranty tracking | Should-have | 📋 | — |
| CS-007 | Resolution code master | Should-have | 📋 | — |
| CS-008 | Engineer scorecard | Should-have | 📋 | — |
| CS-009 | AMC management + scheduling | Nice-have | 📋 | — |
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
| FIN-006 | Multi-category Expense module | Must-have post-C#2 | 📋 | — |
| FIN-007 | Expense policy master | Must-have post-C#2 | 📋 | — |
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
| INT-008 | Activity prep brief (AI) | Should-have | 📋 | Built by FLD-013 |
| INT-009 | Conversational query (limited) | Nice-have | 💭 | — |
| INT-010 | Forecasting (revenue, cash, churn) | Nice-have | 💭 | — |
| INT-011 | Recommendation engine | Nice-have | 💭 | — |
| INT-012 | AI accuracy dashboard | Nice-have | 💭 | — |
| INT-013 | Predictive analytics | Future | 💭 | — |

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
