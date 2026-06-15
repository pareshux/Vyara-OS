# What We Deliberately Did NOT Build in v1

This list exists to prevent scope creep. Every item below was considered and deferred with a specific rationale.
When pressure arises to add one, reference this document.

---

## Workflow Engine

| Not built | Why deferred |
|---|---|
| Visual drag-and-drop workflow editor | Config JSON edited in Settings UI is sufficient for v1; WYSIWYG builder adds 3–4 weeks for marginal gain |
| Complex expression guard type (CEL/JSONLogic) | Three guard types (required_fields, required_documents, approval_granted) cover all known Vyara v1 cases |
| Multi-approver voting / quorum in engine | Approvals module handles this separately; engine just checks `approval_granted` guard |
| In-flight instance migration (when template changes) | Version the template; new projects get new version. Running projects stay on old version until closed |
| Parallel/split stages (fork/join) | All Vyara pipelines are linear with back-flow; parallelism not needed |
| Webhook action with auth (OAuth, signed headers) | Simple POST sufficient for v1 integrations; add later |
| Stage rollback (undo last transition) | Back-flow transitions ("Need Clarification → Tracking") cover the need without mutation of history |

## Modules / Features

| Not built | Why deferred |
|---|---|
| Form Builder UI (custom fields with sections, validation, conditional logic) | `custom_fields JSONB` on project covers v1 needs; full builder is Phase 2 when second vertical onboards |
| Document Intelligence OCR / extraction | Phase 2; Phase 1 is capture + link only. OCR on messy BOQs needs human-validation step to be safe |
| AI skills beyond voice-note transcription | Phase 2. Only one skill (voice note → activity) has a committed owner/budget for v1 |
| Tender intake module | Phase 3 — low volume, high complexity, not the primary segment for first customer |
| Design Services workflow | Phase 3 |
| Repeat-business engine | Phase 3 |
| Dealer portal (self-service) | Phase 2; Phase 1 is internal dealer management only |
| SSO (SAML/OIDC) | Phase 2; username/password sufficient for first customers |
| Multi-currency | Phase 2; all v1 customers are INR |
| WhatsApp Business API integration | Phase 2; Phase 1 uses manual WhatsApp links / copy-paste templates |
| AI Voice collections (Sarvam) | Phase 2; dunning via WhatsApp templates is Phase 1 |

## Infrastructure

| Not built | Why deferred |
|---|---|
| Separate microservices | ADR-001; extract at proven scale, not before |
| Multi-region Supabase | Single region (ap-south-1) sufficient for India-only v1 |
| Dedicated search infrastructure (Elasticsearch/Typesense) | Postgres FTS + pg_trgm covers v1 scale; migrate when query latency data demands it |
| Event sourcing / full CQRS | Append-only `audit_log` + `workflow_transition_log` provides auditability without full ES complexity |
| Granular Inngest fan-out (per-tenant queues) | Single Inngest app sufficient; shard by tenant when throughput demands it |

---

**Discipline check:** Before adding any item from this list, ask:
1. Does a specific paying customer need it in the next sprint?
2. Can the need be met by the simpler thing already built?
3. What existing feature does NOT ship if we build this instead?
