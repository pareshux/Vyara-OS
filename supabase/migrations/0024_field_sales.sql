-- ============================================================
-- 0024_field_sales.sql — Field Sales module (Slice 4 Step 1)
--
-- Sales-force automation: rep check-in/out, visit & call logging,
-- vehicle assignment, km-based reimbursement claims.
--
-- Schema overview:
--   Masters
--     visit_purpose
--     visit_outcome
--     vehicle_type
--     fuel_type
--     vehicle_reimbursement_rate    (matrix: type × fuel × ₹/km, effective-dated)
--   Entities
--     vehicle                       (with current assigned_user_id; per-vehicle rate override)
--     vehicle_assignment_history    (append-only audit of swaps)
--     field_attendance              (one row per user per day — also carries the claim)
--     field_visit                   (linked to attendance + subject Business Object)
--     field_call                    (lighter — phone / WhatsApp log)
--
-- Conventions (per Constitution):
--   - tenant_id on every table
--   - audit cols + soft-delete on mutable entities
--   - RLS: tenant isolation always; field_attendance / field_visit / field_call
--     also gated to (user_id = auth.uid() OR role IN ('admin','manager'))
--   - Append-only: vehicle_assignment_history (no UPDATE / DELETE)
--   - field_visit / field_call subject = four nullable FKs (project / lead / firm /
--     dealer) with num_nonnulls()=1. Stronger integrity than a TEXT polymorphic;
--     new subject types require a small migration, which is acceptable.
--   - Auto-approve threshold, working hours, geofence radius — live in
--     tenant.settings JSON (not new columns), so customer #2 configures
--     without schema change.
-- ============================================================


