# Customer Onboarding Runbook

> **Operational playbook** for onboarding a new tenant. Distinct from
> [`customer-2-readiness-audit.md`](./customer-2-readiness-audit.md): that
> document asks *can we onboard?*; this one answers *how do we onboard, step
> by step?*
>
> **Audience:** the person doing the onboarding (today: us; later: a
> Customer Success implementer).
>
> **Blueprint:** ARCH-003. Status: ✅ (draft 1).
>
> **Updates:** revise after every real onboarding. Mark steps as ✅/⚠️/❌
> in the "current tooling" column based on what actually worked.

---

## 0. Targets, assumptions, and what this runbook is NOT for

### Target customer profile for tenants #2–#5
- **Vertical:** building materials (per Constitution v2). Industry-pack expansion comes after.
- **Tier:** Tier-1 (₹100cr+) or Tier-2 (₹20–100cr) manufacturer with most of the same operational shape as Vyara.
- **Commercial motion:** at least one of {architect-specified, direct contractor, dealer/distributor}. Government tender → defer (not in product yet).
- **Tech profile:** willing to use a cloud SaaS; reps have Android phones; office staff have laptops; finance team uses Tally.

### Hard prerequisites we won't compromise on
- Customer signs a data-use agreement before any data import.
- We have an internal owner (one of us) for the duration of onboarding (8-week ownership).
- Customer designates **one** admin user with authority to make config decisions.

