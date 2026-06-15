-- ============================================================
-- 0005_dispatch.sql  — Slice 2 / Step 2: Dispatch module
--
-- Owns its own tables (dispatch_*). Listens for order.confirmed
-- (well, order.created in this slice — production-readiness is the next
-- valid trigger; we model the transition manually for now).
--
-- Emits dispatch.delivered on POD capture, which the Invoice module
-- (Step 3) listens for.
-- ============================================================


-- ─── 1. DISPATCH_STAGE ───────────────────────────────────────────────────────
CREATE TABLE dispatch_stage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),
  stage_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  color       TEXT NOT NULL DEFAULT '#94a3b8',
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dispatch_stage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON dispatch_stage
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "write_own" ON dispatch_stage
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX dispatch_stage_system_uniq ON dispatch_stage (stage_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX dispatch_stage_tenant_uniq ON dispatch_stage (tenant_id, stage_key) WHERE tenant_id IS NOT NULL;


-- ─── 2. DISPATCH ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS dispatch_seq;

CREATE TABLE dispatch (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenant(id),
  dispatch_number    TEXT NOT NULL,
  sales_order_id     UUID NOT NULL REFERENCES sales_order(id),
  project_id         UUID NOT NULL REFERENCES project(id),  -- denormalized for timeline
  transporter_id     UUID REFERENCES transporter(id),
  current_stage_id   UUID NOT NULL REFERENCES dispatch_stage(id),

  lr_number          TEXT,          -- Lorry Receipt number
  vehicle_number     TEXT,
  driver_phone       TEXT,
  scheduled_at       TIMESTAMPTZ,
  dispatched_at      TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,

  -- POD (Proof of Delivery) capture
  pod_url            TEXT,          -- Storage path in dispatch-pod bucket
  pod_signature_name TEXT,          -- who signed on the receiver side
  pod_uploaded_at    TIMESTAMPTZ,
  pod_uploaded_by    UUID REFERENCES auth.users(id),

  notes              TEXT,
  owner_id           UUID NOT NULL REFERENCES user_profile(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES auth.users(id),
  deleted_at         TIMESTAMPTZ
);

ALTER TABLE dispatch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON dispatch
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON dispatch
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX dispatch_number_tenant_idx ON dispatch (tenant_id, dispatch_number);
CREATE INDEX dispatch_order_idx     ON dispatch (sales_order_id) WHERE deleted_at IS NULL;
CREATE INDEX dispatch_project_idx   ON dispatch (project_id)     WHERE deleted_at IS NULL;
CREATE INDEX dispatch_stage_idx     ON dispatch (tenant_id, current_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX dispatch_scheduled_idx ON dispatch (tenant_id, scheduled_at) WHERE deleted_at IS NULL;

-- Auto-generate dispatch number: VT-DC-YYYY-NNNN
CREATE OR REPLACE FUNCTION set_dispatch_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.dispatch_number IS NULL OR NEW.dispatch_number = '' THEN
    NEW.dispatch_number :=
      'VT-DC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('dispatch_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dispatch_number
  BEFORE INSERT ON dispatch
  FOR EACH ROW EXECUTE FUNCTION set_dispatch_number();


-- ─── 3. DISPATCH_LINE (what's actually being shipped) ────────────────────────
CREATE TABLE dispatch_line (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenant(id),
  dispatch_id        UUID NOT NULL REFERENCES dispatch(id) ON DELETE CASCADE,
  sales_order_line_id UUID REFERENCES sales_order_line(id),  -- cross-module ref OK
  product_name       TEXT NOT NULL,
  sku_code           TEXT NOT NULL,
  unit               TEXT NOT NULL,
  quantity           NUMERIC(10,2) NOT NULL,
  notes              TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE dispatch_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON dispatch_line
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON dispatch_line
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX dispatch_line_dispatch_idx ON dispatch_line (dispatch_id);


-- ─── 4. DISPATCH_STAGE_HISTORY ───────────────────────────────────────────────
CREATE TABLE dispatch_stage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  dispatch_id   UUID NOT NULL REFERENCES dispatch(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES dispatch_stage(id),
  to_stage_id   UUID NOT NULL REFERENCES dispatch_stage(id),
  actor_id      UUID REFERENCES auth.users(id),
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dispatch_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON dispatch_stage_history
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON dispatch_stage_history
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON dispatch_stage_history FROM authenticated;

CREATE INDEX d_stage_history_dispatch_idx ON dispatch_stage_history (dispatch_id, created_at DESC);


-- ─── 5. ACTIVITY TRIGGER ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_dispatch_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'dispatch', NEW.id, NEW.project_id, 'dispatch_scheduled', auth.uid(),
            jsonb_build_object('dispatch_number', NEW.dispatch_number,
                               'sales_order_id', NEW.sales_order_id,
                               'scheduled_at', NEW.scheduled_at));

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
      INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
      VALUES (NEW.tenant_id, 'dispatch', NEW.id, NEW.project_id, 'stage_changed', auth.uid(),
              jsonb_build_object('dispatch_number', NEW.dispatch_number,
                                 'from_stage_id', OLD.current_stage_id,
                                 'to_stage_id', NEW.current_stage_id));
    END IF;

    IF OLD.delivered_at IS NULL AND NEW.delivered_at IS NOT NULL THEN
      INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
      VALUES (NEW.tenant_id, 'dispatch', NEW.id, NEW.project_id, 'dispatch_delivered', auth.uid(),
              jsonb_build_object('dispatch_number', NEW.dispatch_number,
                                 'delivered_at', NEW.delivered_at));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dispatch_activity
  AFTER INSERT OR UPDATE ON dispatch
  FOR EACH ROW EXECUTE FUNCTION trg_fn_dispatch_activity();


-- ─── 6. SEED dispatch_stage system rows ─────────────────────────────────────
INSERT INTO dispatch_stage (id, tenant_id, stage_key, label, order_index, color, is_terminal) VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, NULL, 'scheduled',     'Scheduled',      1, '#60a5fa', false),
  ('b0000000-0000-0000-0000-000000000002'::uuid, NULL, 'in_transit',    'In Transit',     2, '#a78bfa', false),
  ('b0000000-0000-0000-0000-000000000003'::uuid, NULL, 'delivered',     'Delivered',      3, '#fbbf24', false),
  ('b0000000-0000-0000-0000-000000000004'::uuid, NULL, 'pod_uploaded',  'POD Uploaded',   4, '#22c55e', false),
  ('b0000000-0000-0000-0000-000000000005'::uuid, NULL, 'closed',        'Closed',         5, '#6b7280', true),
  ('b0000000-0000-0000-0000-000000000006'::uuid, NULL, 'cancelled',     'Cancelled',      6, '#ef4444', true);


-- ─── 7. SUPABASE STORAGE BUCKET for POD images ──────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dispatch-pod', 'dispatch-pod', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — authenticated tenant users may read/write their own tenant's PODs.
-- Convention: pod path = "<tenant_id>/<dispatch_id>/<filename>"
CREATE POLICY "tenant_read_pod" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispatch-pod'
    AND (storage.foldername(name))[1] = current_tenant_id()::TEXT
  );

CREATE POLICY "tenant_write_pod" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispatch-pod'
    AND (storage.foldername(name))[1] = current_tenant_id()::TEXT
  );

CREATE POLICY "tenant_update_pod" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dispatch-pod'
    AND (storage.foldername(name))[1] = current_tenant_id()::TEXT
  );
