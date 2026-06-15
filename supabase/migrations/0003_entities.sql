-- ============================================================
-- 0003_entities.sql
-- Slice 1 core entities: users, pipeline stages, CRM, projects,
-- specifications, samples, quotations, tasks, timeline, notifications
--
-- Invariants (per Constitution):
--   - tenant_id on every table
--   - audit cols (created_at/by, updated_at/by) on mutable tables
--   - soft-delete (deleted_at) on all mutable business objects
--   - Supabase RLS on every table
--   - Append-only: audit_log, activity, project_stage_history
--
-- Sensitive columns (masked from role='sales_engineer' at app layer):
--   product.base_price, quotation.discount_pct,
--   quotation_line.discount_pct, project.order_value
-- ============================================================


-- ─── 1. USER PROFILE ─────────────────────────────────────────────────────────
-- Extends auth.users with tenant membership and role.
-- The JWT hook (auth.custom_access_token_hook) reads this to embed
-- tenant_id + role into every JWT — enable it in Supabase Dashboard →
-- Auth → Hooks → Custom Access Token.

CREATE TABLE user_profile (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  role        TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'sales_engineer')),
  full_name   TEXT NOT NULL,
  phone       TEXT,
  territory   TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_tenant_read" ON user_profile
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY "own_tenant_insert" ON user_profile
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "own_tenant_update" ON user_profile
  FOR UPDATE USING (tenant_id = current_tenant_id());

CREATE INDEX user_profile_tenant_idx ON user_profile (tenant_id, role, is_active);


-- ─── Auth custom access token hook ───────────────────────────────────────────
-- Cannot be created via migration on hosted Supabase (auth schema is restricted).
-- Run the hook function manually in the Dashboard SQL editor — see docs/setup-auth-hook.sql


-- ─── 2. PIPELINE STAGE ───────────────────────────────────────────────────────
-- Lightweight, data-driven stage list per segment.
-- tenant_id IS NULL → system-provided (visible to all tenants).
-- Slice 1 seeds: Specified → Tracking → Paving Stage → Quoting → Won / Lost.
-- is_paving_stage = true triggers the hero follow-up flow (Inngest picks this up).

CREATE TABLE pipeline_stage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenant(id),  -- NULL = system stage
  segment         TEXT NOT NULL DEFAULT 'architect',
  stage_key       TEXT NOT NULL,
  label           TEXT NOT NULL,
  order_index     INTEGER NOT NULL,
  color           TEXT NOT NULL DEFAULT '#94a3b8',
  is_paving_stage BOOLEAN NOT NULL DEFAULT false,
  is_terminal     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pipeline_stage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON pipeline_stage
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());

CREATE POLICY "write_own" ON pipeline_stage
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- Unique constraints handle NULLs via partial indexes
CREATE UNIQUE INDEX pipeline_stage_system_uniq
  ON pipeline_stage (segment, stage_key) WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX pipeline_stage_tenant_uniq
  ON pipeline_stage (tenant_id, segment, stage_key) WHERE tenant_id IS NOT NULL;

CREATE INDEX pipeline_stage_segment_idx ON pipeline_stage (segment, order_index);


-- ─── 3. FIRM ─────────────────────────────────────────────────────────────────

CREATE TABLE firm (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('architect', 'contractor', 'developer', 'owner', 'dealer', 'government', 'other')),
  city        TEXT,
  state       TEXT NOT NULL DEFAULT 'Gujarat',
  gstin       TEXT,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE firm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON firm
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON firm
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX firm_tenant_type_idx ON firm (tenant_id, type) WHERE deleted_at IS NULL;
CREATE INDEX firm_name_trgm_idx ON firm USING GIN (name gin_trgm_ops);


-- ─── 4. CONTACT ──────────────────────────────────────────────────────────────

