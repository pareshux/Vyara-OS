-- ============================================================
-- 0044_owner_brief_entity_kind.sql — INT-014
--
-- Extend ai_extraction.entity_kind to include 'owner_brief' —
-- the AI-generated executive summary rendered on the Owner
-- Dashboard (/owner). Same caching contract as firm_brief:
-- one row per tenant, refreshed every 6h, source_storage_path
-- shaped as `inline_text:owner_brief:<tenant_id>`.
-- ============================================================

ALTER TABLE ai_extraction DROP CONSTRAINT IF EXISTS ai_extraction_entity_kind_check;
ALTER TABLE ai_extraction ADD CONSTRAINT ai_extraction_entity_kind_check
  CHECK (entity_kind IN (
    'dispatch_diary', 'invoice_photo', 'voice_quote',
    'voice_sample_outcome', 'whatsapp_ptp', 'playground',
    'business_card',
    'odometer_photo', 'voice_visit_note',
    'visit_prep_brief',
    'team_day_summary',
    'firm_brief',
    -- INT-014: executive summary on Owner Dashboard
    'owner_brief'
  ));
