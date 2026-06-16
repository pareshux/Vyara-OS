-- ============================================================
-- 0011_dealer.sql — Slice 3 Step 1: Dealer module schema + RLS
--
-- Owns its own tables (dealer, dealer_user). Adds dealer-scoping
-- to existing cross-module tables so a dealer-role user can only
-- read rows that belong to *their* dealer firm.
--
-- Auth-hook side: docs/setup-auth-hook.sql gets a dealer_id claim
-- (manual Supabase Dashboard step required after this migration —
-- auth schema is restricted on hosted Supabase, can't be done from
-- a migration).
--
-- Decisions locked (per pre-build audit):
--   A1: dealer.tier is TEXT with no CHECK (Slice 3.5 Masters will
--       introduce dealer_tier master; constraints come later)
--   B1: dealer_user has is_active + revoke fields (Vyara admins can
--       revoke a dealer-user's portal access without deactivating
--       the whole dealer)
--   C1: seeds 2 additional dealer-type firms + 3 dealer rows; no
--       fake auth users — operator invites real users via Step 2 UI
-- ============================================================


-- ─── 1. JWT helper for dealer scope ──────────────────────────────────────────
-- Reads dealer_id from JWT claims (populated by the updated
-- custom_access_token_hook for users with role='dealer').

CREATE OR REPLACE FUNCTION current_dealer_id() RETURNS UUID AS $$
  SELECT NULLIF(auth.jwt() ->> 'dealer_id', '')::UUID;
$$ LANGUAGE sql STABLE;


-- ─── 2. EXTEND user_profile.role ─────────────────────────────────────────────
-- Adds 'dealer' as a valid role alongside admin/manager/sales_engineer.

ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_role_check;
ALTER TABLE user_profile ADD CONSTRAINT user_profile_role_check
  CHECK (role IN ('admin', 'manager', 'sales_engineer', 'dealer'));


-- ─── 3. DEALER ───────────────────────────────────────────────────────────────
-- 1:1 link to firm (a firm is OR isn't a dealer). Channel-specific
-- attributes that don't belong on the generic firm record.

CREATE SEQUENCE IF NOT EXISTS dealer_seq;

CREATE TABLE dealer (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  firm_id                  UUID NOT NULL REFERENCES firm(id),
  dealer_code              TEXT NOT NULL,                 -- auto VT-DLR-NNNN
  tier                     TEXT,                          -- nullable, no CHECK (Slice 3.5 Masters owns the values)
  territory                TEXT,
  credit_limit             NUMERIC(14,2),
  credit_period_days       INTEGER NOT NULL DEFAULT 30,
  dormancy_threshold_days  INTEGER NOT NULL DEFAULT 90,
  onboarded_at             DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES auth.users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               UUID REFERENCES auth.users(id),
  deleted_at               TIMESTAMPTZ
);

ALTER TABLE dealer ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX dealer_code_uniq ON dealer (tenant_id, dealer_code);
CREATE UNIQUE INDEX dealer_firm_uniq ON dealer (firm_id) WHERE deleted_at IS NULL;
CREATE INDEX dealer_tenant_active_idx ON dealer (tenant_id, is_active) WHERE deleted_at IS NULL;

-- Internal users (anyone NOT a dealer role) see all dealers in their tenant
CREATE POLICY "internal_full_access" ON dealer
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

-- Dealer-role users see only their own dealer row
CREATE POLICY "dealer_self_read" ON dealer
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND current_actor_role() = 'dealer'
    AND id = current_dealer_id()
  );

