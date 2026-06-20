-- ============================================================
-- 0043_firm_brief_entity_kind.sql — REL-011
--
-- Extend ai_extraction.entity_kind to include 'firm_brief' —
-- the AI-generated relationship health brief shown on the
-- Customer 360 Overview tab. Cached 24h per firm.
-- Same logging contract as visit_prep_brief and team_day_summary.
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
    -- REL-011: relationship intelligence brief per firm
    'firm_brief'
  ));
