-- ============================================================
-- 0029_type_masters.sql — Sprint 1.3 (Platform foundations)
--
-- Converts task.type and activity.type from CHECK-constraint
-- enums into master tables. Stops the per-migration CHECK
-- extension pattern that's been the source of latent bugs
-- (e.g. ai_extraction.entity_kind 'business_card' lived in
-- code for ~5 months before 0027 added it to the CHECK).
--
-- Strategy:
--   1. Create task_type_master + activity_type_master
--      (tenant_id NULL = system row visible to all tenants;
--       tenant_id set = tenant-extension).
--   2. Seed system rows = every code currently in the CHECKs.
--      module_code FK to tenant_feature.code lets us hide types
--      tied to disabled modules in admin UI / filters.
--   3. Backfill task.type_id / activity.type_id from existing
--      type TEXT via code match.
--   4. Drop the CHECK constraints (the master is now the source
--      of truth; the sync triggers below enforce "type must
--      exist in master" at INSERT time).
--   5. Add BEFORE INSERT/UPDATE triggers that resolve type → type_id.
--      Old call sites that write { type: 'planned_visit', ... }
--      keep working — the trigger fills type_id automatically and
--      RAISEs if the code is unknown (clearer error than a CHECK
--      violation, and the master is one DML away from extending).
--
-- task.type TEXT and activity.type TEXT remain in place for now
-- (one slice of backwards-compat). New code can write type_id
-- directly; old code keeps using type. Sprint 2 retires .type
-- once the call sites are all migrated.
-- ============================================================


-- ─── 1. task_type_master ──────────────────────────────────────
CREATE TABLE task_type_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),       -- NULL = system row
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT,                              -- 'sales' | 'fulfilment' | 'finance' | 'inventory' | 'field' | 'general'
  module_code TEXT,                              -- joins tenant_feature.code; NULL = always available
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE task_type_master ENABLE ROW LEVEL SECURITY;

-- Read: system rows visible to all; tenant rows visible to own tenant.
CREATE POLICY "read_system_or_own" ON task_type_master
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
-- Write: tenants may only extend (not modify system rows).
CREATE POLICY "tenant_write" ON task_type_master
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update" ON task_type_master
  FOR UPDATE USING (tenant_id = current_tenant_id());

-- Unique code (per tenant, or globally for system rows).
CREATE UNIQUE INDEX task_type_master_system_uniq
  ON task_type_master (code) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX task_type_master_tenant_uniq
  ON task_type_master (tenant_id, code) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;
-- Hot path for the sync trigger.
CREATE INDEX task_type_master_code_idx
  ON task_type_master (code, tenant_id) WHERE deleted_at IS NULL;


-- ─── 2. activity_type_master (mirror shape) ───────────────────
CREATE TABLE activity_type_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT,
  module_code TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE activity_type_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_system_or_own" ON activity_type_master
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "tenant_write" ON activity_type_master
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update" ON activity_type_master
  FOR UPDATE USING (tenant_id = current_tenant_id());
CREATE UNIQUE INDEX activity_type_master_system_uniq
  ON activity_type_master (code) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX activity_type_master_tenant_uniq
  ON activity_type_master (tenant_id, code) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX activity_type_master_code_idx
  ON activity_type_master (code, tenant_id) WHERE deleted_at IS NULL;


-- ─── 3. Seed system rows (every code currently in the CHECKs) ─

