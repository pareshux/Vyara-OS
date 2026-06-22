-- ============================================================
-- 0067_purchase_requisition_schema.sql — Purchase Requisition (P4α)
--
-- Blueprint: DEL-015.
--
-- The "I need X for Y project" demand-capture step. Sits before the
-- PO — a site engineer / store keeper / project manager raises a PR
-- saying what's needed + why + by when; an approver greenlights;
-- procurement then raises a PO (or in P4β, an RFQ across vendors).
--
-- For Tier-2 Indian firms the PR is the FIRST internal discipline
-- step — without it, anyone with PO permissions could spend money
-- without sign-off. Even for sub-₹50k auto-approved POs, the PR
-- creates the documentation trail.
--
-- Schema:
--   purchase_requisition (header)
--     - pr_number auto VT-PR-* / RA-PR-*
--     - project_id (optional — typical for EPC, niche for Vyara)
--     - cost_center TEXT (free text v1; master in v2)
--     - requested_by FK user_profile
--     - required_by_date (when the goods are needed on site)
--     - justification (free text — why this is needed)
--     - estimated_value (sum of line estimated_value; drives approval)
--     - status: draft → submitted → approved (or rejected/cancelled);
--       po_raised when P4β converts to a PO (terminal)
--     - approval_request_id (PLAT-014 link)
--
--   purchase_requisition_line
--     - product_id optional (ad-hoc descriptions allowed for capital
--       equipment / one-off items that won't have a product master)
--     - description, hsn_code, unit, quantity, estimated_rate
--     - estimated_value = quantity * estimated_rate
--     - preferred_vendor_id (optional suggestion — actual vendor
--       picked at PO time / RFQ evaluation)
--     - specifications (extra detail: dimensions, finish, brand)
--
-- Approval seeded for entity_type='purchase_requisition' with the
-- same bands as PO (₹50k-₹5L manager / ₹5L-₹25L manager+admin /
-- ₹25L+ admin); sub-₹50k auto-approves per PLAT-014 default.
-- ============================================================

CREATE TABLE purchase_requisition (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  pr_number                TEXT NOT NULL,
  project_id               UUID REFERENCES project(id),
  cost_center              TEXT,
  requested_by             UUID REFERENCES user_profile(id),
  required_by_date         DATE,
  justification            TEXT,
  estimated_value          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'po_raised')),
  approval_request_id      UUID REFERENCES approval_request(id),
  linked_po_id             UUID REFERENCES purchase_order(id),     -- set by P4β when PR converts to PO
  submitted_at             TIMESTAMPTZ,
  approved_at              TIMESTAMPTZ,
  approved_by              UUID REFERENCES user_profile(id),
  rejected_at              TIMESTAMPTZ,
  rejected_by              UUID REFERENCES user_profile(id),
  rejection_reason         TEXT,
  cancelled_at             TIMESTAMPTZ,
  cancelled_by             UUID REFERENCES user_profile(id),
  cancellation_reason      TEXT,
  notes                    TEXT,
  -- Audit
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES user_profile(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               UUID REFERENCES user_profile(id),
  deleted_at               TIMESTAMPTZ,

  UNIQUE (tenant_id, pr_number)
);

