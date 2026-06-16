-- ============================================================
-- 0017_invoice_tax_pt_snapshot.sql — Slice 3.5 Step 5
--
-- Add nullable snapshot FKs to invoice so we can trace "where did
-- this 18% / Net-30 come from?" without breaking when an admin
-- later edits or deactivates a master row. ON DELETE SET NULL.
--
-- Authoritative numbers stay on the invoice itself:
--   invoice.gst_pct  + invoice.gst_amount
--   invoice.payment_terms_days + invoice.due_date
-- The FKs are informational, set only when the saved values match
-- the master values at create time.
-- ============================================================

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS tax_rate_id      UUID REFERENCES tax_rate(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_term_id  UUID REFERENCES payment_term(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoice_tax_rate_idx
  ON invoice (tax_rate_id) WHERE tax_rate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_payment_term_idx
  ON invoice (payment_term_id) WHERE payment_term_id IS NOT NULL;
