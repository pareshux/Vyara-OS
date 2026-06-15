-- ============================================================
-- 0001_baseline.sql
-- Cross-cutting foundation: tenant, auth extensions, audit_log
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fuzzy global search

-- ─── Tenant ───────────────────────────────────────────────────────────────────

CREATE TABLE tenant (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'starter',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── JWT claim helpers (public schema — auth schema is restricted on hosted Supabase) ──
-- These read custom claims that auth.custom_access_token_hook writes into the JWT.
-- Create the hook function separately in the Dashboard SQL editor (see docs/setup-notes.md).

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_actor_role() RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'role';
$$ LANGUAGE sql STABLE;

-- ─── Audit log (append-only) ──────────────────────────────────────────────────

CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenant(id),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  action       TEXT NOT NULL,
  actor_id     UUID REFERENCES auth.users(id),
  actor_role   TEXT,
  old_value    JSONB,
  new_value    JSONB,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No UPDATE/DELETE — enforced by RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON audit_log
  FOR ALL USING (tenant_id = current_tenant_id());

-- Only INSERT allowed; no updates or deletes even by service role in app code
CREATE POLICY "append_only_insert" ON audit_log
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- Revoke UPDATE/DELETE from all roles (belt + suspenders)
REVOKE UPDATE, DELETE ON audit_log FROM authenticated;

CREATE INDEX audit_log_entity_idx ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX audit_log_actor_idx  ON audit_log (tenant_id, actor_id, created_at DESC);
