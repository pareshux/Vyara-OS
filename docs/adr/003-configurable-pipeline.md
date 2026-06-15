# ADR-003 — Configurable Pipeline via Template (not per-segment code)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Vyara operates across six sales segments: Architect, Dealer, Tender, Retail, Government, Corporate. Each has a distinct journey (different stages, required documents, SLAs, approvals). The naive implementation is one codebase per segment—six state machines, six Kanban boards, six sets of guard logic.

This creates: duplicate code, impossible cross-segment dedup, broken cross-segment reporting, and a maintenance tax every time a stage name changes.

## Decision

One `project` entity. One workflow engine. One Kanban component. Segment determines which `pipeline_template` is loaded at runtime—the config, not the code, changes per segment.

The `workflow_template` table stores the full stage/transition/guard/action config as JSONB. The engine (`modules/shared/workflow/engine.ts`) is segment-agnostic; it reads whatever config is loaded.

`project.segment → workflow_template (segment filter) → stages / transitions / guards`

Templates are seeded from `config/workflow-templates/*.json`. Tenants can override system templates with their own.

## Consequences

**Good:** Adding a new segment = adding a JSON file + seeding a row. Zero new code. Cross-segment reporting trivial (same `project` table). One Kanban board handles all segments.

**Accepted trade-off:** The engine must be expressive enough to encode all segment differences via config. Guard types in v1 (required_fields, required_documents, approval_granted) cover all known Vyara cases. If a future segment needs conditional logic the engine can't express, we add a new guard type—not a new engine.

**Boundary:** The template config is the product manager's interface, not the developer's. Non-technical admins should eventually be able to edit templates in the Settings UI without a deploy.
