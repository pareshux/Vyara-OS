# ADR-004 — Multi-Tenancy via Postgres RLS

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Vyara-OS is a SaaS product: multiple manufacturing companies (tenants) share one database. Data isolation between tenants is a hard security requirement. Options considered:

1. **Separate schemas per tenant** — clean isolation but complex migrations, no cross-tenant analytics, hard to scale past ~50 tenants.
2. **Separate databases per tenant** — maximum isolation, operational nightmare, expensive.
3. **Single schema + `tenant_id` column + RLS** — simple application code, Postgres enforces isolation, scales to thousands of tenants.

## Decision

Single Supabase project. Every tenant-scoped table carries `tenant_id UUID NOT NULL`. Postgres Row-Level Security policies enforce: `tenant_id = auth.tenant_id()`.

`auth.tenant_id()` is a SQL function that reads `tenant_id` from the JWT claim, injected at login time by the auth service. This means isolation is enforced at the DB layer—no application code can accidentally leak rows.

The audit log's JWT-based isolation also protects it: a tenant's users can only read their own audit trail.

## Consequences

**Good:** Tenant isolation is correct-by-default. Application services don't need to add `WHERE tenant_id = ?` to every query—RLS handles it. Onboarding a new tenant = inserting a row in `tenant`, no schema changes.

**Accepted trade-off:** Cross-tenant queries (e.g. platform-wide analytics for Vyara operators) require a service-role client that bypasses RLS—used only in internal admin tooling, never in customer-facing APIs.

**Non-negotiable:** Margin, cost, and discount data are in the same DB but protected by both RLS (tenant) and RBAC (role within tenant). Field engineers must never see margin data—this is enforced in the application RBAC layer on top of RLS.
