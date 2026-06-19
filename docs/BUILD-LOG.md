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