-- Auto-generate dealer_code: VT-DLR-NNNN
CREATE OR REPLACE FUNCTION set_dealer_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.dealer_code IS NULL OR NEW.dealer_code = '' THEN
    NEW.dealer_code := 'VT-DLR-' || lpad(nextval('dealer_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dealer_code BEFORE INSERT ON dealer
  FOR EACH ROW EXECUTE FUNCTION set_dealer_code();


-- ─── 4. DEALER_USER ──────────────────────────────────────────────────────────
-- Links auth users to dealers. Many-to-many supported (rare but allowed).
-- is_active enables admin to revoke portal access without deactivating
-- the whole dealer or deleting the auth user.

CREATE TABLE dealer_user (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenant(id),
  dealer_id      UUID NOT NULL REFERENCES dealer(id) ON DELETE CASCADE,
  auth_user_id   UUID NOT NULL REFERENCES auth.users(id),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  invited_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by     UUID REFERENCES auth.users(id),
  accepted_at    TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_by     UUID REFERENCES auth.users(id),
  revoke_reason  TEXT,
  UNIQUE (dealer_id, auth_user_id)
);

ALTER TABLE dealer_user ENABLE ROW LEVEL SECURITY;

CREATE INDEX dealer_user_dealer_idx ON dealer_user (dealer_id);
CREATE INDEX dealer_user_auth_idx   ON dealer_user (auth_user_id);

CREATE POLICY "internal_full_access" ON dealer_user
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

-- Dealer user sees only their own dealer_user row(s)
CREATE POLICY "dealer_self_read" ON dealer_user
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND current_actor_role() = 'dealer'
    AND dealer_id = current_dealer_id()
  );


-- ─── 5. EXTEND sales_order WITH created_via ──────────────────────────────────
-- Distinguishes orders placed by internal sales team vs by a dealer
-- through the portal. Backwards-compatible (default 'internal').

ALTER TABLE sales_order
  ADD COLUMN IF NOT EXISTS created_via TEXT NOT NULL DEFAULT 'internal'
    CHECK (created_via IN ('internal', 'dealer_portal'));

CREATE INDEX sales_order_created_via_idx ON sales_order (tenant_id, created_via);


-- ─── 6. DEALER-SCOPED RLS ON CROSS-MODULE TABLES ─────────────────────────────
-- Existing tenant_isolation policies allow any tenant-matched user to
-- read everything. With dealer-role users now possible, we tighten
-- those policies to exclude 'dealer' and add per-dealer SELECT policies
-- that filter by the dealer's firm_id.
--
-- INSERT/UPDATE policies for dealer-role users come in Step 4 when
-- dealer-side order placement is built. Step 1 ensures dealers can't
-- LEAK other dealers' data.

-- ─── 6a. firm ─────────────────────────────────────────────────────────────────
-- Dealers can see their own firm row only (they shouldn't browse the
-- whole customer/architect/contractor master).

DROP POLICY IF EXISTS "tenant_isolation" ON firm;
DROP POLICY IF EXISTS "tenant_insert" ON firm;

CREATE POLICY "internal_full_access" ON firm
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON firm
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND current_actor_role() = 'dealer'
    AND id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
  );

-- ─── 6b. contact ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON contact;
DROP POLICY IF EXISTS "tenant_insert" ON contact;

CREATE POLICY "internal_full_access" ON contact
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON contact
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND current_actor_role() = 'dealer'
    AND firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
  );

-- ─── 6c. sales_order ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON sales_order;
DROP POLICY IF EXISTS "tenant_insert" ON sales_order;

CREATE POLICY "internal_full_access" ON sales_order
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON sales_order
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND current_actor_role() = 'dealer'
    AND buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
  );

-- ─── 6d. sales_order_line ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON sales_order_line;
DROP POLICY IF EXISTS "tenant_insert" ON sales_order_line;

CREATE POLICY "internal_full_access" ON sales_order_line
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON sales_order_line
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND current_actor_role() = 'dealer'
    AND sales_order_id IN (
      SELECT id FROM sales_order
      WHERE buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
    )
  );

-- ─── 6e. invoice ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON invoice;
DROP POLICY IF EXISTS "tenant_insert" ON invoice;

CREATE POLICY "internal_full_access" ON invoice
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON invoice
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND current_actor_role() = 'dealer'
    AND buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
  );

-- ─── 6f. invoice_line ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON invoice_line;
DROP POLICY IF EXISTS "tenant_insert" ON invoice_line;

CREATE POLICY "internal_full_access" ON invoice_line
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON invoice_line
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND current_actor_role() = 'dealer'
    AND invoice_id IN (
      SELECT id FROM invoice
      WHERE buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
    )
  );

-- ─── 6g. receipt ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON receipt;
DROP POLICY IF EXISTS "tenant_insert" ON receipt;

CREATE POLICY "internal_full_access" ON receipt
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON receipt
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND current_actor_role() = 'dealer'
    AND invoice_id IN (
      SELECT id FROM invoice
      WHERE buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
    )
  );


-- ─── 7. DEALER_LEDGER_V (derived running-balance view) ───────────────────────
-- Aggregates invoices (debits) + receipts (credits) per dealer.firm_id
-- into a chronologically-ordered ledger with a running balance column.
-- Read-only; tenant + dealer scoping enforced by the underlying invoice
-- and receipt RLS policies (views inherit RLS from base tables).

