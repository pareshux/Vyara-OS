# Customer-#2 Readiness Audit — living document

> The **8-week customer-#2 onboarding test** is the year-1 success gate (Constitution v2). This audit records the platform's readiness and lists what would still block onboarding a second Tier-1 / Tier-2 building-materials manufacturer today. Re-run after every slice; the gap should narrow, not widen.

**Most recent revision:** 2026-06-16 (post Slice 3)
**Headline history:**
- Post Slice 2:    4–6 months
- Post Slice 2.5:  4–6 months (held — no new infra, no new debt)
- Post Slice 3:    **3–4 months** (narrowed — dealer module is reusable; readiness sprint becomes more impactful)

---

# Post-Slice-3 update (current)

## What Slice 3 added vs the 8-week target

| Discipline test | Result |
|---|---|
| Multi-persona auth boundary works generically | ✅ `role='dealer'` + `current_dealer_id()` JWT claim; layout-level gating works for any tenant; no Vyara assumptions in the gate logic |
| Dealer tier values not hardcoded | ✅ `dealer.tier TEXT` (no CHECK); UI offers suggestions via datalist but accepts anything (Decision A1 from Step 1) |
| Dealer code prefix configurable per tenant | ⚠️ Still `VT-DLR-` hardcoded — same debt as `VT-QT-`/`VT-SO-`/`VT-INV-` from prior slices. Becomes a Masters-slice fix (tenant-configurable code prefix) |
| Dealer-portal RLS is generic | ✅ Tightened `tenant_isolation` policies on 9 cross-module tables (firm, contact, sales_order/_line, invoice/_line, receipt, dispatch/_line, sales_order_stage_history) to exclude dealer role; added `dealer_self_read` scoped via `current_dealer_id()`. Same pattern any other tenant's dealer would inherit |
| Invite-user flow is tenant-agnostic | ✅ Supabase Auth Admin API call; works for any tenant. Email sender is the Supabase default — per-tenant branding is a known Masters/readiness gap |
| Auto-created dealer projects use generic stage | ✅ Seeded one `segment='dealer'` `stage_key='active'` pipeline_stage row (system-wide, `tenant_id IS NULL`); the auto-create logic uses it for any tenant |
| Cross-module write (dealer → project) | ⚠️ **Known smell:** `placeDealerOrder` action INSERTs to `project` to satisfy NOT NULL FK. Pragmatic for pilot; proper fix is a `requestDealerProject()` action in the project module that dealer-orders calls. Recorded as debt |
| Dealer performance metrics use generic time periods | ✅ "This month vs last month" — works for any tenant, any reporting cadence (M1 from Step 6) |

## What Slice 3 specifically did NOT make worse

