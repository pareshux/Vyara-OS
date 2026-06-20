-- 0041_quotation_lead_link.sql
-- Capability: Revenue
--
-- Allows quotes to be created from the Lead stage, before a project exists.
-- project_id becomes nullable; lead_id is added as an optional FK.
-- On lead win, the winsLead action sets project_id on all orphaned lead quotes.

-- 1. Make project_id nullable
ALTER TABLE quotation
  ALTER COLUMN project_id DROP NOT NULL;

-- 2. Add lead_id FK
ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES lead(id);

-- 3. Index for the lead Quotes tab query
CREATE INDEX IF NOT EXISTS quotation_lead_idx
  ON quotation (lead_id)
  WHERE deleted_at IS NULL;

-- 4. Constraint: a quotation must have at least one of project_id or lead_id
ALTER TABLE quotation
  ADD CONSTRAINT quotation_must_have_context
  CHECK (project_id IS NOT NULL OR lead_id IS NOT NULL);
