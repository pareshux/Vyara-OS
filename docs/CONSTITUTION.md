# Vyara OS — Product Constitution

> **Read this first, every session, before any other instruction.**
> Vyara OS is a project-centric Manufacturing Revenue & Project OS for Vyara Tiles — and the foundation of a future vertical-SaaS platform for made-to-order building-materials manufacturers. This document governs every architectural and product decision. Its purpose is to prevent drift across long sessions and multiple contributors. When a request conflicts with a principle here, surface the conflict rather than silently overriding it.

---

## The Ten Principles (in priority order)

**1. The Project is the spine.**
The system is organised around the Project. It is the central object everything else relates to.

**2. Commercial transactions and interactions belong to a Project.**
Quotes, samples, orders, dispatches, invoices, activities, and complaints link to a project. *Masters and parties — products, price lists, dealers, employees, territories — exist independently and are **referenced**, not owned, by projects.* Do not force reference data to belong to a project.

**3. Every core business object carries the common spine.**
Project, contact, quote, order, sample, dispatch, complaint, etc. each support: **Timeline · Documents · Tasks · Comments · Activities · Notifications · Audit · AI.** *Reference/master data does not — a price list has no task list or AI panel.*

**4. Everything configurable.**
Pipelines, stages, rules, approvals, and templates are **data, not code.** One configurable workflow engine drives every pipeline and process (per-segment project journeys, quotes, samples, collections, complaints).

**5. Integrate, don't rebuild.**
Tally (accounts) and the production system are systems of record we **sync with, never replace.** Out of scope entirely: general ledger, inventory/warehouse management, production execution, HR/payroll.

**6. Right device for the user.**
Mobile-first for field sales engineers; desktop for management and inside sales; tablet for warehouse/dispatch. Design each tier for how that user actually works.

**7. AI assists; humans decide.**
No autonomous action where money or reputation is at stake. Every AI skill has a non-AI fallback and a human checkpoint before customer-facing output is sent.

**8. One source of truth.**
No duplicate data — reference, don't copy. *Exception: immutable snapshots, e.g. the price captured on a quotation line, which must not change when a price list later changes.*

**9. Every change is auditable.**
Append-only audit log. Nothing is silently mutated. Every state transition records who, when, and why.

**10. Simple beats clever.**
Build the minimum that serves Vyara's real pipelines. Hold clean module boundaries so future verticals (steel, cement, paint) slot in without a rewrite. Over-abstraction before shipping the first vertical is the primary risk.

---

## Foundational Invariants (non-negotiable)

- **Multi-tenant from day one:** `tenant_id` on every table, even while single-tenant. Supabase RLS enforces tenant + territory isolation.
- **Project-centric data model:** one `project` entity + a configurable `pipeline_template` per segment (architect / dealer / tender / retail / government / corporate). **Never** build separate pipeline systems.
- **`project_stakeholder`** is the N–N join (project × contact × role: specifier / buyer / influencer).
- **Margin, cost, and discount are masked from field engineers.** Pricing approval is role-gated.
- **Modular monolith:** engines (Workflow, Document, AI, Communication, Approval, Reporting, Search, Notification, Forms) are **modules with hard boundaries** — no cross-module DB reads; communicate via services and events. They are not separately deployed services until real multi-tenant scale demands it.
- **Event-driven core** via Inngest; every meaningful state change emits a domain event carrying `tenant_id`, actor, timestamp, and correlation_id.

---

## Tech Stack (the agreed baseline)

Next.js · Supabase Postgres (Mumbai region, DPDP Act 2023 residency) · Vercel · Inngest (events) · Upstash Redis (cache) · AiSensy (WhatsApp) · Exotel → Plivo (telephony) · Sarvam AI (STT/TTS) · Claude Haiku + Sonnet (AI platform) · Razorpay (payments). Field app is offline-tolerant.

---

## Naming Conventions

`snake_case` · singular table names · foreign keys `<entity>_id` · join tables `<a>_<b>` · history tables `<entity>_history` · booleans `is_/has_` · timestamps `*_at`. Every table carries `tenant_id`, audit columns (`created_at/by`, `updated_at/by`), and soft-delete (`deleted_at`).
