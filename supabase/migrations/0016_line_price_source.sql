-- ============================================================
-- 0016_line_price_source.sql — Slice 3.5 Step 4
--
-- Add nullable price_list_entry_id snapshot FK to quotation_line and
-- sales_order_line. Informational only — unit_price stays the
-- authoritative number (snapshot principle #8). The FK lets a reviewer
-- later trace "what list did this price come from?" without breaking
-- if the entry is edited or deleted later (ON DELETE SET NULL).
--
-- Wiring (the actions calling get_active_price + writing the FK) lands
-- in the same step's app code.
-- ============================================================

ALTER TABLE quotation_line
  ADD COLUMN IF NOT EXISTS price_list_entry_id UUID REFERENCES price_list_entry(id) ON DELETE SET NULL;

ALTER TABLE sales_order_line
  ADD COLUMN IF NOT EXISTS price_list_entry_id UUID REFERENCES price_list_entry(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotation_line_price_source_idx
  ON quotation_line (price_list_entry_id) WHERE price_list_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_order_line_price_source_idx
  ON sales_order_line (price_list_entry_id) WHERE price_list_entry_id IS NOT NULL;