CREATE TABLE contact (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  firm_id     UUID REFERENCES firm(id),
  full_name   TEXT NOT NULL,
  role_title  TEXT,
  phone       TEXT,
  email       TEXT,
  city        TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE contact ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON contact
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON contact
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX contact_tenant_idx ON contact (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX contact_firm_idx ON contact (firm_id) WHERE deleted_at IS NULL;
CREATE INDEX contact_name_trgm_idx ON contact USING GIN (full_name gin_trgm_ops);


-- ─── 5. PRODUCT ──────────────────────────────────────────────────────────────
-- SENSITIVE: base_price masked from role='sales_engineer' at application layer.
-- MRP is the customer-facing price; base_price is the internal reference.

CREATE TABLE product (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenant(id),
  sku_code     TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Paver'
                 CHECK (category IN ('Paver', 'Kerb', 'Step', 'Drain', 'Grass Paver', 'Cobble', 'Other')),
  unit         TEXT NOT NULL DEFAULT 'sqft'
                 CHECK (unit IN ('sqft', 'sqm', 'nos', 'rft', 'running metre')),
  base_price   NUMERIC(10,2),  -- SENSITIVE: internal cost/base; mask from sales_engineer
  mrp          NUMERIC(10,2),  -- customer-facing listed price
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (tenant_id, sku_code)
);

ALTER TABLE product ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON product
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON product
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX product_tenant_active_idx ON product (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX product_name_trgm_idx ON product USING GIN (name gin_trgm_ops);


-- ─── 6. PROJECT ──────────────────────────────────────────────────────────────
-- The spine of the system. Every other entity links here.
-- SENSITIVE: order_value masked from sales_engineer at app layer.

CREATE TABLE project (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenant(id),
  name              TEXT NOT NULL,
  segment           TEXT NOT NULL DEFAULT 'architect'
                      CHECK (segment IN ('architect', 'dealer', 'tender', 'retail', 'government', 'corporate', 'generic')),
  current_stage_id  UUID NOT NULL REFERENCES pipeline_stage(id),
  buyer_firm_id     UUID REFERENCES firm(id),
  architect_firm_id UUID REFERENCES firm(id),
  territory         TEXT,
  owner_id          UUID NOT NULL REFERENCES user_profile(id),
  city              TEXT,
  state             TEXT NOT NULL DEFAULT 'Gujarat',
  estimated_value   NUMERIC(14,2),
  order_value       NUMERIC(14,2),  -- SENSITIVE: masked from sales_engineer
  won_quote_id      UUID,           -- FK added below after quotation table
  loss_reason_code  TEXT,
  custom_fields     JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES auth.users(id),
  deleted_at        TIMESTAMPTZ
);

ALTER TABLE project ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON project
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON project
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX project_tenant_stage_idx ON project (tenant_id, current_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX project_owner_idx ON project (tenant_id, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX project_name_trgm_idx ON project USING GIN (name gin_trgm_ops);


-- ─── 7. PROJECT STAKEHOLDER ──────────────────────────────────────────────────

CREATE TABLE project_stakeholder (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  project_id  UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contact(id),
  role        TEXT NOT NULL CHECK (role IN ('specifier', 'buyer', 'influencer', 'decision_maker', 'contractor')),
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, contact_id, role)
);

ALTER TABLE project_stakeholder ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON project_stakeholder
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_insert" ON project_stakeholder
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX stakeholder_project_idx ON project_stakeholder (project_id, role);


-- ─── 8. PROJECT STAGE HISTORY ────────────────────────────────────────────────
-- Immutable log of every stage transition. Append-only.

CREATE TABLE project_stage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  project_id    UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stage(id),  -- NULL on initial creation
  to_stage_id   UUID NOT NULL REFERENCES pipeline_stage(id),
  actor_id      UUID REFERENCES auth.users(id),
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE project_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON project_stage_history
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_insert" ON project_stage_history
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON project_stage_history FROM authenticated;

CREATE INDEX stage_history_project_idx ON project_stage_history (project_id, created_at DESC);


-- ─── 9. SPECIFICATION ────────────────────────────────────────────────────────
-- What products an architect has specified for a project.
-- This is what triggers the paving-stage follow-up — if specifications exist
-- and the project advances to paving_stage, the hero flow kicks in.

CREATE TABLE specification (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenant(id),
  project_id              UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  product_id              UUID NOT NULL REFERENCES product(id),
  specified_by_contact_id UUID REFERENCES contact(id),
  finish                  TEXT,
  quantity                NUMERIC(10,2),
  unit                    TEXT,
  area_sqft               NUMERIC(10,2),
  notes                   TEXT,
  is_confirmed            BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES auth.users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES auth.users(id),
  deleted_at              TIMESTAMPTZ
);

ALTER TABLE specification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON specification
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON specification
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX specification_project_idx ON specification (project_id) WHERE deleted_at IS NULL;


-- ─── 10. SAMPLE REQUEST ──────────────────────────────────────────────────────

CREATE TABLE sample_request (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenant(id),
  project_id     UUID NOT NULL REFERENCES project(id),
  contact_id     UUID REFERENCES contact(id),
  product_id     UUID NOT NULL REFERENCES product(id),
  quantity       INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'dispatched', 'delivered',
                                     'outcome_positive', 'outcome_negative', 'cancelled')),
  dispatched_at  TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  outcome_notes  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES auth.users(id),
  deleted_at     TIMESTAMPTZ
);

ALTER TABLE sample_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON sample_request
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON sample_request
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX sample_request_project_idx ON sample_request (project_id) WHERE deleted_at IS NULL;
CREATE INDEX sample_request_status_idx  ON sample_request (tenant_id, status) WHERE deleted_at IS NULL;


-- ─── 11. QUOTATION ───────────────────────────────────────────────────────────
-- SENSITIVE: discount_pct masked from sales_engineer at app layer.
-- quotation_number is auto-generated by trigger below.

CREATE SEQUENCE IF NOT EXISTS quotation_seq;

CREATE TABLE quotation (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenant(id),
  project_id        UUID NOT NULL REFERENCES project(id),
  quotation_number  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'revised', 'accepted', 'rejected', 'expired')),
  valid_until       DATE,
  notes             TEXT,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,  -- SENSITIVE
  total             NUMERIC(14,2) NOT NULL DEFAULT 0,
  sent_at           TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES auth.users(id),
  deleted_at        TIMESTAMPTZ
);

