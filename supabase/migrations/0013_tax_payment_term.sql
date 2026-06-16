-- ============================================================
-- 0013_tax_payment_term.sql — Slice 3.5 Step 1
--
-- Two foundational masters + nullable FK columns on product, dealer,
-- firm. Both masters enforce a single is_default per tenant via
-- partial unique indexes (Decision O1).
--
-- Wiring (lookups from these masters) lands in Step 5 of this slice
-- — the FK columns added here are nullable so existing rows are
-- unaffected until then.
-- ============================================================


-- ─── 1. TAX_RATE ─────────────────────────────────────────────────────────────
CREATE TABLE tax_rate (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  rate_pct    NUMERIC(5,2) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE tax_rate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON tax_rate
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

-- Code unique per tenant (among active rows)
CREATE UNIQUE INDEX tax_rate_code_uniq
  ON tax_rate (tenant_id, code) WHERE deleted_at IS NULL;

-- O1: at most one default per tenant (among active rows)
CREATE UNIQUE INDEX tax_rate_default_uniq
  ON tax_rate (tenant_id) WHERE is_default = true AND is_active = true AND deleted_at IS NULL;

CREATE INDEX tax_rate_active_idx ON tax_rate (tenant_id, is_active, sort_order) WHERE deleted_at IS NULL;


-- ─── 2. PAYMENT_TERM ─────────────────────────────────────────────────────────
CREATE TABLE payment_term (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  code          TEXT NOT NULL,
  label         TEXT NOT NULL,
  days          INTEGER NOT NULL CHECK (days >= 0),
  description   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES auth.users(id),
  deleted_at    TIMESTAMPTZ
);

ALTER TABLE payment_term ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON payment_term
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX payment_term_code_uniq
  ON payment_term (tenant_id, code) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX payment_term_default_uniq
  ON payment_term (tenant_id) WHERE is_default = true AND is_active = true AND deleted_at IS NULL;

CREATE INDEX payment_term_active_idx ON payment_term (tenant_id, is_active, sort_order) WHERE deleted_at IS NULL;


-- ─── 3. NULLABLE FK COLUMNS ──────────────────────────────────────────────────
-- These plug the masters into the consumers. Wiring (actually reading
-- from them at quote/invoice time) lands in Steps 4 + 5.

ALTER TABLE product
  ADD COLUMN IF NOT EXISTS default_tax_rate_id UUID REFERENCES tax_rate(id);

ALTER TABLE dealer
  ADD COLUMN IF NOT EXISTS default_payment_term_id UUID REFERENCES payment_term(id);

ALTER TABLE firm
  ADD COLUMN IF NOT EXISTS default_payment_term_id UUID REFERENCES payment_term(id);


-- ─── 4. SEED: Vyara defaults ────────────────────────────────────────────────
-- 3 Indian GST rates relevant to construction/concrete products; 18% as
-- tenant default. 3 standard payment terms; Net 30 as tenant default.
-- All labeled with VT- prefix for clarity (same convention as other codes).

INSERT INTO tax_rate (id, tenant_id, code, label, rate_pct, is_default, sort_order, notes) VALUES
  ('a8000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'GST_5',   'GST 5%',   5.00,  false, 10,
   'For sand, aggregate, fly ash and select raw materials.'),
  ('a8000000-0000-0000-0000-000000000002'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'GST_12',  'GST 12%',  12.00, false, 20,
   'For certain construction materials and reduced-rate items.'),
  ('a8000000-0000-0000-0000-000000000003'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'GST_18',  'GST 18%',  18.00, true,  30,
   'Default for finished concrete products — pavers, kerbs, tiles.');

INSERT INTO payment_term (id, tenant_id, code, label, days, is_default, sort_order, description) VALUES
  ('a9000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'NET_15',  'Net 15',  15, false, 10,
   'Payment due within 15 days of invoice date.'),
  ('a9000000-0000-0000-0000-000000000002'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'NET_30',  'Net 30',  30, true,  20,
   'Default standard payment term: due within 30 days of invoice.'),
  ('a9000000-0000-0000-0000-000000000003'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'NET_45',  'Net 45',  45, false, 30,
   'Extended terms for established large-volume buyers.');
