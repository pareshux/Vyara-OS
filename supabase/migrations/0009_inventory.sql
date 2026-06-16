-- ============================================================
-- 0009_inventory.sql  — Slice 2.5: Operational Inventory module
--
-- Owns its own tables (warehouse, stock, stock_*). Cross-module
-- communication via Inngest events only. Reads from product
-- (catalog) and tenant; writes nothing to other modules.
--
-- Load-bearing invariant: the application layer NEVER updates
-- stock.* columns directly. Every change comes through a
-- stock_movement insert, and the trigger updates stock atomically.
-- This guarantees the ledger is always reconcilable with state.
--
-- Customer-#2 readiness notes baked in:
--   - All movement_type / warehouse_type / adjustment_type values
--     are generic (not Vyara-specific)
--   - approval threshold is a per-tenant setting (in tenant.settings)
--   - seed data is minimal & explicitly labelled
-- ============================================================


-- ─── 1. WAREHOUSE ────────────────────────────────────────────────────────────
CREATE TABLE warehouse (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'own_plant'
                CHECK (type IN ('own_plant', 'transit', 'samples', 'dealer_consignment', 'other')),
  address     TEXT,
  city        TEXT,
  state       TEXT NOT NULL DEFAULT 'Gujarat',
  manager_id  UUID REFERENCES user_profile(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE warehouse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON warehouse
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON warehouse
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX warehouse_code_tenant_uniq ON warehouse (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX warehouse_active_idx ON warehouse (tenant_id, type, is_active) WHERE deleted_at IS NULL;


-- ─── 2. STOCK (per warehouse × product) ──────────────────────────────────────
-- One row per (warehouse, product). All quantity columns are non-negative
-- by trigger discipline (the trigger raises if a movement would push them
-- below zero — see trg_fn_stock_movement_apply).

CREATE TABLE stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouse(id),
  product_id      UUID NOT NULL REFERENCES product(id),
  available_qty   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
  reserved_qty    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  min_level       NUMERIC(14,2),
  max_level       NUMERIC(14,2),
  last_movement_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON stock
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON stock
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX stock_warehouse_idx ON stock (warehouse_id);
CREATE INDEX stock_product_idx   ON stock (product_id);
CREATE INDEX stock_low_idx       ON stock (tenant_id) WHERE min_level IS NOT NULL AND available_qty < min_level;


-- ─── 3. STOCK_MOVEMENT (append-only ledger) ──────────────────────────────────
-- Every stock change MUST come through here. The trigger updates the
-- stock row. The ledger is the source of truth; stock.* columns are
-- a materialized cache that can always be rebuilt from movements.

CREATE TABLE stock_movement (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  warehouse_id        UUID NOT NULL REFERENCES warehouse(id),
  product_id          UUID NOT NULL REFERENCES product(id),
  movement_type       TEXT NOT NULL CHECK (movement_type IN (
    'receipt',           -- stock coming in (production, opening balance)
    'direct_issue',      -- stock going out without prior reservation
    'dispatch_issue',    -- stock going out via a consumed reservation (reduces reserved_qty)
    'transfer_in',       -- received from another warehouse
    'transfer_out',      -- sent to another warehouse
    'adjustment_plus',   -- positive correction (found stock, recount up)
    'adjustment_minus',  -- negative correction (damage, recount down)
    'sample_issue',      -- sample sent out (only valid from type='samples' warehouses)
    'reservation_in',    -- stock reserved (available → reserved)
    'reservation_out'    -- reservation released back to available
  )),
  quantity            NUMERIC(14,2) NOT NULL CHECK (quantity > 0),  -- always positive; type determines direction
  reason_code         TEXT,
  related_entity_type TEXT,
  related_entity_id   UUID,
  actor_id            UUID REFERENCES auth.users(id),
  remark              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_movement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON stock_movement
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON stock_movement
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON stock_movement FROM authenticated;

CREATE INDEX stock_movement_idx ON stock_movement (warehouse_id, product_id, created_at DESC);
CREATE INDEX stock_movement_related_idx ON stock_movement (related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL;


-- ─── 4. STOCK MOVEMENT → STOCK APPLY TRIGGER ─────────────────────────────────
-- The single load-bearing piece of logic in this module.

CREATE OR REPLACE FUNCTION trg_fn_stock_movement_apply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Ensure a stock row exists for this (warehouse, product)
  INSERT INTO stock (tenant_id, warehouse_id, product_id)
  VALUES (NEW.tenant_id, NEW.warehouse_id, NEW.product_id)
  ON CONFLICT (warehouse_id, product_id) DO NOTHING;

  -- Apply the delta. NUMERIC math; the column CHECKs guard against negative results.
  IF NEW.movement_type IN ('receipt', 'transfer_in', 'adjustment_plus') THEN
    UPDATE stock
    SET available_qty = available_qty + NEW.quantity,
        last_movement_at = NEW.created_at,
        updated_at = now()
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id;

  ELSIF NEW.movement_type IN ('direct_issue', 'transfer_out', 'adjustment_minus', 'sample_issue') THEN
    UPDATE stock
    SET available_qty = available_qty - NEW.quantity,
        last_movement_at = NEW.created_at,
        updated_at = now()
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id;

  ELSIF NEW.movement_type = 'reservation_in' THEN
    UPDATE stock
    SET available_qty = available_qty - NEW.quantity,
        reserved_qty  = reserved_qty  + NEW.quantity,
        last_movement_at = NEW.created_at,
        updated_at = now()
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id;

  ELSIF NEW.movement_type = 'reservation_out' THEN
    UPDATE stock
    SET reserved_qty  = reserved_qty  - NEW.quantity,
        available_qty = available_qty + NEW.quantity,
        last_movement_at = NEW.created_at,
        updated_at = now()
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id;

  ELSIF NEW.movement_type = 'dispatch_issue' THEN
    UPDATE stock
    SET reserved_qty = reserved_qty - NEW.quantity,
        last_movement_at = NEW.created_at,
        updated_at = now()
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_movement_apply
  AFTER INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION trg_fn_stock_movement_apply();


-- ─── 5. STOCK_RESERVATION ────────────────────────────────────────────────────
-- An explicit reservation row linking (warehouse, product, qty) to a
-- related entity (sales_order_line, sample_request). Status transitions:
--   active → consumed (on dispatch)
--   active → released (on cancellation or manual release)
--   active → expired (by expiry cron — future)

CREATE TABLE stock_reservation (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  warehouse_id        UUID NOT NULL REFERENCES warehouse(id),
  product_id          UUID NOT NULL REFERENCES product(id),
  quantity            NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'consumed', 'released', 'expired')),
  related_entity_type TEXT NOT NULL,   -- 'sales_order_line', 'sample_request'
  related_entity_id   UUID NOT NULL,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id),
  consumed_at         TIMESTAMPTZ,
  released_at         TIMESTAMPTZ,
  release_reason      TEXT
);

ALTER TABLE stock_reservation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON stock_reservation
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON stock_reservation
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- Prevent double-active reservations for the same source entity line
CREATE UNIQUE INDEX stock_reservation_active_uniq
  ON stock_reservation (related_entity_type, related_entity_id, product_id)
  WHERE status = 'active';

CREATE INDEX stock_reservation_related_idx ON stock_reservation (related_entity_type, related_entity_id);
CREATE INDEX stock_reservation_status_idx  ON stock_reservation (tenant_id, status) WHERE status = 'active';


-- ─── 6. STOCK_ADJUSTMENT ─────────────────────────────────────────────────────
-- Tracks deliberate ledger corrections (damage write-offs, recounts, etc.)
-- with optional approval workflow. The actual ledger entry is in
-- stock_movement; this table records *why* and tracks the approval.

CREATE TABLE stock_adjustment (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  warehouse_id        UUID NOT NULL REFERENCES warehouse(id),
  product_id          UUID NOT NULL REFERENCES product(id),
  adjustment_type     TEXT NOT NULL CHECK (adjustment_type IN ('damage', 'count_diff', 'correction', 'opening_balance', 'other')),
  quantity_delta      NUMERIC(14,2) NOT NULL,           -- signed: positive = add, negative = remove
  estimated_value     NUMERIC(14,2),                    -- ₹ value at time of adjustment (for threshold check)
  reason              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  movement_id         UUID REFERENCES stock_movement(id),  -- set after the ledger entry is created
  requested_by        UUID REFERENCES auth.users(id),
  approved_by         UUID REFERENCES auth.users(id),
  approved_at         TIMESTAMPTZ,
  rejected_reason     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_adjustment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON stock_adjustment
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON stock_adjustment
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX stock_adjustment_status_idx ON stock_adjustment (tenant_id, status, created_at DESC);
CREATE INDEX stock_adjustment_warehouse_idx ON stock_adjustment (warehouse_id, created_at DESC);


-- ─── 7. STOCK_TRANSFER + LINES ───────────────────────────────────────────────
-- Multi-line warehouse-to-warehouse transfer. State: draft → in_transit →
-- completed | cancelled. Transitions trigger movements on both warehouses.

CREATE SEQUENCE IF NOT EXISTS stock_transfer_seq;

CREATE TABLE stock_transfer (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  transfer_number     TEXT NOT NULL,
  from_warehouse_id   UUID NOT NULL REFERENCES warehouse(id),
  to_warehouse_id     UUID NOT NULL REFERENCES warehouse(id),
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'in_transit', 'completed', 'cancelled')),
  scheduled_at        TIMESTAMPTZ,
  shipped_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id),
  deleted_at          TIMESTAMPTZ,
  CHECK (from_warehouse_id != to_warehouse_id)
);

