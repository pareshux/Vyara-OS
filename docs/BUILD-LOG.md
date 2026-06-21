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

## 2026-06-22

### Constitution v2 → v3 amendment · cross-industry positioning · Raj demo plan locked (pending commit)
- **Tracks:** governance (Constitution + CLAUDE.md + Blueprint Last-updated + memory)
- **Capability:** Cross-cutting / governance
- **Tier:** N/A (governance)
- **Status change:** "Year-1 success = onboard a similar Tier-1/Tier-2 building-materials maker in 8 weeks" → "Year-1 success = onboard a customer in a different industry (Raj Avinsys, electrical EPC) in 8 weeks"
- **Notes:** Two strategic decisions landed today, one drove the other.

  **(1) The Constitution had been stale.** Blueprint v3 (`docs/PRODUCT-BLUEPRINT-v3.md` §0.1–§0.4) was already shaped horizontally — "modular Business Operating System for manufacturing, contracting, distribution, and service companies; industry behaviour from configuration + masters + activity types; 8 supported industries share one architecture." Constitution v2 still said "vertical SaaS for made-to-order building-materials manufacturers" with §5 explicitly excluding RMC / Steel / Furniture / Paint / Chemical and §10 deferring cross-industry expansion as "not a year-1 design constraint." Per CLAUDE.md's tiebreaker rule (*"Constitution wins on principles; Blueprint wins on capability partitioning"*) the two documents could co-exist, but only because nobody had tested the friction with a real cross-industry customer.

  **(2) Pitching Raj Avinsys Pvt. Ltd. forced the recognition.** Raj is Gujarat's "premier electrical contracting company" (since 2004) running three motions: EPC project work (industrial customers — chemicals/pharma/energy/infra), panel manufacturing (MCC/PCC/PDB/APFC/PLC built-to-order), and AMC + breakdown maintenance ("73% retention" their headline metric). Honest research surfaced that the architecture *does* fit Raj — 6 of 8 capabilities map cleanly to their motions; the gaps are CS-001 complaints (unbuilt), CS-009 AMC contracts (unbuilt), drawing-approval gate (workflow extension), milestone-billing schedule (Finance extension), procurement tracking (Constitution §5 needed to broaden). User chose **Frame A** (cross-industry by design) over Frame B (one-off opportunistic): *"For us closing a customer based on their need and make the product adjust based on their requirement is a win."* That sentence IS the platform thesis stated plainly — recorded as a new feedback memory `feedback-cross-industry-by-configuration` so it doesn't drift.

  **Amendment scope (surgical, not a rewrite):**
  - `docs/CONSTITUTION.md` title bumped v2 → v3; top paragraph rewritten (positioning); year-1 success criterion rewritten (Raj named as first cross-industry target); v3 amendment note added at top documenting why + when; Principle #5 rewritten (in/out-of-scope language broadened — procurement IN for industries that depend on it; RMC-shape still requires deliberate cost decision; "Out-of-vertical" language replaced with "fundamentally different operational shapes"); Principle #10 rewritten (cross-industry expansion **is** a year-1 design constraint as of 2026-06-22; new abstractions must ask "does this work for an electrical-EPC tenant too?"); Current build section refreshed (Vyara Tiles build mature through Slice 4 + Sprint 1 + INT-014 Slices 1+2+3+3.1+4; INT-014 Slice 5 dropped on 2026-06-21; now in Raj demo build); Principles #0–#11 unchanged (always industry-neutral, only #5 and #10 had building-materials-specific language).
  - `CLAUDE.md` preamble: top tagline rewritten to "modular Business Operating System"; year-1 metric rewritten with Raj named; doc reference bumped to (v3); the "Slice 1 + Slice 2 are complete..." stale paragraph removed and replaced with current state; Platform discipline test now asks "does this work for an electrical-EPC tenant too?"; Foundational audit Q7 references Constitution v3 + the Raj demo tenant as the live regression test; Current step section completely rewritten to record Raj demo plan (~3 weeks across 5 phases: provision tenant + masters → mock data → CS-001 → CS-009 → drawing-approval + milestone billing). Sprint 2 queue updated.
  - `docs/PRODUCT-BLUEPRINT-v3.md` Last-updated line records the amendment + Raj plan; no §11 row changes (governance change, not a capability change).
  - `docs/BUILD-LOG.md` this entry.
  - `MEMORY.md` indexes new feedback memory `feedback-cross-industry-by-configuration`; `project-vyara-os.md` refreshed (positioning at top; build status reflecting current state); `project-current-state.md` snapshot reflects the amendment + Raj demo phasing.

  **The Raj demo doubles as the Customer-#2 onboarding rehearsal.** Same code path a real second customer would take. The first time we flip to the Raj tenant, Vyara-isms in copy / AI prompts / seed data will surface; each surfaced item is a Customer-#2 readiness gap fixed before a real customer hits it. Predicted surface area (recorded in `project-current-state` for the next session): AI prompts referencing "manufacturing" / "Surat" / "tiles"; dashboard / empty-state copy; the Slice-1 `paving_stage` hero is fully Vyara-specific and likely needs to generalize to a per-tenant "hero stage"; dealer module needs feature-flag hidden for Raj (PLAT-004 already supports this); field_activity_type seeds need broadening.

  **No code changes in this commit.** Docs-only. tsc / dev-server / runtime smoke unchanged. The Raj demo build begins as Phase 1 (provision tenant + Raj-shaped masters) in a separate commit after this one lands.

## 2026-06-21