-- Task types — accumulated across migrations 0003, 0004, 0009, 0022, 0025.
INSERT INTO task_type_master (tenant_id, code, label, category, module_code, sort_order) VALUES
  -- Core / general
  (NULL, 'manual',                     'Manual task',                'general',   NULL,                  10),
  (NULL, 'system',                     'System task',                'general',   NULL,                  20),
  -- Sales pipeline
  (NULL, 'paving_followup',            'Paving stage follow-up',     'sales',     NULL,                  30),
  (NULL, 'stale_quote',                'Stale quote',                'sales',     NULL,                  40),
  (NULL, 'sample_outcome',             'Sample outcome pending',     'sales',     NULL,                  50),
  (NULL, 'order_followup',             'Order follow-up',            'sales',     NULL,                  60),
  (NULL, 'lead_followup',              'Lead follow-up',             'sales',     NULL,                  70),
  (NULL, 'lead_stale',                 'Stale lead',                 'sales',     NULL,                  80),
  -- Fulfilment
  (NULL, 'dispatch_schedule',          'Schedule dispatch',          'fulfilment','enable_dispatches',   90),
  (NULL, 'dispatch_pod_pending',       'POD pending',                'fulfilment','enable_dispatches',  100),
  -- Finance
  (NULL, 'invoice_send',               'Send invoice',               'finance',   NULL,                 110),
  (NULL, 'invoice_overdue',            'Invoice overdue',            'finance',   NULL,                 120),
  (NULL, 'collection_followup',        'Collection follow-up',       'finance',   'enable_collections', 130),
  (NULL, 'payment_ptp',                'Promise-to-pay due',         'finance',   'enable_collections', 140),
  -- Inventory
  (NULL, 'stock_low',                  'Low stock',                  'inventory', 'enable_inventory',   150),
  (NULL, 'stock_adjustment_approval',  'Stock adjustment approval',  'inventory', 'enable_inventory',   160),
  (NULL, 'stock_transfer_confirm',     'Confirm stock transfer',     'inventory', 'enable_inventory',   170),
  -- Field sales
  (NULL, 'planned_visit',              'Planned visit',              'field',     'enable_field_sales', 180);

-- Activity types — accumulated across 0003, 0004, 0009, 0021, 0022.
INSERT INTO activity_type_master (tenant_id, code, label, category, module_code, sort_order) VALUES
  -- System / lifecycle
  (NULL, 'created',                   'Created',                    'system',    NULL,                  10),
  (NULL, 'updated',                   'Updated',                    'system',    NULL,                  20),
  (NULL, 'system',                    'System event',               'system',    NULL,                  30),
  (NULL, 'stage_changed',             'Stage changed',              'pipeline',  NULL,                  40),
  -- General human-driven
  (NULL, 'note',                      'Note',                       'general',   NULL,                  50),
  (NULL, 'notification',              'Notification sent',          'general',   NULL,                  60),
  (NULL, 'task_created',              'Task created',               'general',   NULL,                  70),
  (NULL, 'task_done',                 'Task done',                  'general',   NULL,                  80),
  -- Sales engagement
  (NULL, 'call',                      'Call logged',                'sales',     NULL,                  90),
  (NULL, 'visit',                     'Visit logged',               'sales',     'enable_field_sales', 100),
  (NULL, 'sample_requested',          'Sample requested',           'sales',     NULL,                 110),
  (NULL, 'sample_updated',            'Sample updated',             'sales',     NULL,                 120),
  (NULL, 'quote_created',             'Quote created',              'sales',     NULL,                 130),
  (NULL, 'quote_sent',                'Quote sent',                 'sales',     NULL,                 140),
  -- Fulfilment
  (NULL, 'dispatch_scheduled',        'Dispatch scheduled',         'fulfilment','enable_dispatches',  150),
  (NULL, 'dispatch_delivered',        'Dispatch delivered',         'fulfilment','enable_dispatches',  160),
  -- Finance
  (NULL, 'invoice_created',           'Invoice created',            'finance',   NULL,                 170),
  (NULL, 'invoice_sent',              'Invoice sent',               'finance',   NULL,                 180),
  (NULL, 'invoice_overdue',           'Invoice overdue',            'finance',   NULL,                 190),
  (NULL, 'payment_received',          'Payment received',           'finance',   'enable_collections', 200),
  (NULL, 'dunning_sent',              'Dunning sent',               'finance',   'enable_collections', 210),
  (NULL, 'ptp_recorded',              'Promise-to-pay recorded',    'finance',   'enable_collections', 220),
  -- Inventory
  (NULL, 'stock_movement',            'Stock movement',             'inventory', 'enable_inventory',   230),
  (NULL, 'stock_adjustment',          'Stock adjustment',           'inventory', 'enable_inventory',   240),
  (NULL, 'stock_transfer',            'Stock transfer',             'inventory', 'enable_inventory',   250),
  (NULL, 'stock_reservation',         'Stock reservation',          'inventory', 'enable_inventory',   260),
  -- Lead module
  (NULL, 'lead_won',                  'Lead won',                   'sales',     NULL,                 270),
  (NULL, 'lead_lost',                 'Lead lost',                  'sales',     NULL,                 280),
  (NULL, 'lead_assigned',             'Lead assigned',              'sales',     NULL,                 290),
  (NULL, 'lead_meeting',              'Lead meeting',               'sales',     NULL,                 300),
  (NULL, 'lead_quote_request',        'Lead quote request',         'sales',     NULL,                 310),
  (NULL, 'lead_sample_request',       'Lead sample request',        'sales',     NULL,                 320),
  -- Platform
  (NULL, 'ai_extraction',             'AI extraction',              'platform',  'enable_ai_surfaces', 330);


