-- ============================================================
-- 0027_ai_entity_kind_extend.sql — Field Sales Step 5
--
-- Extend ai_extraction.entity_kind to include the new field-sales
-- surfaces (odometer_photo, voice_visit_note) plus the existing
-- business_card surface that was added to the TS enum but never
-- got into the CHECK constraint.
-- ============================================================

ALTER TABLE ai_extraction DROP CONSTRAINT IF EXISTS ai_extraction_entity_kind_check;
ALTER TABLE ai_extraction ADD CONSTRAINT ai_extraction_entity_kind_check
  CHECK (entity_kind IN (
    'dispatch_diary', 'invoice_photo', 'voice_quote',
    'voice_sample_outcome', 'whatsapp_ptp', 'playground',
    'business_card',
    -- Field sales (Step 5)
    'odometer_photo', 'voice_visit_note'
  ));