-- ─── 1. VISIT_PURPOSE master ──────────────────────────────────────────────────
CREATE TABLE visit_purpose (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE visit_purpose ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON visit_purpose
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX visit_purpose_code_uniq
  ON visit_purpose (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX visit_purpose_active_idx
  ON visit_purpose (tenant_id, is_active, sort_order) WHERE deleted_at IS NULL;


-- ─── 2. VISIT_OUTCOME master ──────────────────────────────────────────────────
CREATE TABLE visit_outcome (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  code            TEXT NOT NULL,
  label           TEXT NOT NULL,
  -- is_positive lets us aggregate "positive visits / total" without
  -- the dashboard knowing which codes mean "good" for a given tenant.
  is_positive     BOOLEAN NOT NULL DEFAULT false,
  -- requires_followup is a UI hint: when chosen, the visit form
  -- auto-suggests creating a task.
  requires_followup BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ
);

ALTER TABLE visit_outcome ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON visit_outcome
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX visit_outcome_code_uniq
  ON visit_outcome (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX visit_outcome_active_idx
  ON visit_outcome (tenant_id, is_active, sort_order) WHERE deleted_at IS NULL;


-- ─── 3. VEHICLE_TYPE master ───────────────────────────────────────────────────
CREATE TABLE vehicle_type (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE vehicle_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vehicle_type
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX vehicle_type_code_uniq
  ON vehicle_type (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX vehicle_type_active_idx
  ON vehicle_type (tenant_id, is_active, sort_order) WHERE deleted_at IS NULL;


-- ─── 4. FUEL_TYPE master ──────────────────────────────────────────────────────
CREATE TABLE fuel_type (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE fuel_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON fuel_type
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX fuel_type_code_uniq
  ON fuel_type (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX fuel_type_active_idx
  ON fuel_type (tenant_id, is_active, sort_order) WHERE deleted_at IS NULL;


-- ─── 5. VEHICLE_REIMBURSEMENT_RATE master ─────────────────────────────────────
-- Effective-dated matrix. Only one "current" rate per (type, fuel) at a time:
-- enforced by the partial unique index where effective_to IS NULL.
-- Resolution order in app code: vehicle.custom_rate_per_km
--   > current matrix row for the vehicle's (type, fuel)
--   > NULL (claim cannot be auto-computed; manager enters manually).

CREATE TABLE vehicle_reimbursement_rate (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_type(id),
  fuel_type_id    UUID NOT NULL REFERENCES fuel_type(id),
  rate_per_km     NUMERIC(8,2) NOT NULL CHECK (rate_per_km >= 0),
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

ALTER TABLE vehicle_reimbursement_rate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vehicle_reimbursement_rate
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX vehicle_rate_current_uniq
  ON vehicle_reimbursement_rate (tenant_id, vehicle_type_id, fuel_type_id)
  WHERE effective_to IS NULL AND deleted_at IS NULL;

CREATE INDEX vehicle_rate_lookup_idx
  ON vehicle_reimbursement_rate (tenant_id, vehicle_type_id, fuel_type_id, effective_from DESC)
  WHERE deleted_at IS NULL;


-- ─── 6. VEHICLE ───────────────────────────────────────────────────────────────
-- One row per physical vehicle. assigned_user_id is the current primary
-- driver (nullable — unassigned pool is valid). Reassignment writes a
-- new vehicle_assignment_history row + flips this field — wired in app code.

CREATE TABLE vehicle (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenant(id),
  vehicle_number     TEXT NOT NULL,
  vehicle_type_id    UUID NOT NULL REFERENCES vehicle_type(id),
  fuel_type_id       UUID NOT NULL REFERENCES fuel_type(id),
  ownership          TEXT NOT NULL DEFAULT 'personal'
                       CHECK (ownership IN ('company', 'personal')),
  assigned_user_id   UUID REFERENCES user_profile(id),
  -- Per-vehicle override of the (type × fuel) matrix rate. NULL → use matrix.
  custom_rate_per_km NUMERIC(8,2) CHECK (custom_rate_per_km IS NULL OR custom_rate_per_km >= 0),
  make_model         TEXT,
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES auth.users(id),
  deleted_at         TIMESTAMPTZ
);

ALTER TABLE vehicle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vehicle
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX vehicle_number_uniq
  ON vehicle (tenant_id, vehicle_number) WHERE deleted_at IS NULL;
CREATE INDEX vehicle_assigned_idx
  ON vehicle (tenant_id, assigned_user_id) WHERE deleted_at IS NULL AND assigned_user_id IS NOT NULL;
CREATE INDEX vehicle_active_idx
  ON vehicle (tenant_id, is_active) WHERE deleted_at IS NULL;


-- ─── 7. VEHICLE_ASSIGNMENT_HISTORY (append-only) ──────────────────────────────
CREATE TABLE vehicle_assignment_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  vehicle_id  UUID NOT NULL REFERENCES vehicle(id),
  user_id     UUID REFERENCES user_profile(id),  -- nullable = unassigned period
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  reason      TEXT,
  assigned_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vehicle_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vehicle_assignment_history
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON vehicle_assignment_history
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON vehicle_assignment_history FROM authenticated;

CREATE INDEX vehicle_assn_history_vehicle_idx
  ON vehicle_assignment_history (vehicle_id, assigned_at DESC);
CREATE INDEX vehicle_assn_history_user_idx
  ON vehicle_assignment_history (user_id, assigned_at DESC) WHERE user_id IS NOT NULL;


-- ─── 8. FIELD_ATTENDANCE ──────────────────────────────────────────────────────
-- One row per (user, attendance_date). Carries check-in, check-out,
-- vehicle for the day, odometer readings, and the auto-computed
-- reimbursement claim. status_for_day distinguishes WFH/leave/holiday
-- from on-duty days so the manager dashboard shows "on leave" not "missing".

CREATE TABLE field_attendance (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  user_id                  UUID NOT NULL REFERENCES user_profile(id),
  attendance_date          DATE NOT NULL,
  status_for_day           TEXT NOT NULL DEFAULT 'on_duty'
                             CHECK (status_for_day IN ('on_duty', 'wfh', 'leave', 'holiday')),

  -- Check-in
  check_in_at              TIMESTAMPTZ,
  check_in_lat             NUMERIC(9,6),
  check_in_lng             NUMERIC(9,6),
  check_in_odometer_km     INTEGER CHECK (check_in_odometer_km IS NULL OR check_in_odometer_km >= 0),
  check_in_photo_url       TEXT,

  -- Check-out
  check_out_at             TIMESTAMPTZ,
  check_out_lat            NUMERIC(9,6),
  check_out_lng            NUMERIC(9,6),
  check_out_odometer_km    INTEGER CHECK (check_out_odometer_km IS NULL OR check_out_odometer_km >= 0),
  check_out_photo_url      TEXT,

  -- Vehicle + claim (vehicle chosen at check-in; reps can override the
  -- default assigned_user_id vehicle for the day, e.g. when swapping cars).
  vehicle_id               UUID REFERENCES vehicle(id),
  total_km                 INTEGER GENERATED ALWAYS AS (
                             CASE
                               WHEN check_out_odometer_km IS NOT NULL
                                AND check_in_odometer_km IS NOT NULL
                                AND check_out_odometer_km >= check_in_odometer_km
                               THEN check_out_odometer_km - check_in_odometer_km
                               ELSE NULL
                             END
                           ) STORED,
  -- Rate snapshotted on check-out so the claim doesn't drift if the
  -- matrix is edited later. NULL until check-out / claim computation.
  rate_applied             NUMERIC(8,2),
  reimbursement_amount     NUMERIC(12,2),

  claim_status             TEXT NOT NULL DEFAULT 'draft'
                             CHECK (claim_status IN
                               ('draft', 'submitted', 'approved', 'rejected', 'exported')),
  submitted_at             TIMESTAMPTZ,
  approved_at              TIMESTAMPTZ,
  approved_by              UUID REFERENCES user_profile(id),
  rejection_reason         TEXT,

  notes                    TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES auth.users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               UUID REFERENCES auth.users(id),
  deleted_at               TIMESTAMPTZ,

  CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
);

ALTER TABLE field_attendance ENABLE ROW LEVEL SECURITY;

-- Reps see only their own days; managers/admins see everyone in the tenant.
CREATE POLICY "own_or_team_select" ON field_attendance
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE POLICY "own_insert" ON field_attendance
  FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

-- Reps can update their own row (within app-layer edit window);
-- managers/admins can update any row (e.g. approve/reject claim).
CREATE POLICY "own_or_team_update" ON field_attendance
  FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE UNIQUE INDEX field_attendance_user_date_uniq
  ON field_attendance (tenant_id, user_id, attendance_date) WHERE deleted_at IS NULL;
CREATE INDEX field_attendance_team_date_idx
  ON field_attendance (tenant_id, attendance_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX field_attendance_claim_status_idx
  ON field_attendance (tenant_id, claim_status, attendance_date DESC)
  WHERE deleted_at IS NULL AND claim_status IN ('submitted', 'approved');


-- ─── 9. FIELD_VISIT ───────────────────────────────────────────────────────────
-- Each visit attaches to exactly one subject Business Object via four
-- nullable FKs + a num_nonnulls()=1 check. Enforces integrity without
-- a TEXT polymorphic. Adding a new subject type later is one ALTER.

CREATE TABLE field_visit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  attendance_id       UUID REFERENCES field_attendance(id),
  user_id             UUID NOT NULL REFERENCES user_profile(id),

  visited_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes    INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),

  visit_purpose_id    UUID REFERENCES visit_purpose(id),
  visit_outcome_id    UUID REFERENCES visit_outcome(id),

  -- Subject: exactly one of these is set.
  project_id          UUID REFERENCES project(id),
  lead_id             UUID REFERENCES lead(id),
  firm_id             UUID REFERENCES firm(id),
  dealer_id           UUID REFERENCES dealer(id),

  contact_id          UUID REFERENCES contact(id),  -- who was met (optional)

  -- Location stamp
  lat                 NUMERIC(9,6),
  lng                 NUMERIC(9,6),
  location_label      TEXT,

  -- Content
  notes_text          TEXT,
  voice_note_url      TEXT,
  photo_urls          TEXT[] NOT NULL DEFAULT '{}',
  ai_extracted_payload JSONB,  -- structured output from voice → AI extraction

  -- Edit window: app enforces 24h then locks; this column lets the manager
  -- know a record was retroactively amended.
  locked_at           TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id),
  deleted_at          TIMESTAMPTZ,

  CHECK (num_nonnulls(project_id, lead_id, firm_id, dealer_id) = 1)
);

ALTER TABLE field_visit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_or_team_select" ON field_visit
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE POLICY "own_insert" ON field_visit
  FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE POLICY "own_or_team_update" ON field_visit
  FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE INDEX field_visit_attendance_idx ON field_visit (attendance_id) WHERE deleted_at IS NULL;
CREATE INDEX field_visit_user_date_idx  ON field_visit (tenant_id, user_id, visited_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX field_visit_project_idx    ON field_visit (project_id, visited_at DESC) WHERE project_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX field_visit_lead_idx       ON field_visit (lead_id, visited_at DESC)    WHERE lead_id IS NOT NULL    AND deleted_at IS NULL;
CREATE INDEX field_visit_firm_idx       ON field_visit (firm_id, visited_at DESC)    WHERE firm_id IS NOT NULL    AND deleted_at IS NULL;
CREATE INDEX field_visit_dealer_idx     ON field_visit (dealer_id, visited_at DESC)  WHERE dealer_id IS NOT NULL  AND deleted_at IS NULL;


-- ─── 10. FIELD_CALL ───────────────────────────────────────────────────────────
-- Lighter — phone / WhatsApp log. Same subject discipline as field_visit.
-- duration in seconds (phone-call granularity).

CREATE TABLE field_call (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenant(id),
  attendance_id      UUID REFERENCES field_attendance(id),
  user_id            UUID NOT NULL REFERENCES user_profile(id),

  called_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel            TEXT NOT NULL DEFAULT 'call'
                       CHECK (channel IN ('call', 'whatsapp')),
  direction          TEXT NOT NULL DEFAULT 'outbound'
                       CHECK (direction IN ('inbound', 'outbound')),
  duration_seconds   INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),

  visit_outcome_id   UUID REFERENCES visit_outcome(id),

  project_id         UUID REFERENCES project(id),
  lead_id            UUID REFERENCES lead(id),
  firm_id            UUID REFERENCES firm(id),
  dealer_id          UUID REFERENCES dealer(id),
  contact_id         UUID REFERENCES contact(id),

  notes_text         TEXT,

  locked_at          TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES auth.users(id),
  deleted_at         TIMESTAMPTZ,

  CHECK (num_nonnulls(project_id, lead_id, firm_id, dealer_id) = 1)
);

ALTER TABLE field_call ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_or_team_select" ON field_call
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE POLICY "own_insert" ON field_call
  FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE POLICY "own_or_team_update" ON field_call
  FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE INDEX field_call_attendance_idx ON field_call (attendance_id) WHERE deleted_at IS NULL;
CREATE INDEX field_call_user_date_idx  ON field_call (tenant_id, user_id, called_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX field_call_project_idx    ON field_call (project_id, called_at DESC) WHERE project_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX field_call_lead_idx       ON field_call (lead_id, called_at DESC)    WHERE lead_id IS NOT NULL    AND deleted_at IS NULL;
CREATE INDEX field_call_firm_idx       ON field_call (firm_id, called_at DESC)    WHERE firm_id IS NOT NULL    AND deleted_at IS NULL;
CREATE INDEX field_call_dealer_idx     ON field_call (dealer_id, called_at DESC)  WHERE dealer_id IS NOT NULL  AND deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA (Vyara tenant)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── visit_purpose ────────────────────────────────────────────────────────────
INSERT INTO visit_purpose (id, tenant_id, code, label, sort_order) VALUES
  ('ad000000-0000-0000-0000-000000000001'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'INTRO',    'Introduction / cold call', 10),
  ('ad000000-0000-0000-0000-000000000002'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'SITE',     'Site survey',              20),
  ('ad000000-0000-0000-0000-000000000003'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'DEMO',     'Product demo / showroom',  30),
  ('ad000000-0000-0000-0000-000000000004'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'NEGO',     'Negotiation / commercial', 40),
  ('ad000000-0000-0000-0000-000000000005'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'COLL',     'Collection follow-up',     50),
  ('ad000000-0000-0000-0000-000000000006'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'SVC',      'Service / complaint',      60);


-- ─── visit_outcome ────────────────────────────────────────────────────────────
INSERT INTO visit_outcome (id, tenant_id, code, label, is_positive, requires_followup, sort_order) VALUES
  ('ae000000-0000-0000-0000-000000000001'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'POSITIVE', 'Positive — proceed',      true,  false, 10),
  ('ae000000-0000-0000-0000-000000000002'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'FOLLOWUP', 'Follow-up needed',        false, true,  20),
  ('ae000000-0000-0000-0000-000000000003'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'SAMPLE',   'Sample requested',        true,  true,  30),
  ('ae000000-0000-0000-0000-000000000004'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'QUOTE',    'Quote requested',         true,  true,  40),
  ('ae000000-0000-0000-0000-000000000005'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'WON',      'Order won / verbal commit', true, false, 50),
  ('ae000000-0000-0000-0000-000000000006'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'LOST',     'Lost / no interest',      false, false, 60);


-- ─── vehicle_type ─────────────────────────────────────────────────────────────
INSERT INTO vehicle_type (id, tenant_id, code, label, sort_order) VALUES
  ('af000000-0000-0000-0000-000000000001'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'BIKE',   'Bike / Scooter',     10),
  ('af000000-0000-0000-0000-000000000002'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'CAR',    'Car',                20),
  ('af000000-0000-0000-0000-000000000003'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'AUTO',   'Auto rickshaw',      30),
  ('af000000-0000-0000-0000-000000000004'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'PICKUP', 'Pickup / small truck', 40),
  ('af000000-0000-0000-0000-000000000005'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'VAN',    'Van',                50);


-- ─── fuel_type ────────────────────────────────────────────────────────────────
INSERT INTO fuel_type (id, tenant_id, code, label, sort_order) VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'PETROL', 'Petrol',     10),
  ('b0000000-0000-0000-0000-000000000002'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'DIESEL', 'Diesel',     20),
  ('b0000000-0000-0000-0000-000000000003'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'CNG',    'CNG',        30),
  ('b0000000-0000-0000-0000-000000000004'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'EV',     'Electric',   40),
  ('b0000000-0000-0000-0000-000000000005'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'HYBRID', 'Hybrid',     50);


-- ─── vehicle_reimbursement_rate (current matrix) ──────────────────────────────
-- Rates picked as plausible mid-2026 India defaults. Tenant edits via /admin.
INSERT INTO vehicle_reimbursement_rate
  (id, tenant_id, vehicle_type_id, fuel_type_id, rate_per_km) VALUES
  -- Bike
  ('b1000000-0000-0000-0000-000000000001'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 4.50),  -- bike + petrol
  ('b1000000-0000-0000-0000-000000000002'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000004'::uuid, 2.50),  -- bike + EV
  -- Car
  ('b1000000-0000-0000-0000-000000000003'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 10.00), -- car + petrol
  ('b1000000-0000-0000-0000-000000000004'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid,  8.50), -- car + diesel
  ('b1000000-0000-0000-0000-000000000005'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000003'::uuid,  6.50), -- car + CNG
  ('b1000000-0000-0000-0000-000000000006'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000004'::uuid,  4.00), -- car + EV
  ('b1000000-0000-0000-0000-000000000007'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000005'::uuid,  7.00), -- car + hybrid
  -- Auto
  ('b1000000-0000-0000-0000-000000000008'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000003'::uuid, 'b0000000-0000-0000-0000-000000000003'::uuid,  5.50), -- auto + CNG
  -- Pickup / Van
  ('b1000000-0000-0000-0000-000000000009'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000004'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid, 12.00), -- pickup + diesel
  ('b1000000-0000-0000-0000-00000000000a'::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid,
   'af000000-0000-0000-0000-000000000005'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid, 13.00); -- van + diesel


-- ─── vehicle (assigned to existing demo users by name) ───────────────────────
-- Wrapped in a DO block because the user_profile IDs aren't known at write
-- time; we look them up. If users aren't seeded yet (fresh deploys), exit
-- gracefully and the admin seeds vehicles via the UI.
DO $$
DECLARE
  v_tenant       UUID := 'a1111111-1111-1111-1111-111111111111';
  v_priya        UUID;
  v_mehul        UUID;
  v_nisha        UUID;
BEGIN
  SELECT id INTO v_priya FROM user_profile
    WHERE tenant_id = v_tenant AND full_name = 'Priya Shah' LIMIT 1;
  SELECT id INTO v_mehul FROM user_profile
    WHERE tenant_id = v_tenant AND full_name = 'Mehul Vora' LIMIT 1;
  SELECT id INTO v_nisha FROM user_profile
    WHERE tenant_id = v_tenant AND full_name = 'Nisha Kapoor' LIMIT 1;

  IF v_priya IS NULL THEN
    RAISE NOTICE 'Demo users not seeded — skipping vehicle seed.';
    RETURN;
  END IF;

  -- Priya (sales engineer) — petrol bike, matrix rate
  INSERT INTO vehicle
    (id, tenant_id, vehicle_number, vehicle_type_id, fuel_type_id, ownership,
     assigned_user_id, make_model, notes)
  VALUES
    ('b2000000-0000-0000-0000-000000000001'::uuid, v_tenant,
     'GJ-05-AB-1234',
     'af000000-0000-0000-0000-000000000001'::uuid,  -- bike
     'b0000000-0000-0000-0000-000000000001'::uuid,  -- petrol
     'personal', v_priya, 'Honda Activa 6G', 'Primary daily-use scooter.');

  -- Mehul (manager) — CNG car with custom rate override (₹7.50 vs matrix ₹6.50)
  IF v_mehul IS NOT NULL THEN
    INSERT INTO vehicle
      (id, tenant_id, vehicle_number, vehicle_type_id, fuel_type_id, ownership,
       assigned_user_id, custom_rate_per_km, make_model, notes)
    VALUES
      ('b2000000-0000-0000-0000-000000000002'::uuid, v_tenant,
       'GJ-05-CD-5678',
       'af000000-0000-0000-0000-000000000002'::uuid,  -- car
       'b0000000-0000-0000-0000-000000000003'::uuid,  -- CNG
       'personal', v_mehul, 7.50, 'Maruti Dzire CNG',
       'Custom rate ₹7.50/km (above matrix ₹6.50) — agreed at appointment.');
  END IF;

  -- Nisha (sales engineer) — diesel car, matrix rate
  IF v_nisha IS NOT NULL THEN
    INSERT INTO vehicle
      (id, tenant_id, vehicle_number, vehicle_type_id, fuel_type_id, ownership,
       assigned_user_id, make_model, notes)
    VALUES
      ('b2000000-0000-0000-0000-000000000003'::uuid, v_tenant,
       'GJ-01-EF-9012',
       'af000000-0000-0000-0000-000000000002'::uuid,  -- car
       'b0000000-0000-0000-0000-000000000002'::uuid,  -- diesel
       'personal', v_nisha, 'Hyundai i20 Diesel', 'Ahmedabad territory daily-use.');
  END IF;

  -- Mirror current assignments into history so the audit table isn't empty.
  INSERT INTO vehicle_assignment_history
    (tenant_id, vehicle_id, user_id, reason)
  SELECT tenant_id, id, assigned_user_id, 'Initial assignment (seed)'
  FROM vehicle
  WHERE tenant_id = v_tenant AND assigned_user_id IS NOT NULL;
END $$;