-- ─── 4. Add FK columns + backfill from existing TEXT ──────────

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES task_type_master(id);

ALTER TABLE activity
  ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES activity_type_master(id);

-- Backfill task.type_id from system rows (every task today references a
-- system code). Tenant-extension rows don't exist yet.
UPDATE task t
SET type_id = m.id
FROM task_type_master m
WHERE m.tenant_id IS NULL
  AND m.code = t.type
  AND m.deleted_at IS NULL
  AND t.type_id IS NULL;

UPDATE activity a
SET type_id = m.id
FROM activity_type_master m
WHERE m.tenant_id IS NULL
  AND m.code = a.type
  AND m.deleted_at IS NULL
  AND a.type_id IS NULL;


-- ─── 5. Drop the CHECK constraints ────────────────────────────
-- Master tables are now the source of truth; sync triggers below
-- enforce "type must exist in master" with a clearer error.

ALTER TABLE task     DROP CONSTRAINT IF EXISTS task_type_check;
ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_type_check;


-- ─── 6. Sync triggers — keep type TEXT and type_id in lockstep ──

CREATE OR REPLACE FUNCTION sync_task_type_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type_id IS NULL AND NEW.type IS NOT NULL THEN
    -- Prefer tenant-specific override (tenant_id = NEW.tenant_id),
    -- fall back to system row (tenant_id IS NULL).
    SELECT id INTO NEW.type_id
    FROM task_type_master
    WHERE code = NEW.type
      AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
      AND deleted_at IS NULL
    ORDER BY tenant_id NULLS LAST  -- tenant override wins
    LIMIT 1;

    IF NEW.type_id IS NULL THEN
      RAISE EXCEPTION 'Unknown task.type: %. Insert a task_type_master row first.', NEW.type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_task_type_id
  BEFORE INSERT OR UPDATE OF type ON task
  FOR EACH ROW EXECUTE FUNCTION sync_task_type_id();

CREATE OR REPLACE FUNCTION sync_activity_type_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type_id IS NULL AND NEW.type IS NOT NULL THEN
    SELECT id INTO NEW.type_id
    FROM activity_type_master
    WHERE code = NEW.type
      AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
      AND deleted_at IS NULL
    ORDER BY tenant_id NULLS LAST
    LIMIT 1;

    IF NEW.type_id IS NULL THEN
      RAISE EXCEPTION 'Unknown activity.type: %. Insert an activity_type_master row first.', NEW.type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_activity_type_id
  BEFORE INSERT OR UPDATE OF type ON activity
  FOR EACH ROW EXECUTE FUNCTION sync_activity_type_id();


-- ─── 7. Index on type_id for join performance ────────────────
CREATE INDEX IF NOT EXISTS task_type_id_idx     ON task     (type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS activity_type_id_idx ON activity (type_id);
