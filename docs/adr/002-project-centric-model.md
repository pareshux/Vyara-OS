# ADR-002 — Project as Primary Aggregate Root

**Status:** Accepted  
**Date:** 2026-06-15

## Context

The Vyara value chain spans: Influence → Acquire → Convert → Execute → Deliver → Collect → Retain. Every entity in this chain—specification, quote, order, invoice, sample, task, document, complaint—belongs to a project. Architects specify a project. Quotes are made for a project. Invoices bill a project. Complaints arise from a project.

The alternative is to make each entity first-class independently (quote-centric, invoice-centric). This fragments the view: a single large project with multiple quotes, partial dispatches, and outstanding invoices becomes impossible to see as a unit.

## Decision

`project` is the primary aggregate root. All revenue-bearing entities carry a `project_id` FK. The project carries `segment`, `pipeline_template_id`, and `current_stage`—making it the natural home for the workflow instance.

Cross-entity views (unified timeline, document list, task board) resolve by joining on `project_id`. The project detail page (tabs: Overview · Stakeholders · Specifications · Samples · Quotes · Orders · Documents · Timeline · Tasks) is the primary UX surface.

## Consequences

**Good:** One search surface, one dedup point, correct cross-segment reporting, unified audit timeline per project.

**Accepted trade-off:** The project entity accumulates scope (tabs, relations). Manage this through UI composition (tabs) and DB discipline (FK + no denormalization), not by putting fields directly on `project` that belong in child tables.

**Implication for dealers:** Dealer replenishment orders are still `project`s (segment = 'dealer'), even though they're simpler. This is intentional: same pipeline engine, same search, same timeline—just a shorter template.