- No new hardcoded enums where customer #2 would have different values
- All 11 new dealer surfaces (5 internal + 6 portal) use generic copy
- Dealer module schema is fully isolated — disabling it for a tenant that doesn't have a dealer network is a future tenant-settings flag, not a code change
- No tier-specific business logic anywhere (e.g., "platinum dealers get X" — that's correctly deferred to Slice 3.5 schemes / pricing)

## Open debts surfaced or carried forward

| Debt | Severity | Slice that addresses it |
|---|---|---|
| Code prefix (`VT-*`) hardcoded across modules | Low | Masters slice (3.5) — `tenant.settings.code_prefix` |
| Per-tenant invite email branding | Low | Masters slice (3.5) — notification template master |
| Dealer-orders cross-module write to project | Low | Future refactor — extract `requestDealerProject()` to the project module |
| Module visibility per tenant (Principle #11) | High | Readiness sprint |
| Tier as TEXT (not a master) | Medium | Masters slice (3.5) — `dealer_tier` master |
| Territory as TEXT (not a master) | Medium | Masters slice (3.5) — `territory` master |
| Dealer-side Razorpay payment initiation | Medium | Fast-follow to Masters / Readiness |

## What still blocks 8-week onboarding (carried forward)

Mostly unchanged from prior audits — Slice 3 wasn't the slice to close these. Severity-ordered:

| Need | Effort | Notes |
|---|---|---|
| Tenant-creation admin UI | 1–2 days | Currently manual SQL |
| Master-data importers (firm/contact/product/warehouse) | ~4 weeks (1 wk per entity) | Only invoice + opening-stock CSVs exist; **add dealer-CSV here too** (new finding) |
| Module visibility per tenant | 2–3 weeks | Now more impactful — Slice 3 introduced two large surfaces (dealer admin + portal) that not every tenant wants |
| Configurable pipeline / stage seeds | 1–2 weeks | "paving_stage" still Vyara-specific; "Dealer orders" project segment now adds another seed dependency |
| Product category CHECK relaxation | 1 day + retrofit | Same as before |
| Subdomain / per-tenant routing | 1–2 weeks | Same |
| Pricing setup UI | Slice 3.5 scope | — |
| Documentation / runbooks | 1–2 weeks | Add: dealer onboarding runbook, portal user-invite flow doc |

**Realistic onboarding time: 3–4 months. Target: 8 weeks. Gap: ~2×.**

The reason the headline narrowed from 4–6 months → 3–4 months: **the dealer module is one of the larger commercial surfaces a Tier-2 manufacturer needs.** Without Slice 3, "onboard customer #2 in 8 weeks" assumed they could live with no dealer support — which is unrealistic for >70% of building-materials manufacturers. With Slice 3, the readiness sprint's remaining work (tenant onboarding + seed packs + module visibility + masters) becomes meaningfully more impactful per week.

## Recommendation (updated)

Sequence remains:

```
NEXT  →  Slice 3.5 (Masters & Configuration)  ← vendor, price-list, taxes, payment-terms,
                                                 reason-codes, notification templates,
                                                 dealer_tier + territory masters,
                                                 admin UI for masters
THEN  →  Platform-readiness sprint             ← tenant onboarding, seed packs, module
                                                 visibility flags, master CSV importers
                                                 (incl. dealer-CSV), code-prefix config,
                                                 subdomain routing, runbooks
THEN  →  First real customer-#2 onboarding attempt
THEN  →  Slice 4 (Tenders / Complaints / etc.)
```

**The Masters slice + the Readiness sprint together close the gap.** Once both ship, an honest attempt at onboarding a second similar Tier-1/Tier-2 building-materials manufacturer in 8 weeks becomes possible. Before either lands, the 3–4 month estimate is the realistic floor.

---

# Historical — Post Slice 2.5

**Date:** 2026-06-16 (post Slice 2.5)
**Headline:** 4–6 months (unchanged — Slice 2.5 did not add net customer-#2 infrastructure, but it did *prove platform discipline* on every new design).

## Where Slice 2.5 helped

| Discipline test | Status |
|---|---|
| New enum values are generic, not Vyara-specific | ✅ warehouse types (own_plant / transit / samples / dealer_consignment / other), movement types (10 generic), adjustment types (5 generic) — all reusable |
| Configurable thresholds, not hardcoded | ✅ adjustment_approval_threshold_inr lives on `tenant.settings`, not in code |
| Default-warehouse resolution per tenant | ✅ `tenant.settings.inventory.default_warehouse_code` with fallback to first active own_plant |
| Seed data labelled as Vyara-specific, not platform default | ✅ migration explicitly says `for Vyara (the launch customer)`; CODE values are obviously Vyara (SURAT-PLANT-1) but the *types* are generic |
| Stock invariants enforced at DB level | ✅ trigger-driven (single load-bearing function); CHECK constraints prevent negative qty; reservations have UNIQUE active-per-line idx |

## What still blocks 8-week onboarding (unchanged from Slice 2 audit)

These are the same items as the prior audit — none were addressed in Slice 2.5 (and the spec didn't promise to). Listed in rough effort order:

| Need | Effort | Notes |
|---|---|---|
| Tenant-creation admin UI | 1–2 days | Currently manual SQL |
| User onboarding flow (invite + first-login) | 1–2 weeks | No invite/SSO/first-login flow exists |
| Configurable pipeline / stage seeds | 1–2 weeks | Slice 1's pipeline_stage seed uses "paving_stage" — Vyara-specific term. A precast manufacturer would have different stage labels |
| Product category constraint relaxation | 1 day to relax, weeks to retrofit reporting | `product.category` CHECK lists Vyara's categories; needs to become an enum-per-tenant pattern |
| Module visibility per tenant (Principle #11) | 2–3 weeks | Tier 2 should not see tender / architect / multi-plant — no implementation yet |
| Master-data importers for firm / contact / product / warehouse | ~4 weeks (1 wk per entity) | Only invoices and opening stock have CSV import |
| Pricing setup UI | Already deferred (next-Slice scope) | No price-list system yet |
| Subdomain / per-tenant routing | 1–2 weeks | Single domain, JWT-based tenant_id |
| Documentation, runbooks | 1–2 weeks | None yet |

**Realistic onboarding time still: 4–6 months. Target: 8 weeks. Gap: 2.5–4×.**

## What Slice 2.5 specifically did NOT make worse

- No new hardcoded enum where customer #2 would have different values.
- No new feature that requires Vyara-specific terminology in user-facing labels.
- The inventory module would work for any building-materials manufacturer with single-line schema seed customization (one new warehouse row + opening stock CSV).
- Default-warehouse setting cleanly per-tenant — no Vyara assumption leaks.

## Recommended platform-readiness work (parallel stream, not a slice)

Once the next 2–3 slices ship, dedicate a ~1-week sprint to:

1. **Tenant onboarding UI** — admin form to create a new tenant + invite first admin user.
2. **Configurable seed packs** — replace SQL seeds with a `tenant_seed_template` table or JSON files that the tenant-creation flow can pick from.
3. **Module visibility flags** — add `tenant.settings.modules_enabled` array; sidebar + project tabs read from it.
4. **Master-data CSV import** for firms + contacts + products + warehouses (the four entities a new manufacturer needs to bring in).
5. **Documentation** — admin guide, master-data import guide, first-week runbook.

That sprint alone would shrink the gap from "4–6 months" to "**2–3 weeks** for a similar Tier-1/Tier-2 customer." Combined with the rest of the platform (Slice 3 dealer + complaints + pricing), 8 weeks becomes realistic.

## Conclusion

Slice 2.5 **maintained** customer-#2 readiness — every new schema and action was designed against the discipline test, none introduced new Vyara-specific lock-in. The platform did not get *further* from the 8-week goal. Closing the existing gap requires a dedicated readiness sprint, not another business-capability slice. **Recommendation:** after Slice 3 (Dealer portal), schedule the readiness sprint before Slice 4.
