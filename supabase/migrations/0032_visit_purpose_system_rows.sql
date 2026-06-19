-- ============================================================
-- 0032_visit_purpose_system_rows.sql — Sprint 2.1c (Blueprint FLD-009)
--
-- Broadens the visit_purpose master from sales-rep-only to the full
-- cross-industry vocabulary the Field Operations capability needs.
-- Same mechanism we used for task / activity / relationship type
-- masters (0029, 0031): tenant_id NULL = system row visible to all
-- tenants; tenant rows override on the same code.
--
-- Naming: the Blueprint reframes this as "field_activity_type" but
-- we keep the table name `visit_purpose` to avoid renaming the
-- `field_visit.visit_purpose_id` FK column and the existing call
-- sites. The conceptual mapping lives in the Blueprint; the data
-- model stays.
--
-- Changes:
--   1. ALTER tenant_id to allow NULL (= system row)
--   2. ADD category column for industry-pack filtering
--   3. Update RLS — read system OR own, write own only
--   4. Split unique constraints (system + tenant)
--   5. Seed 16 system rows across 7 categories
--
-- Existing Vyara tenant rows are not modified — the tenant's UI
-- keeps showing exactly what it shows today. New tenants
-- onboarded after this migration see the 16 system rows by
-- default and can disable / extend per their industry.
-- ============================================================


-- ─── 1. Allow NULL tenant_id ──────────────────────────────────
-- Today tenant_id is NOT NULL — all visit_purpose rows belong to
-- a specific tenant. Relax to let system rows exist.

ALTER TABLE visit_purpose ALTER COLUMN tenant_id DROP NOT NULL;


-- ─── 2. Add category column ───────────────────────────────────
-- Industry-pack filtering hint: a service-business tenant might
-- show only category IN ('service','installation','audit'); a
-- distribution tenant might show only category IN ('sales','collection').

ALTER TABLE visit_purpose ADD COLUMN IF NOT EXISTS category TEXT;


-- ─── 3. Update RLS ────────────────────────────────────────────
-- Old policy was tenant_isolation. Replace with the system-or-own
-- pattern used by the other type masters.

DROP POLICY IF EXISTS "tenant_isolation" ON visit_purpose;

CREATE POLICY "read_system_or_own" ON visit_purpose
  FOR SELECT
  USING ((tenant_id IS NULL OR tenant_id = current_tenant_id()) AND deleted_at IS NULL);

CREATE POLICY "tenant_write" ON visit_purpose
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_update" ON visit_purpose
  FOR UPDATE
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);


-- ─── 4. Update unique constraints ─────────────────────────────
-- Old: unique (tenant_id, code). New: split into a per-tenant
-- unique and a system-level unique, both filtered to non-deleted.

DROP INDEX IF EXISTS visit_purpose_code_uniq;

CREATE UNIQUE INDEX visit_purpose_system_uniq
  ON visit_purpose (code)
  WHERE tenant_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX visit_purpose_tenant_uniq
  ON visit_purpose (tenant_id, code)
  WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;


-- ─── 5. Seed system rows ──────────────────────────────────────
-- 16 codes across 7 categories. Lowercase to distinguish from the
-- Vyara tenant's existing UPPERCASE codes (INTRO, SITE, …) so
-- there's no collision and admins can tell at a glance which
-- rows are system vs tenant in the (future) admin UI.

INSERT INTO visit_purpose (tenant_id, code, label, category, sort_order) VALUES
  -- Sales motion
  (NULL, 'sales_visit',         'Sales visit',                'sales',        10),
  (NULL, 'site_survey',         'Site survey',                'sales',        20),
  (NULL, 'demo',                'Product demonstration',      'sales',        30),
  (NULL, 'negotiation',         'Negotiation / commercial',   'sales',        40),
  -- Finance
  (NULL, 'collection_visit',    'Collection visit',           'finance',      50),
  -- Service motion
  (NULL, 'complaint_visit',     'Complaint visit',            'service',      60),
  (NULL, 'service_call',        'Service call',               'service',      70),
  (NULL, 'breakdown_response',  'Breakdown response',         'service',      80),
  (NULL, 'amc_visit',           'AMC scheduled visit',        'service',      90),
  -- Installation / project execution
  (NULL, 'installation',        'Installation',               'installation',100),
  (NULL, 'commissioning',       'Commissioning',              'installation',110),
  (NULL, 'handover',            'Project handover',           'installation',120),
  -- Audit / quality / compliance
  (NULL, 'inspection',          'Inspection',                 'audit',       130),
  (NULL, 'audit',               'Audit',                      'audit',       140),
  -- Training / customer success
  (NULL, 'training',            'Customer training',          'training',    150),
  -- Catch-all
  (NULL, 'other',               'Other',                      'other',       900);
