-- ============================================================
-- 0036_ai_visit_prep_brief.sql — FO-8 (Blueprint FLD-013)
--
-- Extend ai_extraction.entity_kind to include 'visit_prep_brief' —
-- the AI-generated short context blob shown on the in-progress
-- visit card. Same logging contract as every other AI surface.
-- ============================================================

ALTER TABLE ai_extraction DROP CONSTRAINT IF EXISTS ai_extraction_entity_kind_check;
ALTER TABLE ai_extraction ADD CONSTRAINT ai_extraction_entity_kind_check
  CHECK (entity_kind IN (
    'dispatch_diary', 'invoice_photo', 'voice_quote',
    'voice_sample_outcome', 'whatsapp_ptp', 'playground',
    'business_card',
    'odometer_photo', 'voice_visit_note',
    -- FO-8: visit prep brief
    'visit_prep_brief'
  ));