### Owner Dashboard — INT-014 Slice 5 dropped after build-then-revert (pending commit)
- **Tracks:** INT-014 (✅ final at Slices 1+2+3+3.1+4); INT-009 (drop sharpens its mandate)
- **Capability:** Intelligence
- **Tier:** Should-have (slice originally planned; now dropped)
- **Status change:** "Slice 5 = drill-down filters + Quick Actions + saved views" → ❌ Slice 5 dropped, subsumed by INT-009
- **Notes:** Built Slice 5.1 (drill-down filters: territory / role / rep, URL-param-driven, applied to people-aware sections only — Top reps · Today's field · Roster · Scorecards; honest dashed scope hint when filters active; `OwnerFilters` + `FilterScope` types extending `getOwnerOverview`; `allowedRepIds` Set hoisted into Section 9; new `owner-filter-bar.tsx` client component). Got it to a working state in the working tree (`tsc --noEmit` clean, `/owner` compiled in 2.8s with 1843 modules, smoke 307 for unauthenticated curl on both bare and filtered URLs). **Before commit, user pushed back:** *"I feel the filters are not required.. the chat would cover this part so lets drop the slice 5?"* Honest agreement — the conversational agent (INT-009, lifted from 💭 to 📋 in Slice 3.1) is the stronger drill-down path on a twice-a-day executive surface: filters force the owner to *operate* the dashboard (poke-around motion), chat lets them *interrogate* it (specific-answer motion). The trimmed brief's action chips (Slice 3.1) already cover the Quick-Actions need (5.2). Saved views (5.3) only matter if filters exist, so they fall away too. **Trade-off acknowledged:** the page loses the "pin the whole view to one territory" affordance — that becomes a chat turn instead of URL state. For an exec surface read twice a day that's the right call; would be wrong for a dashboard people live in 8 hours a day. **Revert executed in the working tree:** `lib/read-models/owner-overview.ts` — `OwnerFilters` + `FilterScope` types removed; `getOwnerOverview(period)` signature restored; the filter normalisation block (territoryFilter / roleFilter / repFilter / anyFilterActive) removed; `fieldReps` IIFE wrapper unwrapped back to direct query (no narrowing); `allowedRepIds` Set + `inAllowed()` helper removed from Section 9; Section 9 quote-attribution loops restored (no `anyFilterActive` gate); today's-expense query select restored (was `user_id, amount, status` → back to `amount, status`); Section 11 + 12 + 13 rollups restored to tenant-wide; `filter_scope: FilterScope` field removed from `OwnerOverview`; return statement restored. `app/(app)/owner/owner-filter-bar.tsx` — deleted. `app/(app)/owner/page.tsx` — `parseFilters` helper removed; searchParams type narrowed back to `{ period?: string }`; parallel `allFieldReps` fetch removed; `repOptions` + `territoryOptions` derivations removed; filter bar render + dashed scope hint removed; `OwnerFilterBar` + `Filter` icon + `OwnerFilters` + `RepOption` imports removed; header comment + footer copy rewritten to document the drop decision (not pretend the slice never existed). **Smoke after revert:** `tsc --noEmit` clean; `/owner` back to 307 in 22ms; remaining "Slice 5" mentions in shipped code are intentional documentation of the drop decision in the page header / page footer / read-model header (so future contributors don't accidentally rebuild what was decided against). **Drop sharpens INT-009's mandate** — chat is no longer a "natural complement to the brief"; it's the ONLY drill-down path on /owner. Worth flagging in the INT-009 planning doc next time it's touched. **Lesson recorded as memory note** (see [[feedback-phased-builds]] / [[feedback-money-first-owner-view]] adjacency): even when the audit, sub-slicing, and code all hold up, the right answer can still be *"don't ship this"* — and that's faster to discover after building one slice end-to-end than after building all three. The phased-builds rule did its job: walking 5.1 before bundling 5.3 + 5.2 means the revert is ~3 hours of work, not ~3 days.

### Honest Blueprint correction — INT-015 added; FLD-023 stays ❌ (pending commit)
- **Tracks:** INT-015 (new, 💭 Considered)
- **Capability:** Intelligence
- **Tier:** Nice-have
- **Status change:** new row 💭 added; rep-scorecards gap-marker text corrected to point at INT-015 instead of pretending it was "saved for Slice 5"
- **Notes:** User asked whether the two gap markers on the Owner Dashboard rep scorecards (live GPS + visit attribution) were unbuilt or just deferred. Honest answer: (1) **FLD-023** live GPS is a documented `❌ Future / won't build` decision in §11.5 — privacy + battery + reps will turn it off; check-in stamps give ~90% of the value. Not a forgotten todo, an intentional Blueprint position. (2) **Visit → closed ₹ attribution was NOT in the Blueprint** at all. I described it as "saved for Slice 5" in my Slice 4 commit, which was sloppy — per the workflow rule in CLAUDE.md ("If no item exists for what you're about to build, stop and add it first"), I should have added it as a tracked Blueprint item before describing it as deferred. **Correction shipped:** new `INT-015` row added to §11.8 (Intelligence) with nice-have tier and 💭 Considered status; the rep-scorecards.tsx gap marker now references INT-015 explicitly and acknowledges the attribution rule (last-visit-before-win vs all-visits-credited vs time-decay) as an open design decision before any build. Read-model header comment updated for the same fix. **No feature code, no schema changes — purely a documentation honesty correction.** Build decision still open: do we lift INT-015 to 📋 + build in Slice 5, or keep it 💭 and finish drill-downs / filters / Quick Actions first?

### Owner Dashboard — INT-014 Slice 4 · Field + People (227d24d)
- **Tracks:** INT-014 (Slices 1+2+3+3.1+4 ✅)
- **Capability:** Intelligence (cross-capability reads: Field Operations, Finance, Platform)
- **Tier:** Should-have
- **Status change:** ✅ Slices 1+2+3+3.1 → ✅ Slices 1+2+3+3.1+4
- **Notes:** Three new sections wired between Operations (§10) and Attention Centre (which still sits last so the page ends on the ranked action list). **Foundational audit before code:** `field_attendance` has per-user-per-day status (on_duty/wfh/leave/holiday) + check_in/out + total_km + reimbursement; `field_visit` has user_id + visit_outcome_id + location_label + state + visited_at; `expense` has user_id + amount + status + expense_date; `user_profile.role` CHECK IN ('admin','manager','sales_engineer','dealer') — field-eligible filter = role IN ('sales_engineer','manager'). RLS on field_attendance allows admin/manager to see all rows so the owner view works without surgery. Two honest gaps surfaced as visible markers (per Constitution Principle #11): live GPS → FLD-023 (already ❌ "won't build" in Blueprint — privacy + battery); visit → closed-₹ attribution → no FK from field_visit to quotation, saved for Slice 5 because the traversal (lead.won_at via visit.lead_id, project terminal stage via visit.project_id, then quote → invoice chain) is its own slice of work. **Files shipped:** `lib/read-models/owner-overview.ts` — 3 new types (`FieldToday`, `RosterEntry` + `RosterStatus`, `RepScorecard`), 6 new queries (field-eligible reps, today's attendance, today's visits, today's expenses, period attendance rollup, period visits rollup, period expenses rollup — totalling 7 actually counting the field_reps query; both attendance + visits queries reused for today and period as separate Promise.all slots so the period selector drives scorecards without a re-query). Roster sort is statuses (on_duty first, then wfh, leave, holiday, no_record) then within on_duty by check-in time (earlier first). Today's field activity is intentionally NOT period-coupled — the owner reading at 11am wants now-state not a 30-day average; the period selector drives §13 scorecards. Top field rep computed off `rep_scorecards[0]` (the same data the user sees). `facts` extended with 3 new fields: `on_duty_now_count`, `visits_completed_today`, `top_field_rep_label`. **3 new components** under `app/(app)/owner/`: `field-today.tsx` (4-card status strip + 3-card activity strip + link to /field/team); `team-roster.tsx` (list with status dot + role chip + check-in time/location/visits inline + status badge on the right + deep-link to /field/team/[userId]); `rep-scorecards.tsx` (2-card layout: top-5 list with trophy/award icons for ranks 1–3 + completion-% tone chip; companion card with 2 dashed gap markers). All reuse `formatMoney` (Indian short) + tabular-nums + lucide + status-never-color-only pattern. **Page wiring** in `page.tsx` — 3 new section blocks inserted after Operations; footer updated to acknowledge Slices 1+2+3+4 and the FLD-023 / attribution gaps. **Smoke test:** `npx tsc --noEmit` clean. `/owner` compiles in 191ms (Fast Refresh — full build was 1832 modules). 307 to /login expected for unauthenticated curl. **No migrations** in this slice. **Slice 5 planned:** drill-down filters per section (territory / role overrides), Quick Actions, saved views, possibly visit→closed-₹ attribution.

### Owner Dashboard — INT-014 Slice 3.1 · AI brief redesign (6efafd5)
- **Tracks:** INT-014 (Slices 1+2+3+3.1 ✅), INT-009 (lifted 💭 → 📋)
- **Capability:** Intelligence
- **Tier:** Should-have
- **Status change:** brief schema redesign + INT-009 promoted from Considered to Planned
- **Notes:** User feedback after walking Slice 3 in the browser: "AI insights right now is too text heavy, very hard to focus on anything." The screenshot showed why — the existing brief was 1 headline + 9 bullets averaging 27 words = ~250 words in 3 columns. Three options offered (3-chip, tighter sections, headline-only); user picked the 3-chip option. **Schema change** (`lib/ai/prompts/owner-brief.ts`): removed `top_opportunities[]`, `top_risks[]`, `recommendations[]`; added `actions[]` (max 3) where each action = `{ label, target, search }`. `target` is an enum (collections/quotes/projects/leads/tasks/approvals/firms) — the page the user will actually act on. `search` is optional substring the target page can pre-filter by (firm name or invoice number). Prompt v3 → v4 with explicit good/bad chip examples ("Call Surat Muni · ₹9.9L · 85d overdue" GOOD vs "Follow up on collections" BAD); system prompt rewritten to demand verb-first ≤10-word chips and forbid duplicating the headline in chip text. **Component swap** (`app/(app)/owner/owner-brief-card.tsx`): dropped the 3-column grid + the `BriefList` sub-component; new layout = severity-icon + title + chip + freshness on one row, headline (larger, weight-medium) below, then a "What to do today →" label + a flex-wrap row of `<ActionChip>` Link components. Each chip computes `/<target>?q=<search>` (pages that don't support `q` ignore it gracefully). Skeleton also updated to match new shape. **Cache invalidation:** the cache key already includes prompt version (`inline_text:owner_brief:<tenant>:owner_brief.v4`) so v3 cached briefs auto-invalidate on next read; no DB sweep needed. **INT-009 lifted from 💭 Considered to 📋 Planned** in §11 — the conversational agent is now scheduled as the natural "tell me more" companion to the trimmed brief. Pattern locked: tool-use agent wrapping read-models, NOT raw LLM-to-SQL; read-only v1; mandatory "I don't have that" path; cache by `(tenant, normalised_query)`. **Smoke test:** `npx tsc --noEmit` clean. `/owner` recompiled in 433ms (1805 modules — same as Slice 3, no module count change since one component shrunk and another didn't grow). 307 to /login expected for unauthenticated curl. **No migrations, no read-model changes** in this slice — purely AI-surface refactor.

### Owner Dashboard — INT-014 Slice 3 · Revenue + Ops (887e1a2)
- **Tracks:** INT-014 (Slices 1+2+3 ✅)
- **Capability:** Intelligence (cross-capability reads: Revenue, Delivery, Platform)
- **Tier:** Should-have
- **Status change:** ✅ Slices 1+2 → ✅ Slices 1+2+3
- **Notes:** Four new sections added between PTP coverage and the Attention Centre, so the full page now reads: Brief → Health KPIs → § Ageing → § Debtors → § Cash → § PTP → § Funnel → § Win rate → § Top reps → § Operations → Attention Centre. **Foundational audit before code:** quotation has `status` CHECK enum (draft/sent/revised/accepted/rejected/expired — note the actual closure verbs are accepted/rejected, NOT won/lost) + `sent_at` + `accepted_at` (no `rejected_at`, so rejected-in-period approximated via `updated_at` window — flagged but workable for win-rate denominator). lead has `won_at`, `lost_at`, `lost_reason_id`, `created_at`. dispatch has `scheduled_at`/`dispatched_at`/`delivered_at` but NO `expected_delivery_at` → on-time % surfaced as honest gap marker → DEL-007. stock_location has NO `safety_stock`/`reorder_level` → stock-at-risk surfaced as honest gap marker (no Blueprint item yet — discoverable for future). `lead_loss_reason` master exists per-tenant for label resolution. **Files shipped:** `lib/read-models/owner-overview.ts` — 4 new types (`RevenueFunnel`, `WinRateCycle`, `TopRep`, `Operations`), 11 new queries to Promise.all (open leads head, won/lost leads in period, sent/accepted/rejected quotes in period with created_by + sent_at + accepted_at for cycle calc, dispatch_stage master, dispatches/delivered/in-transit, lead_loss_reason master). A 12th new query (user_profile rep names) runs after the Promise.all once rep IDs are known — same pattern as Slice 1's buyer-name fetch. Funnel conversions can exceed 100% on short windows when wins predate the window — we surface that rather than capping (calibration honesty). Cycle calcs use defensive `>=0` guard. `facts` block extended with 10 new fields including a citation-ready `top_rep_label` and `top_loss_reason`. **4 new components** under `app/(app)/owner/`: `revenue-funnel.tsx` (vertical 4-stage bars with proportional widths + conversion-% chips between rows, click any stage → underlying list); `win-rate.tsx` (headline % with Strong/Average/Below-par chip + 3-stat sub-strip (cycle / lost ₹ / won ₹) + top-3 loss-reason chips + amber "leads closed without reason" hygiene flag rendering only when non-zero); `top-reps.tsx` (top 5 list with trophy/award icons for ranks 1–3, personal win-rate inline); `operations.tsx` (2-card layout: live ops card with dispatch counts + in-transit + delivered + avg cycle + by-stage chips; gaps card with on-time % → DEL-007 chip + stock-at-risk reason). All four reuse the same `formatMoney` (Indian short format) + tabular-nums + lucide + status-never-color-only pattern from Slices 1+2. **Page wiring** in `page.tsx` — 4 new section blocks inserted after PTP coverage; footer copy updated to acknowledge Slices 1+2+3 and list the 5 gap markers (CS-001, DEL-007, REL-016, FIN-014, safety_stock). **AI brief context extended** (`lib/actions/owner-brief.ts`) with a `revenue_depth` block (funnel stages + conversions + win rate + accepted/rejected ₹ + top 3 loss reasons + top 3 reps with personal win rate + ops snapshot). System prompt v2 → v3 with cache-key versioning (cache key still includes prompt version so v2 cached briefs auto-invalidate). **Smoke test:** `npx tsc --noEmit` clean across all changes. `next dev` boots in 1.5s; `/owner` compiles in 1.9s (1805 modules — Slice 2 was 1808; -3 modules makes sense, some lucide icons reused across slices). 307 to `/login` for unauthenticated curl expected. **No migrations** in this slice. **Slices 4–5 planned:** S4 Field + People (rep scorecards, attendance rollup, who's on duty right now), S5 drill-down filters + Quick Actions + saved views.

### Owner Dashboard — INT-014 Slice 2 · Finance depth (d702fcc)
- **Tracks:** INT-014 (Slices 1+2 ✅)
- **Capability:** Intelligence (cross-capability reads: Finance, Relationship)
- **Tier:** Should-have
- **Status change:** 🚧 Slice 1 → ✅ Slices 1+2
- **Notes:** Reorders the Blueprint plan per "money first" executive-surface feedback (saved previous session): Finance depth lands before Revenue+Ops (was Blueprint's S3). Four new sections inserted between Business Health and Attention Centre, so the page now reads: Brief → Health KPIs → § Ageing → § Debtors → § Cash → § PTP → Attention Centre. The ranked Attention Centre intentionally stays last — money depth is "context for the day," ranked action list is "what to do next." **Foundational audit before code:** `invoice_ageing_v`, `receipt` (received_at + amount + payment_mode), `promise_to_pay` (open + dishonoured), `firm` for debtor names — all already exist. Two honest gaps surfaced: ageing bucket boundaries are hardcoded in the view (Customer-#2 readiness gap, pre-existing — not in scope to refactor); cash OUTflow needs an AP / expense-payment ledger that doesn't exist (FIN-014). Both rendered as visible gap markers, not silently absorbed. **Files shipped:** `lib/read-models/owner-overview.ts` — 4 new types (`Ageing` / `TopDebtor` / `CashMovement` / `PtpCoverage`), 2 new queries (receipts in 30+30d window w/ `payment_mode` + `received_at` for mode split + best-day; `promise_to_pay` open + dishonoured-30d), buyer-name resolution merged for the overdue + debtor sets in one `.in('id', buyerIds)` (no N+1, no extra round trip). Ageing bucket rollup and top-10 debtor groupby computed in-memory from the existing `ageingRows` fetch — zero extra queries for those two sections. Top-debtor `oldest_invoice_label` picks the worst-outstanding invoice per firm for citation. Cash movement uses a FIXED 30d window (not period-coupled) so the section is stable across the period selector — same reasoning as DSO. PTP `coverage_pct` is honestly null when no overdue invoices exist (rather than misleading 100%). `facts` block extended with `top_debtor_label / receipts_30d / receipts_prev_30d / ptp_total_promised / ptp_due_this_week / ptp_overdue_with_promise / ptp_overdue_without_promise` so the AI brief has concrete signals. **4 new components** under `app/(app)/owner/`: `finance-ageing.tsx` (horizontal stacked bar + 4-card grid with bucket icon + ₹ + count + %; each bucket clicks through to `/collections?bucket=X` matching the existing filter contract); `finance-debtors.tsx` (top 10 list with severity-colored days-late chip + worst-invoice citation, deep-links to Customer 360); `finance-cash-movement.tsx` (2-card layout: cash IN with mode split + best day + delta-chip; cash OUT rendered as honest gap marker w/ FIN-014 chip); `finance-ptp-coverage.tsx` (headline coverage % with tone chip Strong/Patchy/Thin + 3-stat sub-strip + dishonoured-30d flag rendered only when non-zero). All four components use the same `formatMoney` (Indian short format ₹L/cr), `tabular-nums`, lucide icons, status-never-color-only pattern as Slice 1. **Page wiring** in `page.tsx` — 4 new sections + reordered Attention Centre to the bottom + footer text updated to acknowledge Slices 1+2. **AI brief context extended** (`lib/actions/owner-brief.ts`) with a `receivables_depth` block (top-3 debtors, ageing buckets, PTP coverage, cash-in 30d). System prompt updated to reference the block and demand concrete debtor/PTP citations; prompt version bumped `owner_brief.v1` → `owner_brief.v2`; cache key now includes prompt version (`inline_text:owner_brief:<tenant>:<version>`) so v1 cached briefs naturally invalidate on next read without a DB sweep. **Smoke test:** `npx tsc --noEmit` clean across all changes. `next dev` boots in 1.5s; `/owner` compiles in 3s (1808 modules — Slice 1 was 1772; +36 from 4 new section components + 4 new lucide icon imports + 2 brief edits). 307 to `/login` for unauthenticated curl is expected. **No migrations** in this slice. **Slices 3–5 planned:** S3 Revenue+Ops (pipeline funnel, win-rate, top reps, dispatch on-time%), S4 Field+People (rep scorecards, attendance rollup), S5 drill-down filters + Quick Actions + saved views.

## 2026-06-20

### Owner Dashboard — INT-014 Slice 1 (8ae1175)
- **Tracks:** INT-014 (✅ Slice 1, 🚧 ongoing)
- **Capability:** Intelligence (with reads across Revenue, Finance, Relationship, Platform)
- **Tier:** Should-have
- **Status change:** new row 🚧 Slice 1
- **Notes:** Audit before code (per `feedback-foundational-audit.md`): three parallel Explore agents catalogued the existing intelligence stack (daily-digest engine, 4 read-models, 7 chip KPIs per firm, finance ageing buckets, field-team rollups, approvals queue, 10 AI prompts, `tabular-nums` everywhere) — finding ~60% of the spec already buildable with no schema work and identifying 11 honest data gaps (no chart lib, no date-range picker, no CS module, no dispatch SLA, no generic firm credit_limit, no pipeline probability, no org hierarchy, no visit planning, no territory/branch beyond `user_profile.territory`, no broadcast infra, no owner role). Three blocking decisions resolved with the user before code: (1) new `/owner` route + admin-only via `user_profile.role === 'admin'` check; (2) Slice 1 = Sections 1+2 only, walked end-to-end before continuing; (3) ship with empty-states for the gaps, no schema additions beyond the AI cache entity_kind. **Files shipped:** Migration 0044 (`ai_extraction.entity_kind` += `owner_brief`). `lib/read-models/owner-overview.ts` — 5th cross-capability assembler (after project-progress, customer-360, visit-detail, field-day). One Promise.all with 17 parallel reads: tenant, invoices×2 (current+prev period for revenue delta), receipts×2 (collections delta), sales_order×2 (orders delta), invoice_ageing_v (outstanding + worst-overdue list), open quotations (open pipeline), 30d billed (DSO denominator), 20 worst overdue invoices, 20 stalled high-value projects, all pending approvals, all overdue tasks, paving-stage projects (nested async IIFE: first fetches stage IDs then projects in those stages — PostgREST can't filter on a joined column), 50 cold leads, 50 stale sent quotes. Phase 2 (1 follow-up): bulk firm-name lookup for overdue invoice buyer names to avoid N+1. Returns shaped `BusinessHealth` (6 KPIs with per-period prev-period delta on the 3 period-sensitive ones; outstanding / open_pipeline / DSO point-in-time) + `AttentionItem[]` ranked by score (log10 of money × time-since), with 3 honest gap-marker rows that always sort to the bottom (`gap_complaint` → CS-001, `gap_dispatch_sla` → DEL-007, `gap_credit_exposure` → REL-016). `lib/ai/prompts/owner-brief.ts` — Zod schema (`health` + `headline` + `top_opportunities` ≤3 + `top_risks` ≤3 + `recommendations` ≤3, all bullets ≤22 words). System prompt is calibrated as "executive briefing voice of the business" — demands concrete `₹`/buyer-name/invoice-number citations, refuses generic CRM advice ("focus on customer retention"), uses Indian short-format `₹3.2L` / `₹2.3 cr`. `lib/actions/owner-brief.ts` — pulls context from `getOwnerOverview('week')` so the brief is provably consistent with the page; caches 6h in `ai_extraction` (shorter than firm-brief's 24h since business state shifts faster at owner level); admin-only enforcement. **UI:** `/owner/page.tsx` server component, `<Suspense>`-wraps the brief so the page paints fast while AI streams. `period-selector.tsx` URL-param-driven (today/week/month/quarter/year — defaults to month, no scrolling). `owner-kpi-strip.tsx` 6-card grid (md:grid-cols-3) with KPI + icon + DeltaChip (▲▼flat + percentage + green/red), each card is a `<Link>` to its capability page. `attention-centre.tsx` ranked rows with category-icon + severity-pill (critical/warning/info/gap, never color-only — every state has an icon AND label), money on right + count + drill arrow on hover. Gap rows render with dashed border + Blueprint ID chip. Empty-state ("All clear — rare, well done") for tenants with zero attention items. `owner-brief-card.tsx` async server component with three-column body (Opportunities · Risks · Recommendations). **Sidebar:** new `executive` group at top, gated to `roles: ['admin']` via a new role gate on `NavItem` (item with `roles` only renders for matching `userRole`); `userRole` was already plumbed in from the layout. **Reuse:** `Card size="sm"`, `Skeleton`, `Badge`, `cn`, `createClient`, `extractFromText`, `ai_extraction` cache key pattern (`inline_text:owner_brief:<tenant_id>`), `invoice_ageing_v`, the existing 6-KPI shape from `/finance`. **Smoke test:** dev server boots in 1.4s, `/owner` compiles in 1.98s (1772 modules), all sibling routes (`/dashboard`, `/firms`) still compile cleanly. `npx tsc --noEmit` clean across the new files. **Per Constitution Principle #11:** the gap markers are intentionally not dead code — they make missing data legible. **Slices 2–5 planned:** S2 Revenue+Operations · S3 Finance+Relationships · S4 Field+People · S5 drill-downs + filters + Quick Actions. **Migration 0044 must be applied to the remote DB** before the brief can write to `ai_extraction` with `entity_kind='owner_brief'` (until applied, the brief soft-fails with a discreet inline message and the rest of the page works).

### Customer 360 — Slice 2.4 · Collections tab (3189691)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Finance)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** Collections tab shows payment-tracking state per invoice: stage badge (color from collection_stage master), overdue badge, outstanding vs billed, next_action_at. Links to /invoices/[id]. Collections agg reuses invoiceAggRows from Phase 1 — no extra query. Tab trigger shows overdue count in red. Slice 3 (Visits + AI insights) is next after morning walkthrough.

### Customer 360 — Slice 2.3 · Quotes tab (8796971)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Revenue)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** Quotes tab: stats (total · open · value), card rows with quotation_number (mono), status badge (Won/Lost/Sent/Draft/Revised/Expired), project name link, created date, valid_until with amber warning for near-expiry. Links to /projects/[id] — no standalone /quotes/[id] page. No read-model change; Phase 2 quotes query already shipped in Slice 2.2 (b3f3231).

### Customer 360 — Slice 2.2 · Invoices tab (b3f3231)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Finance)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** Read-model restructured to two-phase (Phase 1: 6 parallel queries; Phase 2: quotes + collections conditional on ID lists). Invoice tab: stats (total · overdue · outstanding), card rows with invoice_number/external_invoice_number (mono), status badge, invoice date, due date (red + alert icon when overdue), total + outstanding. Links to /invoices/[id]. Sensitive-column check: invoice.total is not masked; only quotation.discount_pct and project.order_value are masked per PLAT-007.

### Customer 360 — Slice 2.1 · Orders tab (44e3806)
- **Tracks:** REL-009 (still ✅ Partial)
- **Capability:** Relationship (read-through to Revenue)
- **Tier:** Should-have
- **Status change:** ✅ Partial → ✅ Partial (extends)
- **Notes:** First Slice 2 tab. Read-model extension follows the pattern locked in Slice 1.6: one limited query for the tab list + one lightweight aggregate (no joins, no limit) for totals. Orders queried by `sales_order.buyer_firm_id` direct (the cleanest path — `sales_order` has buyer_firm_id stored explicitly, no need to traverse projects). New shape: `orders: { items, total, showing, total_value, active_count }` with `active_count` computed from `pipeline_stage.is_terminal` (same heuristic as projects). New Customer360Order type carries order_number / value / order_date / expected_delivery_at / current_stage / project link. UI: tab between Projects and Contacts; stats line above the list shows total · active · total_value · "Showing X of Y" when truncated; card rows show order_number (mono font), stage badge, project name (link target), order date, expected delivery (if set), value right-aligned. Each row deep-links to `/orders/[id]`. Empty state copy explains how orders arrive. **Architectural payoff:** the page didn't need restructuring — adding the tab is `import` + `destructure` + `<TabsTrigger>` + `<TabsContent>`. Slice 2.2 (next tab) will follow the same pattern.

### Customer 360 — Slice 1.6 · Tab restructure + Contacts tab (821085d)
- **Tracks:** REL-009 (still ✅ Partial — structural pivot, not a new tier)
- **Capability:** Relationship
- **Tier:** Should-have
- **Status change:** ✅ Partial (Slice 1.5) → ✅ Partial (Slice 1.6 restructures)
- **Notes:** User feedback after walking Slice 1: "if a firm has 3 contacts, why does clicking 'View all' send me away to /contacts? show them here. And put tabs below the header so Slice 2 has somewhere to land." Right call. The page now has `<Tabs>` below the header: **Overview** (default) | **Projects** | **Contacts**. Header card narrows to identity (name, type, contact details, primary contact) — no more "View all N" link (the Contacts tab badge does that job). Overview tab carries a 4-card KPI strip (`projects.total`, `contact_count`, `kpis.total_estimated_value`, `kpis.last_touched_at`) + an AI insights placeholder (REL-011 destination — copy explains what's coming) + Notes section (renders only when firm.notes is set). Projects tab is verbatim what was below the card in Slice 1.5. Contacts tab is a new table showing every contact (capped at 100; "Primary" badge on row 0; tel:/mailto: links). **Read-model extension:** `contacts: Customer360Contact[]` (capped 100) added alongside `primary_contact` (which is now derived from `contacts[0]`); new `kpis` object with `total_estimated_value` + `active_project_count` (uses `pipeline_stage.is_terminal` to exclude won/lost) + `last_touched_at`. Two project queries now: one limited for the Projects list, one lightweight aggregate (no joins, no limit) for KPIs — keeps the page bounded as project count grows. **Architecturally the boundary held:** the page is still a dumb consumer of one assembled object. Slice 2 tabs (Quotes / Orders / Invoices / Collections) drop in by adding one query to the assembler + one `<TabsContent>` each.

### Customer 360 — Slice 1.5 · /firms discovery surface (810025d)
- **Tracks:** REL-009 (still ✅ Partial — extends the surface, doesn't change tier)
- **Capability:** Relationship
- **Tier:** Should-have
- **Status change:** ✅ Partial (Slice 1) → ✅ Partial (Slice 1.5 extends it)
- **Notes:** Single discovery page for every firm in the tenant — replaces the "you can only reach a firm via a project" constraint that Slice 1 closed with. `app/(app)/firms/page.tsx` (server) fetches all non-deleted firms + the `relationship_type_master` rows in parallel; `firms-client.tsx` is a single client component holding filter + search state. Filter dropdown is single-select, options are pulled from the master and tagged with per-tenant counts so the user sees which types have content without opening the menu. Search is client-side substring across name / city / phone / GSTIN (Vyara is well under 500 firms — server-side trgm becomes worthwhile around 5k+; deferred until then). Every row deep-links to `/customers/[firmId]` (Slice 1). Sidebar entry "Firms" sits between Leads and Contacts under Relationship (Firms = the org spine; Contacts = people in those orgs; ordering reflects the data hierarchy). Dealers continue to live at `/dealers` because they carry extra fields (tier, credit limit, code); a dealer is still findable here by filtering type=dealer, and clicks land on the same Customer 360 (not the dedicated dealer detail page — that asymmetry is intentional and can be revisited if it confuses anyone). Why no /firms list page existed before: there was never a daily-use case for "scan everyone" — discovery happened through Leads, Projects, or Contacts. Slice 1 (Customer 360) created the need: now that firms have a destination worth reaching, they need a discovery surface.

### Customer 360 — Slice 1 (9fc3b7e)
- **Tracks:** REL-009 (✅ Partial)
- **Capability:** Relationship
- **Tier:** Should-have
- **Status change:** 📋 → ✅ Partial
- **Notes:** Fourth cross-capability read-model after project-progress (Slice 2), visit-detail (FO-6), field-day (FO-7). `lib/read-models/customer-360.ts` is the assembler; `app/(app)/customers/[firmId]/page.tsx` is the dumb consumer. Header card surfaces firm name + relationship type (resolved via `relationship_type_master` from REL-006, falls back to title-cased `firm.type` for pre-REL-006 rows) + phone/email/website + city/state + GSTIN + primary contact (first contact by `created_at`) + total contact count with "View all N" link. Projects section is a single `.or(buyer_firm_id.eq.X,architect_firm_id.eq.X)` query so dedup + the "Showing 10 of N" count are exact; `firm_role` resolved per row by checking which FK matches. Entry point: project-detail Overview tab — buyer + architect firm names become `<Link>` to `/customers/<firmId>` with a chevron affordance. **Deliberately deferred to slice 2+:** Orders / Quotes / Invoices / Collections sections, Visits / Activities timeline, a `/customers` list page. Per the phased-builds feedback — walk slice 1 end-to-end before bundling slice 2. **Architecturally:** the read-model boundary is set the first time. New sections in slice 2 (Orders, Quotes, Invoices, Collections) extend the assembler with one query each; the page stays a dumb consumer. Slice 2 will not have to re-architect the header.

### Sprint 2.2 (Field Operations deep-build) — CLOSE
- **8/8 items shipped.** FO-1 (sidebar grouping), FO-2 (PLAT-013 attachments), FO-3 (visit proof), FO-4 (PLAT-014 approvals), FO-5 (FIN-006 expenses + FIN-007 partial + FLD-016), FO-6 (FLD-014 Visit Hub partial), FO-7 (FLD-015 day read-model), FO-8 (FLD-013 + INT-008 prep brief).
- **6 Blueprint capabilities touched:** Platform (PLAT-013, PLAT-014), Field Operations (FLD-013, FLD-014, FLD-015, FLD-016), Finance (FIN-006, FIN-007), Intelligence (INT-008), Relationship (touched via visit subject reads), Revenue (touched via project + quote reads).
- **10 Status Tracker rows flipped to ✅** (some Partial — FLD-014 needs book-order/log-complaint when their owners ship; FIN-007 needs a policy CRUD UI).
- **3 new cross-capability read-models** (after Slice 2's project-progress): visit-detail, field-day. The pattern holds.
- **Working examples in `main` ready for Vyara demo.** Sprint 2.3 picks up by either (a) extending Field Ops further (FLD-019 fraud detection, mobile bottom-nav) OR (b) starting Customer Success / CS-001 complaints so the Visit Hub gets its "log complaint from visit" affordance.

### FO-8 — AI visit prep brief (93d9ccc)
- **Tracks:** FLD-013 (✅), INT-008 (✅)
- **Capability:** Field Operations + Intelligence
- **Tier:** Should-have
- **Status change:** 📋 → ✅
- **Notes:** Migration 0036 adds `visit_prep_brief` to the `ai_extraction.entity_kind` CHECK. `lib/ai/prompts/visit-prep-brief.ts` defines a Zod schema (headline ≤14 words / up to 4 bullets / optional caution) + a system prompt that demands matter-of-fact specifics ("Quote ₹4.2L sent 9 days ago, no response" beats "follow-up pending"). `lib/actions/visit-prep-brief.ts` assembles per-subject context — subject summary, last 8 activities, open tasks, last 5 quotes (for projects), last 3 prior visits — serialises to JSON, calls `extractFromText` with the schema, and tags the row with `source_storage_path='inline_text:visit_prep_brief:<visit_id>'` so subsequent calls hit the cache by that key (no second AI call per visit). `<VisitPrepBrief>` renders inline on the in-progress card AND on the Visit Hub. Per Principle #6 read-only — never writes data. This is the first general-purpose Vyara "copilot" surface; the next ones (call recap, outcome quality check) reuse the same plumbing. **First Intelligence consumer of the AI extraction framework that isn't a data-extraction job** — it generates structured advice rather than parsing user-supplied input.

### FO-7 — Field-Activity Day read-model (84c0446)
- **Tracks:** FLD-015
- **Capability:** Field Operations
- **Tier:** Must-have post-C#2
- **Status change:** 📋 → ✅
- **Notes:** Third cross-capability read-model — `lib/read-models/field-day.ts` after `project-progress.ts` and `visit-detail.ts`. Assembles one rep + one date: attendance row, visit counts (completed + planned-open), distance, on-duty duration (computed from check-in/out), vehicle claim amount, expense rollup (total + pending count), and the expense line items themselves. `<FieldDayKpiStrip>` is the one shared component that renders the four KPI cards on both `/field` (the rep's own page) and `/field/team/[userId]` (the manager drill-down). Team-detail page also gains the expense list below the visit list — expense rows with `subject_type='field_visit'` deep-link into the Visit Hub. Rep `/field` shows the strip when checked-in OR checked-out (not on State 1/2/3 since there's no day yet). Why a read-model and not direct queries on each page: per Principle #0, the day's "story" needs to read the same regardless of which surface asks; one assembler keeps the shape stable as new pieces (FO-8 prep-brief stats? FLD-019 fraud signals?) get added — they slot in by extending the read-model. Visit counts use `count: 'exact', head: true` to avoid pulling rows; expense pull is bounded by `(user_id, expense_date)` so it stays cheap.

### FO-6 — Visit Hub (82a06fc)
- **Tracks:** FLD-014 (✅ Partial)
- **Capability:** Field Operations
- **Tier:** Must-have post-C#2
- **Status change:** 📋 → ✅ Partial
- **Notes:** `lib/read-models/visit-detail.ts` — the second cross-capability read-model (after `project-progress.ts`). Assembles the field_visit + contact + subject (project/lead/firm/dealer w/ href back) + attachments (FO-2) + expenses (FO-5) + activity timeline + follow-up tasks into one object. New page `/field/visits/[id]` consumes one assembled object — no cross-module reads in the UI. Sections: header card (subject, state, contact, location with Maps deep-link, outcome, notes, quick-actions row), proof gallery, expenses-on-this-visit list, follow-up tasks, activity timeline. Quick actions wired: add photo, attach file, signature, log expense (subject pre-filled). Completed-visit cards on `/field` now `<Link>` into the hub; in-progress card gets an "Open hub" affordance alongside Complete/Expense/Cancel. **Partial** because the FLD-014 spec also calls for "book order from visit" and "log complaint from visit" — both deferred to their owner capabilities (order action exists but no prefilled flow; complaint module CS-001 not yet built). Read-model is ready for both — they slot in by extending the assembler with one query each. Manager team-detail page deep-link wires when FO-7 (Field-Activity Day read-model) ships.

### FO-5 — Multi-category expense module (82dcba4)
- **Tracks:** FIN-006 (✅), FIN-007 (✅ Partial), FLD-016 (✅)
- **Capability:** Finance + Field Operations
- **Tier:** Must-have post-C#2 (FIN-006), Should-have (FLD-016)
- **Status change:** FIN-006 📋 → ✅; FIN-007 📋 → ✅ Partial; FLD-016 📋 → ✅
- **Notes:** Migration 0035 — `expense_category` master (system + tenant rows, same pattern as task_type / activity_type / relationship_type — 12 cross-industry seeds: fuel, tolls, food_self, food_client, taxi, train_air, accommodation, mobile_recharge, gift, sample_courier, site_supplies, other) + `expense` table (status state machine: draft → submitted → approved | rejected → exported; with `cancelled` and `subject_type/id` for tying an expense to a visit / project / lead / firm). RLS: reps see own, managers see team; rep can only update own *drafts*; managers/admins always. `lib/actions/expenses.ts` ships create / submit / cancel / list / get; on `submitExpense` the engine calls `requestApproval({ entityType: 'expense', amount })` — when a policy band matches it raises an approval request and the expense lands at `status='submitted'`; when no policy matches it auto-approves directly. `approval_request.status` is read-back at list time via `syncExpenseFromApproval` (cheap denormalisation; replaces the Inngest write-back that doesn't exist yet). `<LogExpenseSheet>` is a 2-step bottom sheet: capture (category grid, amount, date, notes) → receipt (snap via FO-2 AttachmentUploadButton kind='receipt'). Abandoned drafts soft-cancel on sheet close (no DB litter). `/expenses` page rolls up by status + groups by date. Sidebar gets a new "Expenses" item under Finance. Wired into `/field`'s in-progress visit card so an expense can be tied to the live visit via `subject_type='field_visit'`. **FIN-007 partial** because the approval_policy table IS the expense policy table — no new master needed; per-tenant policy CRUD UI deferred.

### FO-4 — Generic approval engine (422de80)
- **Tracks:** PLAT-014
- **Capability:** Platform
- **Tier:** Must-have post-C#2 (lifted into Sprint 2.2 so FO-5 has a real engine to consume)
- **Status change:** 📋 → ✅
- **Notes:** Migration 0034 — 4 tables: `approval_policy` (rules per entity_type + amount band), `approval_policy_step` (N ordered steps; `approver_via='role'|'specific_user'`), `approval_request` (one row per ask; status: pending/approved/rejected/cancelled; sequential mode tracks `current_step_order`, parallel leaves it NULL), `approval_step_action` (per-step decision log). Full **multi-level** by design — sequential (each step waits for prior) and parallel (all open at once; `require_all_parallel` toggles all-N vs any-1). A single rejection always closes the request. Approver resolution: role → any active user_profile with `role=X`; specific_user → that uid. Admin can act on any open step (escape hatch for stuck requests). `requestApproval` picks the policy by `(entity_type + amount in band)`; `autoApproveIfNoPolicy` defaults true so a ₹500 expense doesn't manufacture a queue item. `/approvals` page renders the actor-filtered queue (eligibility computed in the action, since RLS only does tenant isolation); `<ApprovalCard>` is a server component for inline rendering on the consumer's detail page (status pill + step ladder + decision history + Approve/Reject when pending). `DecideButtons` is the client island that captures a comment and calls `decideApproval`. **Deferred:** Inngest auto-escalation cron (schema has the column), `reports_to_user_id` on user_profile (the moment a customer asks for hierarchical chains), seeded policies (consumers seed per-tenant). entity_type detail-link resolver registered in `/approvals/page.tsx` — new consumers add one switch case.

### FO-3 — Visit completion: photos + documents + signature (54865a3)
- **Tracks:** PLAT-013 (consumer wiring)
- **Capability:** Field Operations
- **Tier:** part of Field Operations vertical (Sprint 2.2)
- **Status change:** PLAT-013 consumer "first wire" satisfied
- **Notes:** `app/(app)/field/complete-visit-button.tsx` wires the FO-2 primitives — adds a "Proof" section with 3 capture surfaces: photo (mobile camera default), document (PDF/image picker), signature (canvas dialog with `signerName` pre-filled from the contact). Uploads happen eagerly so a heavy photo doesn't block submit. `visits-section.tsx` threads `tenantId` through to the button (already had it at the page level). Attachments persist whether the dialog is submitted or just closed (rep can capture proof, walk to vehicle, come back, submit). What's deliberately NOT in this commit: rendering attachments on the manager's `/field/team/[userId]` cards — that needs a single-query rollup to avoid N+1; it lands with FLD-014 (Visit Hub / Visit Detail page). Cancelled visits leave orphan attachments today (visible to nobody; cleanup job uses the `attachment_tenant_kind_idx` index when built).

### FO-2 — Attachment framework (d114708)
- **Tracks:** PLAT-013
- **Capability:** Platform (substrate for every capability)
- **Tier:** Must-have post-C#2 (lifted into Sprint 2.2 because FO-3 needs it)
- **Status change:** 📋 → ✅
- **Notes:** Migration 0033 + `lib/actions/attachments.ts` + 3 reusable UI primitives (`upload-button`, `list`, `signature-pad`). Polymorphic `attachment` table — `(entity_type TEXT, entity_id UUID, kind)` plus storage_path / mime_type / size_bytes / title / notes / metadata. 5 kinds (photo/document/voice_note/signature/receipt). Bucket reused: `ai-uploads` with path prefix `<tenant_id>/attachment/<entity_type>/yyyy/mm/<ts>_<safename>`. RLS = tenant isolation only; per-entity readability lives in app-layer `canAccessParent` (Option C — admin/manager always; `field_visit` ⇒ owner-or-admin; `sample_request` ⇒ any same-tenant user). Three indexes: `(entity_type, entity_id, created_at DESC)` hot path, `(created_by, created_at DESC)` for "my recent uploads", `(tenant_id, kind, created_at DESC)` for storage cleanup. `SignaturePad` is canvas-based PNG capture; `AttachmentUploadButton` handles camera/file picker per kind; `AttachmentList` renders images as a thumb grid and other kinds as a row list with signed-URL open. Old TEXT[] `photo_urls` columns stay one slice for backwards-compat — new consumers (FO-3 onwards) write to attachment. `entity_type` whitelist gates known consumers (`field_visit` / `expense` / `complaint` / `dispatch` / `sample_request`); adding a new type = add a row to the whitelist + define the readability rule.

### Sprint 2.2 (Field Operations deep-build) — START
- **Strategy:** pick one capability and ship every realistic edge case before moving on. Field Operations chosen — most demo-able, forces the platform pieces (attachments, approval engine, expense module) into existence as their first consumer, becomes the customer-facing demo for C#2.
- **8 items planned, ~6 weeks:** FO-1 sidebar grouping (cosmetic) → FO-2 attachment framework (PLAT-013) → FO-3 visit photos/docs/signature → FO-4 generic approval engine (PLAT-014) → FO-5 multi-category expense module (FIN-006) → FO-6 Visit Hub wiring (FLD-014) → FO-7 Field-Activity Day read-model (FLD-015) → FO-8 AI prep brief (FLD-013).
- **Deferred (correctly out of scope):** offline (FLD-022 ❌), live GPS (FLD-023 ❌), native map (FLD-024 ❌), route optimization (FLD-025 ❌), live AI coaching (FLD-026 ❌), native mobile (FLD-027 ❌).

### FO-1 — Sidebar capability grouping (pending commit)
- **Tracks:** FLD-009 cosmetic follow-up (Blueprint §1.4 "sidebar grouping refactor")
- **Capability:** Cross-cutting (visible UX)
- **Tier:** part of Field Operations vertical
- **Status change:** 📋 → ✅
- **Notes:** components/app/sidebar.tsx now groups nav under capability headers: Dashboard + Field (home, no header) → Relationship (Leads/Contacts/Dealers) → Revenue (Projects/Orders) → Delivery (Inventory/Warehouses/Dispatches) → Finance (Invoices/Collections/Finance) → Tasks (utility, no header) → Admin (existing). Dealer moved from "channel-y last position" to Relationship per Blueprint reframing (dealer is a relationship type, not its own module). URLs unchanged; pure visual structure. Cosmetic-only — Blueprint §1.4 flagged as "~1 day".

### Sprint 2.1c — visit_purpose system rows + broader vocabulary (1b44972)
- **Tracks:** FLD-009
- **Capability:** Field Operations
- **Tier:** Must-have C#2
- **Status change:** 📋 → ✅
- **Notes:** Migration 0032 promotes `visit_purpose` from tenant-only to a system+tenant master, mirroring the type-master pattern from 0029 and 0031. Allows tenant_id NULL (system rows visible to all). Adds `category` column for industry-pack filtering hints. RLS updated to read-system-or-own. 16 system seeds across 7 categories (sales, finance, service, installation, audit, training, other) — covers the cross-industry vocabulary the Field Operations capability needs. Existing Vyara tenant rows untouched. Table NOT renamed to `field_activity_type` (the FK column ripple isn't worth it; the Blueprint already documents the conceptual mapping). **Closes the third and last Must-have-C#2 item — the runbook's ~8-day estimate to honest 8-week onboarding lands at ~7 days actual.**

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

### 2026-06-20 — REL-011: Firm health signals + AI relationship brief (82b5d76)
- **Tracks:** REL-011
- **Capability:** Relationship + Intelligence
- **Tier:** Should-have
- **Status change:** 💭 → ✅
- **Notes:** Two surfaces. /firms list: 4 bulk queries run in parallel (overdue invoices by buyer_firm_id, stale sent quotes >7d via project join, active projects not updated >14d, open leads not updated >3d) → per-firm signal map → color chips on each row (red overdue, amber quote awaiting, orange project stale, blue lead stale) + new City/State/Attention filters. Customer 360 Overview tab: <FirmBrief> async server component replaces "coming soon" placeholder; lib/actions/firm-brief.ts assembles 5-query context, calls Claude via extractFromText, caches in ai_extraction with 24h TTL (gte created_at guard); lib/ai/prompts/firm-brief.ts defines FirmBriefSchema (health enum + headline + bullets) and a prompt that demands concrete ₹ amounts, invoice numbers, days-overdue.