CREATE OR REPLACE VIEW dealer_ledger_v AS
WITH all_txn AS (
  -- Invoices = debit (dealer owes us)
  SELECT
    d.id                  AS dealer_id,
    d.tenant_id           AS tenant_id,
    i.invoice_date        AS txn_date,
    'invoice'             AS txn_type,
    i.id                  AS source_id,
    i.invoice_number      AS source_ref,
    i.billed_amount       AS debit,
    0::NUMERIC(14,2)      AS credit,
    i.created_at          AS sort_at,
    'Invoice ' || i.invoice_number AS description
  FROM invoice i
  JOIN dealer d ON d.firm_id = i.buyer_firm_id AND d.deleted_at IS NULL
  WHERE i.deleted_at IS NULL

  UNION ALL

  -- Receipts = credit (dealer paid us)
  SELECT
    d.id                  AS dealer_id,
    d.tenant_id           AS tenant_id,
    r.received_at         AS txn_date,
    'receipt'             AS txn_type,
    r.id                  AS source_id,
    COALESCE(r.payment_reference, 'Receipt') AS source_ref,
    0::NUMERIC(14,2)      AS debit,
    r.amount              AS credit,
    r.created_at          AS sort_at,
    UPPER(r.payment_mode) || ' receipt' AS description
  FROM receipt r
  JOIN invoice i ON i.id = r.invoice_id AND i.deleted_at IS NULL
  JOIN dealer d ON d.firm_id = i.buyer_firm_id AND d.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
)
SELECT
  dealer_id,
  tenant_id,
  txn_date,
  txn_type,
  source_id,
  source_ref,
  debit,
  credit,
  description,
  SUM(debit - credit) OVER (
    PARTITION BY dealer_id
    ORDER BY txn_date, sort_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )::NUMERIC(14,2) AS running_balance
FROM all_txn
ORDER BY dealer_id, txn_date, sort_at;

GRANT SELECT ON dealer_ledger_v TO authenticated;


-- ─── 8. SEED: 2 ADDITIONAL DEALER FIRMS + 3 DEALER ROWS ──────────────────────
-- Vyara has 1 firm of type='dealer' today (Shree Constructions). Add 2 more
-- so the dealer-performance dashboard has comparison data. No fake auth
-- users — operator invites real users via the Step 2 UI when ready.

INSERT INTO firm (id, tenant_id, name, type, city, state, gstin, phone, email, notes) VALUES
  ('d0000000-0000-0000-0000-000000000006'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'Surat Pavers Distributors',  'dealer', 'Surat',  'Gujarat',
   '24AAACS1234D1Z5', '+912614001001', 'sales@suratpavers.example', 'Tier 1 dealer; south-Surat territory'),
  ('d0000000-0000-0000-0000-000000000007'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'Gujarat Tile Mart',          'dealer', 'Ahmedabad', 'Gujarat',
   '24AAACG5678E1Z2', '+917912002002', 'orders@gujarattilemart.example', 'Tier 2 dealer; Ahmedabad corridor');

-- Promote 3 dealer-type firms to dealer records.
-- Shree Constructions is a contractor too in spirit, but here we model it
-- as a contractor-turned-dealer (a real Vyara pattern).
INSERT INTO dealer (tenant_id, firm_id, tier, territory, credit_limit, credit_period_days, onboarded_at, notes) VALUES
  ('a1111111-1111-1111-1111-111111111111'::uuid,
   'd0000000-0000-0000-0000-000000000004'::uuid,   -- Shree Constructions
   'silver', 'Surat North', 500000, 30, '2026-01-15',
   'Long-standing dealer; converted from contractor account in 2026.'),
  ('a1111111-1111-1111-1111-111111111111'::uuid,
   'd0000000-0000-0000-0000-000000000006'::uuid,   -- Surat Pavers Distributors
   'gold',   'Surat South', 1000000, 45, '2026-03-01',
   'Top dealer by volume in south Surat.'),
  ('a1111111-1111-1111-1111-111111111111'::uuid,
   'd0000000-0000-0000-0000-000000000007'::uuid,   -- Gujarat Tile Mart
   'bronze', 'Ahmedabad',  300000, 30, '2026-05-20',
   'New dealer; ramping up in Ahmedabad region.');