ALTER TABLE purchase_requisition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON purchase_requisition
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX pr_status_idx        ON purchase_requisition (tenant_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX pr_project_idx       ON purchase_requisition (project_id) WHERE project_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX pr_requested_by_idx  ON purchase_requisition (requested_by) WHERE deleted_at IS NULL;
CREATE INDEX pr_approval_idx      ON purchase_requisition (approval_request_id) WHERE approval_request_id IS NOT NULL;
CREATE INDEX pr_linked_po_idx     ON purchase_requisition (linked_po_id) WHERE linked_po_id IS NOT NULL;


-- Sequence + render_tenant_code-aware trigger
CREATE SEQUENCE purchase_requisition_seq START 1;

CREATE OR REPLACE FUNCTION set_purchase_requisition_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq  BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.pr_number IS NOT NULL AND NEW.pr_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('purchase_requisition_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'purchase_requisition', v_seq);
  IF v_code IS NULL THEN
    v_code := 'VT-PR-' || EXTRACT(YEAR FROM COALESCE(NEW.required_by_date, CURRENT_DATE))::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.pr_number := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_purchase_requisition_number_t
  BEFORE INSERT ON purchase_requisition
  FOR EACH ROW EXECUTE FUNCTION set_purchase_requisition_number();


CREATE TABLE purchase_requisition_line (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  pr_id               UUID NOT NULL REFERENCES purchase_requisition(id) ON DELETE CASCADE,
  line_no             INTEGER NOT NULL,
  product_id          UUID REFERENCES product(id),       -- optional: ad-hoc items allowed
  description         TEXT NOT NULL,
  hsn_code            TEXT,
  unit                TEXT NOT NULL DEFAULT 'nos',
  quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  estimated_rate      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (estimated_rate >= 0),
  estimated_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
  preferred_vendor_id UUID REFERENCES vendor(id),         -- optional suggestion
  specifications      TEXT,                                -- dimensions, finish, brand notes
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (pr_id, line_no)
);

ALTER TABLE purchase_requisition_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON purchase_requisition_line
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX prl_pr_idx       ON purchase_requisition_line (pr_id);
CREATE INDEX prl_product_idx  ON purchase_requisition_line (product_id) WHERE product_id IS NOT NULL;


-- ─── Extend next_code_sequence RPC ────────────────────────────

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
    ELSE NULL
  END;

  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'next_code_sequence: unknown kind %', p_kind;
  END IF;

  RETURN nextval(v_seq_name::regclass);
END;
$$;


-- ─── Per-tenant code template seed ──────────────────────────

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,purchase_requisition}',
  '"VT-PR-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'vyara-tiles';

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,purchase_requisition}',
  '"RA-PR-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'raj-avinsys';


-- ─── Approval policy seed (mirrors PO bands) ──────────────────

DO $$
DECLARE
  t_record       RECORD;
  v_policy_mid   UUID;
  v_policy_high  UUID;
  v_policy_top   UUID;
BEGIN
  FOR t_record IN
    SELECT id, slug FROM tenant WHERE slug IN ('vyara-tiles', 'raj-avinsys')
  LOOP
    IF EXISTS (
      SELECT 1 FROM approval_policy
      WHERE tenant_id = t_record.id AND entity_type = 'purchase_requisition'
    ) THEN
      RAISE NOTICE '[pr] approval policies already exist for tenant %, skipping', t_record.slug;
      CONTINUE;
    END IF;

    -- Band 1: ₹50k - ₹5L → manager (1 step)
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'purchase_requisition', 'PR ₹50k - ₹5L',
      50000.01, 500000, 'sequential', true, true,
      'Manager approval for routine requisitions.'
    )
    RETURNING id INTO v_policy_mid;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES (
      t_record.id, v_policy_mid, 1, 'role', 'manager', 'Manager approval'
    );

    -- Band 2: ₹5L - ₹25L → manager → admin
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'purchase_requisition', 'PR ₹5L - ₹25L',
      500000.01, 2500000, 'sequential', true, true,
      'Two-step: manager then director.'
    )
    RETURNING id INTO v_policy_high;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES
      (t_record.id, v_policy_high, 1, 'role', 'manager', 'Manager approval'),
      (t_record.id, v_policy_high, 2, 'role', 'admin',   'Director approval');

    -- Band 3: ≥ ₹25L → admin only
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'purchase_requisition', 'PR ≥ ₹25L',
      2500000.01, NULL, 'sequential', true, true,
      'Capital requisitions — director sign-off only.'
    )
    RETURNING id INTO v_policy_top;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES (
      t_record.id, v_policy_top, 1, 'role', 'admin', 'Director approval'
    );

    RAISE NOTICE '[pr] seeded approval policies for tenant %', t_record.slug;
  END LOOP;
END $$;
