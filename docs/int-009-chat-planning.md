# INT-009 — Conversational AI agent · planning doc

> **Status:** 📋 Planned. Not yet built. Lifted from 💭 Considered → 📋 in the Slice 3.1 turn as the natural "tell me more" companion to the trimmed Owner Brief.
>
> **Owner:** Paresh + Claude (planning conversation in session that shipped INT-014 Slices 1+2+3+3.1).
>
> **Don't start building until Q1–Q6 below are locked.** The point of this doc is to make the design conversation resumable.

---

## What we're building (one-liner)

A Glean-style natural-language chat over Vyara's commercial data: the owner / manager opens a chat surface and asks questions like "did we get payments from Surat Municipal?" or "how many leads closed in the last week?" and gets an instant, accurate, audit-trailed answer.

The product job is **lookups + aggregations on tap**, not AI judgment. The brief already handles executive judgment.

---

## Locked baseline (do not re-litigate)

1. **Tool-use agent pattern, NOT raw LLM-to-SQL.** The model picks which predefined tool to call. The tool runs a bounded query through RLS. If the data isn't reachable through a tool, the model literally cannot claim it. This is the single design choice that prevents "AI says ₹5L received from ABC when there's no row."
2. **Read-only v1.** No "send WhatsApp", "create task", "raise approval" from chat. Write actions come later or never.
3. **Mandatory "I don't have that" path** enforced at the tool layer. The model can't invent an answer when no tool covers the question.
4. **Tenant + role scoping at the tool layer**, not just the prompt. RLS still does its job; the tools sit on top.
5. **Cache by `(tenant_id, normalized_query)` for 5–10 min** so repeat questions in the same session = one Claude call.
6. **`chat_log` table** audited every message (tenant_id, user_id, query, tools_called, response_text, latency_ms, cost_inr_paise, created_at). Non-negotiable.
7. **Anthropic Sonnet for v1**, with a Haiku route for cheap Tier-1 lookups once we have measurement.

---

## Six open design questions (the decision points)

### Q1 — Where does the chat live in the UI?

| Option | Description | Tradeoff |
|---|---|---|
| (a) Floating button on every page | Bottom-right chat icon, expands to a side panel | Clutters every screen; on mobile competes with bottom-nav; but matches "ask while working" use case |
| (b) Sidebar panel on /owner only | Collapsible right rail on the Owner Dashboard | Narrow audience; harder to discover; matches admin-only investment |
| (c) Dedicated `/ask` page | Full-screen chat surface, sidebar link | Explicit destination; easier conversation UX; breaks "ask in flow" |
| (d) Cmd+K / Ctrl+K overlay | Keyboard shortcut from anywhere | Powerful, Linear-style; bigger build; needs robust palette; discoverability concern for non-power-users |

**My recommendation:** (a) floating button, admin-scoped for v1. Why: the use case Paresh described ("did we get payments?", "how many leads closed?") is incidental and conversational — happens while looking at something else. Cmd+K is the "right" answer for a power-user-heavy customer; Vyara/Mehul is not a Cmd+K user.

### Q2 — Who can use it?

| Option | Description | Tradeoff |
|---|---|---|
| (a) Admin only | Same scope as /owner | Cleanest; no role-mask handling |
| (b) Admin + managers | Sales Manager + Operations Manager roles | More users, still no sensitive-column risk |
| (c) Everyone, role-scoped | Sales engineers see their data, managers see their team's | Hardest — needs `maskRow` (PLAT-007) integration into the tool layer |

**My recommendation:** (a) admin only for v1. Open up after it's stable.

### Q3 — What kinds of questions does it answer?

| Tier | Examples | Reliability | Cost per question |
|---|---|---|---|
| Tier 1 — Lookups | "show me INV-2026-1006", "find Sterling Constructions", "status of Punyabhoomi project" | ~95% | Cheap (1 tool call, Haiku-suitable) |
| Tier 2 — Aggregations | "how many leads closed last week?", "total outstanding from Surat firms", "top 5 customers by ₹" | ~85% | Medium (1–2 tool calls, Sonnet) |
| Tier 3 — Reasoning | "which customers should I focus collections on?", "is GETCO worth keeping open?" | ~60–70%, fuzzy | High (multi-tool + judgment) |

**My recommendation:** Tier 1 + Tier 2 only in v1. Tier 3 is explicitly out of scope. The brief already does tier-3 executive judgment with citations. Chat is for facts.

### Q4 — How do we build the tools?

| Option | Description | Tradeoff |
|---|---|---|
| (a) Wrap existing read-models 1:1 | `getOwnerOverview`, `getCustomer360`, etc. become 5 tools | Fast to build; tools return huge JSON; high token cost; model has to navigate the blobs |
| (b) ~10 focused single-purpose tools | `find_firm`, `find_invoice`, `recent_payments_for_firm`, `overdue_invoices`, `leads_in_period`, `quotes_by_status`, `dispatches_in_window`, `field_visits_for_firm`, `top_debtors`, `pipeline_funnel` | More tools, but each returns a tight slice; cheaper per call; model picks the right tool faster |
| (c) Hybrid | Focused tools for the hot path, read-model tools for the long tail | Best of both worlds |

**My recommendation:** (b) ~10 focused tools. Read-models were designed to assemble *everything for a page*, not "the single answer to a single question." Build the 10 v1 tools by transcribing real questions Mehul asks for a week.

### Q5 — Multi-turn or single-turn?

