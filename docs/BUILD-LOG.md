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

### Sprint 1.5 — TS types from DB schema (browser client typed; server + npm script deferred)
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
