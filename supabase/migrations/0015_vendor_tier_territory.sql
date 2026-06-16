-- ============================================================
-- 0015_vendor_tier_territory.sql — Slice 3.5 Step 3
--
-- Three reference masters that close the customer-#2-readiness gap
-- around channel taxonomy + supplier records:
--
--   - vendor       :: thin supplier/contractor/service master
--                     (not a procurement suite; transporter stays
--                     separate, owned by dispatch).
--   - dealer_tier  :: replaces free-text dealer.tier; carries the
--                     badge color so TIER_STYLES hardcode goes away.
--   - territory    :: hierarchical (parent_id) so a tenant can nest
--                     Surat → Surat South etc.; replaces free-text
--                     dealer.territory.
--
-- Adds nullable FK columns on `dealer` (tier_id, territory_id) and
-- backfills from the existing text values. The TEXT columns stay
-- (deprecated) so any stale reads keep working; full cleanup happens
-- in the readiness sprint together with project.territory +
-- user_profile.territory migration.
-- ============================================================


-- ─── 1. VENDOR ────────────────────────────────────────────────────────────────
CREATE TABLE vendor (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  vendor_type   TEXT NOT NULL DEFAULT 'supplier'
                  CHECK (vendor_type IN ('supplier', 'contractor', 'service', 'other')),
  gstin         TEXT,
  contact_name  TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES auth.users(id),
  deleted_at    TIMESTAMPTZ
);

ALTER TABLE vendor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vendor
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX vendor_code_uniq
  ON vendor (tenant_id, code) WHERE deleted_at IS NULL;

CREATE INDEX vendor_active_idx ON vendor (tenant_id, is_active, vendor_type) WHERE deleted_at IS NULL;
CREATE INDEX vendor_name_trgm_idx ON vendor USING GIN (name gin_trgm_ops);


-- ─── 2. DEALER_TIER ──────────────────────────────────────────────────────────
-- `color` is a CSS hex used by the tier badge — moves the hardcoded
-- TIER_STYLES map out of code and into the tenant master so customer
-- #2 can have their own tier names + colors.

