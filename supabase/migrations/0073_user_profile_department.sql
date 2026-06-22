-- Capability: Platform
-- Adds department + job_title columns to user_profile so sidebar nav
-- can be filtered per persona (Procurement Manager vs Accounts Manager
-- both have role='manager' but should see different sidebars).
--
-- Department drives:
--   1. Sidebar nav filtering (which links the user sees)
--   2. Default landing route after sign-in
--   3. Persona attribution on demo data
--
-- This is additive — existing rows get NULL which the sidebar treats
-- as "show full nav" (backwards-compat with the single-admin tenants).

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS job_title  TEXT;

COMMENT ON COLUMN user_profile.department IS
  'Functional department: management, projects, field_sales, procurement, accounts, service. Drives sidebar filtering + landing route.';

COMMENT ON COLUMN user_profile.job_title IS
  'Human-readable title shown on profile + /demo persona cards. Example: "Procurement Manager".';

CREATE INDEX IF NOT EXISTS user_profile_department_idx
  ON user_profile (tenant_id, department)
  WHERE is_active = true;
