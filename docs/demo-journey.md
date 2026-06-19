# Vyara OS — Full Demo Journey

> One protagonist project (a brand-new "Park Avenue Townhomes" + the seeded Greenvista Township) is the spine. Every act builds on the last. Edge cases sit inline. **Total: 45–60 min.**
>
> Legend: `★` = the moments that earn the deal · `⚠ EDGE` = realistic complications worth showing.

---

## Setup (5 min before the demo)

- **Two browser windows**: one logged in as `admin@vyaratiles.com`, one incognito ready for the dealer login.
- **Reset the demo data lightly**: ensure Rajhans is Tracking (no orders), Greenvista is Paving (3/5 delivered, 60% billed), Surat SC is Closeout (blocked).
- **Have `/dashboard` open** as the landing page in window 1.
- **Pre-rehearse the Won → Order flow once** — Inngest can lag occasionally; do it once now so the demo gesture is instant.

---

## Act 0 — The 30-second opening (2 min)

Open at `/dashboard`. Don't explain anything yet. Say:

> *"In normal businesses, leadership asks the same 13 questions every day — who's buying, what project, what's quoted, what's dispatched, what's owed. Today Mehul gets those answers from WhatsApp, his head, and Mili's spreadsheets. We want him to get them from one screen. Let me show you that screen first, then we'll walk where the data comes from."*

Then go straight to `/projects`. Point at the **health dots column** for 5 seconds. Say:

> *"You scan only amber and red. Two green, one red. That's your whole portfolio triage in 3 seconds."*

That's the hook. Now rewind to the journey.

---

## Act 1 — A lead arrives (5 min)

**Persona:** Sales engineer Mehul Vora gets a call from architect Rakesh Joshi.

**Honest framing for Vyara**: *"In this system, the moment a lead becomes real is the moment a Project is created. We don't have a separate 'enquiry' funnel today — leads that aren't real enough to be a project live in your head. Mehul, tell us if you want a pre-Project layer; for now this is where the system picks up."*

### Step 1.1 — Capture the contact (if new)

- `/contacts` → search "Ravi & Associates" → exists (seeded). Click in, show the contact (Rakesh Joshi) with his role title.
- ⚠ **EDGE**: If you wanted to add a new architect now, you'd click "New Firm" → "New Contact". Show this in 10 seconds without committing — just to demonstrate it.

### Step 1.2 — Create the project

- `/projects` → **New Project** sheet:
  - Name: "Demo Project — Park Avenue Townhomes"
  - Segment: Architect
  - Buyer firm: Greenfield Developers
  - Architect firm: Ravi & Associates
  - Owner: assign to a sales engineer
  - Estimated value: ₹40L
- Submit. Stage starts at **Specified**.

### Step 1.3 — Open the project, show the empty Scannable Header

> *"Brand new project. Health green, position Specified, no work yet. Watch how this fills up as we go."*

★ **The point**: The header is the spine. By the end of the demo it'll be unrecognisably full — same screen.

---

## Act 2 — Specification + Sample (8 min)

**Persona:** Sales engineer doing the early-stage relationship work.

### Step 2.1 — Stakeholders

- Project → Stakeholders tab → add Rakesh as **Specifier**, Amit (Greenfield) as **Buyer**, Suresh (Shree Constructions) as **Influencer/Contractor**.
- ★ **POINT**: *"Specifier, Buyer, Influencer are different people. Most CRMs don't model this; here it's the relationship graph that drives the project."*

### Step 2.2 — Record the specification

- Specifications tab → Add: Cosmic Pavers, 12000 sqft, Natural finish, "Main internal roads, herringbone pattern."
- Mark Confirmed.

### Step 2.3 — Request a sample

- Samples tab → Request sample → Cosmic Pavers, 10 sqft, send to Rakesh.
- Status: Requested → click through to Dispatched → Delivered.
- Add outcome notes: "Architect approved. Greenlight for spec."
- ⚠ **EDGE**: Show what happens if you forget — the stale-sample Inngest nudge auto-creates a follow-up task after N days.

### Step 2.4 — Advance to Tracking

- Click "Advance to Tracking" on the stepper. Add remark "Spec approved by architect."
- ★ **POINT**: *"Every stage change is in the audit log. IPO auditor sees who advanced what, when, why."*

---

## Act 3 — The magic moment (5 min) · ★ Slice 1 hero

### Step 3.1 — Advance to Paving

- Click "Advance to Paving". Remark: "Construction starting in 2 weeks."
- Watch the page reload.

### Step 3.2 — Show what just happened automatically

