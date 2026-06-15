# ADR-001 — Modular Monolith over Microservices

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Vyara-OS spans seven domain modules and eight shared engines. The engineering team is small, the first vertical (tiles) is unproven in production, and the primary scaling concern is _feature velocity_, not throughput.

Microservices are the instinct when you see many modules. But premature decomposition into separately-deployed services forces: distributed transactions, inter-service auth, network-failure handling, duplicated CI/CD pipelines, and expensive observability—before you have any evidence of which modules actually need independent scaling.

## Decision

Build as a single deployable unit (one Next.js app + one Supabase project). Hard module boundaries are _architectural discipline_, not physical deployment boundaries.

Rules enforced by convention (and future linting):
1. Each module lives in `modules/<name>/`.
2. Cross-module access is via the module's `index.ts` public API only—never by importing from `domain/`, `services/`, or `events/` directly.
3. No module may query another module's DB tables. Data needed by another module is either: (a) passed via the calling service, or (b) read via a shared engine.
4. Domain events (Inngest) are the only acceptable async coupling between modules.

## Consequences

**Good:** Fast local development, no distributed-transaction complexity, trivial refactoring, single deployment, cheap observability.

**Accepted trade-off:** All modules scale together. If the collections module needs 10× CPU and projects needs 1×, we over-provision everything.

**Exit trigger:** When one module demonstrably needs independent scaling (evidence: sustained p95 latency degradation attributable to one module while others are idle), extract that module into a standalone service. The boundary is already clean.