ALTER TABLE quotation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON quotation
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON quotation
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX quotation_number_tenant_idx ON quotation (tenant_id, quotation_number);
CREATE INDEX quotation_project_idx ON quotation (project_id) WHERE deleted_at IS NULL;
CREATE INDEX quotation_status_idx  ON quotation (tenant_id, status) WHERE deleted_at IS NULL;

-- Auto-generate quotation number: VT-QT-YYYY-NNNN
CREATE OR REPLACE FUNCTION set_quotation_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quotation_number IS NULL OR NEW.quotation_number = '' THEN
    NEW.quotation_number :=
      'VT-QT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quotation_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotation_number
  BEFORE INSERT ON quotation
  FOR EACH ROW EXECUTE FUNCTION set_quotation_number();


-- ─── 12. QUOTATION LINE ──────────────────────────────────────────────────────
-- Snapshots sku_code, product_name, unit_price at creation — never re-read
-- live catalog after a quote is sent (per Constitution §8).
-- SENSITIVE: discount_pct masked from sales_engineer at app layer.

CREATE TABLE quotation_line (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  quotation_id  UUID NOT NULL REFERENCES quotation(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES product(id),  -- nullable (snapshot survives catalog delete)
  product_name  TEXT NOT NULL,   -- snapshot
  sku_code      TEXT NOT NULL,   -- snapshot
  unit          TEXT NOT NULL,   -- snapshot
  quantity      NUMERIC(10,2) NOT NULL,
  unit_price    NUMERIC(10,2) NOT NULL,  -- snapshot at time of quote
  discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,  -- SENSITIVE
  line_total    NUMERIC(14,2) NOT NULL,
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE quotation_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON quotation_line
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_insert" ON quotation_line
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX quotation_line_quotation_idx ON quotation_line (quotation_id);


-- Back-fill the circular FK from project to quotation
ALTER TABLE project
  ADD CONSTRAINT project_won_quote_fk
  FOREIGN KEY (won_quote_id) REFERENCES quotation(id);


-- ─── 13. TASK ────────────────────────────────────────────────────────────────
-- Polymorphic-light: project_id is nullable (global tasks have no project).
-- type distinguishes manual from system-generated tasks.
-- Inngest creates paving_followup + stale_quote tasks automatically.

CREATE TABLE task (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  project_id          UUID REFERENCES project(id),
  type                TEXT NOT NULL DEFAULT 'manual'
                        CHECK (type IN ('manual', 'paving_followup', 'stale_quote', 'sample_outcome', 'system')),
  title               TEXT NOT NULL,
  description         TEXT,
  due_at              TIMESTAMPTZ,
  priority            TEXT NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  is_done             BOOLEAN NOT NULL DEFAULT false,
  done_at             TIMESTAMPTZ,
  assignee_id         UUID REFERENCES user_profile(id),
  created_by_id       UUID REFERENCES auth.users(id),
  source_entity_type  TEXT,   -- 'project' | 'sample_request' | 'quotation'
  source_entity_id    UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

ALTER TABLE task ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON task
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE POLICY "tenant_insert" ON task
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX task_assignee_idx ON task (tenant_id, assignee_id, is_done) WHERE deleted_at IS NULL;
CREATE INDEX task_project_idx  ON task (project_id) WHERE deleted_at IS NULL;
CREATE INDEX task_due_idx      ON task (tenant_id, due_at) WHERE is_done = false AND deleted_at IS NULL;


-- ─── 14. ACTIVITY (Timeline) ─────────────────────────────────────────────────
-- Append-only feed attached to every core entity.
-- Triggers below auto-insert entries on key state changes.
-- project_id is denormalized for fast project-timeline queries.

CREATE TABLE activity (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenant(id),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  project_id   UUID REFERENCES project(id),
  type         TEXT NOT NULL
                 CHECK (type IN ('created', 'updated', 'stage_changed', 'sample_requested',
                                  'sample_updated', 'quote_created', 'quote_sent',
                                  'task_created', 'task_done', 'note', 'call',
                                  'visit', 'notification', 'system')),
  actor_id     UUID REFERENCES auth.users(id),
  content      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON activity
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_insert" ON activity
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON activity FROM authenticated;

CREATE INDEX activity_project_idx ON activity (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX activity_entity_idx  ON activity (tenant_id, entity_type, entity_id, created_at DESC);


-- ─── 15. NOTIFICATION ────────────────────────────────────────────────────────
-- User inbox. Inserted by Inngest (service role bypasses RLS).
-- Users may only read and mark-read their own notifications.

CREATE TABLE notification (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenant(id),
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  project_id   UUID REFERENCES project(id),
  entity_type  TEXT,
  entity_id    UUID,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_notifications_read" ON notification
  FOR SELECT USING (tenant_id = current_tenant_id() AND user_id = auth.uid());

CREATE POLICY "own_notifications_update" ON notification
  FOR UPDATE USING (tenant_id = current_tenant_id() AND user_id = auth.uid());

CREATE INDEX notification_user_idx    ON notification (user_id, is_read, created_at DESC);
CREATE INDEX notification_project_idx ON notification (project_id) WHERE project_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- AUTO-LOGGING TRIGGERS
-- Every key state change writes an activity row automatically.
-- SECURITY DEFINER so they can INSERT into activity from any caller context.
-- actor_id = auth.uid() — NULL for service-role/seed operations (acceptable).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Project: log creation and stage changes
CREATE OR REPLACE FUNCTION trg_fn_project_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'project', NEW.id, NEW.id, 'created', auth.uid(),
            jsonb_build_object('name', NEW.name, 'segment', NEW.segment,
                               'stage_id', NEW.current_stage_id));

  ELSIF TG_OP = 'UPDATE'
    AND OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'project', NEW.id, NEW.id, 'stage_changed', auth.uid(),
            jsonb_build_object('from_stage_id', OLD.current_stage_id,
                               'to_stage_id', NEW.current_stage_id));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_activity
  AFTER INSERT OR UPDATE ON project
  FOR EACH ROW EXECUTE FUNCTION trg_fn_project_activity();


-- Task: log creation and completion
CREATE OR REPLACE FUNCTION trg_fn_task_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'task', NEW.id, NEW.project_id, 'task_created', auth.uid(),
            jsonb_build_object('title', NEW.title, 'priority', NEW.priority, 'type', NEW.type));

  ELSIF TG_OP = 'UPDATE'
    AND OLD.is_done = false AND NEW.is_done = true THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'task', NEW.id, NEW.project_id, 'task_done', auth.uid(),
            jsonb_build_object('title', NEW.title));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_activity
  AFTER INSERT OR UPDATE ON task
  FOR EACH ROW EXECUTE FUNCTION trg_fn_task_activity();


-- Sample request: log creation
CREATE OR REPLACE FUNCTION trg_fn_sample_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'sample_request', NEW.id, NEW.project_id,
            'sample_requested', auth.uid(),
            jsonb_build_object('product_id', NEW.product_id, 'quantity', NEW.quantity));

  ELSIF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'sample_request', NEW.id, NEW.project_id,
            'sample_updated', auth.uid(),
            jsonb_build_object('status', NEW.status, 'outcome_notes', NEW.outcome_notes));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sample_activity
  AFTER INSERT OR UPDATE ON sample_request
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sample_activity();


-- Quotation: log creation and send
CREATE OR REPLACE FUNCTION trg_fn_quotation_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'quotation', NEW.id, NEW.project_id,
            'quote_created', auth.uid(),
            jsonb_build_object('quotation_number', NEW.quotation_number, 'total', NEW.total));

  ELSIF TG_OP = 'UPDATE'
    AND OLD.status != 'sent' AND NEW.status = 'sent' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'quotation', NEW.id, NEW.project_id,
            'quote_sent', auth.uid(),
            jsonb_build_object('quotation_number', NEW.quotation_number, 'total', NEW.total));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotation_activity
  AFTER INSERT OR UPDATE ON quotation
  FOR EACH ROW EXECUTE FUNCTION trg_fn_quotation_activity();
