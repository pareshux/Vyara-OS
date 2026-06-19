-- ============================================================
-- 0031_relationship_type_master.sql — Sprint 2.1b (Blueprint REL-006)
--
-- Promotes firm.type from a hardcoded CHECK to a tenant-extensible
-- master table. Mirrors the task_type_master + activity_type_master
-- pattern from migration 0029: system rows (tenant_id NULL) visible
-- to all tenants; tenant rows override on the same code.
--
-- Why now: every cross-industry tenant has a different relationship
-- vocabulary (consultant for electrical contractors, PMC for HVAC,
-- distributor + dealer separately for distribution businesses, etc).
-- The CHECK is the single biggest "Vyara quirk" hardcode in the
-- relationship spine.
--
-- Strategy (same as 0029):
--   1. Create relationship_type_master with RLS + audit cols.
--   2. Seed 12 system rows — the 7 existing CHECK values + 5 new
--      additions (customer, consultant, distributor, partner, vendor)
--      that already match relationships in the codebase but were
--      previously not first-class.
--   3. Add firm.relationship_type_id nullable FK; backfill from
--      firm.type via code match.
--   4. Drop the CHECK constraint.
--   5. Sync trigger BEFORE INSERT OR UPDATE OF type — resolves the
--      legacy `type` text → `relationship_type_id` automatically so
--      existing call sites that write { type: 'architect', ... }
--      keep working unchanged.
--
-- firm.type TEXT stays in place for one slice for backwards compat.
-- Sprint 3 retires .type once the call sites all reference the FK.
-- ============================================================


-- ─── 1. relationship_type_master ──────────────────────────────
CREATE TABLE relationship_type_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),       -- NULL = system row
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT,                              -- 'specifier' | 'buyer' | 'channel' | 'supplier' | 'other'
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE relationship_type_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON relationship_type_master
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "tenant_write" ON relationship_type_master
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update" ON relationship_type_master
  FOR UPDATE USING (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX relationship_type_master_system_uniq
  ON relationship_type_master (code) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX relationship_type_master_tenant_uniq
  ON relationship_type_master (tenant_id, code) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX relationship_type_master_code_idx
  ON relationship_type_master (code, tenant_id) WHERE deleted_at IS NULL;


-- ─── 2. Seed system rows ──────────────────────────────────────
-- The 7 existing CHECK values + 5 new ones. Lowercase codes to
-- match firm.type's existing convention. Categories used by
-- downstream filtering / segmentation (no app code today; future
-- admin UI will read these).

INSERT INTO relationship_type_master (tenant_id, code, label, category, sort_order) VALUES
  -- Specifiers (influence specs without being the buyer)
  (NULL, 'architect',   'Architect / Specifier',     'specifier', 10),
  (NULL, 'consultant',  'Consultant (PMC / Design)', 'specifier', 20),
  -- Buyers
  (NULL, 'contractor',  'Contractor',                'buyer',     30),
  (NULL, 'developer',   'Developer',                 'buyer',     40),
  (NULL, 'owner',       'Owner / End-customer',      'buyer',     50),
  (NULL, 'customer',    'Customer',                  'buyer',     60),
  (NULL, 'government',  'Government / PSU',          'buyer',     70),
  -- Channel
  (NULL, 'dealer',      'Dealer',                    'channel',   80),
  (NULL, 'distributor', 'Distributor',               'channel',   90),
  (NULL, 'partner',     'Partner / Reseller',        'channel',  100),
  -- Supplier-side
  (NULL, 'vendor',      'Vendor / Supplier',         'supplier', 110),
  -- Catch-all
  (NULL, 'other',       'Other',                     'other',    900);


-- ─── 3. Add firm.relationship_type_id ─────────────────────────
ALTER TABLE firm
  ADD COLUMN IF NOT EXISTS relationship_type_id UUID REFERENCES relationship_type_master(id);

-- Backfill from existing TEXT — every existing firm matches a
-- system code.
UPDATE firm f
SET relationship_type_id = m.id
FROM relationship_type_master m
WHERE m.tenant_id IS NULL
  AND m.code = f.type
  AND m.deleted_at IS NULL
  AND f.relationship_type_id IS NULL;


-- ─── 4. Drop the CHECK constraint ─────────────────────────────
-- Master is now the source of truth; the sync trigger below
-- enforces "type must exist in master" with a clearer error than
-- the dropped CHECK ever did.

ALTER TABLE firm DROP CONSTRAINT IF EXISTS firm_type_check;


-- ─── 5. Sync trigger — keep firm.type TEXT and FK in lockstep ──
-- Same pattern as sync_task_type_id / sync_activity_type_id in 0029.
-- Existing call sites that write { type: 'architect', ... } keep
-- working — the trigger fills relationship_type_id automatically.

CREATE OR REPLACE FUNCTION sync_firm_relationship_type_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.relationship_type_id IS NULL AND NEW.type IS NOT NULL THEN
    SELECT id INTO NEW.relationship_type_id
    FROM relationship_type_master
    WHERE code = NEW.type
      AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
      AND deleted_at IS NULL
    ORDER BY tenant_id NULLS LAST  -- tenant override wins
    LIMIT 1;

    IF NEW.relationship_type_id IS NULL THEN
      RAISE EXCEPTION 'Unknown firm.type: %. Insert a relationship_type_master row first.', NEW.type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_firm_relationship_type_id
  BEFORE INSERT OR UPDATE OF type ON firm
  FOR EACH ROW EXECUTE FUNCTION sync_firm_relationship_type_id();


-- ─── 6. Index on the new FK ───────────────────────────────────
CREATE INDEX IF NOT EXISTS firm_relationship_type_id_idx
  ON firm (relationship_type_id) WHERE deleted_at IS NULL;
