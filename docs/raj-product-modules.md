# CRMOS — Product Module Reference

A complete reference to every module in the product, organised by business capability.

---

**Prepared for**
Raj Avinsys Pvt. Ltd. · Gujarat

**Prepared by**
Paresh Khatri · contact@mindboxtech.agency

**Version**
v1.0 · 22 June 2026

---

## About this document

This is a **module reference**, not a walkthrough. Where the [Navigation Guide](./raj-demo-navigation-guide.md) tells the story of a project from start to finish, this document goes module-by-module and explains what each one does, who uses it, what it integrates with, and what problem it solves.

Use this as a companion to the navigation guide. When you read about an Act in the guide and want deeper understanding of the module being demonstrated, look it up here.

---

## Demo login credentials

Six personas are pre-provisioned for the Raj Avinsys demo. Sign in at `/demo` or directly at `/login` using the credentials below.

| Name | Role | Email | Password |
|---|---|---|---|
| Sandeep | Director | `admin@rajavinsys.example` | `RajDemo@1234` |
| Rakesh | Project Manager | `rakesh@rajavinsys.example` | `RajDemo@1234` |
| Anil | Site Engineer | `anil@rajavinsys.example` | `RajDemo@1234` |
| Mehul | Procurement Manager | `mehul@rajavinsys.example` | `RajDemo@1234` |
| Priya | Accounts Manager | `priya@rajavinsys.example` | `RajDemo@1234` |
| Vikas | Service Engineer | `vikas@rajavinsys.example` | `RajDemo@1234` |

All accounts use the same demo password. Each persona's sidebar and landing page are tailored to their department.

---

## How CRMOS is organised

CRMOS is built around **eight business capabilities**. Each capability has multiple modules that work together. The eight are deliberately limited — a new top-level capability requires evidence from multiple customers, not a single feature request.

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

The rest of this document walks through each capability, then each module within it.

---

# Capability 1 · Relationship

**Purpose:** Manage every person and organisation your business interacts with — across every relationship type, across full history.

**Modules in this capability:**
- Firms (organisation registry)
- Contacts (people registry)
- Leads (opportunity capture)
- Dealers (extension of firms — typed as dealer)
- Vendors (extension of firms — typed as vendor)
- Business-card OCR (AI capture)

---

## Module 1.1 · Firms

**Purpose:** A single record per organisation — customer, vendor, dealer, architect, consultant — regardless of how many roles they play in your business.

**Who uses it:** Site engineers (Anil), project managers (Rakesh), procurement (Mehul), accounts (Priya), service (Vikas), director (Sandeep).

**Key features:**

- Single source of truth per organisation
- Relationship type taxonomy (customer / architect / consultant / vendor / dealer / distributor / partner / government / contractor / developer / influencer)
- GSTIN, PAN, address, contact details
- City + state for territorial reporting
- Multi-contact support (one firm has many contacts)
- Customer 360 view — full history of every project, quote, order, invoice, payment, complaint, visit, document
- AI relationship intelligence brief — auto-summary of firm health, key signals, dormant alerts

**How it works:** Every interaction in the product — a lead, a project, a quote, an invoice — links back to a firm. The firm's profile page shows all of these in one timeline. Search across firms by name, city, GSTIN, or relationship type.

**Integrates with:** Almost every module in the product.

**What it replaces:** Address-book spreadsheets, Tally party master, separate vendor / customer / dealer lists that all duplicate the same organisation.

---

## Module 1.2 · Contacts

**Purpose:** Capture every individual you interact with — engineers, plant managers, architects, consultants, procurement officers — tied to the firms they work at.

**Who uses it:** Field-going roles (Anil, Vikas) and inside sales.

**Key features:**

- Multi-firm support (a consultant might work at three firms)
- Role per firm (technical, commercial, decision-maker, influencer)
- Phone, email, address
- Tap-to-call from mobile
- Interaction timeline (every visit, call, email)
- Primary contact flag per firm

**How it works:** When Anil captures a lead at an exhibition, he creates the contact + the firm in one flow. The system links them. Later, when Vikas needs to call the plant manager about a complaint, he finds the contact in the firm record.

**Integrates with:** Firms, Leads, Visits, Complaints.

**What it replaces:** Sales team's personal phone contact lists, business card boxes, "let me find that email I sent last month".

---

## Module 1.3 · Leads

**Purpose:** Capture early-stage opportunities before they become formal projects.

**Who uses it:** Site engineers (Anil) at exhibitions / cold calls, inside sales, project managers (Rakesh) qualifying inbound enquiries.

**Key features:**

