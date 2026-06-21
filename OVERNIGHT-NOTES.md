# Overnight run notes — 2026-06-22 → 23

> **Read this top-to-bottom in the morning.** Single source of truth for what shipped while you slept. Phase commits are atomic — any single phase rolls back via `git revert <sha>`.

## Status at a glance

| Phase | What | Commit | Tests | Walked? |
|---|---|---|---|---|
| 2 | Mock data for Raj + view-RLS security fix | _committing_ | 26/26 integration + 179/179 vitest | n/a |
| 3 | CS-001 complaint module | _pending_ | _pending_ | n/a |
| 4 | CS-009 AMC contracts | _pending_ | _pending_ | n/a |
| 5a | Drawing-approval gate | _pending_ | _pending_ | n/a |
| 6 | Vyara-isms hunt | _pending_ | _pending_ | n/a |

I'll update this table as each phase commits.

---

## Architectural decisions made overnight (every one is flippable)

> Each entry: **decision · reason · cost-to-flip**.

**Phase 2:**
- **Project.segment CHECK extended (migration 0046)** to admit `'epc_project'` + `'panel_order'` · Reason: Phase 1's pipeline_stage rows used those segment values; project.segment had to match. The cross-industry-clean move would be to drop the CHECK entirely + let segments live in a master, but that's a broader refactor; this single-line additive change unblocks Phase 2 without scope creep · Cost to flip: drop the CHECK + add master table + UI for segment management (~half a day).
- **View `security_invoker = true` for `invoice_ageing_v` + `dealer_ledger_v` (migration 0047)** · Reason: discovered Raj admin saw Vyara invoices via the view — PG views run with owner privileges (postgres = BYPASSRLS) by default. Critical cross-tenant data leak. PG 15+ `security_invoker` forces RLS to evaluate as the calling user · Cost to flip: 1-line `ALTER VIEW … SET (security_invoker = false)` (don't — this is a security fix, never revert).
- **Mock data uses fixed UUIDs (prefix `aaXX0001-…`)** instead of random · Reason: idempotent re-runs via UPSERT on PK; predictable for debugging; never accidentally drift from migration to migration · Cost to flip: change to random + handle idempotency elsewhere.
- **Project description stored in `custom_fields.description` JSONB** instead of a dedicated `notes` column · Reason: `project` table doesn't have a `notes` column (other entities do — firm, contact, quotation, sales_order, invoice). Adding one would be a schema change; using JSONB is the documented extension point · Cost to flip: add `notes` column via migration + refactor seed to use it (~30 min).

---

## Vyara-isms surfaced + their fix status

> Things hardcoded to Vyara that shouldn't be. Fixed in Phase 6 unless noted.

_(populated as I go)_

### Discovered during Phase 2 audit (before any seed wrote)
- **`quotation_number` trigger hardcodes `'VT-QT-YYYY-NNNN'` prefix** — ignores `tenant.settings.codes.quotation`. Workaround for Phase 2: pre-fill `quotation_number` with `RA-QT-*` so the trigger no-ops. **Real fix in Phase 6:** rewrite trigger to read tenant.settings or use the existing `next_code_sequence` RPC (PLAT-010).
- **`sales_order` number trigger** same Vyara-ism as above.
- **`invoice` number trigger** same Vyara-ism as above.
- **`project.segment` CHECK constraint** didn't include `'epc_project'` or `'panel_order'` (added in Phase 1's pipeline_stage seed). Migration 0046 extends the CHECK. Phase 6 follow-up: consider whether project.segment should be a tenant-configurable TEXT (drop CHECK entirely) per the cross-industry-by-configuration principle.

### Discovered DURING Phase 2 seed + integration test
- **🚨 CRITICAL — `invoice_ageing_v` + `dealer_ledger_v` views leaked cross-tenant data via RLS bypass.** Discovered when integration test signed in as Raj admin and saw Vyara invoices in `invoice_ageing_v`. Root cause: PG views run with OWNER privileges by default; the postgres superuser owner has BYPASSRLS, so RLS on the underlying tables was silently bypassed when accessed through the view. **Fixed immediately in migration 0047** (`ALTER VIEW … SET (security_invoker = true)` — PG 15+ feature). Post-fix integration test confirms Raj sees only Raj rows. **This bug existed in production-style code from Slice 2 (migration 0006) and would have leaked across any 2-tenant setup; the Raj demo surfaced it exactly as the cross-industry rehearsal was supposed to.**
- **`project` table has no `notes` column** (other entities do: firm/contact/quotation/sales_order/invoice). Workaround: stash descriptive text in `custom_fields` JSONB. Phase 6 consideration: add `notes` column for symmetry or document the JSONB-extension pattern.

---

## Tests added

| File | Covers | Status |
|---|---|---|
| `scripts/test-raj-mock-data.ts` (Phase 2) | RLS-scoped read by Raj admin · row counts for 10 tables · cross-tenant isolation (Raj sees 0 Vyara firms) · pipeline-stage joins · sales-order joins · invoice ageing view · Raj stage seed consistency (30 rows; 18 EPC + 12 Panel) | 26/26 pass |
| (existing `__tests__/slice2/`) — re-run after migrations 0046 + 0047 | 179 vitest tests · server actions · inngest handlers · unit helpers | 179/179 pass

---

## Open questions for you

_(populated as I go — anything I genuinely couldn't decide alone)_

---

## What I deferred and why

_(populated as I go)_

---

## Recovery instructions

If you wake up and something looks wrong:

- **Vyara appears broken:** `git log --oneline` to find the latest commit. Each Phase commit has tests passing at commit time — if Vyara breaks, it's likely Phase 6 (the Vyara-isms refactor). Revert with `git revert <sha>` and the prior state is restored. RLS tenant_isolation means Raj seed data never affects Vyara reads regardless.
- **A specific migration broke something:** all migrations are additive (new tables, new CHECK values, new INSERTs). Worst case: revert the migration via the inverse SQL. Each migration file has a leading comment naming the safe rollback path.
- **The /demo page won't sign in as Raj:** confirm `scripts/onboard-tenant-config.raj.json` still has password `RajDemo@1234` matching the `/demo` page hardcode.

---

_This file gets overwritten each overnight run. Don't commit it as long-term documentation; it's a session artifact._
