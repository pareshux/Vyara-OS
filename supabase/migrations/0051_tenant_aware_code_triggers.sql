-- ============================================================
-- 0051_tenant_aware_code_triggers.sql — Raj demo Phase 6 (Vyara-isms).
--
-- Fixes the five hardcoded 'VT-' prefix triggers so they read
-- tenant.settings.codes.{kind} and render the tenant's template.
-- Before this migration, every auto-generated number had a 'VT-'
-- prefix regardless of which tenant created the row — a real
-- Vyara-ism affecting cross-industry tenants (Raj would see
-- VT-CMP-2026-XXXX instead of RA-CMP-2026-XXXX).
--
-- Pattern: introduce one DB-side helper function `render_tenant_code`
-- that does template lookup + render. Each trigger calls it. Falls
-- back to the hardcoded VT-* default when:
--   - tenant.settings.codes doesn't have a template for the kind
--   - template is malformed / missing required tokens
--
-- Triggers touched:
--   - set_quotation_number      (0003)
--   - set_sales_order_number    (0004)
--   - set_invoice_number        (0006)
--   - set_complaint_number      (0048)
--   - set_amc_contract_number   (0050)
--
-- The TypeScript-side `nextCode` helper (PLAT-010 / Sprint 1.7) still
-- works — when it pre-fills NEW.code with a value, the trigger no-ops
-- because the IF check at the top of each trigger sees a non-NULL value.
-- The two paths now produce identical output when both run.
--
-- New supported kinds (extend the existing CodeTemplatesSchema in
-- lib/tenants/settings-schema.ts to add these defaults; deferred):
--   - complaint (default 'VT-CMP-{yyyy}-{nnnn}')
--   - amc       (default 'VT-AMC-{yyyy}-{nnnn}')
-- ============================================================


-- ─── render_tenant_code helper ──────────────────────────────
-- Reads tenant.settings.codes->>kind for tenant_id, applies
-- {yyyy} → current year and {nnnn|nnnnn|nnn} → padded sequence.
-- Returns NULL when no template (caller falls back to VT- default).

CREATE OR REPLACE FUNCTION render_tenant_code(
  p_tenant_id UUID,
  p_kind      TEXT,
  p_seq       BIGINT
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_template TEXT;
  v_year     TEXT;
  v_result   TEXT;
BEGIN
  -- Pull the template from tenant.settings.codes.<kind>
  SELECT settings #>> ARRAY['codes', p_kind] INTO v_template
  FROM tenant WHERE id = p_tenant_id;

  IF v_template IS NULL OR v_template = '' THEN
    RETURN NULL;
  END IF;

  v_year := to_char(now(), 'YYYY');
  v_result := v_template;
  -- Year substitution
  v_result := replace(v_result, '{yyyy}', v_year);
  -- Sequence — try nnnnn first (longest), then nnnn, then nnn
  IF v_result LIKE '%{nnnnn}%' THEN
    v_result := replace(v_result, '{nnnnn}', lpad(p_seq::TEXT, 5, '0'));
  ELSIF v_result LIKE '%{nnnn}%' THEN
    v_result := replace(v_result, '{nnnn}', lpad(p_seq::TEXT, 4, '0'));
  ELSIF v_result LIKE '%{nnn}%' THEN
    v_result := replace(v_result, '{nnn}', lpad(p_seq::TEXT, 3, '0'));
  ELSE
    -- Template has no sequence token — refuse, let the trigger fall back
    RETURN NULL;
  END IF;

  RETURN v_result;
END;
$$;


-- ─── Rewrite 5 triggers ─────────────────────────────────────

-- Quotation
CREATE OR REPLACE FUNCTION set_quotation_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
  v_tenant_code TEXT;
BEGIN
  IF NEW.quotation_number IS NOT NULL AND NEW.quotation_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('quotation_seq');
  v_tenant_code := render_tenant_code(NEW.tenant_id, 'quotation', v_seq);
  NEW.quotation_number := COALESCE(
    v_tenant_code,
    'VT-QT-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 4, '0')
  );
  RETURN NEW;
END;
$$;

-- Sales order
CREATE OR REPLACE FUNCTION set_sales_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
  v_tenant_code TEXT;
BEGIN
  IF NEW.order_number IS NOT NULL AND NEW.order_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('sales_order_seq');
  v_tenant_code := render_tenant_code(NEW.tenant_id, 'sales_order', v_seq);
  NEW.order_number := COALESCE(
    v_tenant_code,
    'VT-SO-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 4, '0')
  );
  RETURN NEW;
END;
$$;

-- Invoice
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
  v_tenant_code TEXT;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('invoice_seq');
  v_tenant_code := render_tenant_code(NEW.tenant_id, 'invoice', v_seq);
  NEW.invoice_number := COALESCE(
    v_tenant_code,
    'VT-INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 4, '0')
  );
  RETURN NEW;
END;
$$;

-- Complaint
CREATE OR REPLACE FUNCTION set_complaint_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
  v_tenant_code TEXT;
BEGIN
  IF NEW.complaint_number IS NOT NULL AND NEW.complaint_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('complaint_seq');
  v_tenant_code := render_tenant_code(NEW.tenant_id, 'complaint', v_seq);
  NEW.complaint_number := COALESCE(
    v_tenant_code,
    'VT-CMP-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 4, '0')
  );
  RETURN NEW;
END;
$$;

-- AMC contract
CREATE OR REPLACE FUNCTION set_amc_contract_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
  v_tenant_code TEXT;
BEGIN
  IF NEW.contract_number IS NOT NULL AND NEW.contract_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('amc_contract_seq');
  v_tenant_code := render_tenant_code(NEW.tenant_id, 'amc', v_seq);
  NEW.contract_number := COALESCE(
    v_tenant_code,
    'VT-AMC-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 4, '0')
  );
  RETURN NEW;
END;
$$;


-- ─── Add the new template keys to Raj's tenant.settings ─────
-- Raj's existing tenant.settings.codes has quotation/sales_order/invoice/
-- dispatch/lead/dealer. Add complaint + amc here so newly-created
-- complaints + AMC contracts get RA-CMP-* / RA-AMC-* automatically.
-- (Vyara doesn't have these keys; trigger will fall back to VT-CMP-* / VT-AMC-*
-- for Vyara — correct behaviour.)

UPDATE tenant
SET settings = jsonb_set(
  jsonb_set(
    settings,
    '{codes, complaint}',
    '"RA-CMP-{yyyy}-{nnnn}"'::jsonb
  ),
  '{codes, amc}',
  '"RA-AMC-{yyyy}-{nnnn}"'::jsonb
)
WHERE slug = 'raj-avinsys';


-- ─── Smoke ─────────────────────────────────────────────────
-- Nothing in this migration creates rows. The next time a Raj user
-- creates a complaint or AMC contract via the UI / action, the trigger
-- will render the RA-* prefix from the template. Tested in the Phase 6
-- integration test below.