CREATE TABLE dealer_tier (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6B7280',  -- CSS hex
  bg_color    TEXT NOT NULL DEFAULT '#F3F4F6',  -- CSS hex for badge bg
  sort_order  INTEGER NOT NULL DEFAULT 0,       -- higher = more senior tier
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE dealer_tier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON dealer_tier
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX dealer_tier_code_uniq
  ON dealer_tier (tenant_id, code) WHERE deleted_at IS NULL;

CREATE INDEX dealer_tier_active_idx ON dealer_tier (tenant_id, is_active, sort_order) WHERE deleted_at IS NULL;


-- ─── 3. TERRITORY ────────────────────────────────────────────────────────────
-- Self-referencing parent_id allows nesting (Zone > State > City > Area).
-- For Vyara we seed two levels: Gujarat → Surat North / Surat South / Ahmedabad.

CREATE TABLE territory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  parent_id   UUID REFERENCES territory(id),
  level       INTEGER NOT NULL DEFAULT 0,  -- 0=root, 1=child, etc.
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE territory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON territory
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX territory_code_uniq
  ON territory (tenant_id, code) WHERE deleted_at IS NULL;

CREATE INDEX territory_parent_idx ON territory (tenant_id, parent_id, sort_order) WHERE deleted_at IS NULL;


-- ─── 4. NULLABLE FK COLUMNS ON DEALER ────────────────────────────────────────
-- Keeping the old TEXT columns (dealer.tier, dealer.territory) for now —
-- they become deprecated read-only fallbacks until the readiness sprint
-- migrates project.territory + user_profile.territory and we drop them
-- together.

ALTER TABLE dealer
  ADD COLUMN IF NOT EXISTS tier_id      UUID REFERENCES dealer_tier(id),
  ADD COLUMN IF NOT EXISTS territory_id UUID REFERENCES territory(id);

CREATE INDEX IF NOT EXISTS dealer_tier_id_idx      ON dealer (tenant_id, tier_id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dealer_territory_id_idx ON dealer (tenant_id, territory_id) WHERE deleted_at IS NULL;


-- ─── 5. SEED: dealer_tier (Vyara — Bronze/Silver/Gold/Platinum) ─────────────
-- Colors match the hardcoded TIER_STYLES that currently lives in
-- app/(app)/dealers/page.tsx + [id]/page.tsx so the migration is visually
-- a no-op for the Vyara tenant. Customer #2 changes these via the admin UI.

INSERT INTO dealer_tier (id, tenant_id, code, label, color, bg_color, sort_order) VALUES
  ('aa000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'BRONZE',   'Bronze',   '#C2410C', '#FFEDD5', 10),
  ('aa000000-0000-0000-0000-000000000002'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'SILVER',   'Silver',   '#475569', '#F1F5F9', 20),
  ('aa000000-0000-0000-0000-000000000003'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'GOLD',     'Gold',     '#B45309', '#FEF3C7', 30),
  ('aa000000-0000-0000-0000-000000000004'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'PLATINUM', 'Platinum', '#374151', '#E5E7EB', 40);


-- ─── 6. SEED: territory (Gujarat hierarchy for Vyara) ───────────────────────
INSERT INTO territory (id, tenant_id, code, label, parent_id, level, sort_order) VALUES
  ('ab000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'GJ', 'Gujarat', NULL, 0, 0),
  ('ab000000-0000-0000-0000-000000000010'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'SUR-N', 'Surat North',
   'ab000000-0000-0000-0000-000000000001'::uuid, 1, 10),
  ('ab000000-0000-0000-0000-000000000011'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'SUR-S', 'Surat South',
   'ab000000-0000-0000-0000-000000000001'::uuid, 1, 20),
  ('ab000000-0000-0000-0000-000000000012'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'AHM', 'Ahmedabad',
   'ab000000-0000-0000-0000-000000000001'::uuid, 1, 30);


-- ─── 7. SEED: a couple of vendors for Vyara ─────────────────────────────────
-- Just enough to populate the admin list on first load. CSV importer is
-- planned for the readiness sprint.

INSERT INTO vendor (id, tenant_id, code, name, vendor_type, gstin, contact_name, phone, email, address, notes) VALUES
  ('ac000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'V-CEM-01', 'Ambuja Cement (Surat depot)', 'supplier',
   '24AAACA1234B1Z5', 'Pradeep Sharma', '+919825110011', 'pradeep@ambuja.example',
   'GIDC Industrial Estate, Surat, Gujarat',
   'Primary cement supplier; OPC 53 grade.'),
  ('ac000000-0000-0000-0000-000000000002'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'V-AGG-01', 'Sai Stone Crushers', 'supplier',
   '24AAACS5678C1Z6', 'Bhavesh Patel', '+919825220022', 'sales@saicrushers.example',
   'Hazira Road, Surat, Gujarat',
   'Aggregates — 6mm, 10mm, 20mm; 2hr delivery window.'),
  ('ac000000-0000-0000-0000-000000000003'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'V-CON-01', 'Mehul Civil Works', 'contractor',
   '24AAACM9012D1Z7', 'Mehul Rana', '+919898330033', 'mehul@civilworks.example',
   'Adajan, Surat, Gujarat',
   'On-call paving + ground prep contractor.'),
  ('ac000000-0000-0000-0000-000000000004'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'V-SVC-01', 'UPL Power Solutions', 'service',
   '24AAACU3456E1Z8', 'Service desk', '+912614001500', 'service@uplpower.example',
   'GIDC Surat',
   'DG set + factory electrical AMC.');


-- ─── 8. BACKFILL dealer.tier_id from existing tier text ─────────────────────
-- Case-insensitive match against the seeded labels above. Free-text values
-- that don't match any seeded tier are left as NULL (the deprecated text
-- column still holds the original value).

UPDATE dealer d
SET tier_id = dt.id, updated_at = now()
FROM dealer_tier dt
WHERE d.tenant_id = dt.tenant_id
  AND dt.deleted_at IS NULL
  AND d.tier IS NOT NULL
  AND lower(d.tier) = lower(dt.label)
  AND d.tier_id IS NULL;


-- ─── 9. BACKFILL dealer.territory_id from existing territory text ───────────
-- Case-insensitive match against territory labels (Surat North / Surat South / Ahmedabad).
-- Anything else stays NULL.

UPDATE dealer d
SET territory_id = t.id, updated_at = now()
FROM territory t
WHERE d.tenant_id = t.tenant_id
  AND t.deleted_at IS NULL
  AND d.territory IS NOT NULL
  AND lower(d.territory) = lower(t.label)
  AND d.territory_id IS NULL;