ALTER TABLE stock_transfer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON stock_transfer
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON stock_transfer
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX stock_transfer_number_uniq ON stock_transfer (tenant_id, transfer_number);
CREATE INDEX stock_transfer_status_idx ON stock_transfer (tenant_id, status) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_stock_transfer_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.transfer_number IS NULL OR NEW.transfer_number = '' THEN
    NEW.transfer_number :=
      'VT-ST-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('stock_transfer_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_transfer_number
  BEFORE INSERT ON stock_transfer
  FOR EACH ROW EXECUTE FUNCTION set_stock_transfer_number();


CREATE TABLE stock_transfer_line (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  stock_transfer_id   UUID NOT NULL REFERENCES stock_transfer(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES product(id),
  quantity            NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  notes               TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE stock_transfer_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON stock_transfer_line
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON stock_transfer_line
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX stock_transfer_line_idx ON stock_transfer_line (stock_transfer_id);


-- ─── 8. EXTEND task.type AND activity.type FOR INVENTORY ─────────────────────
ALTER TABLE task DROP CONSTRAINT IF EXISTS task_type_check;
ALTER TABLE task ADD CONSTRAINT task_type_check
  CHECK (type IN ('manual', 'paving_followup', 'stale_quote', 'sample_outcome', 'system',
                  'order_followup', 'dispatch_schedule', 'dispatch_pod_pending',
                  'invoice_send', 'invoice_overdue', 'collection_followup', 'payment_ptp',
                  -- Slice 2.5
                  'stock_low', 'stock_adjustment_approval', 'stock_transfer_confirm'));

ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_type_check;
ALTER TABLE activity ADD CONSTRAINT activity_type_check
  CHECK (type IN ('created', 'updated', 'stage_changed', 'sample_requested',
                  'sample_updated', 'quote_created', 'quote_sent',
                  'task_created', 'task_done', 'note', 'call',
                  'visit', 'notification', 'system',
                  'dispatch_scheduled', 'dispatch_delivered',
                  'invoice_created', 'invoice_sent', 'invoice_overdue',
                  'payment_received', 'dunning_sent', 'ptp_recorded',
                  -- Slice 2.5
                  'stock_movement', 'stock_adjustment', 'stock_transfer', 'stock_reservation'));


-- ─── 9. SEED warehouses for Vyara (the launch customer) ─────────────────────
-- Two seeds: a commercial plant + a sample warehouse. Tier-2 customers
-- will typically have just one own_plant warehouse to start.

INSERT INTO warehouse (id, tenant_id, code, name, type, city, state, notes) VALUES
  ('e0000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'SURAT-PLANT-1', 'Surat Plant 1',     'own_plant', 'Surat', 'Gujarat',
   'Primary commercial production + stocking warehouse'),
  ('e0000000-0000-0000-0000-000000000002'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'SAMPLES-SURAT', 'Samples - Surat',   'samples',   'Surat', 'Gujarat',
   'Dedicated sample-stock bucket. Sample requests draw from here so they cannot poison commercial availability.');


-- ─── 10. PER-TENANT SETTINGS: inventory adjustment approval threshold ───────
-- Stored on tenant.settings JSONB (already exists). Default = ₹10,000 worth
-- of stock requires manager approval; below the threshold, auto-approved.
-- This is read by the server action; not enforced by a constraint.

UPDATE tenant
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'inventory', jsonb_build_object(
    'adjustment_approval_threshold_inr', 10000,
    'default_warehouse_code', 'SURAT-PLANT-1'
  )
)
WHERE id = 'a1111111-1111-1111-1111-111111111111'::uuid;
