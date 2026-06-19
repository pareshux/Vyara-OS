-- ============================================================
-- 0028_tenant_features.sql — Sprint 1.1 (Platform foundations)
--
-- Per-tenant feature toggles. The smallest abstraction that
-- unblocks Customer #2 differentiation without paying for a
-- full Module Registry.
--
-- Semantics:
--   - Absence of a row → use the code-level default (FEATURE_DEFAULTS
--     in lib/auth/features.ts). Default is "enabled" so an
--     un-configured tenant gets all features (backwards-compat).
--   - Row with is_enabled=false → explicit OFF for this tenant.
--   - config JSONB → per-tenant tuning beyond the on/off bit
--     (e.g. {"auto_approve_threshold": 1000} for field_sales).
--
-- Not a "master" in the classic sense (no CRUD lifecycle, no
-- soft-delete). Pure config. Admin UI lands when Customer #2
-- onboarding actually needs it.
-- ============================================================

CREATE TABLE tenant_feature (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

ALTER TABLE tenant_feature ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON tenant_feature
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX tenant_feature_code_uniq
  ON tenant_feature (tenant_id, code);


-- ─── Seed: Vyara tenant — everything ON ─────────────────────
-- Vyara uses every module today. We seed the rows explicitly so
-- admins see the known features in (the future) admin UI. The
-- helper would assume-enabled anyway if rows were missing, so
-- this is informational, not load-bearing.

INSERT INTO tenant_feature (tenant_id, code, is_enabled, notes) VALUES
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_field_sales',   true, 'Field sales / visit module'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_dealer_portal', true, 'Dealer-role portal + dealer orders'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_collections',   true, 'AR / collections / dunning'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_tally_sync',    true, 'Tally invoice + receipt sync'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_ai_surfaces',   true, 'Photo / voice extraction across modules'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_inventory',     true, 'Operational inventory (stock, reservations, transfers)'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_warehouse',     true, 'Warehouse tablet view'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_dispatches',    true, 'Dispatch / logistics module'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_finance',       true, 'Finance / Tally dashboards'),
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'enable_daily_digest',  true, 'AI-generated daily digest on /dashboard');
