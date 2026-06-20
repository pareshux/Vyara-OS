-- ============================================================
-- 0038_ai_team_day_summary.sql
--
-- Extend ai_extraction.entity_kind to include 'team_day_summary' —
-- the AI-generated daily team digest rendered on /field/team for
-- the sales head. Same caching pattern as visit_prep_brief
-- (source_storage_path key = inline_text:team_day_summary:<date>).
-- ============================================================

ALTER TABLE ai_extraction DROP CONSTRAINT IF EXISTS ai_extraction_entity_kind_check;
ALTER TABLE ai_extraction ADD CONSTRAINT ai_extraction_entity_kind_check
  CHECK (entity_kind IN (
    'dispatch_diary', 'invoice_photo', 'voice_quote',
    'voice_sample_outcome', 'whatsapp_ptp', 'playground',
    'business_card',
    'odometer_photo', 'voice_visit_note',
    'visit_prep_brief',
    'team_day_summary'
  ));
