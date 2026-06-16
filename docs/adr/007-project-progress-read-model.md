# ADR-007: Project-Progress Read-Model Boundary

**Status:** Accepted (2026-06-16)
**Supersedes:** none
**Related:** ADR-001 (Modular Monolith), Vision Blueprint § Scannable Project Tracking, design.md §5

## Context

The Scannable Project Tracking pattern (Vision Blueprint) needs the project header to combine state from five modules — Project, Document, Order, Dispatch, Invoice — into one assembled view that drives the macro stepper, sub-pipeline, gates, mini-bars, health pill, and next-action banner. The same assembled view also feeds the list-view status dot, dashboard, and mobile Today.

The initial wording in the Vision Blueprint described this as a read-model "subscribed to domain events, never reaches into another module's tables." A strict implementation of that wording would mean:

1. Inngest event handlers maintain a `project_progress_view` table, refreshed on every relevant event (`order.created`, `dispatch.delivered`, `invoice.synced`, `payment.received`, etc.).
2. UI components only read the projection table.

That's a meaningful build — event handlers, refresh logic, projection-staleness diagnostics, schema for the view, RLS, indexing, plus an out-of-band reconciler for missed events.

For Slice 2's scope and pace, we chose a **pragmatic implementation**: a single server-side function (`getProjectProgress(projectId)` and `getProjectProgressBatch(ids)`) that performs the cross-module reads itself and returns one assembled object. The consumer contract — what the UI components see — is identical to the event-sourced version. Upgrading to a projection table later is additive; consumers don't change.

## Decision

**All cross-module reads needed for the project header go ONLY through `lib/read-models/project-progress.ts`.**

This is the single boundary where reads of the following tables are sanctioned on the project's behalf:

- `sales_order`, `sales_order_line`
- `dispatch`, `dispatch_line`
- `invoice`, `invoice_line`
- `stock_reservation`
- `task` (for the next-action banner)
- `project_stage_history` (for stalled-too-long)
- `pipeline_stage`, `pipeline_substage`, `gate_requirement` (its own configuration)

Other UI surfaces that legitimately own one of these tables (e.g. `/orders`, `/dispatches`, `/invoices`, the project's Orders tab) continue to query their own tables directly — they're not "reading on the project's behalf."

## Consequences

- The header / list-dot / dashboard / mobile Today see one assembled object. They never query `sales_order`, `dispatch`, `invoice`, etc. directly. ✓
- New modules surface in the header by extending the assembler with one additional query — not by adding direct table reads in a UI component.
- The health rule, gate evaluator, mini-bar derivations, and next-action picker are computed in the read-model. A single source of truth across all project-progress consumers.
- If we later want event sourcing, only the inside of the assembler changes — every consumer keeps working unchanged.

## Review rule

Code reviews **must reject**:

- Any new `.from('sales_order')`, `.from('dispatch')`, `.from('invoice')`, `.from('stock_reservation')`, or their `_line` variants inside:
  - `components/projects/scannable-progress-header.tsx`
  - Any file matching `components/projects/*-progress-*.tsx` (forward-looking)
  - `app/(app)/projects/[id]/page.tsx` adding **new** cross-module reads beyond what's already there
  - `app/(app)/projects/page.tsx` or `projects-client.tsx` adding cross-module reads
  - Any future dashboard tile that shows project-progress information

- Any reimplementation of the health rule, gate evaluation, or mini-bar derivation outside the assembler.

Acceptable use of these tables remains:

- Their owning surfaces (`/orders/*`, `/dispatches/*`, `/invoices/*`)
- The project's Orders tab (legitimate cross-module display, not project-progress)
- New read-model assemblers for other large objects (Order, Invoice, Dealer headers) following the same pattern

## Mechanical enforcement (light)

An ESLint `no-restricted-syntax` override flags cross-module string-literal `.from('<table>')` calls inside the listed file globs. It's a guardrail, not a wall — a developer with a legitimate exception can document it inline. See `.eslintrc.json` `overrides` section.

## Upgrade path to event-sourced projection

When justified (multiple consumers, performance concerns, audit needs):

1. Add a `project_progress_view` table with a per-project row.
2. Add Inngest handlers for `order.*`, `dispatch.*`, `invoice.*`, `task.*` that refresh the relevant fields.
3. Add a nightly reconciler that recomputes from source-of-truth and flags drift.
4. Change `getProjectProgress` internals to read the view table; consumer contract unchanged.

Until then, the pragmatic assembler is the production implementation.