- Kanban board grouped by pipeline stage
- Custom stages per tenant (Raj uses: New → Contacted → Qualified → Quoted → Negotiation → Won / Lost)
- Lead source tracking (exhibition / referral / cold call / website / dealer)
- Loss reason tracking on lost leads
- Owner assignment with reassignment audit trail
- Estimated value + expected close date
- Convert-to-project workflow on Won
- SLA-based dormancy alerts (when a lead hasn't been touched in N days)

**How it works:** A lead is just a structured note about an opportunity. When it gets serious, it's converted to a Project (inheriting the customer + value). When it's lost, the loss reason is captured for trend analysis.

**Integrates with:** Firms, Contacts, Projects (on conversion), Visits, Tasks (auto-generated follow-ups).

**What it replaces:** "Lead board" whiteboards, separate CRM tools that don't tie back to project delivery, WhatsApp group chatter about "interest from xyz customer".

---

## Module 1.4 · Dealers

**Purpose:** Manage your dealer / distributor network — relationship type "dealer", but with extra fields (tier, credit limit, code).

**Who uses it:** Inside sales, dealer portal users.

**Key features:**

- Dealer tier master (Platinum / Gold / Silver / Bronze)
- Credit limit per dealer
- Dealer order placement workflow
- Dealer portal (separate login for dealers themselves to place orders)
- Pricing tier per dealer

**Note for Raj Avinsys:** Dealer portal is **disabled** for Raj since EPC + panel manufacturing sells direct to industrial customers, not through dealers. The feature flag is per-tenant.

---

## Module 1.5 · Vendors

**Purpose:** Manage your supplier base — relationship type "vendor", with KYC + payment terms attached.

**Who uses it:** Procurement (Mehul), accounts (Priya).

**Key features:**

- GSTIN, PAN with regex validation
- MSME status (not_msme / micro / small / medium) + UDYAM number
- Bank account details (account no, IFSC, bank name) for NEFT auto-fill
- Default payment terms (days)
- GST state code (auto-derived from GSTIN) for IGST vs CGST+SGST routing
- Vendor type (supplier / contractor / service / other) for TDS section routing
- Performance scorecards (separate module)

**How it works:** When you raise a PO against a vendor, the GSTIN + state code determine the GST split. When you pay them, the vendor type drives TDS section. When they're MSME, the 45-day clock starts on supply receipt.

**Integrates with:** Purchase Orders, Vendor Bills, Vendor Payments, AP Ageing, Vendor Scorecards, GSTR-2B reconciliation.

**What it replaces:** Tally vendor master with manually-typed PAN/MSME info, separate MSME tracking sheets, "let me check if they have PAN" delays.

---

## Module 1.6 · Business-card OCR (AI)

**Purpose:** Capture leads and contacts from business cards using AI image recognition.

**Who uses it:** Anyone at events — site engineers, sales, directors.

**Key features:**

- Snap a photo of a business card on mobile
- AI extracts: name, designation, phone, email, address, firm, GSTIN (if visible)
- Pre-fills the new-contact / new-lead form
- Human reviews + edits before saving

**How it works:** Uses Anthropic's Claude vision API. The card image is sent to the model with a structured prompt; the response is a parsed JSON object that fills the form. The human always reviews — AI never autonomously creates records.

**Integrates with:** Contacts, Firms, Leads.

**What it replaces:** Manual data entry from business card stacks, "I'll add them to my contacts later" (which never happens).

---

# Capability 2 · Revenue

**Purpose:** Generate business — from opportunity through to confirmed order, with full commercial controls.

**Modules in this capability:**
- Projects (the opportunity / engagement)
- Specifications (what the customer needs)
- Sample requests (when samples / drawings go out)
- Quotations (priced offers)
- Sales Orders (confirmed orders)
- Catalog + Pricing (products, price lists, taxes)

---

## Module 2.1 · Projects

**Purpose:** The central engagement entity — one project per delivery commitment, with all related work attached.

**Who uses it:** Rakesh (PM), Anil (site engineer), Mehul (procurement raises PRs against projects), Vikas (service engineer references projects for related complaints).

**Key features:**

- Pipeline stage machine (custom per tenant)
- Raj has two segments: EPC Project (18 stages from RFQ to DLP) + Panel Order (12 stages from enquiry to SAT)
- Stakeholder registry per project (buyer, architect, consultant, contractor)
- Gate requirements per stage (required documents, required fields)
- Scannable progress header — position + health + completeness in one row
- Stage history with full audit trail
- Project P&L (revenue committed, cost committed, margin tracking)
- Cross-reference: specs, samples, quotes, orders, dispatches, invoices, collections, complaints, visits, attachments
- AI project brief (health summary + risks + next actions)

**How it works:** A project is created either from a won lead (auto-conversion) or directly. As it progresses, each gate must be satisfied to advance — for example, "drawings approved" is a gate before "procurement starts" in Raj's EPC pipeline.

**Integrates with:** Almost every other revenue + delivery + finance module.

**What it replaces:** Excel project trackers, WhatsApp project groups, Google Sheets "master tracker", paper file folders per project.

---

## Module 2.2 · Specifications

**Purpose:** Capture what the customer needs — products, quantities, finishes, specifications — against a project.

**Who uses it:** Rakesh, estimation team, draftsmen.

**Key features:**

- Product picker (from catalog) or ad-hoc text
- Quantity + unit + finish
- Specifications text (drawing reference, brand preference)
- Linked to the project + the customer firm
- Drives sample-requesting + quote-building
- Versioning when specs change

**Integrates with:** Projects, Catalog, Sample requests, Quotations.

---

## Module 2.3 · Sample requests

**Purpose:** Track samples / drawings / mock-ups sent to customers for evaluation.

**Who uses it:** Inside sales, project managers.

**Key features:**

- Sample qty + product + finish
- Recipient (customer firm + contact)
- Dispatched / received / outcome status
- Outcome (accepted / rejected / requires revision)
- Auto-task on outcome ("sample accepted, raise quote")

**Integrates with:** Projects, Specifications, Quotations.

---

## Module 2.4 · Quotations

**Purpose:** Priced offers sent to customers, with full commercial logic.

**Who uses it:** Rakesh (PM raises quotes for his projects), Anil (sales engineer raises customer-facing quotes), Sandeep (Director approves above threshold).

**Key features:**

- Line-by-line product picker with auto-pricing
- Quantity + rate + discount % per line
- HSN code per line
- GST split (IGST or CGST+SGST) auto-detected from customer state vs warehouse state
- Subtotal, GST total, grand total
- Customer payment terms + validity period
- Status state machine: draft → submitted → approved → sent → accepted / rejected / expired
- Margin calculation (masked from sales_engineer role per RBAC)
- Approval routing when discount or margin breaches threshold
- BOQ PDF generation
- WhatsApp share via AiSensy
- Multiple revisions with full history
- Auto-conversion to Sales Order on Accept
- AI quote draft from spec (future enhancement)

**Integrates with:** Projects, Specifications, Pricing, Sales Orders, Approvals.

**What it replaces:** Excel quote templates, manual PDF generation, "let me update the spreadsheet and resend".

---

## Module 2.5 · Sales Orders

**Purpose:** Confirmed orders — what the customer has committed to buy.

**Who uses it:** Rakesh, accounts (Priya for invoicing), warehouse (for dispatch).

**Key features:**

- Created from accepted quote (auto) or directly
- Line items snapshot from quote (price locked)
- Customer + project + sales contract reference
- Stage state machine: confirmed → in_production → ready → dispatched → delivered → closed
- Reservation against stock (operational inventory)
- Linked dispatches + invoices
- Order P&L

**Integrates with:** Quotations, Stock, Dispatches, Invoices.

---

## Module 2.6 · Catalog + Pricing

**Purpose:** Master data for products, variants, pricing, taxes.

**Who uses it:** Admin / management.

**Key features:**

- Product master with SKU codes, descriptions, units, HSN codes
- Variants (size, finish)
- Bundles (composite products)
- Multiple price lists (retail, dealer, contract)
- Customer-specific pricing (future enhancement)
- Tax master (GST rates by HSN)
- Payment terms master
- Effective-dated pricing (price changes take effect from a future date)

**Integrates with:** Quotations, Sales Orders, PRs, POs.

---

# Capability 3 · Delivery

**Purpose:** Fulfil commitments — order → reserve stock → schedule → dispatch → POD → received. Plus the entire procurement chain.

**Modules in this capability:**
- Inventory (stock + reservations)
- Warehouses (stock locations + receipts)
- Dispatches (delivery to customer)
- **Procurement** sub-capability:
  - Purchase Requisitions
  - RFQs + Comparative Statements
  - Purchase Orders
  - Goods Receipt Notes
  - Returns to Vendor
  - Blanket POs
  - Job-work challans
  - Vendor performance scorecards

---

## Module 3.1 · Inventory

**Purpose:** Track stock — what we have, where it is, what's reserved for which order.

**Who uses it:** Warehouse supervisors, project managers, procurement.

**Key features:**

- Stock locations per warehouse (bins, racks, zones)
- Stock movements (receipts, issues, transfers, adjustments, returns)
- Reservations against sales orders or projects
- Stock-on-hand by location
- Polymorphic movement attribution (related to GRN / dispatch / sample / transfer / adjustment / RTV)
- Movement audit trail with reason codes

**Integrates with:** GRNs (in), RTVs (out), Dispatches (out), Stock Adjustments (write-offs), Stock Transfers (warehouse-to-warehouse).

---

## Module 3.2 · Warehouses

**Purpose:** Multiple physical locations where stock is held.

**Who uses it:** Warehouse supervisors, procurement, dispatch managers.

**Key features:**

- Warehouse master (name, address, state for GST routing)
- Multi-location stock visibility
- Per-warehouse user assignment
- Tablet-friendly receipt + dispatch views
- Default warehouse per project

**Integrates with:** Inventory, POs (ship-to selection), Dispatches (from selection).

---

## Module 3.3 · Dispatches

**Purpose:** Delivery from warehouse to customer.

**Who uses it:** Dispatch managers, warehouse supervisors, site engineers (POD capture).

**Key features:**

- Dispatch against a sales order
- Multi-tranche support (one SO → multiple dispatches)
- Transporter master + vehicle assignment
- E-way bill capture (mandatory for ₹50k+ interstate)
- Driver name + phone
- Status state machine: scheduled → loaded → in_transit → delivered → received
- POD (Proof of Delivery) capture: photo + signature on mobile
- Damage reporting on receipt
- Dispatch diary AI capture (warehouse can voice/photo capture, AI extracts structured data)

**Integrates with:** Sales Orders, Warehouses, Inventory, Field Operations.

---

## Module 3.4 · Purchase Requisitions (Procurement)

**Purpose:** Internal request: "I need this material / service."

**Who uses it:** Site engineers, project managers (Rakesh), store keepers.

**Key features:**

- Project link (optional) + cost center
- Required-by date
- Justification (visible to approver)
- Multiple line items with product picker, HSN, qty, est. rate, preferred vendor
- Approval routing by estimated value (under ₹50k auto-approves; ₹50k-₹5L manager; ₹5L-₹25L manager+admin; ₹25L+ admin)
- Status state machine: draft → submitted → approved / rejected → cancelled / po_raised
- Conversion to PO on approval (pre-fills PO form from PR lines)
- Linked PO traceability

**Integrates with:** Projects, Approvals, Purchase Orders, RFQs.

**What it replaces:** Email requests for materials, WhatsApp "we need X", paper requisition slips.

---

## Module 3.5 · RFQs + Comparative Statements (Procurement)

**Purpose:** Send a quote request to multiple vendors, compare their responses, pick the winner.

**Who uses it:** Procurement manager (Mehul).

**Key features:**

- Source from one or more PRs (consolidation)
- Invite 2+ vendors
- Per-vendor response capture (rate, GST, delivery days, payment terms)
- Comparative Statement matrix (vendor × line)
- L1 auto-highlighting (lowest landed cost)
- Click-to-select with override-reason-on-non-L1
- Auto-finalisation when all vendors respond
- "Create PO from CS" CTA (pre-fills PO with winner's rates)

**Integrates with:** Vendors, PRs, Purchase Orders.

**What it replaces:** Excel comparative statements, manual L1 reasoning, "why did we pick this vendor" arguments at audit time.

---

## Module 3.6 · Purchase Orders (Procurement)

**Purpose:** The formal order to a vendor.

**Who uses it:** Procurement manager (Mehul).

**Key features:**

- Vendor + warehouse + project
- Multiple line items with HSN, qty, rate, discount, GST
- IGST vs CGST+SGST split auto-detected from vendor state vs warehouse state
- Subtotal, GST total, grand total
- Payment terms, delivery terms, warranty, LD, retention %
- Status state machine: draft → pending_approval → approved → sent → partly_received → received → cancelled / closed
- Address snapshots (bill-to, ship-to, vendor) frozen at PO time for audit
- PDF generation + WhatsApp share
- Approval routing by amount band
- Linked GRNs, RTVs, Vendor Bills, Payments
- Sources: ad-hoc / from-PR / from-RFQ / blanket-release
- **Imports-lite fields:** Bill of Entry no/date, customs duty, CIF FX rate, ports of loading/discharge

**Integrates with:** Vendors, Warehouses, Projects, PRs, RFQs, Blanket POs, GRNs, Vendor Bills.

---

## Module 3.7 · Goods Receipt Notes (Procurement)

**Purpose:** Document material arrival at warehouse, per PO.

**Who uses it:** Stores in-charge, warehouse supervisor.

**Key features:**

- Linked to a PO
- Per-line: qty received, qty accepted, qty rejected with reason
- Paperwork capture: vendor challan no, vendor invoice no, vehicle no, transporter, e-way bill no
- QC status (not_required / pending / accepted / rejected / partial_accept)
- Status state machine: draft → posted → cancelled
- On post: updates PO qty_received, writes stock_movement, creates QC task if rejection
- Batch + expiry tracking per line

**Integrates with:** Purchase Orders, Inventory, Tasks, Returns to Vendor.

---

## Module 3.8 · Returns to Vendor (Procurement)

**Purpose:** Send rejected material back to the vendor after a GRN.

**Who uses it:** Stores + procurement.

**Key features:**

- Linked to a GRN (and through it to a PO)
- Per-line: qty to return + reason
- Cap on return qty (can't return more than was accepted)
- Status state machine: draft → posted → cancelled
- On post: reverses stock_movement, decrements PO qty_received
- Vendor credit-note tracking (closes the loop when vendor's credit note is received)

**Integrates with:** GRNs, Purchase Orders, Inventory.

---

## Module 3.9 · Blanket POs (Procurement)

**Purpose:** Annual rate contracts — locked rate + capped quantity for high-velocity items.

**Who uses it:** Procurement manager.

**Key features:**

- Annual qty cap + locked rate
- Value cap auto-computed (qty × rate)
- Validity period (typically Apr-Mar Indian FY)
- 5-state lifecycle: draft / active / exhausted / expired / cancelled
- Drawdown tracker (qty_released auto-updates as release POs are raised)
- Release-PO creation flow: pick blanket → fill qty → save (vendor + rate pre-filled)
- Progress visualisation (stacked bar)

**Integrates with:** Purchase Orders.

**What it replaces:** Excel rate-contract sheets, "are we still under the cap?" guesswork, individual rate negotiation per PO.

---

## Module 3.10 · Job Work Challans (Procurement)

**Purpose:** Track materials sent to job workers for processing, while remaining on your books.

**Who uses it:** Procurement, accounts (for ITC-04 filing).

**Key features:**

- Send qty + process nature (machining / cutting / coating / etc.)
- Job-worker GSTIN snapshot at challan time (so ITC-04 stays correct if vendor master changes)
- Expected return date (with 1-year limit for inputs, 3-year for capital goods)
- Receipt tracking (qty received back + qty scrap + return date)
- Status state machine: sent → partly_received → fully_received / cancelled
- Quarterly ITC-04 CSV export for upload to GSTN portal

**Integrates with:** Vendors, Accounts compliance.

---

## Module 3.11 · Vendor Performance Scorecards

**Purpose:** Performance summary per vendor per FY — derived from PO + GRN + Bill activity.

**Who uses it:** Procurement manager, director.

**Key features:**

- Per-vendor metrics:
  - PO count + value
  - On-time delivery % (GRN date vs PO expected delivery)
  - Qty acceptance % (accepted vs received from GRN lines)
  - Mismatched bill count
  - Outstanding amount
- Auto-grades: A (≥90% on-time + ≥98% acceptance + 0 mismatches) / B (≥70%/95%) / C (anything below) / unrated
- FY toggle (current + 2 prior years)
- KPI strip + grade rollup + sortable table

**Integrates with:** Vendors, POs, GRNs, Vendor Bills.

**What it replaces:** Annual vendor review meetings driven by memory and gossip. Now driven by data.

---

# Capability 4 · Field Operations

**Purpose:** Activity-based execution in the field — any structured task done on location, by any field-going role.

**Modules in this capability:**
- Day Lifecycle (attendance)
- Visit Execution
- Vehicle + Reimbursement
- Multi-category Expenses
- Manager team view + claim approval
- Voice + photo AI capture

---

## Module 4.1 · Day Lifecycle (Attendance)

**Purpose:** Day begins with check-in, ends with check-out, with auto-computed claim in between.

**Who uses it:** Site engineers (Anil), service engineers (Vikas).

**Key features:**

- Mobile check-in with odometer photo + GPS + (optional) selfie
- Status options: on_duty / wfh / leave / holiday
- Vehicle assignment for the day
- Multiple visits during the day attached to the same attendance
- Mobile check-out with odometer photo
- Auto-computed total_km from check-in and check-out readings
- Auto-computed reimbursement claim from km × vehicle rate
- Claim submission to manager for approval

**Integrates with:** Visits, Vehicles, Reimbursement Rates, Claims, Approvals.

---

## Module 4.2 · Visit Execution

**Purpose:** Each visit to a customer / site is captured with full context.

**Who uses it:** Field-going roles.

**Key features:**

- Subject: project / lead / firm / dealer (exactly one)
- Visit purpose (configurable — sales / site / inspection / commissioning / installation / AMC / service / etc.)
- Visit outcome (configurable per visit purpose)
- GPS + location label
- Voice note → AI extraction of structured outcome fields
- Photo + document + signature capture
- Activity events (travel started → arrived → in_progress → completed)
- Multi-leg km tracking
- Visit hub (combined view with attachments + expenses + tasks + activity timeline)
- Edit window (24h then locked)

**Integrates with:** Day Lifecycle, Visit Masters, Attachments, Expenses, Tasks.

---

## Module 4.3 · Vehicle + Reimbursement

**Purpose:** Vehicle master + per-km reimbursement matrix.

**Who uses it:** Admin (master setup), field-going roles (claims).

**Key features:**

- Vehicle master (registration, model, assigned user)
- Vehicle type (bike / car / company-owned)
- Fuel type (petrol / diesel / EV)
- Reimbursement rate matrix (per vehicle type × fuel type × effective date)
- Auto-claim computation
- Effective-dated rates (new rate takes effect from a future date)

**Integrates with:** Attendance, Claims.

---

## Module 4.4 · Multi-category Expenses

**Purpose:** Capture all expense types — not just travel km.

**Who uses it:** Field-going roles, manager (approval).

**Key features:**

- 12 system categories: fuel / tolls / food_self / food_client / taxi / train_air / accommodation / mobile_recharge / gift / sample_courier / site_supplies / other
- Tenant can add custom categories
- Per-expense: category + amount + date + notes + receipt photo
- Subject link (tie expense to a specific visit / project / firm)
- Approval routing by amount band
- Status state machine: draft → submitted → approved / rejected → exported

**Integrates with:** Visits, Approvals, Finance export.

---

## Module 4.5 · Manager team view

**Purpose:** Manager dashboard showing the field team in real-time.

**Who uses it:** Project managers, directors.

**Key features:**

- Today: who's on duty, who's WFH, who's on leave
- Live last-known location (Google Maps deep-link, opt-in)
- Per-rep card: status, plan-vs-done, running km, current location
- Stale-activity flag (rep hasn't moved in 2 hours)
- Drill-down to individual day detail
- Claim approval queue (inline approve/reject)
- Period rollup (visits done, km, expense, on-duty days)

**Integrates with:** Attendance, Visits, Expenses, Claims.

---

## Module 4.6 · Voice + Photo AI Capture

**Purpose:** Speed up field data entry using AI.

**Who uses it:** Field-going roles.

**Key features:**

- **Voice note → completion form:** Anil speaks a 30-second update; AI extracts outcome + interest level + next action + amount mentioned
- **Odometer photo OCR:** Anil photographs the odometer; AI reads the numeric reading
- **Site photo as evidence:** auto-attached to the visit with EXIF metadata preserved
- **Business card OCR** (shared with Relationship capability)
- **Voice → quote line** (future): "5000 cartons of pavers at 22 rupees" → quote line draft

All AI outputs are human-reviewed before save. Never autonomous.

---

# Capability 5 · Customer Success

**Purpose:** Keep customers — resolve issues, deliver service, manage warranty/AMC, track satisfaction.

**Modules in this capability:**
- Complaints
- AMC Contracts + Visits
- Service Tickets (future)
- Warranty Tracking (future)

---

## Module 5.1 · Complaints

**Purpose:** Capture and resolve customer issues with full audit trail.

**Who uses it:** Customer service rep (intake), service engineers (Vikas), service manager (escalation).

**Key features:**

- Severity master (system + tenant-configurable)
- Complaint type master (configurable)
- Stage state machine: logged → triaged → assigned → in_progress → resolved → closed / rejected
- Per-tenant pipeline (Raj uses 7 stages including escalation)
- Customer + reporter contact + linked project / order / AMC
- Assignment to engineer
- Resolution form: root cause, parts used, photos, customer signature
- SLA timing per severity (first-response time + resolution time)
- Escalation triggers (auto when SLA breach approaches)
- Stage history audit trail
- AI complaint classification from free text (future)

**Integrates with:** Firms, Projects, Sales Orders, AMC, Field Visits, Approvals (free-replacement under warranty), Customer Success engineer.

**What it replaces:** Email-based complaint tracking, WhatsApp escalation chains, "we lost the customer's complaint email".

---

## Module 5.2 · AMC Contracts + Visits

**Purpose:** Annual Maintenance Contracts with auto-scheduled visit cadence.

**Who uses it:** Service engineers (Vikas), service manager.

**Key features:**

- Contract per customer (linked to optional sales order)
- 5-state lifecycle: draft / active / expired / renewed / cancelled
- Visit frequency: monthly / quarterly / bi-annual / annual / custom
- Auto-generated visit schedule (evenly spaced across the contract period)
- Per-visit status: scheduled / done / cancelled / rescheduled
- Renewal flow (parent_contract_id linking renewed contracts to predecessors)
- Days-to-expiry warning on dashboard
- Future: AMC-specific billing schedule (pre-paid quarterly vs annual)

**Integrates with:** Firms, Sales Orders, Complaints, Field Visits.

**What it replaces:** Excel AMC schedules, "did we visit them this quarter?" guesswork, missed AMC visits = lost renewals.

---

# Capability 6 · Finance

**Purpose:** Business finance — receivables, payables, expense, claims, credit, targets, incentives. **Not accounting ERP.**

**Modules in this capability:**
- Invoices (sales-side AR)
- Collections (dunning + PTP + receipts)
- Vendor Bills (AP — covered in Procurement capability)
- Vendor Payments + TDS (covered in Procurement)
- AP Ageing + MSME compliance (covered in Procurement)
- GSTR-2B reconciliation (covered in Procurement)
- Expense Management (covered in Field Operations)
- Tally Integration

---

## Module 6.1 · Invoices

**Purpose:** Customer-facing invoices for delivered orders.

**Who uses it:** Accounts (Priya), finance head.

**Key features:**

- Invoice against sales order or directly (without order, for retention bills, RA bills, advance bills)
- Line items snapshot (price + tax frozen at invoice time)
- GST split (IGST or CGST+SGST)
- Retention amount tracking (typical 5% in EPC)
- Running-bill sequence support (RA bills against milestones)
- Status state machine: drafted → sent → partly_paid → paid → written_off
- E-invoicing IRN (mandatory for ₹5cr+ turnover, optional below)
- PDF generation + WhatsApp share
- Photo OCR (capture a vendor-side invoice photo, AI extracts structured data)
- Tally sync (two-way with reconciliation log)

**Integrates with:** Sales Orders, Collections, Tally.

---

## Module 6.2 · Collections

**Purpose:** Manage receivables — get paid faster.

**Who uses it:** Collections officer, accounts manager (Priya), director.

**Key features:**

- Ageing dashboard (current / 1-30 / 31-60 / 61-90 / 90+ buckets)
- WhatsApp dunning via AiSensy (pre-due reminder, overdue reminder, escalation)
- Promise-to-pay (PTP) capture
- Receipt recording
- PTP coverage % (overdue invoices with an open PTP)
- Dishonoured PTPs flagged
- Collection cadence: scheduled Inngest job runs daily at 10:00 IST
- WhatsApp PTP capture (AI extracts amount + date from customer's WA reply)
- Customer-level account view

**Integrates with:** Invoices, AiSensy, Tasks (PTP due dates auto-task).

---

## Module 6.3 · Tally Integration

**Purpose:** Bidirectional sync with Tally for accounting integration.

**Who uses it:** Accounts.

**Key features:**

- Two-way sync of invoices + receipts
- Reconciliation log (catches drift between CRMOS and Tally)
- Vendor + customer master sync
- Tax + payment-term sync
- Configurable per-tenant (some tenants use Zoho Books / QuickBooks — adapter pattern, future)
- Per-tenant `procurement.ap_master` flag — Tally stays AP master OR CRMOS becomes AP master

---

# Capability 7 · Intelligence

**Purpose:** Make data speak. Dashboards, AI, alerts, recommendations, business health.

**Modules in this capability:**
- Owner Dashboard (executive surface)
- Daily Digest (AI narrative + focus items)
- Attention Centre (ranked queue across capabilities)
- AI Assistants (distributed across the product)

---

## Module 7.1 · Owner Dashboard

**Purpose:** Executive surface for the Director — 30-second business-health read followed by drill-throughs.

**Who uses it:** Director (Sandeep).

**Sections (top-to-bottom):**

1. Today's KPIs with day-over-day deltas
2. AI Brief (3 actions for today, drafted from data)
3. Receivables ageing (5-bucket stacked bar)
4. Top debtors (top 10 by outstanding)
5. Cash movement (30-day cash-in by payment mode)
6. PTP coverage
7. Pipeline funnel (leads → wins)
8. Win rate + cycle time
9. Top reps (closed amount in period)
10. Operations (dispatch counts, in-transit, delivered)
11. Today's field activity
12. Team roster (live)
13. Rep scorecards
14. Attention Centre (ranked feed)

**Integrates with:** Every capability — reads from aggregated views.

---

## Module 7.2 · Daily Digest

**Purpose:** AI-generated narrative summary of yesterday's business + today's priorities.

**Who uses it:** Manager + executive roles.

**Key features:**

- Scheduled Inngest cron runs at 7:00 IST
- AI prompt assembles: yesterday's revenue, collections, key events, top tasks, anomalies
- Generates: 5-sentence narrative + 5 focus items
- Stored in `daily_digest` table for historical reading
- Mobile-optimised digest card on /dashboard

---

## Module 7.3 · Attention Centre

**Purpose:** Ranked queue of items needing decisions today.

**Who uses it:** Manager + executive roles.

**Key features:**

- Cross-capability roll-up (no single module owns it)
- Categories: critical collections, high-value stalled deals, pending approvals, overdue tasks, paving stage, cold leads, stale quotes
- Severity classification (critical / warning / info / gap)
- Honest gap markers (where modules aren't built yet)
- Each item drill-throughs to the source page

---

## Module 7.4 · AI Assistants

**Purpose:** AI plumbing distributed across the product.

**Who uses it:** Every role.

**Surfaces:**

- Business-card OCR (Relationship)
- Voice → completion form (Field Ops)
- Odometer photo OCR (Field Ops)
- Invoice photo OCR (Finance)
- Dispatch diary OCR (Delivery)
- AI quote draft from spec (future, Revenue)
- AI complaint classification from text (future, Customer Success)
- AI relationship intelligence brief (Relationship)
- AI Owner Brief on `/owner` (Intelligence)
- AI Visit Prep Brief (Field Ops + Intelligence)

All AI outputs are reviewed before save. Per Constitution Principle #6: AI assists; humans decide.

---

# Capability 8 · Platform

**Purpose:** Everything every capability needs. No business logic — substrate only.

**Modules in this capability:**
- Auth + Multi-tenancy
- RBAC + Department-aware navigation
- Workflow engine + Pipeline stages + Gate requirements
- Tasks
- Activity timeline + Audit log
- Notifications + Notification transport
- Attachments
- Approvals
- Feature flags + Tenant settings
- Code-prefix templates
- AI plumbing
- Event bus (Inngest)

---

## Module 8.1 · Auth + Multi-tenancy

**Purpose:** Secure user + tenant model with row-level isolation.

**Key features:**

- Supabase auth (email + password, magic links optional)
- `tenant_id` on every table
- Row-level security (RLS) policies enforce tenant isolation
- Per-user profile with role + department + job title

---

## Module 8.2 · RBAC + Department Navigation

**Purpose:** Role-based access control + department-aware sidebar curation.

**Key features:**

- Three internal roles: admin / manager / sales_engineer (plus dealer for portal users)
- Six departments: management / projects / field_sales / procurement / accounts / service
- Sidebar items can be gated by role AND/OR department
- Each persona sees only items relevant to their work
- Default landing route per department

---

## Module 8.3 · Workflow Engine

**Purpose:** Configurable pipeline stages + gate requirements per entity.

**Key features:**

- `pipeline_stage` table per entity (project, lead, sales_order, etc.)
- `pipeline_substage` for finer breakdowns
- `gate_requirement` master — required documents + required fields per stage
- Stage advance validates gates before allowing transition
- Atomic stage advance with history log

---

## Module 8.4 · Tasks

**Purpose:** Action items generated by anything + assigned to anyone.

**Key features:**

- Polymorphic source (any entity can generate tasks)
- Auto-generated tasks (paving-stage follow-up, stale quote nudge, sample-no-outcome, SLA approach)
- Manual tasks
- Assignee + due date + priority (low / medium / high / urgent)
- Per-user task queue
- Snooze + complete + reassign
- Linked back to source entity

---

## Module 8.5 · Activity Timeline + Audit Log

**Purpose:** Every change is recorded.

**Key features:**

- `activity` table — typed events per entity (created / assigned / stage_changed / quote_sent / order_won / etc.)
- `audit_log` table — append-only, system-wide
- Per-entity timeline on every detail page
- Filter by activity type
- Triggered by database (not app-level — even direct SQL writes get logged)

---

## Module 8.6 · Notifications

**Purpose:** Alert users to things they need to know.

**Key features:**

- In-app (badge on topbar bell)
- WhatsApp via AiSensy (configurable templates)
- Email (future)
- Push (future)
- Per-user notification preferences (which categories, which channels)

---

## Module 8.7 · Attachments

**Purpose:** Documents, photos, signatures, voice notes — attached to anything.

**Key features:**

- Polymorphic (any entity can have attachments)
- 5 kinds: photo / document / voice_note / signature / receipt
- Storage in Supabase Storage (S3-compatible)
- Per-entity parent-readability check
- Signed URLs for secure access
- Reusable components: AttachmentUploadButton, AttachmentList, SignaturePad

---

## Module 8.8 · Approvals

**Purpose:** Multi-step + multi-level approval flows for any entity above threshold.

**Key features:**

- Approval policies per entity_type + amount band
- Sequential or parallel steps
- Role-based or specific-user approver resolution
- Require-all vs any-one for parallel mode
- Per-step action log (approve/reject + comment)
- Auto-escalation cron (future)
- Inline approval card on consumer pages

**Used by:** Quotes (margin override), Sales Orders (post-confirmation cancellation), PRs, POs, Vendor Bills, Vendor Payments, Expenses, Claims.

---

## Module 8.9 · Feature Flags + Tenant Settings

**Purpose:** Per-tenant configuration without code forks.

**Key features:**

- `tenant_feature` table — boolean flags per capability (enable_field_sales, enable_dealer_portal, enable_warehouse, etc.)
- `tenant.settings` JSON column (Zod-validated) — for richer config (code prefixes, company info, integration credentials)
- Configurable per-tenant: sidebar items, default landings, approval thresholds, code prefix templates, masters

---

## Module 8.10 · Code-Prefix Templates

**Purpose:** Per-tenant document numbering.

**Key features:**

- Templates like `VT-QT-{yyyy}-{nnnn}` for Vyara or `RA-PO-{yyyy}-{nnnn}` for Raj
- Auto-applied via DB triggers (safety net) + RPC + app-level helper
- Supported entities: quotation, sales_order, invoice, dispatch, dealer, lead, stock_transfer, purchase_order, GRN, return_to_vendor, vendor_bill, vendor_payment, purchase_requisition, RFQ, blanket_po, job_work_challan

---

## Module 8.11 · AI Plumbing

**Purpose:** Shared AI infrastructure used by every capability.

**Key features:**

- `ai_extraction` table — cache for AI outputs (avoid re-calling for same input)
- `extractFromImage` (image OCR)
- `extractFromText` (text extraction with structured schema)
- Anthropic Claude (configurable provider; future pluggable)
- Per-tenant API key (optional)
- PII scrubbing on input
- Observability + retry logic

---

## Module 8.12 · Event Bus

**Purpose:** Loose coupling between modules — events emitted, subscribers react.

**Key features:**

- Inngest as the event runtime
- Events: `quote.won`, `order.confirmed`, `dispatch.delivered`, `invoice.overdue`, `payment.received`, `complaint.logged`, etc.
- Subscribers per event in their own modules
- Per Constitution Principle #0: no cross-module writes, all integration via events

**Used by:** Order creation on quote-won, dispatch scheduling on order-confirmed, collection trigger on invoice-overdue, daily digest cron, paving-stage daily check.

---

# Closing notes

## What CRMOS is NOT

For clarity, here's what we don't build:

| Out of scope | Why |
|---|---|
| MRP / production scheduling | Different operational shape — too tied to factory floor specifics |
| HR + payroll | Different domain — better-served by dedicated HRMS |
| Consumer-facing e-commerce / D2C | Different commercial model — better-served by Shopify-class tools |
| Third-party marketplace listings | Different commercial model |
| Manufacturing execution / machine telemetry | Different operational shape — too tied to specific machine vendors |
| Treasury / banking beyond payment-gateway integration | Different domain |
| Full ERP replacement | Tally / SAP / Oracle integrate with CRMOS — not replaced by it |

## What gets configured, not coded

The same architecture supports eight industries by configuration:

| Industry | Examples |
|---|---|
| Building Materials | Vyara Tiles, paver / kerb / tile manufacturers |
| Electrical Contractors | **Raj Avinsys**, panel manufacturers, EPC companies |
| Industrial Manufacturers | OEM panel makers, equipment builders |
| HVAC | Cooling system installers, AMC providers |
| Engineering Companies | Design + commissioning firms |
| Distributors | Multi-brand reseller chains |
| Fabricators | MS fabrication, sheet metal, custom enclosure makers |
| Service Businesses | Pure-AMC providers, breakdown service companies |

Industry behavior is absorbed through:

- `relationship_type_master` (vocabulary varies)
- Pipeline templates + stages + gates (workflow shape varies)
- `field_activity_type` master (visit purposes vary)
- Outcome vocabularies (per activity type)
- Approval policies + thresholds (governance varies)
- Dashboard layouts + alert rules (executive surface varies)
- Custom fields (when introduced)

**Same schema. Same modules. Different configuration.**

That's the platform thesis.

---

## Contact

**Paresh Khatri**
contact@mindboxtech.agency

Prepared for Raj Avinsys Pvt. Ltd. · June 2026

---

*End of document. Version 1.0.*
