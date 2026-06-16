# Customer-#2 Readiness Audit — after Slice 2.5

> The **8-week customer-#2 onboarding test** is the year-1 success gate (Constitution v2). This audit records the platform's readiness *after Slice 2.5* and lists what would still block onboarding a second Tier-1 / Tier-2 building-materials manufacturer today. Re-run after every slice; the gap should narrow, not widen.

**Date:** 2026-06-16 (post Slice 2.5)
**Last audit headline:** 4–6 months (post Slice 2)
**Current headline:** 4–6 months (unchanged — Slice 2.5 did not add net customer-#2 infrastructure, but it did *prove platform discipline* on every new design).

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
