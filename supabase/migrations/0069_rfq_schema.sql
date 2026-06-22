-- ============================================================
-- 0069_rfq_schema.sql — RFQ + vendor responses (P4β)
--
-- Blueprint: DEL-020.
--
-- The multi-vendor evaluation step: send the requirement to 2-5
-- vendors, collect quotes, pick L1 (or override with justification).
--
-- Schema:
--   request_for_quotation        — header (RFQ#, project, dates, status)
--   request_for_quotation_line   — what's being asked for (line items)
--   request_for_quotation_vendor — which vendors got invited
--   request_for_quotation_response — per-vendor per-line quote (rate +
--                                    delivery + payment terms + notes)
--
-- One RFQ can have multiple source PRs (the consolidation flow). For
-- v1 we use rfq.source_pr_ids JSONB array (cheaper than a join table
-- for the common 1-3 case); multi-PR-consolidation reads it as needed.
--
-- State:
--   draft → sent → quotes_collected → cs_finalised → po_raised
--   draft → cancelled
-- ============================================================

CREATE TABLE request_for_quotation (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  rfq_number               TEXT NOT NULL,
  project_id               UUID REFERENCES project(id),
  cost_center              TEXT,
  source_pr_ids            JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ['uuid', 'uuid'] — PRs consolidated into this RFQ
  rfq_date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  response_deadline        DATE,
  required_by_date         DATE,
  notes                    TEXT,
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'sent', 'quotes_collected', 'cs_finalised', 'po_raised', 'cancelled')),
  linked_po_id             UUID REFERENCES purchase_order(id),
  cs_winner_decision       TEXT,                                  -- 'L1' or override reason
  sent_at                  TIMESTAMPTZ,
  sent_by                  UUID REFERENCES user_profile(id),
  cancelled_at             TIMESTAMPTZ,
  cancelled_by             UUID REFERENCES user_profile(id),
  cancellation_reason      TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES user_profile(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               UUID REFERENCES user_profile(id),
  deleted_at               TIMESTAMPTZ,

  UNIQUE (tenant_id, rfq_number)
);

