-- ============================================================
-- 0059_rtv_schema.sql — Return to Vendor (RTV) module — Phase 1γ
--
-- Blueprint: DEL-017 RTV completion.
--
-- Adds the reverse-receipt flow that complements GRN posting:
--   - return_to_vendor (header) + return_to_vendor_line tables
--   - Sequence + render_tenant_code-aware auto-number trigger
--   - next_code_sequence() RPC whitelist extended
--   - stock_movement.movement_type CHECK extended to admit
--     'return_to_vendor' so negative-direction movements can be
--     recorded against the RTV via the existing polymorphic
--     (related_entity_type, related_entity_id) pattern.
--   - Per-tenant code template seed (VT-RTV-* / RA-RTV-*)
--
-- State machine (consumer in lib/actions/return-to-vendor.ts):
--   draft → posted    (atomic: decrement po_line.qty_received,
--                      recompute parent PO status,
--                      write stock_movement(type='return_to_vendor')
--                      for product-linked lines)
--   draft → cancelled
--
-- Indian accounting note: an RTV represents the buyer's debit
-- note to the vendor for goods returned. The vendor responds with
-- a credit note. The RTV header carries optional
-- vendor_credit_note_no + date so the buyer can record the round
-- trip once the credit note arrives.
-- ============================================================

-- ─── 1. STOCK_MOVEMENT — extend movement_type CHECK ───────────

ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_movement_type_check;
ALTER TABLE stock_movement
  ADD CONSTRAINT stock_movement_movement_type_check
    CHECK (movement_type IN (
      'receipt',
      'direct_issue',
      'dispatch_issue',
      'transfer_in',
      'transfer_out',
      'adjustment_plus',
      'adjustment_minus',
      'sample_issue',
      'reservation_in',
      'reservation_out',
      'return_to_vendor'        -- new (P1γ)
    ));

COMMENT ON CONSTRAINT stock_movement_movement_type_check ON stock_movement IS
  'Allowed movement kinds. return_to_vendor added in 0059 for the RTV flow; '
  'paired with reason_code=''rtv'' and related_entity_type=''return_to_vendor''.';


-- ─── 2. RETURN_TO_VENDOR ──────────────────────────────────────

CREATE TABLE return_to_vendor (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  rtv_number               TEXT NOT NULL,
  grn_id                   UUID NOT NULL REFERENCES goods_receipt_note(id),
  po_id                    UUID NOT NULL REFERENCES purchase_order(id),    -- denormalised for query speed
  vendor_id                UUID NOT NULL REFERENCES vendor(id),            -- denormalised
  warehouse_id             UUID NOT NULL REFERENCES warehouse(id),         -- denormalised
  rtv_date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  reason                   TEXT,                                            -- short header-level reason (per-line gets its own)
  notes                    TEXT,
  -- Vendor's credit-note round trip (captured post-hoc)
  vendor_credit_note_no    TEXT,
  vendor_credit_note_at    DATE,
  -- Workflow
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'posted', 'cancelled')),
  posted_at                TIMESTAMPTZ,
  posted_by                UUID REFERENCES user_profile(id),
  cancelled_at             TIMESTAMPTZ,
  cancelled_by             UUID REFERENCES user_profile(id),
  cancellation_reason      TEXT,
  -- Audit
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES user_profile(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               UUID REFERENCES user_profile(id),
  deleted_at               TIMESTAMPTZ,

  UNIQUE (tenant_id, rtv_number)
);

ALTER TABLE return_to_vendor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON return_to_vendor
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX rtv_grn_idx       ON return_to_vendor (grn_id) WHERE deleted_at IS NULL;
CREATE INDEX rtv_po_idx        ON return_to_vendor (po_id)  WHERE deleted_at IS NULL;
CREATE INDEX rtv_vendor_idx    ON return_to_vendor (vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX rtv_tenant_date_idx ON return_to_vendor (tenant_id, rtv_date DESC) WHERE deleted_at IS NULL;


-- Sequence + safety-net trigger (mirrors set_goods_receipt_note_number)

CREATE SEQUENCE return_to_vendor_seq START 1;

CREATE OR REPLACE FUNCTION set_return_to_vendor_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq  BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.rtv_number IS NOT NULL AND NEW.rtv_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('return_to_vendor_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'return_to_vendor', v_seq);
  IF v_code IS NULL THEN
    v_code := 'VT-RTV-' || EXTRACT(YEAR FROM NEW.rtv_date)::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.rtv_number := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_return_to_vendor_number_t
  BEFORE INSERT ON return_to_vendor
  FOR EACH ROW EXECUTE FUNCTION set_return_to_vendor_number();


-- ─── 3. RETURN_TO_VENDOR_LINE ─────────────────────────────────

CREATE TABLE return_to_vendor_line (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(id),
  rtv_id           UUID NOT NULL REFERENCES return_to_vendor(id) ON DELETE CASCADE,
  grn_line_id      UUID NOT NULL REFERENCES goods_receipt_note_line(id),
  po_line_id       UUID NOT NULL REFERENCES purchase_order_line(id),  -- denormalised
  product_id       UUID REFERENCES product(id),
  description      TEXT NOT NULL,
  unit             TEXT NOT NULL,
  qty_returned     NUMERIC(14,3) NOT NULL CHECK (qty_returned > 0),
  reason           TEXT,
  remarks          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE return_to_vendor_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON return_to_vendor_line
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX rtv_line_rtv_idx      ON return_to_vendor_line (rtv_id);
CREATE INDEX rtv_line_grn_line_idx ON return_to_vendor_line (grn_line_id);


-- ─── 4. EXTEND next_code_sequence RPC ─────────────────────────

CREATE OR REPLACE FUNCTION next_code_sequence(p_kind TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_name TEXT;
BEGIN
  v_seq_name := CASE p_kind
    WHEN 'quotation'          THEN 'quotation_seq'
    WHEN 'sales_order'        THEN 'sales_order_seq'
    WHEN 'invoice'            THEN 'invoice_seq'
    WHEN 'dispatch'           THEN 'dispatch_seq'
    WHEN 'dealer'             THEN 'dealer_seq'
    WHEN 'lead'               THEN 'lead_seq'
    WHEN 'stock_transfer'     THEN 'stock_transfer_seq'
    WHEN 'purchase_order'     THEN 'purchase_order_seq'
    WHEN 'goods_receipt_note' THEN 'goods_receipt_note_seq'
    WHEN 'return_to_vendor'   THEN 'return_to_vendor_seq'
    ELSE NULL
  END;

  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'next_code_sequence: unknown kind %', p_kind;
  END IF;

  RETURN nextval(v_seq_name::regclass);
END;
$$;


-- ─── 5. PER-TENANT CODE TEMPLATE SEED ─────────────────────────

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,return_to_vendor}',
  '"VT-RTV-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'vyara-tiles';

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,return_to_vendor}',
  '"RA-RTV-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'raj-avinsys';
