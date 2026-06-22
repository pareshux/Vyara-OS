# Raj Avinsys — Product Walkthrough Guide

A 20-stage tour of CRMOS, seen through the eyes of your team.

---

**Prepared for**
Raj Avinsys Pvt. Ltd. · Gujarat
EPC · Panel Manufacturing · AMC

**Prepared by**
Paresh Khatri · designsbyparesh@gmail.com

**Version**
v1.0 · 22 June 2026

---

## About this guide

This document is a **product walkthrough**, not a manual. It tells the story of a project at Raj Avinsys from the first enquiry through to commissioned site and ongoing service, narrated through the eyes of six members of your team — each one responsible for a different stage of the work.

You can read it cover-to-cover in about 30 minutes. Or you can sit at a computer with this guide open and click along, signing in as each persona as you reach their part of the story.

The product itself is configured, not coded, around your business. Anything that doesn't match how you actually work today can be changed. Anything that's missing can be added. That conversation is what comes after this walkthrough.

---

## Contents

**Part 1 · How to use this guide** (page 3)

**Part 2 · Your team in this walkthrough** (page 4)

**Part 3 · Winning the work** (page 5)
- Act 1 · A new opportunity lands
- Act 2 · A day in the field
- Act 3 · Lead becomes a Project
- Act 4 · Building the quote
- Act 5 · The Director approves the big number

**Part 4 · Procuring the material** (page 11)
- Act 6 · Raising a Purchase Requisition
- Act 7 · Procurement responds with an RFQ
- Act 8 · Comparative Statement — picking the winner
- Act 9 · Purchase Order goes out
- Act 10 · The rate-contract alternative — Blanket POs

**Part 5 · Receiving the goods** (page 17)
- Act 11 · Goods Receipt Note
- Act 12 · Return to Vendor

**Part 6 · Paying the vendor** (page 20)
- Act 13 · Booking the vendor's bill
- Act 14 · Payment with TDS
- Act 15 · NEFT bank file

**Part 7 · Tax compliance** (page 24)
- Act 16 · GSTR-2B reconciliation
- Act 17 · AP Ageing and MSME compliance
- Act 18 · ITC-04 quarterly return

**Part 8 · Service after the sale** (page 28)
- Act 19 · Complaints and AMC

**Part 9 · The Director's view** (page 30)
- Act 20 · Sandeep's daily ritual

**Part 10 · Conclusion** (page 32)
- What this product replaces
- What to try yourself
- Next steps

---

# Part 1 · How to use this guide

## Where to begin

Open a Chrome or Safari browser and navigate to:

```
https://localhost:3000/demo
```

You'll see a single page with six cards laid out as a team — one card per role in your business. The walkthrough begins by clicking the **Anil** card.

## What happens at each stage

Each Act in this guide starts the same way:

| Header | Meaning |
|---|---|
| **Sign in as <name>** | Sign out if you're already logged in, then click this person's card on `/demo` |
| **The scenario** | A short paragraph setting up what's happening in the business right now |
| **What you'll do** | Numbered click-by-click steps inside the product |
| **What you'll see** | The state of the screen after those clicks |
| **What this means for Raj** | The business value, in plain language |

## Switching between roles

When an Act says "Sign in as Rakesh", you'll need to:

1. Click your avatar in the top-right corner of the product
2. Click "Sign out"
3. You'll return to `/demo`
4. Click the next persona's card

## A single password for all roles

All six personas in this demo share the same password:

```
RajDemo@1234
```

This is intentional for demonstration. In a real deployment, every team member would have their own credentials, set during onboarding.

---

# Part 2 · Your team in this walkthrough

Six members of your team carry the story forward. Each one has a different view of the product, shaped around what they do daily.

## Quick reference

| Role | Name | Department | Their daily question |
|---|---|---|---|
| Director | **Sandeep** | Management | "How is the business today, and what needs my attention?" |
| Project Manager | **Rakesh** | Projects | "Which milestones are due, what materials need ordering, what's stuck?" |
| Site Engineer | **Anil** | Field | "Where do I go today, and what do I need to log?" |
| Procurement Manager | **Mehul** | Procurement | "What's pending approval, which POs are stuck, which vendors are reliable?" |
| Accounts Manager | **Priya** | Accounts | "What bills need approving, what's due this week, are we GST-compliant?" |
| Service Engineer | **Vikas** | Service | "Which complaints are open, which AMC visits are scheduled?" |

## What each role can and cannot see

Permissions in CRMOS are role-based and tenant-isolated. Each persona above sees only the parts of the product relevant to their work. A site engineer doesn't see vendor payment screens. A service engineer doesn't see procurement. This isn't a limitation — it's a design principle. Cognitive load is one of the biggest barriers to software adoption in field-heavy businesses.

Sandeep, as Director, is the only persona who sees everything.

---

# Part 3 · Winning the work

