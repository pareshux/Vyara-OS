-- ============================================================
-- 0014_price_list.sql — Slice 3.5 Step 2: Price list master
--
-- Two tables (header + entries) + a resolution helper function.
-- Wiring into quote/order creation lands in Step 4.
--
-- Resolution order (most-specific first):
--   (segment match + region match) >
--   (segment match, region null) >
--   (region match, segment null) >
--   (segment null, region null = tenant default)
-- All filtered by effective_from <= today <= effective_to.
-- ============================================================


-- ─── 1. PRICE_LIST (header) ──────────────────────────────────────────────────
CREATE TABLE price_list (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  code            TEXT NOT NULL,
  label           TEXT NOT NULL,
  segment         TEXT
                    CHECK (segment IS NULL OR segment IN
                      ('architect', 'dealer', 'tender', 'retail', 'government', 'corporate', 'generic')),
  region          TEXT,
  currency        TEXT NOT NULL DEFAULT 'INR',
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

ALTER TABLE price_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON price_list
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX price_list_code_uniq
  ON price_list (tenant_id, code) WHERE deleted_at IS NULL;

-- O1-style: at most one default per tenant (among active)
CREATE UNIQUE INDEX price_list_default_uniq
  ON price_list (tenant_id) WHERE is_default = true AND is_active = true AND deleted_at IS NULL;

CREATE INDEX price_list_active_idx ON price_list (tenant_id, is_active, segment, region) WHERE deleted_at IS NULL;


-- ─── 2. PRICE_LIST_ENTRY (per-product price) ─────────────────────────────────
CREATE TABLE price_list_entry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  price_list_id   UUID NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES product(id),
  unit_price      NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  min_qty         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  valid_from      DATE,
  valid_to        DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

ALTER TABLE price_list_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON price_list_entry
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Tiered pricing: same (list, product) allowed with different min_qty
CREATE UNIQUE INDEX price_list_entry_tier_uniq
  ON price_list_entry (price_list_id, product_id, min_qty);

CREATE INDEX price_list_entry_lookup_idx
  ON price_list_entry (price_list_id, product_id, min_qty DESC);


-- ─── 3. get_active_price() — resolution helper ──────────────────────────────
-- Returns the unit price for a product, picking the most-specific
-- matching active price list and the highest-min_qty entry that
-- still fits the requested quantity. Returns NULL when no match.

CREATE OR REPLACE FUNCTION get_active_price(
  p_tenant   UUID,
  p_product  UUID,
  p_segment  TEXT,
  p_region   TEXT,
  p_qty      NUMERIC
) RETURNS TABLE (
  unit_price       NUMERIC,
  price_list_id    UUID,
  price_list_label TEXT,
  entry_id         UUID
)
LANGUAGE sql STABLE AS $$
  WITH list_match AS (
    SELECT
      pl.id,
      pl.label,
      pl.is_default,
      -- Specificity score: higher = more specific
      CASE
        WHEN pl.segment IS NOT NULL AND pl.region IS NOT NULL AND pl.segment = p_segment AND pl.region = p_region THEN 4
        WHEN pl.segment IS NOT NULL AND pl.segment = p_segment AND pl.region IS NULL THEN 3
        WHEN pl.region  IS NOT NULL AND pl.region  = p_region  AND pl.segment IS NULL THEN 2
        WHEN pl.segment IS NULL AND pl.region IS NULL THEN 1
        ELSE 0
      END AS specificity
    FROM price_list pl
    WHERE pl.tenant_id = p_tenant
      AND pl.is_active = true
      AND pl.deleted_at IS NULL
      AND pl.effective_from <= CURRENT_DATE
      AND (pl.effective_to IS NULL OR pl.effective_to >= CURRENT_DATE)
  ),
  filtered AS (
    SELECT * FROM list_match WHERE specificity > 0
  ),
  best_list AS (
    SELECT id, label
    FROM filtered
    ORDER BY specificity DESC, is_default DESC, id
    LIMIT 1
  )
  SELECT
    e.unit_price,
    bl.id   AS price_list_id,
    bl.label AS price_list_label,
    e.id    AS entry_id
  FROM best_list bl
  JOIN price_list_entry e ON e.price_list_id = bl.id AND e.product_id = p_product
  WHERE e.min_qty <= COALESCE(p_qty, 0)
    AND (e.valid_from IS NULL OR e.valid_from <= CURRENT_DATE)
    AND (e.valid_to   IS NULL OR e.valid_to   >= CURRENT_DATE)
  ORDER BY e.min_qty DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_active_price TO authenticated;


-- ─── 4. SEED — Vyara default price list with all 10 SKUs at MRP ─────────────
-- Tenant-default list (no segment, no region) so it acts as the fallback for
-- everyone until segment-specific lists are added.

INSERT INTO price_list (id, tenant_id, code, label, segment, region, is_default, notes) VALUES
  ('b1000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'DEFAULT_2026', 'Default — 2026', NULL, NULL, true,
   'Tenant-default price list; covers all 10 SKUs at MRP. Add segment-specific or region-specific lists to override.');

-- Snapshot every active product's MRP into the default list
INSERT INTO price_list_entry (tenant_id, price_list_id, product_id, unit_price, min_qty, notes)
SELECT
  p.tenant_id,
  'b1000000-0000-0000-0000-000000000001'::uuid,
  p.id,
  COALESCE(p.mrp, p.base_price, 0),
  0,
  'Initial seed from product.mrp'
FROM product p
WHERE p.tenant_id = 'a1111111-1111-1111-1111-111111111111'::uuid
  AND p.deleted_at IS NULL
  AND p.is_active = true;