| Option | Description | Tradeoff |
|---|---|---|
| (a) Single-turn | Each message independent | Cheap; predictable; "show me last month's" requires re-typing the entity |
| (b) Multi-turn with rolling window | Keep last 4 user + 4 assistant messages | Natural follow-up; bounded cost; some drift risk |
| (c) Multi-turn unbounded | Full conversation history | Best UX; cost runs away; drift accumulates over long sessions |

**My recommendation:** (b) multi-turn with 4-message rolling window. Follow-ups will happen ("how about last month?"); single-turn forces re-typing; unbounded explodes cost.

### Q6 — What does an answer look like?

| Option | Description | Tradeoff |
|---|---|---|
| (a) Pure text | "We received ₹3.2L from Sterling on 18 June via NEFT." | Simplest; loses richness |
| (b) Text + drill-through chip | Answer + `[Sterling Constructions →]` linking to Customer 360 | Matches brief redesign pattern; pushes back to lists |
| (c) Text + embedded micro-card | Answer + a small card showing the actual receipt row | Richer; "I see it for myself"; matches brief's "money first" honesty |
| (d) Text + small table for aggregations | "12 leads closed last week." + a table | Natural for tier-2 questions |

**My recommendation:** (c) + (d) combined — embedded micro-cards for lookups, small tables for aggregations. Chips alone push the user out of the chat (defeats "ask in flow"). The brief proved embedded richness works.

---

## Recommended v1 summary

> **Floating chat button, admin-only**, opens a side panel from anywhere. **~10 focused, single-purpose, read-only tools** wrapping bounded queries. **Tier 1 + Tier 2 only — no judgment questions.** **Multi-turn with a 4-message rolling window.** **Answers as text + embedded micro-cards (and small tables for aggregations).** **`chat_log` table audited every message.** Mandatory "I don't have that" enforced at the tool layer. Cache by `(tenant_id, normalized_query)` for 5 min. Sonnet at first, Haiku route for Tier-1 once measured.
>
> **Effort:** ~2 weeks. 1 week for the tool + agent infrastructure (Anthropic SDK, tool schemas, tool implementations, audit table, RLS-aware query wrappers), 1 week for the UI (floating button, panel, message list, micro-card components, example-questions onboarding, error states).

---

## Honest risks to plan for

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Cost** | ~₹2–5/message at Sonnet. 30 q/day = ~₹3,000/month for one user | Cache; route Tier 1 to Haiku once measured; per-tenant cap; show cost in chat_log |
| **Latency** | 2–4 sec response is fine for chat; would fail for Cmd+K (<500ms) | Tilts Q1 toward floating button over Cmd+K |
| **Discoverability** | Mehul won't read docs. He needs example questions visible the first time he opens the panel | "Try: 'did we get payments from X' or 'how many leads closed this week'" inline in empty state |
| **Trust collapse on first hallucination** | If the chat hallucinates one wrong ₹ figure on Mehul's second query, he won't trust it again | "I don't have that" must be obviously preferable to guessing. Log every answer. Show data source on hover. |
| **Customer-#2 readiness** | Tools should reference data-driven masters, not hardcoded enums | Build tools to consume the same masters the UI does (task_type_master, activity_type_master, relationship_type_master, lead_loss_reason, etc.). No "if status=paid" — `find_paid_invoices` queries the same way the UI does |

---

## Foundational audit (run BEFORE coding — placeholder for the v1 sprint)

When we kick this off, run the standard seven questions from CLAUDE.md:

1. **Data inputs** — which entities does each tool read? (Already mapped: 10 tools cover firm/contact/lead/quote/project/order/invoice/receipt/dispatch/field_visit.)
2. **Data outputs** — none, read-only.
3. **Master dependencies** — every tool should resolve labels via the masters (relationship_type, lead_stage, lead_loss_reason, task_type, activity_type, expense_category, dispatch_stage, collection_stage).
4. **CRUD completeness** — read-only, N/A.
5. **Action ↔ UI symmetry** — every chat answer should be reachable by a manual UI path (Customer 360, /collections, etc.) so the user can validate.
6. **Cross-module coupling** — tools are tenant-bounded reads; no writes; per Constitution #0 ✅.
7. **Customer-#2 readiness** — pass if tools resolve enums via masters and never hardcode "if currency = INR" type checks.

---

## Cross-references

- Blueprint `INT-009` row in [`PRODUCT-BLUEPRINT-v3.md`](./PRODUCT-BLUEPRINT-v3.md) §11.8 — keep this doc in sync if the row changes
- Brief redesign that surfaced this need: [`BUILD-LOG.md`](./BUILD-LOG.md) entry "Owner Dashboard — INT-014 Slice 3.1" (`6efafd5`)
- Foundational-audit discipline: [CLAUDE.md](../CLAUDE.md) "Foundational audit — run BEFORE building any feature"
- Constitution principles that apply: #0 (capability platform), #6 (AI assists humans), #7 (one source of truth), #8 (auditable changes)

---

## What needs to happen next

1. **Paresh decides Q1–Q6.** That's the only blocking step before any code.
2. After decisions land, **update this doc to mark decisions [LOCKED]** and remove the open-question table; replace with a "v1 spec" section.
3. **Foundational audit** with the actual chosen tool list.
4. **Slice 1 of INT-009 v1** = audit table + 3-4 tier-1 tools + the floating button + side panel + empty state, no aggregations or tables yet. Walk that end-to-end before adding more tools (per the "build in phases, walk end-to-end" feedback memory).
5. **Slice 2 of INT-009 v1** = aggregation tools + tables. Walk again.
6. **Slice 3 of INT-009 v1** = polish + cost routing (Haiku for Tier 1) + example-questions onboarding.