- **Project header**: health pill still green, but **Paving sub-pipeline appears** with all 6 sub-stages and their signals (mostly empty since we haven't quoted yet).
- **Next Action banner**: auto-created task — "Follow up on Paving stage start — verify dispatch readiness".
- Open `/tasks` → the task is there, owner is the sales engineer, high priority.
- Switch to mobile layout (`/dashboard` on narrow viewport or chrome dev tools) → task appears on **Today**.

★ **The line that lands:**
> *"This is why won specs stop leaking. Every time a project hits paving, the system creates the follow-up. Mehul's team doesn't have to remember. They just open Today on their phone."*

⚠ **EDGE**: There's also an Inngest **daily cron** that catches anything missed — runs at 10 AM IST, sweeps projects that hit paving via other paths.

---

## Act 4 — Quote (8 min)

**Persona:** Inside-sales / estimation.

### Step 4.1 — Create the quote

- Project → Quotes tab → **Create Quote** sheet.
- Valid until: 30 days out.
- **Line 1**: pick Cosmic Pavers from the dropdown.
  - ★ **POINT immediately**: *"Unit price auto-fills — from DEFAULT_2026 · ₹291.67. Mili configured that price list. Engineering didn't touch it."*
- Quantity 2400.
- Add 4 more lines (one per section).
- Watch the running total at the bottom: ₹35L.

### Step 4.2 — ⚠ EDGE: Customer wants a discount

- Edit line 1's unit price down to ₹277.
- ★ **POINT**: *"**vs list -5%** appears in red. The audit log records this was a manual override — the price-list FK is NOT saved. If a director asks 'who discounted', the system tells you honestly."*
- Edit back to ₹291.67 so the snapshot FK is restored.

### Step 4.3 — Submit

- Click Create quotation. Quote appears in the tab as **Draft VT-QT-2026-NNNN**.
- ⚠ **EDGE**: Sales engineer role wouldn't see margin/cost columns at all — Constitution rule. Switch role briefly if you want to prove it.

### Step 4.4 — Mark Sent

- Click **Mark Sent** on the quote card. Status flips to Sent, `sent_at` timestamps, `quote.sent` event fires.
- ★ **POINT**: *"In production this would WhatsApp the quote PDF to the buyer via AiSensy. Same flow."*

### Step 4.5 — Refresh project page → look at the Quote sub-stage

- Paving sub-pipeline → **Quote cell now shows "1 quote · 1 sent"**.
- ★ **POINT**: *"The whole-project header reflects the new quote without any tab navigation."*

---

## Act 5 — Win the quote → Order auto-creates (5 min) · ★ Slice 2 hero begins

### Step 5.1 — Mark Won

- Quotes tab → click the green **Won** button on the quote.
- Toast: "Quote marked as Won." Quote badge turns green.

### Step 5.2 — Show the event-driven boundary

- Wait ~1 second. Refresh.
- **Orders tab now has a new row** — `VT-SO-2026-NNNN`, value ₹35L, status Confirmed, **auto-created from the quote**.
- ★ **POINT**: *"Quote and Order are different modules. They never write to each other's tables. The Order module subscribed to the `quote.won` event and built its own record. This is how new modules — complaints, tenders — will plug in later without breaking what exists."*

### Step 5.3 — Look at the header

- Refresh project. Paving sub-pipeline:
  - Quote: "1 quote · 1 won" (green dot — "done")
  - Order: "1 order · ₹35L" (active dot)
  - Reservation mini-bar appears.

⚠ **EDGE**: Reservation may be partial if stock is insufficient. For demo, Greenvista's order is fully reservable. Click into `/inventory` to show the reservation entries.

---

## Act 6 — Dispatch (10 min)

**Persona:** warehouse + dispatch ops on a tablet.

### Step 6.1 — Switch to tablet layout

- Resize browser to ~iPad width, or use dev tools.
- Go to `/warehouse`.

### Step 6.2 — Schedule the first tranche

- New dispatch → select the order → 1 line, 2400 sqft → schedule for tomorrow → assign transporter.
- Save → dispatch appears as Scheduled.

### Step 6.3 — Walk through the lifecycle

- Mark Dispatched → mark Delivered → **upload POD** (any image will do, or signature name).
- Each transition writes a stage_history row + activity.

### Step 6.4 — Show the header update

- Switch back to desktop, open the project.
- Dispatch mini-bar: "1/1 tranches · 1 delivered" (becomes 4/5 if you've also kept the seeded ones).

### Step 6.5 — ⚠ EDGE: A tranche is delayed

- Open the next scheduled tranche.
- Don't mark dispatched. Show how the dispatcher notes a delay (notes field).
- ★ **POINT**: *"In production this triggers a WhatsApp to the buyer + a dispatch_delay_reason from masters."*

### Step 6.6 — ⚠ EDGE: The PROJECT is multi-tranche

> *"This is the data-model decision that matters. One order, many dispatches. That's the operational reality for a township paving job — you don't ship 12000 sqft in one truck. The header shows '3 of 5 tranches' because it's counting child records, not flipping a 'dispatched' flag."*

---

## Act 7 — Running bill + retention (8 min) · ★ Slice 2 hero peak — IPO story

### Step 7.1 — Raise RA-Bill #1

- `/invoices/new`.
- Linked sales order: Greenvista's order.
- Buyer firm auto-fills.
- Subtotal: ₹14L (sections 1+2 worth).
- ★ **POINT immediately**: *"GST and payment terms auto-fill — From GST_18 · 18%, From NET_30 · 30d. Due date auto-derived. Mili configured both masters."*
- ⚠ **EDGE**: If the buyer firm had a different `default_payment_term_id` set, the chip would say "buyer override" in green.
- Toggle **Running bill** on, sequence 1.
- Retention: 5%.
- Create.

### Step 7.2 — Show the live totals

- Computed panel: GST ₹2.52L, Total ₹16.52L, Retention held ₹82,600, Billed (due now) ₹15.69L.
- ★ **POINT**: *"This is the construction-industry detail nobody else models. Retention held, running bill sequence, final bill flag — IPO auditor needs all of it."*

### Step 7.3 — Raise RA-Bill #2

- Same flow, ₹7L subtotal, sequence 2, retention 5%. Create.

### Step 7.4 — Refresh project header

- Billing mini-bar: ₹21L of ₹35L · 60%.
- Quote → Order → Reserve stock → Ready → Dispatch — all show their numbers.

★ **The line that lands:**
> *"At any moment, Mehul opens this project, looks at the header, sees: green health, 1 quote won, 1 order ₹35L, 3 of 5 dispatched, 60% billed. He doesn't need to ask anyone. The screen tells him."*

---

## Act 8 — Collection + the IPO story (10 min)

**Persona:** Accounts (Mili-equivalent) + Periwal (independent director).

### Step 8.1 — `/collections`

- Show the ageing buckets: Current, 1–30, 31–60, 60+.
- ★ **POINT**: *"Sorted by bucket, by customer. You see the worst offenders without filtering."*

### Step 8.2 — ⚠ EDGE: An overdue invoice

- Click into an overdue invoice (any from Surat SC's older bills).
- Show the dunning timeline — "Pre-due reminder sent X days ago, overdue reminder sent Y."
- ★ **POINT**: *"AiSensy WhatsApp dunning runs on an Inngest cron daily at 10 AM. We don't chase manually; the system chases and Mehul's team only handles the responses."*

### Step 8.3 — ⚠ EDGE: Log a promise-to-pay

- Click "Log promise-to-pay" → amount, date, notes ("Buyer confirmed payment on Friday").
- ★ **POINT**: *"Promise overdue? System escalates automatically and tells the right person."*

### Step 8.4 — Log a receipt

- Receipt → ₹15.69L for the RA-Bill #1.
- Invoice flips to **Paid**.

### Step 8.5 — `/finance`

- DSO number. Total outstanding. Collections performance this month vs last.
- ★ **THE LINE for Periwal:**
> *"This is the dashboard your independent director asks for at every board meeting. Today Mili builds it from Tally and Excel each time. Here it's live, drillable, and the underlying audit trail is automatic."*

---

## Act 9 — Closeout (5 min)

**Persona:** Project manager wrapping up.

### Step 9.1 — Open Surat Smart City Sector 5

- This is the **Closeout** project. Header is red.
- Health pill: "Past Closeout SLA (45d/30d) — Acceptance certificate uploaded".
- ★ **POINT**: *"Two things together flipped this to red. The stage SLA is exceeded **and** the acceptance certificate gate is unsatisfied. Either alone would be amber. Together, blocked."*

### Step 9.2 — Show the gates

- Three gate chips: Acceptance certificate (red), Retention release letter (red), All invoices paid (green).
- ⚠ **EDGE**: *"How do we satisfy a doc gate? Upload the acceptance certificate. The doc-upload UI is a Slice-4 build — for now, the moment an admin uploads, the gate flips. This is a real gap to call out honestly."*

### Step 9.3 — Show the timeline

- Last 5 activities — invoice issued, RA-Bill #4 marked final, payment received, stage transitioned to Closeout.

---

## Act 10 — Dealer parallel motion (8 min)

**Persona:** Dealer-side user in a separate window.

### Step 10.1 — Internal dealer view

- `/dealers` → switch to Performance view → "This month vs last month".
- ★ **POINT**: *"Mehul's question #11: which dealers are performing? One click. Green deltas, red deltas, dot for dormancy."*

### Step 10.2 — Switch to dealer login

- Incognito window → login as a dealer user.
- Lands on `/dealer-portal/dashboard` — KPIs, credit utilisation, overdue alerts.

### Step 10.3 — Place a dealer order

- Click New Order → pick products → submit.
- ⚠ **EDGE**: System auto-creates a per-dealer **Project** behind the scenes (NOT NULL FK) but the dealer never sees the concept of a Project. We expose what they need: order, ledger, invoices.

### Step 10.4 — Back to internal view

- Project list now has the auto-created dealer project. Order appears under `/orders`. Same dispatch + invoice machinery follows.

★ **The line:**
> *"Same Order, Dispatch, Invoice, Collection modules. The dealer portal is a different face on the same plumbing. That's the platform thesis — modules over surfaces."*

---

## Act 11 — Mili's moment (6 min) · ★ Slice 3.5 — configuration owned by the business

### Step 11.1 — `/admin`

- Six cards: Tax, Payment Terms, Price Lists, Vendors, Dealer Tiers, Territories.

### Step 11.2 — Live config change

- `/admin/taxes` → click "Add tax rate" → "GST 28% for luxury items", make default.
- Open `/invoices/new` → GST field auto-fills 28%. Microcopy: "From GST_28 · 28%".
- ★ **THE LINE for Mili:**
> *"You just changed a tax rate. Every new invoice picks it up. Zero engineering. This is how every Tier-1 manufacturer will configure the system to their reality."*

### Step 11.3 — `/admin/price-lists`

- DEFAULT_2026 → show entries.
- ⚠ **EDGE**: *"Want dealer-segment pricing? Add a new price list with segment=dealer; quotes for dealer projects auto-resolve to it. The resolution priority — segment+region > segment > region > tenant default — is in the SQL function, configurable per tenant."*

### Step 11.4 — `/admin/dealer-tiers`

- Show Bronze/Silver/Gold/Platinum with colours.
- Add "Diamond" → red. Open a dealer → tier dropdown has Diamond. Header badge would render in red on selection.

---

## Act 12 — Closing: honest gaps + what's next (5 min)

Pre-empt Q&A. State the gaps before they're asked:

| Gap | Status |
|---|---|
| Pre-Project lead funnel | Not built. Asking you whether you need it. |
| Tender management | Sequenced later — distinct motion |
| Complaints / service | Sequenced later |
| Document upload UI for gates | Slice 4 |
| Razorpay payment initiation | Fast-follow |
| Tally two-way sync | Currently write-only invoices → Tally; deeper read TBD |
| Production planning | Stays in your existing setup — we don't rebuild |

End with the platform-readiness pitch:

> *"We've finished the Masters slice. Next is one platform-readiness sprint — tenant onboarding, module visibility per tenant, code-prefix config. Then the real test: onboarding a second similar manufacturer in 8 weeks. That's the year-1 success measure. If we can do that, we have a vertical SaaS platform. If we can't, we have a Vyara fork. Today is our last chance to fold your feedback into the platform before that test."*

---

## Time-boxed variants

| Time | Sequence |
|---|---|
| **30 min** | Act 0 → Act 3 (Paving magic) → Act 5 (Quote-won → Order) → Act 7 (RA-bill) → Act 10 (Dealer portal in 90s) → Act 12 |
| **60 min** | All above + Act 1.1, Act 4 (full quote), Act 8 (collections), Act 11 (Mili) |
| **90 min** | All acts + every edge case + open Q&A from Act 9 onwards |

---

## One thing to add before the demo (~2 hours of work)

The honest framing in Act 1 is uncomfortable — telling Mehul "we don't have a lead funnel" is a weak open. Two options before showing it to Vyara:

1. **Build the Option C `/leads` view** (1 day) — a filtered Projects list showing "Specified stage + no specifications yet" with a lighter UI. Sells the entry funnel without new schema.
2. **Reframe and own it** — open with "we made a deliberate choice to skip the pre-Project funnel because in our research, Mehul-level leadership filters mentally before anything touches a system. Tell us if we're wrong." Confidence in the choice can land just as well.

Pick **(1)** if showing to Mehul AND his team (team members may track leads); **(2)** if it's just Mehul + Periwal.

---

## Pre-flight checklist

- [ ] Admin credentials work (`admin@vyaratiles.com` + password from earlier reset)
- [ ] Dealer user can log in (test via incognito)
- [ ] `/dashboard` loads cleanly
- [ ] Greenvista shows 3/5 tranches and ~60% billed
- [ ] Surat SC shows the red blocked health pill
- [ ] Rajhans shows Tracking + green
- [ ] At least one quote on Greenvista in Draft status (for the Won demo)
- [ ] Tablet-width browser bookmark ready for `/warehouse`
- [ ] One image file ready on desktop for POD upload
