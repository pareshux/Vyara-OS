-- ============================================================
-- 0052_tenant_company_info.sql — Phase 7d (Vyara-isms in PDFs)
--
-- User's morning walk: "lot of PDFs has vyara tiles". Confirmed in
-- app/(print)/quotes/[id]/boq/page.tsx + dealer-portal welcome +
-- collections WhatsApp dunning default. All four references
-- hardcoded "Vyara Tiles" / "Vyara, Gujarat" / "24AABCV1234F1Z5".
--
-- This migration adds tenant.settings.company.{address, city, state,
-- gstin} for both Vyara + Raj. Consumer code (BOQ print page, dunning
-- message default, dealer portal welcome) reads from tenant + settings
-- instead of hardcoding.
--
-- Settings JSONB has passthrough on the existing TenantSettingsSchema
-- (lib/tenants/settings-schema.ts), so the new keys round-trip
-- through the Zod validator cleanly without schema changes.
--
-- Reverse: UPDATE tenant SET settings = settings - 'company' WHERE slug IN (...);
-- ============================================================

UPDATE tenant
SET settings = jsonb_set(
  settings,
  '{company}',
  '{"address": "Vyara, Gujarat", "city": "Vyara", "state": "Gujarat", "gstin": "24AABCV1234F1Z5"}'::jsonb
)
WHERE slug = 'vyara-tiles';

UPDATE tenant
SET settings = jsonb_set(
  settings,
  '{company}',
  '{"address": "Vapi, Gujarat", "city": "Vapi", "state": "Gujarat", "gstin": "24AABCR9999X1Z8"}'::jsonb
)
WHERE slug = 'raj-avinsys';