The story begins outside the office, where most EPC business actually starts.

## Act 1 · A new opportunity lands

### Sign in as Anil

### The scenario

It's mid-June. Anil has just returned from a GIDC industry meet in Vapi. While he was there, the Plant Head of Vapi Specialty Chemicals stopped him at the chai counter and mentioned that they're planning a major expansion — two new MCC panels plus cabling work. Budget approved. They want a quote in two weeks.

Anil captured the conversation in CRMOS the same evening on his phone.

### What you'll do

1. After signing in, you'll land on the **Field** workspace — Anil's home.
2. Click **Leads** in the left sidebar.
3. You'll see a list of one lead: **"Vapi Specialty Chemicals — Panel + EPC enquiry"**
4. Click into the lead.

### What you'll see

The lead detail page shows everything Anil captured:

- Contact name and phone (typed in as raw text — Anil hadn't formally created a contact record yet)
- Buyer firm (auto-linked to Vapi Specialty Chemicals)
- City, state, estimated project value (₹85 lakh)
- Expected close date (45 days)
- Notes from the conversation
- Owner (Anil)
- Stage (New)

### What this means for Raj

Every conversation that could turn into business is now tracked from day one. Six months later, when Sandeep asks "what happened to that Vapi lead?", the answer is one click away — including who spoke to whom, when, and what was promised.

The phrase "let me check with the team" disappears from the business.

---

## Act 2 · A day in the field

### Sign in as Anil

### The scenario

It's now 8:00 AM the next morning. Anil has three site visits planned today, one of which is at the L&T Vadinar project — a project Raj has been delivering for six months. The customer wants a pre-commissioning check and has hinted at an AMC discussion.

### What you'll do

1. Click **Field** in the left sidebar.
2. You'll see Anil's day already underway:
   - **On duty since 8:00 AM** chip at the top
   - Odometer reading captured at check-in (42,810 km)
   - GPS location captured
   - Planned visit list
3. You'll see an **in-progress visit** card showing he's currently at L&T Vadinar.
4. Click into the visit.

### What you'll see

The visit detail page is built for someone holding a phone in one hand:

- Subject (the L&T firm)
- State (in-progress)
- Quick-actions row: add photo · attach file · capture signature · log expense
- Voice note button — record a 30-second update, the system extracts structured outcome data
- Contact who was met
- Outcome dropdown (positive / follow-up / not-interested / etc.)
- Notes textarea

When Anil hits "Complete visit", the system:
- Locks the visit (24-hour edit window)
- Auto-creates a follow-up task if outcome was positive
- Updates the customer's interaction timeline

### What this means for Raj

Field activity stops being a black hole. Every minute spent at a customer site is tied to a specific outcome and a specific cost. No more reading end-of-week summaries — you know what happened the moment it happens.

The vehicle reimbursement that Anil claims is auto-computed from his odometer readings. No spreadsheets at month-end.

---

## Act 3 · Lead becomes a Project

### Sign in as Rakesh

### The scenario

Anil's qualified lead has hit Rakesh's desk. The customer is serious. Time to formalise this as a project — assign an owner, set stages, start tracking specifications.

### What you'll do

1. You'll land on the **Projects** workspace.
2. You'll see the four projects Rakesh is already running, including the L&T Vadinar work and an Adani Hazira deal.
3. To convert the Vapi lead into a project, you'd normally:
   - Go to **Leads**, open the Vapi lead, click **"Convert to project"**
   - The system creates a new project inheriting the lead's customer + value
4. For this walkthrough, open an existing project — click into any of Rakesh's projects.

### What you'll see

The Project Detail page has tabs:

| Tab | Contents |
|---|---|
| **Overview** | Stakeholders, scannable progress, key dates, AI insights |
| **Specifications** | What the customer needs — products, quantities, finishes |
| **Samples** | Sample requests, drawings, photos |
| **Quotes** | Quotations sent against this project |
| **Orders** | Sales orders raised |
| **Documents** | Attachments — drawings, BOQs, PO copies |
| **Timeline** | Every change, audit-ready |
| **Tasks** | Open and closed tasks against this project |

Notice the **scannable project header** at the top — it shows position in the pipeline, health (green/amber/red), and completeness (which gates are satisfied, which are pending).

### What this means for Raj

A project gets one home where everyone — sales, projects, accounts, service — sees the same picture. The phrase "let me check with finance" disappears, because Rakesh, Mehul, and Priya are all looking at the same numbers.

For an EPC business, this is the difference between projects that finish on time and projects that bleed through scope creep.

---

## Act 4 · Building the quote

### Sign in as Rakesh

### The scenario

The customer's spec is locked. Rakesh needs to translate it into a priced quotation.

### What you'll do

1. Inside a project, click the **Quotes** tab.
2. You'll see existing quotes raised against this project.
3. Click into a quote to see the detail.

### What you'll see

The quote detail page shows:

- Line-by-line items (cables, panels, labour, freight)
- Per-line: HSN code, qty, unit, rate, discount, GST
- Subtotal, GST split (IGST for interstate, CGST+SGST for intrastate), grand total
- Customer payment terms
- Validity period
- Status chip (draft / sent / accepted / rejected / expired)
- Approval status (if margin is above threshold)

From here Rakesh can:

- **Print BOQ** — generates a PDF formatted for the customer
- **Share via WhatsApp** — sends the quote PDF through AiSensy with a pre-filled message
- **Track viewed** — knows when the customer has opened the PDF
- **Revise** — creates a new version while keeping the history

### What this means for Raj

Pricing consistency across every quote. Every line uses master pricing, master GST rates, master HSN codes. Discounts above policy automatically route for approval — junior team members can't accidentally undercut the business.

The history of every revision is preserved. Years later, you can prove exactly what was offered, on what date, at what price.

---

## Act 5 · The Director approves the big number

### Sign in as Sandeep

### The scenario

The Vapi quote is ₹85 lakh — above the margin threshold that the system allows a project manager to send unilaterally. It routes to Sandeep for approval.

### What you'll do

1. After signing in, you'll land on the **Owner Dashboard**.
2. At the top, you'll see today's financial health — revenue, collections, outstanding, with day-over-day deltas.
3. Below that, an **AI Brief** — three priority actions for today, written by the system from the day's data.
4. Click **Approvals** in the left sidebar.

### What you'll see

A queue of decisions waiting for you, each one a clickable card with full context:

- Quotes above margin threshold
- Purchase orders above ₹5 lakh
- Vendor payments above ₹2 lakh
- Discount overrides
- Lead reassignments

Each card shows:

- The amount and the entity
- Who raised it and when
- The justification they provided
- The customer / vendor history (have we worked with them before, payment record, scorecard)
- **Approve** and **Reject** buttons — rejection requires a reason

### What this means for Raj

Approvals stop being a bottleneck. You see everything in one place with full context. No more "did Mehul send me that PO over WhatsApp?" or "where's the quote PDF?". And every decision is logged with timestamp and reason — audit-ready by default.

Most importantly, the system doesn't ask you to approve things you've already approved. Standing approvals (recurring vendors under threshold, repeat customers under credit limit) auto-clear so you're left with the genuinely consequential decisions.

---

# Part 4 · Procuring the material

The quote was won. A sales order was generated. Now Raj needs to procure the materials — cables from Polycab, panels from Schneider, switchgear from L&T.

## Act 6 · Raising a Purchase Requisition

### Sign in as Rakesh

### The scenario

For the Adani Hazira EPC project (already in flight), Rakesh's site engineer has confirmed they need 1,500 metres of LT cable plus a set of Schneider MCCB components. The cable is ₹4.20 lakh; the MCCBs are ₹2.80 lakh. Both above the auto-approval threshold.

### What you'll do

1. Click **Procurement** in the left sidebar.
2. You'll land on the procurement hub.
3. Click **Requisitions** in the sub-navigation.
4. You'll see Rakesh's existing PRs:
   - **RA-PR-2026-0002** — Adani cables, ₹4.20L, *submitted* (awaiting approval)
   - **RA-PR-2026-0003** — L&T Schneider, ₹2.80L, *approved*
5. Click **+ New requisition** to see the form (no need to submit).

### What you'll see

The PR form is structured:

- **Project link** — which project this is for
- **Cost center** — for general overheads not tied to a project
- **Required-by date**
- **Justification** — a paragraph explaining why this is needed (visible to the approver)
- **Items requested** — line items with:
  - Product (optional — links to product master if available)
  - Description (mandatory)
  - HSN code
  - Unit, quantity, estimated rate
  - Preferred vendor (optional — Rakesh's suggestion)
  - Specifications

As Rakesh types quantities, the system shows the running total at the bottom: *"Total estimated: ₹4.20L — above ₹50k, will route to Manager-band approval."*

### What this means for Raj

The site engineer's "I need this" becomes a documented request with approval routing baked in. No more verbal commitments that get forgotten. No more unauthorised purchases discovered at month-end.

For an EPC business where materials are 60-70% of project cost, this discipline alone can save 2-3% of revenue annually.

---

## Act 7 · Procurement responds with an RFQ

### Sign in as Mehul

### The scenario

Rakesh's PR for cables has landed in Mehul's queue. The amount is significant; Mehul wants to compare quotes from three vendors before committing to one.

### What you'll do

1. You'll land on the **Procurement** hub.
2. Click **Requisitions** to find Rakesh's submitted PR.
3. From the PR detail page, Mehul has two routes:
   - **Raise PO directly** — if he already knows the vendor and rate
   - **Send RFQ first** — if multiple vendors should compete
4. Click **RFQs** in the sub-navigation.
5. Click **+ New RFQ**.

### What you'll see

The RFQ form lets Mehul:

- Link the source PR (so traceability is preserved)
- Pick which vendors to invite (minimum two)
- Set a response deadline
- Specify line items with required specs

After the RFQ is sent, vendor responses come back. They can either:

- Be entered manually into the system by accounts (typing in vendor quote details)
- Be uploaded as PDFs — the system extracts pricing automatically using AI (future enhancement)

### What this means for Raj

Vendor selection becomes a transparent process. Comparative pricing is the norm, not the exception. When auditors ask "why did you pick this vendor", you have an actual answer with documentation.

For high-velocity items where you have annual rate contracts (cement, steel, common cables), you skip RFQ entirely and use Blanket POs instead — see Act 10.

---

## Act 8 · Comparative Statement — picking the winner

### Sign in as Mehul

### The scenario

Three vendors have responded to the RFQ. Mehul opens the Comparative Statement to evaluate them side-by-side.

### What you'll do

1. Inside an RFQ where vendor responses have been captured, click **"Open CS"** in the top-right.
2. You'll see a matrix:
   - Each **row** is a line item
   - Each **column** is a vendor
   - Each **cell** shows that vendor's quoted total for that line
3. The lowest cost per line (**L1**) is automatically highlighted in amber.
4. Click any cell to select that vendor for that line.
5. If you pick a non-L1 cell, the system requires an override reason.
6. Click **"Finalise CS"** when done.
7. From the finalised CS, click **"Create PO from CS"** — the system pre-fills a PO with the winning vendor + locked rates.

### What you'll see

After CS finalisation, the RFQ status flips to *"cs_finalised"*. Each line is marked with the chosen vendor + reason (auto-set to "L1" or the override text Mehul typed).

If different vendors were chosen across lines, the system flags it: *"Multiple vendors selected — Version 1 creates one PO for the most-picked vendor. Multi-PO from one CS will land in a future release."*

### What this means for Raj

L1 stops being an excuse for poor decisions. You can pick the best vendor — fastest delivery, best payment terms, highest historical quality — with the documented reason for choosing them over the cheapest.

Procurement becomes defensible. Every rupee of overspend (where L1 wasn't chosen) has a paper trail explaining why it was worth the premium.

---

## Act 9 · Purchase Order goes out

### Sign in as Mehul

### The scenario

The CS is finalised. Mehul raises the PO that goes to Polycab.

### What you'll do

1. Click **Procurement → Orders** in the sub-navigation.
2. You'll see seven POs across various statuses: draft, pending approval, approved, sent, partly received, received, cancelled.
3. Click into **RA-PO-2026-0005** — a partly-received PO.

### What you'll see

The PO detail page is dense with information:

- **Header:** vendor block (Polycab with GSTIN), project link, dates, status pill
- **Approval card** (when pending)
- **Line items table** — HSN, qty, rate, discount, IGST/CGST/SGST split, total
- **Totals box** with the GST split visible
- **Terms section** — payment terms, delivery terms, warranty, LD clause
- **Audit footer** — created by, approved by, sent at, with timestamps
- **Goods receipts section** — list of GRNs against this PO (one in this case)
- **Vendor bills section** — bills booked against this PO (none yet)
- **Print PDF** + **Send via WhatsApp** buttons in the header

### What this means for Raj

The PO becomes the spine of procurement visibility. From this one page you see everything — what was ordered, what's been received, what's been invoiced, what's been paid. The phrase "let me dig through emails" disappears.

For an audit (statutory, internal, or customer audit), the PO is the artefact that ties everything together.

---

## Act 10 · The rate-contract alternative — Blanket POs

### Sign in as Mehul

### The scenario

For high-velocity items like LT cable, you don't want to negotiate rates every time. Raj has an annual contract with Polycab: 15,000 metres at ₹825/metre for FY 2026-27.

### What you'll do

1. Click **Procurement → Blanket POs** in the sub-navigation.
2. You'll see three blanket contracts:

| Blanket # | Vendor | Item | Cap | Drawn | Status |
|---|---|---|---|---|---|
| RA-BPO-2026-0002 | Polycab | LT XLPE 150 sq mm | 15,000 mtr | 0 | Active (0%) |
| RA-BPO-2026-0003 | Schneider | MCCB 100A 4P | 500 nos | 120 | Active (24%) |
| VT-BPO-2026-0001 | Ambuja | Cement bags | 10,000 | 0 | Active (0%) |

3. Click into the Schneider blanket (RA-BPO-2026-0003).
4. You'll see a drawdown progress bar (24% consumed) and a list of release POs against this blanket.
5. Click **"Release PO from blanket"** in the header.

### What you'll see

The new-PO form opens with:

- Vendor pre-filled (Schneider)
- Locked rate pre-filled (₹18,500/nos)
- Line description pre-filled
- HSN code pre-filled
- Only the **quantity** field is empty — Mehul just types the qty for this release

On save, the blanket's drawdown counter ticks up automatically. The new PO is linked back to the blanket so traceability is intact.

### What this means for Raj

Annual rate contracts that actually work. Every release is tracked against the cap. No more "did we already use up the Polycab contract?" or "what's our remaining qty with Schneider?".

For EPC businesses where you order the same items every week, this is the difference between disciplined procurement and ad-hoc spending.

---

# Part 5 · Receiving the goods

## Act 11 · Goods Receipt Note

### Sign in as Mehul

### The scenario

Polycab's truck has arrived at the Adani Hazira site. The stores team inspects, counts, and accepts the material.

### What you'll do

1. Click **Procurement → Goods receipts (GRN)** in the sub-navigation.
2. You'll see existing GRNs:
   - **RA-GRN-2026-0001** — fully received against a Pack Industries PO
   - **RA-GRN-2026-0002** — partly received against the Polycab PO
3. Click into RA-GRN-2026-0002.

### What you'll see

The GRN detail page shows:

- **Header:** GRN number, status (posted), QC status pill (accepted / partial / rejected)
- **Linked PO** with progress chip
- **Warehouse** where material was received
- **Inbound paperwork:** vendor challan number, vendor invoice number (if shared), vehicle number, transporter name, e-way bill number
- **Line items:** per line shows
  - Quantity received
  - Quantity accepted (passed QC)
  - Quantity rejected (with reason)
  - Batch number + expiry (for batch-controlled items)
  - Remarks

When a GRN is posted (not draft), the system automatically:

- Updates the parent PO's qty_received counter
- Writes a `stock_movement` row (stock IN at warehouse)
- Updates the project's specifications progress
- Triggers a task for the QC officer if any rejection was recorded

### What this means for Raj

Every receipt is documented at the gate. Damages caught at delivery, not at month-end reconciliation. E-way bill compliance built-in. Stock counts maintained automatically.

When the project closes and the customer demands proof of material supplied, the GRN trail is the answer.

---

## Act 12 · Return to Vendor

### Sign in as Mehul

### The scenario

Two weeks after the GRN, the commissioning team finds 50 metres of cable has failed the HV test. It has to go back to Polycab for replacement.

### What you'll do

1. From the GRN detail page (still inside RA-GRN-2026-0002), click **"Return to vendor"** button.
2. The RTV form opens, pre-filled with the GRN's lines.
3. Set the return quantity (50 mtr) and reason ("HV test failure on one section").
4. Save as draft, or post immediately.
5. On post, the system reverses the stock movement and decrements the PO's received-quantity counter.

### What you'll see

The RTV detail page mirrors the GRN structure but reverses the direction:

- Header with linked GRN + linked PO + warehouse
- Lines table with **GRN accepted** column for context and **Returned** quantity highlighted in red
- Vendor credit-note field (filled later when Polycab issues their credit note)

### What this means for Raj

The return process is structured, not "let me call the vendor and figure something out". Stock accuracy is maintained. The vendor's credit note gets logged against the RTV closing the loop — important for ITC reconciliation later.

For panel manufacturing where supplier quality can drift, RTV is the discipline that maintains process integrity.

---

# Part 6 · Paying the vendor

## Act 13 · Booking the vendor's bill

### Sign in as Priya

### The scenario

Polycab's tax invoice has arrived in the post — courier number visible on Priya's desk. She opens CRMOS and books it against the PO.

### What you'll do

1. You'll land on the **Vendor Bills** workspace — Priya's default landing.
2. You'll see four bills across various states:

| Bill # | Status | Match status | Total |
|---|---|---|---|
| RA-VB-2026-0002 | Submitted | **Mismatched** | ₹2.18L |
| RA-VB-2026-0005 | Approved | Under review | ₹64.9k |
| RA-VB-2026-0006 | Approved | Under review | ₹4.19L |
| RA-VB-2026-0007 | Partly paid | Under review | ₹15.10L |

3. Click into **RA-VB-2026-0002** — the mismatched one.

### What you'll see

This is where the magic of 3-way match becomes visible.

The bill says:
- Schneider VFD 30HP × 1 unit @ ₹1,85,000 = ₹1,85,000

The PO said:
- Schneider VFD 30HP × 1 unit @ ₹1,75,000 = ₹1,75,000

The system flags:
- **Rate mismatch: +₹10,000 (5.7% over PO)**

Priya now has three options:
- **Reject the bill** — back to vendor with the diagnostic
- **Amend the PO** — if the rate genuinely changed, raise an amendment
- **Approve with override** — and the override reason gets logged forever

### What this means for Raj

Vendors no longer get to "test" you by sending invoices with bumped-up rates. The system catches every rate, every GST percent, every HSN code automatically.

For a procurement spend of ₹2 crore a year, even a 1% rate-creep catch is ₹2 lakh saved. Conservatively, this feature pays for the entire product.

---

## Act 14 · Payment with TDS

### Sign in as Priya

### The scenario

A clean-matched bill (RA-VB-2026-0006) is approved. Time to pay Polycab.

### What you'll do

1. From the bill detail page, click **"Pay vendor"** in the header.
2. The payment form opens.
3. You'll see the gross amount pre-filled.
4. The system auto-suggests the **TDS section** based on the vendor's type:

| Vendor type | TDS section | Rate | If no PAN (§206AA) |
|---|---|---|---|
| Supplier (goods) | §194Q | 0.1% | 5% |
| Contractor | §194C | 1% | 20% |
| Service provider | §194J | 10% | 20% |
| Rent | §194I | 10% | 20% |

5. Polycab is a goods supplier with PAN on file, so the system suggests §194Q at 0.1%.
6. The form shows: Gross ₹4.19L → TDS ₹419 → **Net payable ₹4.18L**.
7. Choose payment mode (NEFT in this case), enter bank reference if available.
8. Click **"Post payment"**.

### What you'll see

After posting:

- The bill flips from "approved" to "paid"
- The payment voucher is generated as a downloadable PDF
- The TDS amount sits in a holding state, awaiting deposit to the government by the 7th of next month
- An entry is created in the **AP Ageing** dashboard reducing outstanding
- A **Form 16A** entry is queued for year-end issuance to Polycab

### What this means for Raj

TDS becomes automatic, not a quarterly panic. Every payment is GST-and-TDS-compliant from the moment it's posted. Form 16A certificates can be issued in bulk at year-end.

For a company with ₹50+ lakh annual TDS deduction, manual tracking is error-prone and risky. Penalties for incorrect TDS can be up to 100% of the tax amount.

---

## Act 15 · NEFT bank file

### Sign in as Priya

### The scenario

Most accountants pay 20-30 vendors per week. Doing each one individually in the bank portal is slow.

### What you'll do

1. Click **Procurement → Payments** in the sub-navigation.
2. In the header, click **"NEFT Export"**.
3. Pick a date range (defaults to the last 30 days).
4. Click **Download CSV**.

### What you'll see

A bank-ready CSV file downloads with columns:

| Column | Meaning |
|---|---|
| Beneficiary name | Vendor name |
| Bank | Vendor's bank |
| IFSC | Branch IFSC |
| Account number | Beneficiary account |
| Amount | Net payable |
| Mode | NEFT or RTGS |
| Reference | Payment voucher number |
| Value date | Payment date |
| Remarks | "Vendor payment - VB-2026-XXXX" |

Upload this CSV directly to your bank portal — HDFC, ICICI, SBI all accept generic NEFT batch CSV. Bank processes the entire batch in one go.

### What this means for Raj

Payment day becomes ten minutes, not four hours.

Per-bank format variations (HDFC-specific column ordering vs ICICI-specific) are configurable per tenant. Future enhancement.

---

# Part 7 · Tax compliance

## Act 16 · GSTR-2B reconciliation

### Sign in as Priya

### The scenario

It's the 14th of the month. The government has just published Raj's GSTR-2B — a statement listing every invoice that vendors have reported supplying to Raj during the previous month. Priya needs to match it against what's been booked in CRMOS.

### What you'll do

1. Click **Procurement → GSTR-2B** in the sub-navigation.
2. Click **"Upload GSTR-2B"** in the header.
3. Upload the CSV downloaded from the GSTN portal.

### What you'll see

The system reconciles vendor-by-vendor and shows four buckets:

| Status | Meaning | Action needed |
|---|---|---|
| **Matched** | Invoice exists in books AND in 2B | ITC claimable — no action |
| **In books, not in 2B** | Vendor forgot to file GSTR-1 | Call them — chase filing |
| **In 2B, not in books** | Vendor reported something not booked | Investigate — possibly duplicate or wrong vendor |
| **Amount mismatch** | Different ₹ amounts | Resolve before claiming ITC |

A dashboard at the top shows the financial impact: how much ITC is at risk if mismatches aren't resolved.

### What this means for Raj

GST input credit no longer leaks silently. Every rupee of GST paid is matched to a government-confirmed entry. For a company with ₹2 crore annual purchase GST, even a 1% leakage discovered is ₹2 lakh recovered.

At scale, GSTR-2B reconciliation is one of the highest-ROI compliance modules in any business operating system.

---

## Act 17 · AP Ageing and MSME compliance

### Sign in as Priya

### The scenario

Sandeep has asked Priya to prepare the weekly cash-out summary. She also wants to flag any MSME vendor approaching the 45-day legal deadline.

### What you'll do

1. Click **Procurement → AP Ageing** in the sub-navigation.

### What you'll see

The dashboard reads top-to-bottom:

**KPI strip:**
- Total outstanding
- Total overdue
- MSME breach count
- MSME approaching count (warning)

**Ageing buckets** (clickable to filter the bill list):
- Current (not yet due)
- 1-30 days overdue
- 31-60 days overdue
- 61-90 days overdue
- 90+ days overdue

**MSME compliance card** (when relevant):

| State | Meaning | Penalty |
|---|---|---|
| Approaching | MSME vendor, 30-44 days since supply | None yet — heads-up |
| Breach | MSME vendor, ≥ 45 days since supply | 3× bank-rate interest + non-deductible for income tax |

For each breach/warning row, the system shows: vendor name, bill number, days since supply, outstanding amount, "X days past 45-day limit" or "X days to limit".

**Top vendor list** — top 10 vendors by outstanding amount, sorted DESC.

**Export buttons:**
- **Export MSME-1** — half-yearly filing CSV for any breached vendors (only renders when breach count > 0)

### What this means for Raj

Cash-out planning becomes proactive. MSME compliance becomes automatic. Penalties for MSME breach (3× bank rate ≈ 24-27% per annum + corporate-tax implications) are silently expensive — most businesses don't realise the size of the exposure until an audit catches them.

For an EPC business that routinely buys from small fabricators and panel sub-assemblers (often MSME-registered), this dashboard alone justifies the product.

---

## Act 18 · ITC-04 quarterly return

### Sign in as Priya

### The scenario

For panel manufacturing, Raj sends materials out to job-workers (powder coaters, machinists, fabricators) for processing. These materials stay on Raj's books legally, but the movement must be reported to GSTN every quarter via Form ITC-04.

### What you'll do

1. Click **Procurement → Job work** in the sub-navigation.
2. You'll see three challans:
   - **VT-JWC-2026-0001** — pigment grinding (partly received, 8 kg scrap)
   - **RA-JWC-2026-0002** — panel powder coating (in transit, 12 panels sent)
   - **RA-JWC-2026-0003** — busbar cutting (fully returned, 24 mtr)
3. Click any challan to see the lifecycle: sent → partly received → fully received.
4. Click **"ITC-04"** in the list header.
5. Pick FY (defaults to current) and quarter (Q1 / Q2 / Q3 / Q4).
6. Click **Download CSV**.

### What you'll see

The CSV is formatted per the ITC-04 form intent (Table 4 + 5A/B): GSTIN of job worker, challan number, date, process nature, HSN code, description, UQC, qty sent, rate, value, qty returned, qty scrap, return date, status, days since challan.

Unregistered job-workers are marked "URP" (Unregistered Person) per GSTN convention.

### What this means for Raj

Job-work compliance no longer needs a dedicated accountant. The system captures every challan automatically as it's issued; the quarterly export is one click.

Beyond compliance, the job-work tracker is useful for production planning — you always know what material is at which sub-contractor, expected back when.

---

# Part 8 · Service after the sale

## Act 19 · Complaints and AMC

### Sign in as Vikas

### The scenario

The Adani Hazira plant has called: their main MCC panel is tripping intermittently during peak loads. The plant manager wants Vikas on-site by tomorrow morning.

### What you'll do

1. You'll land on the **Complaints** workspace — Vikas's default landing.
2. You'll see two open complaints:
   - **RA-CMP-2026-0008** — Adani Hazira MCC panel tripping (assigned 4 hours ago)
   - **RA-CMP-2026-0009** — Anand Pharma APFC capacitor bank failure (assigned yesterday)
3. Click into the Adani complaint.

### What you'll see

The complaint detail page shows:

- **Severity + type classification**
- **Customer + reporter contact** (with phone tap-to-call)
- **Linked project / sales order / AMC contract**
- **Stage progression:** logged → triaged → assigned → in_progress → resolved → closed
- **Stage history** with timestamps for each transition
- **Resolution form** to capture root cause + fix
- **Attachments:** photos, customer acceptance signature

Vikas can advance the stage by clicking forward through the workflow buttons. Each transition adds a row to the timeline.

Click **AMC** in the sidebar to see active AMC contracts:

| Contract | Customer | Frequency | Visits done / scheduled |
|---|---|---|---|
| RA-AMC-2026-0001 | Surat Chemicals | Monthly | 3 / 9 |
| RA-AMC-2026-0002 | L&T Vadinar | Quarterly | 0 / 4 |

Click into any AMC contract to see the visit schedule. Vikas marks each visit done as he completes them.

### What this means for Raj

Service stops being a black hole. SLA timing is visible. Customer satisfaction is trackable. AMC profitability is computable (cost of visits vs annual contract value).

For Raj specifically, with three motions (EPC + panel manufacturing + AMC), Customer Success closes the loop — what was built must now be maintained. This module is where retention happens.

---

# Part 9 · The Director's view

## Act 20 · Sandeep's daily ritual

### Sign in as Sandeep

### The scenario

It's 8:30 AM. Sandeep has just finished his chai. He opens CRMOS to see the state of the business before his first meeting.

### What you'll do

1. You'll land on the **Owner Dashboard** — Sandeep's default landing.
2. Read top-to-bottom.

### What you'll see

The dashboard is structured as a 30-second business-health read followed by deeper sections:

**Section 1: Today's business health**

| Metric | Value | Yesterday |
|---|---|---|
| Revenue today | ₹X | +/-% |
| Collections today | ₹X | +/-% |
| Orders won today | N | +/-% |
| Outstanding | ₹X | (point-in-time) |
| Open pipeline | ₹X | (point-in-time) |
| DSO | N days | (point-in-time) |

**Section 2: AI Brief**

Three actions for the day, drafted by AI from the day's data. Each action has:
- A severity chip (critical / warning / info)
- A one-sentence headline
- Up to three clickable chips that drill to the relevant page (e.g. "Call Surat Chemicals · ₹9.9L · 85d overdue")

**Section 3: Receivables ageing** — 5-bucket stacked bar with clickable filters.

**Section 4: Top debtors** — top 10 customers by outstanding amount.

**Section 5: Cash movement** — 30-day cash-in by payment mode (cheque / NEFT / UPI / cash) with best-day fact and 30-day delta.

**Section 6: PTP coverage** — % of overdue invoices with an open promise-to-pay, dishonoured count.

**Section 7: Pipeline funnel** — open leads → sent quotes → accepted quotes → won leads with conversion percentages.

**Section 8: Win rate + cycle** — accepted vs rejected ratio, average quote-to-close cycle days, top 3 loss reasons.

**Section 9: Top reps** — top 5 by closed amount in period, with personal win rates and trophy icons for top 3.

**Section 10: Operations** — dispatch counts in period, currently in-transit, delivered, average cycle days.

**Section 11: Today's field activity** — on-duty / WFH / leave / no-record strip + visits done today + total team km + total expense today.

**Section 12: Team roster** — live list of your team, sorted by status. Each row shows status dot, name, role, current location label, visit count, last check-in.

**Section 13: Rep scorecards** — top 5 by visits-with-outcome, with completion-% chips.

**Section 14: Attention Centre** — ranked feed of items needing decisions: critical collections, high-value stalled deals, pending approvals, overdue tasks.

### What this means for Raj

You spend ten minutes here in the morning. You see what others have already done overnight, what needs your decision today, where the money is, and where your team is.

The rest of the day is for the conversations the data tells you to have — not the data-gathering itself.

For a Director running a multi-motion business (EPC + manufacturing + service), this is the difference between operating on instinct and operating on signal.

---

# Part 10 · Conclusion

## What this product replaces

Most companies in the EPC and panel manufacturing space use a patchwork of tools that don't talk to each other:

| What you use today | What it does | CRMOS covers via |
|---|---|---|
| WhatsApp groups | Project coordination | Project workspace + tasks + timeline |
| Excel sheets | Quotes, BOQs, costing | Quotes + projects + masters |
| Tally / Busy | Invoices + payments | Invoices + collections (with Tally integration) |
| Tally / manual | Vendor bills + GST | Vendor bills + GSTR-2B + ITC-04 |
| Paper / email | PR + PO approval | Approvals engine with bands |
| Phone calls | Field reporting | Field Operations module |
| Email | Complaints | Complaints + AMC |
| Memory / spreadsheets | Vendor performance | Vendor scorecards |
| Whiteboard | Daily standup | Owner Dashboard + Attention Centre |

**One product. One source of truth. One audit trail.**

## What to try yourself

After this walkthrough, here's what we suggest exploring independently:

| Task | Sign in as | Outcome |
|---|---|---|
| Capture a new lead from scratch | Anil | See the lead appear in your Leads queue |
| Raise a fresh PR for a new project | Rakesh | Watch the approval routing logic |
| Create an RFQ and invite vendors | Mehul | Experience the CS flow with multiple vendors |
| Try to approve the mismatched bill | Priya | See the override flow |
| Resolve a complaint end-to-end | Vikas | Walk a customer ticket from logged → closed |
| Review the dashboard at start of day | Sandeep | Build a feel for the executive surface |

## Your questions, our answers

After your walkthrough, please share with us:

1. **Anything that didn't match how you actually work** — we adjust the product, not the other way around.
2. **Roles you have that we missed** — we add them.
3. **Reports you'd want that aren't here yet** — we build them.
4. **Industry-specific terminology** — every label can be configured to match your business vocabulary.

The product you saw today is **configured**, not **hardcoded**. Every label, every workflow stage, every approval threshold, every dashboard widget can be changed per your business.

That conversation is what comes next.

---

## Contact

**Paresh Khatri**
designsbyparesh@gmail.com

Built for Raj Avinsys Pvt. Ltd. · June 2026

---

*End of guide. Version 1.0.*
