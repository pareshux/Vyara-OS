-- ── Capability: Platform (Schema) ─────────────────────────────────────────────
-- Extends product.category, product.unit, and project.segment CHECK constraints
-- to support electrical contracting and future industry verticals.
-- Additive-only: existing values are preserved in every new constraint.

-- product.category: add electrical categories
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_category_check;
ALTER TABLE product ADD CONSTRAINT product_category_check
  CHECK (category IN (
    'Paver', 'Kerb', 'Step', 'Drain', 'Grass Paver', 'Cobble', 'Other',
    'Cable', 'Transformer', 'Panel', 'Switchgear', 'Civil', 'Hardware'
  ));

-- product.unit: add rmt (running metre abbreviation) and common engineering units
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_unit_check;
ALTER TABLE product ADD CONSTRAINT product_unit_check
  CHECK (unit IN (
    'sqft', 'sqm', 'nos', 'rft', 'running metre',
    'rmt', 'kg', 'MT', 'kVA', 'lot'
  ));

-- project.segment: add electrical and adjacent industry segments
ALTER TABLE project DROP CONSTRAINT IF EXISTS project_segment_check;
ALTER TABLE project ADD CONSTRAINT project_segment_check
  CHECK (segment IN (
    'architect', 'dealer', 'tender', 'retail', 'government', 'corporate', 'generic',
    'electrical', 'mechanical', 'civil'
  ));