ALTER TABLE request_for_quotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON request_for_quotation
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX rfq_status_idx  ON request_for_quotation (tenant_id, status, rfq_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX rfq_project_idx ON request_for_quotation (project_id) WHERE project_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX rfq_po_idx      ON request_for_quotation (linked_po_id) WHERE linked_po_id IS NOT NULL;


CREATE SEQUENCE request_for_quotation_seq START 1;

CREATE OR REPLACE FUNCTION set_request_for_quotation_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq  BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.rfq_number IS NOT NULL AND NEW.rfq_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('request_for_quotation_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'rfq', v_seq);
  IF v_code IS NULL THEN
    v_code := 'VT-RFQ-' || EXTRACT(YEAR FROM NEW.rfq_date)::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.rfq_number := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_request_for_quotation_number_t
  BEFORE INSERT ON request_for_quotation
  FOR EACH ROW EXECUTE FUNCTION set_request_for_quotation_number();


CREATE TABLE request_for_quotation_line (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  rfq_id                   UUID NOT NULL REFERENCES request_for_quotation(id) ON DELETE CASCADE,
  line_no                  INTEGER NOT NULL,
  source_pr_line_id        UUID REFERENCES purchase_requisition_line(id),  -- traceability when PR-sourced
  product_id               UUID REFERENCES product(id),
  description              TEXT NOT NULL,
  hsn_code                 TEXT,
  unit                     TEXT NOT NULL DEFAULT 'nos',
  quantity                 NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  specifications           TEXT,
  required_by_date         DATE,                                            -- per-line override of header date
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (rfq_id, line_no)
);

ALTER TABLE request_for_quotation_line ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON request_for_quotation_line
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX rfq_line_rfq_idx ON request_for_quotation_line (rfq_id);


CREATE TABLE request_for_quotation_vendor (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  rfq_id                   UUID NOT NULL REFERENCES request_for_quotation(id) ON DELETE CASCADE,
  vendor_id                UUID NOT NULL REFERENCES vendor(id),
  invited_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at             TIMESTAMPTZ,                                     -- set when any response row arrives
  vendor_quote_no          TEXT,                                            -- the vendor's own quote reference
  vendor_quote_date        DATE,
  vendor_quote_validity    DATE,                                            -- vendor's "valid until"
  payment_terms_days       INTEGER,
  delivery_terms           TEXT,
  notes                    TEXT,                                            -- vendor-level remarks
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (rfq_id, vendor_id)
);

ALTER TABLE request_for_quotation_vendor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON request_for_quotation_vendor
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX rfqv_rfq_idx    ON request_for_quotation_vendor (rfq_id);
CREATE INDEX rfqv_vendor_idx ON request_for_quotation_vendor (vendor_id);


CREATE TABLE request_for_quotation_response (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  rfq_id                   UUID NOT NULL REFERENCES request_for_quotation(id) ON DELETE CASCADE,
  rfq_line_id              UUID NOT NULL REFERENCES request_for_quotation_line(id) ON DELETE CASCADE,
  vendor_id                UUID NOT NULL REFERENCES vendor(id),
  -- Quote details per line per vendor
  rate                     NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
  discount_pct             NUMERIC(5,2) NOT NULL DEFAULT 0,
  gst_rate_pct             NUMERIC(5,2) NOT NULL DEFAULT 0,
  delivery_days            INTEGER,                                         -- vendor's quoted delivery time
  notes                    TEXT,
  -- Computed: taxable + total stored for the comparison rendering
  taxable_value            NUMERIC(14,2),
  amount_total             NUMERIC(14,2),
  -- CS outcome (set when CS is finalised)
  is_l1                    BOOLEAN,                                         -- L1 designation (lowest landed cost in line)
  is_selected              BOOLEAN NOT NULL DEFAULT false,                   -- picked at CS time
  selection_reason         TEXT,                                            -- override justification when is_selected AND NOT is_l1
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (rfq_line_id, vendor_id)
);

ALTER TABLE request_for_quotation_response ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON request_for_quotation_response
  FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX rfqr_line_idx    ON request_for_quotation_response (rfq_line_id);
CREATE INDEX rfqr_vendor_idx  ON request_for_quotation_response (vendor_id);
CREATE INDEX rfqr_selected_idx ON request_for_quotation_response (rfq_id) WHERE is_selected = true;


-- Extend next_code_sequence + code templates
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
    WHEN 'quotation'             THEN 'quotation_seq'
    WHEN 'sales_order'           THEN 'sales_order_seq'
    WHEN 'invoice'               THEN 'invoice_seq'
    WHEN 'dispatch'              THEN 'dispatch_seq'
    WHEN 'dealer'                THEN 'dealer_seq'
    WHEN 'lead'                  THEN 'lead_seq'
    WHEN 'stock_transfer'        THEN 'stock_transfer_seq'
    WHEN 'purchase_order'        THEN 'purchase_order_seq'
    WHEN 'goods_receipt_note'    THEN 'goods_receipt_note_seq'
    WHEN 'return_to_vendor'      THEN 'return_to_vendor_seq'
    WHEN 'vendor_bill'           THEN 'vendor_bill_seq'
    WHEN 'vendor_payment'        THEN 'vendor_payment_seq'
    WHEN 'purchase_requisition'  THEN 'purchase_requisition_seq'
    WHEN 'rfq'                   THEN 'request_for_quotation_seq'
    ELSE NULL
  END;
  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'next_code_sequence: unknown kind %', p_kind;
  END IF;
  RETURN nextval(v_seq_name::regclass);
END;
$$;

UPDATE tenant SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{codes,rfq}', '"VT-RFQ-{yyyy}-{nnnn}"'::jsonb, true) WHERE slug = 'vyara-tiles';
UPDATE tenant SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{codes,rfq}', '"RA-RFQ-{yyyy}-{nnnn}"'::jsonb, true) WHERE slug = 'raj-avinsys';

-- Extend purchase_order with source RFQ traceability
ALTER TABLE purchase_order
  ADD COLUMN IF NOT EXISTS source_pr_id  UUID REFERENCES purchase_requisition(id),
  ADD COLUMN IF NOT EXISTS source_rfq_id UUID REFERENCES request_for_quotation(id);

CREATE INDEX IF NOT EXISTS po_source_pr_idx  ON purchase_order (source_pr_id)  WHERE source_pr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS po_source_rfq_idx ON purchase_order (source_rfq_id) WHERE source_rfq_id IS NOT NULL;
