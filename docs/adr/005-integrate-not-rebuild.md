# ADR-005 — Integrate, Don't Rebuild (Tally / Production ERP)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Vyara's customers already run Tally for accounting and may run ERPs (SAP, custom) for production planning. Two possible stances:

1. **Replace** — build Vyara accounting and production modules, migrate customers off existing systems.
2. **Integrate** — Vyara owns the revenue and project layer; existing systems own accounting and manufacturing. Sync the data Vyara needs.

Replacing Tally is a multi-year project, carries migration risk, and is a hard enterprise sell. Production planning is out of scope for a revenue OS.

## Decision

Integrate, not rebuild.

- **Tally:** Invoice and payment data flows into Vyara via a Tally push connector (Tally has an XML export + webhook capability) or a lightweight Tally agent installed on the customer's server. Vyara stores a read-only snapshot of invoices/receipts sufficient for the collections workflow. Vyara does not write back to Tally.
- **Production ERP:** Vyara reads production status (order placed, production started, dispatched) via a read-only API or daily sync. Production planning remains in the customer's system.

Integration events: `invoice.synced`, `dispatch.completed`.

## Consequences

**Good:** Ships faster, no accounting risk, easier customer adoption (existing systems stay).

**Accepted trade-offs:**
- Sync lag (Tally data may be hours old in Vyara). Acceptable for collections; not acceptable for real-time payment tracking → mitigate with manual payment entry as override.
- Tally connector fragility (different Tally versions, firewall issues). Mitigation: design sync as idempotent with manual override; treat sync as best-effort enrichment, not the sole source of truth.
- Scope boundary must be explicit in customer contracts: Vyara is not an accounting system.
