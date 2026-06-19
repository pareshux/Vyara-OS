-- ============================================================
-- 0030_next_code_sequence_rpc.sql — Sprint 1.7 (Blueprint PLAT-010)
--
-- Exposes the per-entity Postgres sequences to the app layer via a
-- single tightly-scoped RPC, so server actions can fill the
-- `<entity>_number` / `<entity>_code` field BEFORE insert using the
-- tenant's template (lib/tenants/render-code.ts).
--
-- Existing per-table triggers stay in place as a SAFETY NET: they
-- only fire when the code column comes in NULL or empty, so any
-- legacy code path that doesn't fill the number keeps working.
-- Once every call site is migrated to use the app-level renderer,
-- a future migration can drop the triggers entirely.
--
-- Why a whitelist instead of a generic nextval('any_seq_name')?
-- - Prevents an authenticated user from exhausting an arbitrary
--   sequence (DoS / counter bumping).
-- - Documents which entities the renderer supports, in one place.
-- - Adding a new entity = one line below + a renderer call site.
-- ============================================================

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
    WHEN 'quotation'      THEN 'quotation_seq'
    WHEN 'sales_order'    THEN 'sales_order_seq'
    WHEN 'invoice'        THEN 'invoice_seq'
    WHEN 'dispatch'       THEN 'dispatch_seq'
    WHEN 'dealer'         THEN 'dealer_seq'
    WHEN 'lead'           THEN 'lead_seq'
    WHEN 'stock_transfer' THEN 'stock_transfer_seq'
    ELSE NULL
  END;

  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'next_code_sequence: unknown kind %', p_kind;
  END IF;

  RETURN nextval(v_seq_name::regclass);
END;
$$;

-- Authenticated users (any role) can call. RLS-style tenancy is
-- not relevant here — sequences are global today (see Sprint 2
-- followup: per-tenant code_sequence table for true isolation).
GRANT EXECUTE ON FUNCTION next_code_sequence(TEXT) TO authenticated;

COMMENT ON FUNCTION next_code_sequence(TEXT) IS
  'Allocates the next sequence value for a known entity kind. '
  'Whitelisted kinds: quotation, sales_order, invoice, dispatch, '
  'dealer, lead, stock_transfer. Used by lib/codes/next-code.ts '
  'in tandem with the tenant code template (tenant.settings.codes).';