### Out of scope for this runbook
- Brand-new industries (pivot away from building materials). Use a separate industry-pack runbook (doesn't exist yet — Future).
- Migrating from a competitor SaaS with their export. Treat that as a custom engagement.
- Multi-country / multi-currency. Single market only.

---

## 1. Total time budget

| Phase | Time | Critical path? |
|---|---|---|
| Pre-onboarding (info gathering + agreements) | 1 week | Yes |
| Tenant provisioning + base config | 1 day | Yes |
| Pipeline + vocabulary + masters | 1–2 weeks | Yes (depends on customer responsiveness) |
| Data import (firms / contacts / catalog / pricing / vehicles) | 1–2 weeks | Parallel-able with config |
| User invite + training | 1 week | Parallel-able after users created |
| Tally + WhatsApp + integrations | 3–5 days | Can lag by ~1 week without blocking go-live |
| Smoke test + pilot | 1 week | Yes |
| Pilot → full rollout | 1–2 weeks | Yes |

**Wall-clock end-to-end: 6–8 weeks.** The Constitution v2 success metric ("8 weeks") is honest if the customer is responsive and the gap items below get closed.

---

## 2. Pre-onboarding (Phase 0 · Week 0)

Owner: us (sales / pre-sales).

### 2.1 Information packet from customer

Capture in a single Google Doc or Notion page (template `templates/onboarding-info-packet.md` — TBD).

| Item | Why we need it | Gap |
|---|---|---|
| Legal entity name + GSTIN | Tenant naming; e-invoicing later | — |
| Brand name (used in UI) | Sidebar title, login page header | — |
| Logo (SVG or 256×256 PNG) | Login page, PDF headers | UI for logo upload is missing → manual S3 upload for now |
| Primary admin (name + email + phone) | First user invite | — |
| Sub-tenant code prefix preference (e.g. NT- for Nitco) | tenant.settings.codes.* | ✅ PLAT-005 ships templates |
| Currency + locale | Single-market today — confirm INR / en-IN | OK |
| Working hours (default 10:00–18:00 IST) | Field Operations attendance + alerts | ✅ tenant.settings.field.working_hours |
| Auto-approve threshold for field claims | tenant.settings.field.auto_approve_threshold_rupees | ✅ default ₹500 |
| Tally version + edition | Tally sync flavor | — |
| WhatsApp BSP (AiSensy or another) | Outbound messages | ✅ AiSensy supported |
| Top 20 customers (any format) | Pre-seed Relationship | — |
| Top 50 SKUs + price list | Pre-seed Revenue Catalog | — |
| Territory list (region names) | Territory master seed | — |
| Vehicles + reimbursement rates | Field Operations | — |
| Industry-specific terminology | Configure activity types, relationship types | — |

### 2.2 Modules they want enabled / disabled

A checklist on the info packet. Defaults from Blueprint:

| Module | Default | Toggle the flag? |
|---|---|---|
| Field Operations | ON | Off if no field force |
| Dealer portal | ON | Off if no dealer channel |
| Collections | ON | Off if their finance team owns this in another tool |
| Tally sync | ON | Off if they use other accounting |
| AI surfaces | ON | Off if customer wants opt-in only (rare) |
| Inventory | ON | Off if they don't track stock through our system |
| Warehouse | ON | Off if no tablet ops |
| Dispatches | ON | Off if dispatch is unmanaged today (unlikely) |

Captured in `tenant_feature` (PLAT-004 ✅).

### 2.3 Sign-offs

- Data use agreement signed
- SLA + support terms acknowledged (we should write one — Gap: SLA doc doesn't exist yet)
- Pilot scope agreed (e.g., "1 manager + 5 reps + 1 warehouse")

---

## 3. Tenant provisioning (Phase 1 · Day 1)

Owner: us (Implementation).

### 3.1 Create the tenant row

**Current tooling: manual SQL via Supabase Dashboard.** PLAT-011 will replace with a CLI.

```sql
INSERT INTO tenant (id, name, slug, plan, settings)
VALUES (
  gen_random_uuid(),
  'Nitco Tiles Limited',
  'nitco',
  'pilot',
  '{
    "codes": {
      "quotation":   "NT-QT-{yyyy}-{nnnn}",
      "sales_order": "NT-SO-{yyyy}-{nnnn}",
      "invoice":     "NT-INV-{yyyy}-{nnnn}",
      "dispatch":    "NT-DC-{yyyy}-{nnnn}",
      "lead":        "NT-LD-{yyyy}-{nnnn}",
      "dealer":      "NT-DLR-{nnnn}"
    },
    "field": {
      "auto_approve_threshold_rupees": 500,
      "working_hours": { "start_ist": 10, "end_ist": 18 }
    }
  }'::jsonb
);
```

The `tenant.settings` is Zod-validated on read (PLAT-005 ✅) — if you typo a key, the parser logs a warning and falls back to defaults. Test by hitting `/dashboard` after invite.

**Gap:** no admin UI for tenant.settings. Editing the JSONB requires SQL access. Acceptable for tenant #2; needs PLAT-011 follow-up for tenant #5+.

### 3.2 Subdomain routing

**Current tooling: not built.** PLAT-011.

Today's options:
1. **Path-based** — `/t/<slug>/...` prefix in middleware. Workable; ugly URLs.
2. **Subdomain via Vercel** — `nitco.app.vyaraos.com` → middleware reads subdomain → injects tenant_id.
3. **Custom domain per tenant** — `crm.nitco.com` → CNAME → Vercel.

For tenant #2: pick **(2) subdomain via Vercel.** Configure manually in Vercel dashboard until we automate.

Steps:
- Vercel project settings → Domains → Add `nitco.app.vyaraos.com`
- DNS: `nitco.app.vyaraos.com CNAME → cname.vercel-dns.com` (managed by us if it's our root domain)
- Middleware code change to extract subdomain → tenant slug lookup (Gap: doesn't exist yet — needed)

### 3.3 Feature flags

Apply the customer's decisions from §2.2.

```sql
INSERT INTO tenant_feature (tenant_id, code, is_enabled)
SELECT id, c.code, c.enabled
FROM tenant t,
     (VALUES
       ('enable_field_sales',  true),
       ('enable_dealer_portal', true),
       ('enable_collections',   true),
       ('enable_tally_sync',    true),
       ('enable_ai_surfaces',   true),
       ('enable_inventory',     true),
       ('enable_warehouse',     true),
       ('enable_dispatches',    true),
       ('enable_finance',       true),
       ('enable_daily_digest',  true)
     ) AS c(code, enabled)
WHERE t.slug = 'nitco';
```

Flip any to `false` as the packet dictates.

**Verify:** log in as that tenant's admin and check the sidebar. Disabled modules should be hidden.

---

## 4. Configuration (Phase 2 · Week 2)

Owner: us + customer admin together.

### 4.1 Pipeline + lead stages

System-seeded pipeline stages exist for the `architect` segment (Specified → Tracking → Paving → Closed). For tenant #2:

- Confirm the segment matches their commercial motion. If they're 100% direct-to-contractor (no architect specification phase), edit / add stages via SQL (no UI yet → Gap).
- Confirm SLAs per stage (`pipeline_stage.sla_days`).
- Confirm gate requirements per substage (`gate_requirement`) — what documents / fields are needed to exit each stage.

Lead stages: system seeds 7 (`new → contacted → qualified → quoted → negotiation → won → lost`). Most building-materials manufacturers fit this; if not, add tenant-scoped rows.

**Gap:** no admin UI for pipeline / gate editing. Cumbersome SQL today. Add to PLAT-011 follow-up.

### 4.2 Masters seed (the bulk of week 2)

Each master has an `/admin/*` page today. Order matters — entities depend on masters that come earlier.

| Order | Master | UI | Notes |
|---|---|---|---|
| 1 | Tax rates | `/admin/taxes` ✅ | GST 5/12/18/28; mark one as tenant default |
| 2 | Payment terms | `/admin/payment-terms` ✅ | Net-30, Net-45, Net-60, against-delivery; tenant default |
| 3 | Vehicle types | `/admin/vehicle-types` ✅ | Bike / Car / Auto / Pickup / Van — same as Vyara unless they want custom |
| 4 | Fuel types | `/admin/fuel-types` ✅ | Petrol / Diesel / CNG / EV / Hybrid |
| 5 | Vehicle reimbursement rates | `/admin/vehicle-rates` ✅ | ₹/km matrix — customer-specific |
| 6 | Territories | `/admin/territories` ✅ | Hierarchical — region → zone → city |
| 7 | Dealer tiers | `/admin/dealer-tiers` ✅ | Bronze / Silver / Gold / Platinum or their own ladder |
| 8 | Vendors | `/admin/vendors` ✅ | Transporter + service providers |
| 9 | Visit purposes / outcomes | (no admin UI yet — Gap) | SQL insert into `visit_purpose` and `visit_outcome` masters |
| 10 | Price lists | `/admin/price-lists` ✅ | Default tenant list + segment/region variants |

**Gap callouts:**
- **No bulk CSV importer** for any master. Customer manually enters 30+ rows per master in the admin UI. Tenant-#5 onboarding will demand CSV import — Blueprint item to add.
- **No visit_purpose / visit_outcome admin UI** — manual SQL today. Cheap to build, add to PLAT-011 follow-up.

### 4.3 Industry-specific vocabulary (relationship types, activity types)

After REL-006 lands: edit `relationship_type` master to match customer terminology. Example for an electrical contractor: `customer`, `consultant`, `pmc`, `subcontractor`, `electrician`. Today (REL-006 not yet shipped): firm.type CHECK is hardcoded to building-materials vocabulary, so the customer accepts our vocabulary or we patch the CHECK.

After FLD-009 lands: edit `field_activity_type` master beyond the seeded "visit" purposes — for a service business: `installation`, `commissioning`, `breakdown_call`, `amc_visit`, `audit`. Today (FLD-009 not yet shipped): the seeded six purposes cover sales but not service.

**REL-006 and FLD-009 should ship before tenant #2 if their vocabulary differs meaningfully from Vyara's.**

---

## 5. Data import (Phase 3 · Week 3)

Owner: us (data) + customer (validation).

### 5.1 What gets imported now vs later

| Data | When | How |
|---|---|---|
| Top 100 customer firms | Now | CSV → SQL INSERT (no UI importer yet — Gap) |
| Primary contacts for those firms | Now | CSV → SQL INSERT |
| Top 50 SKUs (catalog) | Now | CSV → SQL INSERT |
| Default price list | Now | CSV → SQL INSERT (use `tenant_price_list_lines.csv`) |
| Vehicles + reimbursement rate overrides | Now | CSV → SQL INSERT |
| Territories | Now | CSV via `/admin/territories` (≤30 rows usually) |
| Dealers (if dealer channel) | Now | CSV → SQL INSERT |
| Open orders (historical) | Negotiable | Often left in their old system; we start fresh from pilot date |
| Open invoices (Tally) | Via Tally sync ✅ | Auto-pulls once Tally is connected |
| Historical activity / quotes | Skip | Too lossy across systems |

### 5.2 CSV templates we need to provide

Today: ad-hoc SQL scripts per import. **Gap:** no documented CSV templates → no batch importer → no validation tooling. Tenant #2 will be painful here.

For tenant #2, we hand-write the CSV → INSERT SQL with the customer providing the source CSVs. For tenant #5, this needs to be a CSV importer in `/admin`.

Add to Blueprint: **PLAT-022 (NEW)** — CSV importers for masters + initial entities. Sprint 2 candidate.

### 5.3 Data hygiene checklist before any import

- Phone numbers: validated as 10-digit Indian mobile or 0-prefixed landline
- GSTIN: 15-char, validated against the format regex
- Email: present where required (firm-level)
- Duplicate detection (firm by GSTIN, contact by phone) — run a SQL audit before INSERT
- Encoding: UTF-8 (handles Hindi / Gujarati names cleanly)

---

## 6. User invites (Phase 4 · Week 3, parallel)

Owner: customer admin (with our support).

### 6.1 Admin user (first)

Today: us creates the admin's auth.users + user_profile manually. The custom-access-token hook injects tenant_id + role into the JWT. Customer logs in via password.

**Gap:** no self-service tenant-admin invite flow. PLAT-011.

```sql
-- See docs/setup-auth-hook.sql for the JWT claim mechanism.
-- 1) Create auth.users via Supabase Dashboard (Auth → Users → Add)
-- 2) Insert user_profile
INSERT INTO user_profile (id, tenant_id, role, full_name, phone)
VALUES (
  '<auth_user_id>',
  '<tenant_id>',
  'admin',
  'Mr Mehta',
  '+91-98XXXXXXXX'
);
```

### 6.2 Other users

Once the admin is in, they invite the team via `/admin/users` (Gap: this page doesn't exist yet — currently SQL only).

For tenant #2: we still do this in SQL. Plan for a `/admin/users` page in Sprint 2 (add to Blueprint: **PLAT-023**).

Roles to assign:
- 1 admin (customer's IT lead or finance head)
- 1–3 managers (sales head, ops head, regional head if any)
- 5–20 sales engineers (the field reps)
- 0–N dealer users (only if dealer portal enabled)

### 6.3 Training

Pre-recorded videos (Gap: doesn't exist yet) or live session. Topics:
- Day-in-the-life for a rep (`/field` walkthrough)
- Day-in-the-life for a manager (`/dashboard`, `/field/team`, `/projects`)
- Day-in-the-life for admin (masters, user invites, settings)
- Voice / photo features (`/field` AI surfaces)

---

## 7. Integrations (Phase 5 · Week 4, parallel)

Owner: us + customer's IT / finance team.

### 7.1 Tally

- Customer provides Tally Server URL or scheduled-export folder
- Configure `tally_sync_log` connector credentials (encrypted in env)
- Run initial sync (read-only) → verify a sample invoice
- Enable two-way sync once smoke-tested

**Gap:** Tally sync config today lives in env vars. Should be in `tenant.settings.integrations.tally` — Blueprint item (PLAT-024).

### 7.2 AiSensy WhatsApp

- Customer creates an AiSensy account (or shares an existing one)
- Templates approved with Facebook (the customer's responsibility):
  - `invoice_dunning_amber` (overdue 7-30d)
  - `invoice_dunning_red` (overdue 30-60d)
  - `ptp_confirmation`
  - `visit_followup` (rep → contact)
- Configure AiSensy API key in env
- Test send to a Vyara internal number first

### 7.3 Anthropic API key

- Use shared key (Vyara's) for tenant #2 — they're billed via our flat fee
- Tenant-specific key path: PLAT-024 (custom integration credentials)

### 7.4 Supabase Storage bucket per tenant?

Today: shared `ai-uploads` bucket with tenant-scoped paths. RLS enforces scope. Acceptable for tenants #2–#10. For #100, revisit.

---

## 8. Smoke test (Phase 6 · Week 5)

Owner: us (drive the test) + customer (validate).

Run through every Mehul's-13-questions journey end-to-end. Each must pass before pilot kickoff.

### 8.1 Manager / Admin journeys
- [ ] Log in to `/dashboard` → see today's digest card (Daily Digest runs at 06:00 IST — verify it ran for the tenant)
- [ ] Open `/projects` list → confirm at least one project shows
- [ ] Open `/leads` list → confirm lead Kanban renders
- [ ] Open `/field/team` → confirm rep grid renders (even if reps haven't checked in yet)
- [ ] Open `/admin/*` masters → confirm seeded data appears

### 8.2 Sales engineer journey
- [ ] Log in as rep → land on `/field`
- [ ] Start day with odometer entry
- [ ] Plan a visit (subject picker finds a real project / lead / firm / dealer)
- [ ] Start the visit (per-leg km computed)
- [ ] Complete visit with voice note (AI extraction populates fields)
- [ ] Optionally snap odometer photo (AI extracts reading)
- [ ] End day → claim auto-computes
- [ ] Manager approves claim from `/field/team`

### 8.3 Office journey
- [ ] Create a lead (with business-card photo capture)
- [ ] Convert lead → project
- [ ] Create a quotation → quotation_number reads as `<PREFIX>-QT-YYYY-NNNN` (verify the prefix is the customer's, not VT)
- [ ] Mark quote won → order created
- [ ] Schedule dispatch
- [ ] Capture POD on warehouse tablet view
- [ ] Create invoice (manual + verify Tally sync)
- [ ] Record a payment promise via WhatsApp PTP capture
- [ ] Record receipt → invoice closes out

### 8.4 Failure / edge case probes
- [ ] Reject a claim with reason → rep sees the reason
- [ ] Log voice note in Hindi or Gujarati → AI extracts cleanly
- [ ] Test offline behaviour (no offline support today — expect online-only; document the limitation for the customer)

---

## 9. Pilot → Full rollout (Phase 7 · Weeks 6–8)

Owner: customer (drive) + us (support).

### 9.1 Pilot scope
- 1 manager + 3–5 reps + 1 warehouse + finance/accounts user
- 1 territory or region only
- 2 weeks of real use

### 9.2 Daily standup with customer admin
- What worked
- What broke
- What confused users
- Any data drift (orders not flowing, invoices not syncing, etc.)

### 9.3 Iteration during pilot
Expect 5–10 small fixes during pilot. Each lands as a follow-up commit. Blueprint items get added to the Status Tracker for any structural changes that surface.

### 9.4 Expansion criteria (must pass before full rollout)
- All smoke-test checks still pass
- < 5 unresolved issues
- Customer admin trained on user-invite flow
- Tally + WhatsApp running with no manual intervention for 7 consecutive days
- DSO trending positive (collections engine demonstrably useful)

---

## 10. Known gaps + Blueprint items they should add

Things this runbook surfaced that aren't yet tracked as Blueprint items. Each becomes a row in §11 of `PRODUCT-BLUEPRINT-v3.md` with status 💭 / 📋:

| Gap | Capability | Tier |
|---|---|---|
| Tenant admin UI for `tenant.settings` (no SQL) | Platform | Must-have C#5 |
| Subdomain → tenant_id middleware | Platform | Must-have C#2 (PLAT-011) |
| Pipeline / gate editor UI | Platform | Should-have |
| `visit_purpose` / `visit_outcome` admin UI | Field Operations | Should-have |
| CSV importers for masters + entities | Platform | Should-have post-C#2 |
| Self-service user invite flow `/admin/users` | Platform | Should-have post-C#2 |
| Training videos / docs | Cross-cutting | Should-have |
| SLA + support agreement template | Cross-cutting | Should-have |
| Tally integration config in `tenant.settings.integrations` | Platform | Should-have post-C#2 |
| AiSensy template registry per tenant | Finance | Should-have |
| Logo upload UI | Platform | Nice-have |
| Brand colour tenant setting | Platform | Nice-have |

The "Must-have C#2" items above are the **gating items for an honest 8-week onboarding**. PLAT-011 is the biggest single piece — without it, every tenant onboarding requires us to do manual SQL for tenant lifecycle.

---

## 11. Estimated effort to close C#2-blocking gaps

| Item | Owner | Days |
|---|---|---|
| PLAT-011 — tenant lifecycle CLI + subdomain middleware | us (dev) | 5 |
| REL-006 — `relationship_type_master` (if customer vocabulary differs) | us (dev) | 2 |
| FLD-009 — broaden `field_activity_type` master vocabulary | us (dev) | 1 |

**~8 dev-days** to close the C#2 critical-path gaps. Sprint 2's first half should be this.

---

## 12. Updates & versioning

This runbook is **versioned in git**. Edits:
- Append a dated entry to the bottom of this file under "Revisions"
- Mark any step's "current tooling" column with ✅ / ⚠️ / ❌ based on the most recent real onboarding
- Add gaps surfaced during an onboarding to §10
- Promote gap items to Blueprint §11 with appropriate tier

### Revisions
- **2026-06-19** — Initial draft (ARCH-003). No real onboarding has been run yet; sections will sharpen after tenant #2.
