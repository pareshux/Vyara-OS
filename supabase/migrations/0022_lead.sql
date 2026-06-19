-- ─── Lead module (Sales capability) ────────────────────────────────────────
-- Captures demand from every commercial motion (architect-specified, tender,
-- direct contractor, dealer). Sits BEFORE the project module — won leads
-- convert to projects (markLeadWon creates a project + links lead.project_id).
--
-- Design follows the Vyara module pattern:
--  - Own tables (prefix lead_), no cross-module writes
--  - Data-driven stages (lead_stage with system seeds + tenant overrides)
--  - Tenant-configurable sources + loss reasons
--  - Reuses the platform spine: activity / task / notification
--  - Append-only stage history


-- ─── 1. lead_stage ──────────────────────────────────────────────────────────
CREATE TABLE lead_stage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenant(id),    -- NULL = system seed
  stage_key       TEXT NOT NULL,                 -- 'new', 'contacted', 'qualified', ...
  label           TEXT NOT NULL,
  order_index     INTEGER NOT NULL,
  color           TEXT NOT NULL DEFAULT '#94a3b8',
  is_terminal     BOOLEAN NOT NULL DEFAULT false, -- 'won', 'lost' are terminal
  is_won          BOOLEAN NOT NULL DEFAULT false, -- exactly one
  is_lost         BOOLEAN NOT NULL DEFAULT false, -- exactly one
  sla_days        INTEGER,                       -- expected time-in-stage
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lead_stage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON lead_stage
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "write_own" ON lead_stage
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX lead_stage_system_uniq
  ON lead_stage (stage_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX lead_stage_tenant_uniq
  ON lead_stage (tenant_id, stage_key) WHERE tenant_id IS NOT NULL;
CREATE INDEX lead_stage_order_idx ON lead_stage (order_index);

COMMENT ON TABLE lead_stage IS 'Per-segment lead pipeline stages — data-driven per Principle #4.';


-- ─── 2. lead_source ─────────────────────────────────────────────────────────
CREATE TABLE lead_source (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  code            TEXT NOT NULL,                 -- 'website', 'walk_in', 'referral', ...
  label           TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ
);

ALTER TABLE lead_source ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON lead_source
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON lead_source
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX lead_source_tenant_code_uniq ON lead_source (tenant_id, code) WHERE deleted_at IS NULL;


-- ─── 3. lead_loss_reason ────────────────────────────────────────────────────
CREATE TABLE lead_loss_reason (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  code            TEXT NOT NULL,
  label           TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

ALTER TABLE lead_loss_reason ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON lead_loss_reason
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON lead_loss_reason
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX lead_loss_reason_tenant_code_uniq ON lead_loss_reason (tenant_id, code) WHERE deleted_at IS NULL;


-- ─── 4. lead ────────────────────────────────────────────────────────────────
CREATE TABLE lead (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  lead_number         TEXT NOT NULL,             -- auto VT-LD-YYYY-NNNN
  title               TEXT NOT NULL,             -- short descriptor: "Greenvista Township paving"
  segment             TEXT NOT NULL DEFAULT 'architect'
                        CHECK (segment IN ('architect','dealer','tender','retail','government','corporate','generic')),
  source_id           UUID REFERENCES lead_source(id),
  current_stage_id    UUID NOT NULL REFERENCES lead_stage(id),

  -- Parties (optional — sometimes a lead comes in before contact / firm is created)
  buyer_firm_id       UUID REFERENCES firm(id),
  architect_firm_id   UUID REFERENCES firm(id),
  primary_contact_id  UUID REFERENCES contact(id),
  contact_name_raw    TEXT,                       -- "Mr Patel, GreenVista", before formal contact created
  contact_phone_raw   TEXT,
  contact_email_raw   TEXT,

  -- Project context
  city                TEXT,
  state               TEXT NOT NULL DEFAULT 'Gujarat',
  territory           TEXT,
  estimated_value     NUMERIC(14,2),              -- in rupees, the project size if we win
  expected_close_at   DATE,                       -- when we expect to win/lose

  -- Ownership
  owner_id            UUID NOT NULL REFERENCES user_profile(id),

  -- Outcome (set on terminal stages)
  won_at              TIMESTAMPTZ,
  won_project_id      UUID REFERENCES project(id), -- the project created on conversion
  lost_at             TIMESTAMPTZ,
  lost_reason_id      UUID REFERENCES lead_loss_reason(id),
  lost_remark         TEXT,

  notes               TEXT,
  custom_fields       JSONB NOT NULL DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id),
  last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT now(), -- for stalled-lead detection
  deleted_at          TIMESTAMPTZ
);

ALTER TABLE lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON lead
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON lead
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX lead_tenant_stage_idx ON lead (tenant_id, current_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX lead_tenant_owner_idx ON lead (tenant_id, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX lead_tenant_source_idx ON lead (tenant_id, source_id) WHERE deleted_at IS NULL;
CREATE INDEX lead_tenant_created_idx ON lead (tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- ─── 4b. lead_seq + auto-numbering trigger ──────────────────────────────────
CREATE SEQUENCE lead_seq START 1;

CREATE OR REPLACE FUNCTION set_lead_number() RETURNS trigger AS $$
BEGIN
  IF NEW.lead_number IS NULL OR NEW.lead_number = '' THEN
    NEW.lead_number := 'VT-LD-' || EXTRACT(YEAR FROM now())::TEXT
                       || '-' || LPAD(nextval('lead_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_number
  BEFORE INSERT ON lead
  FOR EACH ROW EXECUTE FUNCTION set_lead_number();


-- ─── 5. lead_stage_history (append-only) ────────────────────────────────────
CREATE TABLE lead_stage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  lead_id       UUID NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES lead_stage(id),
  to_stage_id   UUID NOT NULL REFERENCES lead_stage(id),
  actor_id      UUID REFERENCES auth.users(id),
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON lead_stage_history
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON lead_stage_history
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON lead_stage_history FROM authenticated;

CREATE INDEX lead_stage_history_lead_idx ON lead_stage_history (lead_id, created_at DESC);


-- ─── 6. Activity trigger: auto-write 'created' on INSERT ───────────────────
-- Stage change activity is written by the server action (it has access to the
-- actor + remark), so we only auto-write on creation here.
CREATE OR REPLACE FUNCTION trg_lead_activity_created() RETURNS trigger AS $$
BEGIN
  INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
  VALUES (
    NEW.tenant_id,
    'lead',
    NEW.id,
    NULL,
    'created',
    NEW.created_by,
    jsonb_build_object(
      'lead_number', NEW.lead_number,
      'title', NEW.title,
      'estimated_value', NEW.estimated_value
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_after_insert
  AFTER INSERT ON lead
  FOR EACH ROW EXECUTE FUNCTION trg_lead_activity_created();


-- ─── 7. Extend activity.type with lead-specific values ─────────────────────
ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_type_check;
ALTER TABLE activity ADD CONSTRAINT activity_type_check
  CHECK (type IN ('created', 'updated', 'stage_changed', 'sample_requested',
                  'sample_updated', 'quote_created', 'quote_sent',
                  'task_created', 'task_done', 'note', 'call',
                  'visit', 'notification', 'system',
                  'dispatch_scheduled', 'dispatch_delivered',
                  'invoice_created', 'invoice_sent', 'invoice_overdue',
                  'payment_received', 'dunning_sent', 'ptp_recorded',
                  'stock_movement', 'stock_adjustment', 'stock_transfer', 'stock_reservation',
                  'ai_extraction',
                  -- Lead module
                  'lead_won', 'lead_lost', 'lead_assigned', 'lead_meeting',
                  'lead_quote_request', 'lead_sample_request'));


-- ─── 8. Extend task.type with lead-specific values ─────────────────────────
ALTER TABLE task DROP CONSTRAINT IF EXISTS task_type_check;
ALTER TABLE task ADD CONSTRAINT task_type_check
  CHECK (type IN ('manual', 'paving_followup', 'stale_quote', 'sample_outcome', 'system',
                  'order_followup', 'dispatch_schedule', 'dispatch_pod_pending',
                  'invoice_send', 'invoice_overdue', 'collection_followup', 'payment_ptp',
                  'stock_low', 'stock_adjustment_approval', 'stock_transfer_confirm',
                  -- Lead module
                  'lead_followup', 'lead_stale'));


-- ─── 9. SYSTEM SEED: 7 default lead stages ─────────────────────────────────
INSERT INTO lead_stage (tenant_id, stage_key, label, order_index, color, is_terminal, is_won, is_lost, sla_days) VALUES
  (NULL, 'new',         'New',          1, '#94a3b8', false, false, false, 2),
  (NULL, 'contacted',   'Contacted',    2, '#3b82f6', false, false, false, 3),
  (NULL, 'qualified',   'Qualified',    3, '#0ea5e9', false, false, false, 7),
  (NULL, 'quoted',      'Quoted',       4, '#f59e0b', false, false, false, 14),
  (NULL, 'negotiation', 'Negotiation',  5, '#a855f7', false, false, false, 14),
  (NULL, 'won',         'Won',          6, '#16a34a', true,  true,  false, NULL),
  (NULL, 'lost',        'Lost',         7, '#dc2626', true,  false, true,  NULL);


-- ─── 10. TENANT SEEDS for Vyara: sources + loss reasons ─────────────────────
INSERT INTO lead_source (tenant_id, code, label, sort_order)
SELECT t.id, src.code, src.label, src.sort_order FROM tenant t
CROSS JOIN (VALUES
  ('website',    'Website',         1),
  ('walk_in',    'Walk-in',         2),
  ('referral',   'Referral',        3),
  ('architect',  'Architect intro', 4),
  ('exhibition', 'Exhibition',      5),
  ('dealer',     'Dealer',          6),
  ('whatsapp',   'WhatsApp inbound',7),
  ('cold_call',  'Cold call',       8)
) AS src(code, label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM lead_source WHERE tenant_id = t.id AND code = src.code);

INSERT INTO lead_loss_reason (tenant_id, code, label, sort_order)
SELECT t.id, r.code, r.label, r.sort_order FROM tenant t
CROSS JOIN (VALUES
  ('price',           'Price — competitor cheaper',        1),
  ('quality',         'Quality concerns',                  2),
  ('delivery',        'Delivery time too long',            3),
  ('relationship',    'Existing supplier relationship',    4),
  ('scope_changed',   'Scope changed / project cancelled', 5),
  ('no_response',     'Lead went silent',                  6),
  ('competitor_won',  'Competitor won the deal',           7),
  ('other',           'Other',                             8)
) AS r(code, label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM lead_loss_reason WHERE tenant_id = t.id AND code = r.code);


-- ─── 11. DEMO LEADS for Vyara — populate the kanban + list ──────────────────
-- Reuses existing firm/contact/user UUIDs from seed/02_reseed_with_real_uids.sql.
-- A spread across stages so the demo doesn't feel empty.
DO $$
DECLARE
  v_tenant UUID := 'a1111111-1111-1111-1111-111111111111';
  v_owner_mehul UUID;
  v_owner_priya UUID;
  v_owner_nisha UUID;
  v_stage_new UUID;
  v_stage_contacted UUID;
  v_stage_qualified UUID;
  v_stage_quoted UUID;
  v_stage_negotiation UUID;
  v_stage_won UUID;
  v_stage_lost UUID;
  v_src_website UUID;
  v_src_referral UUID;
  v_src_architect UUID;
  v_src_dealer UUID;
  v_src_exhibition UUID;
  v_loss_price UUID;
BEGIN
  -- Resolve owner UUIDs by name (existing seeded users)
  SELECT id INTO v_owner_mehul FROM user_profile
    WHERE tenant_id = v_tenant AND full_name = 'Mehul Vora' LIMIT 1;
  SELECT id INTO v_owner_priya FROM user_profile
    WHERE tenant_id = v_tenant AND full_name = 'Priya Shah' LIMIT 1;
  SELECT id INTO v_owner_nisha FROM user_profile
    WHERE tenant_id = v_tenant AND full_name = 'Nisha Kapoor' LIMIT 1;

  -- If users aren't seeded, exit gracefully (the demo just won't have seed leads)
  IF v_owner_mehul IS NULL THEN RETURN; END IF;

  SELECT id INTO v_stage_new         FROM lead_stage WHERE tenant_id IS NULL AND stage_key = 'new';
  SELECT id INTO v_stage_contacted   FROM lead_stage WHERE tenant_id IS NULL AND stage_key = 'contacted';
  SELECT id INTO v_stage_qualified   FROM lead_stage WHERE tenant_id IS NULL AND stage_key = 'qualified';
  SELECT id INTO v_stage_quoted      FROM lead_stage WHERE tenant_id IS NULL AND stage_key = 'quoted';
  SELECT id INTO v_stage_negotiation FROM lead_stage WHERE tenant_id IS NULL AND stage_key = 'negotiation';
  SELECT id INTO v_stage_won         FROM lead_stage WHERE tenant_id IS NULL AND stage_key = 'won';
  SELECT id INTO v_stage_lost        FROM lead_stage WHERE tenant_id IS NULL AND stage_key = 'lost';

  SELECT id INTO v_src_website    FROM lead_source WHERE tenant_id = v_tenant AND code = 'website';
  SELECT id INTO v_src_referral   FROM lead_source WHERE tenant_id = v_tenant AND code = 'referral';
  SELECT id INTO v_src_architect  FROM lead_source WHERE tenant_id = v_tenant AND code = 'architect';
  SELECT id INTO v_src_dealer     FROM lead_source WHERE tenant_id = v_tenant AND code = 'dealer';
  SELECT id INTO v_src_exhibition FROM lead_source WHERE tenant_id = v_tenant AND code = 'exhibition';

  SELECT id INTO v_loss_price FROM lead_loss_reason WHERE tenant_id = v_tenant AND code = 'price';

  -- 10 demo leads
  INSERT INTO lead (tenant_id, title, segment, source_id, current_stage_id,
                    owner_id, city, territory, estimated_value, expected_close_at,
                    contact_name_raw, contact_phone_raw, notes,
                    created_at, last_activity_at) VALUES
    (v_tenant, 'Vasundhara Township paving block', 'architect', v_src_architect, v_stage_new,
     v_owner_priya, 'Ahmedabad', 'Surat North', 4200000, CURRENT_DATE + 60,
     'Hetal Joshi, Studio Praxis', '+91-98259-12233', 'Architect inquiry from website form for paver and kerbstone supply for 6-tower township phase 1.',
     now() - INTERVAL '12 hours', now() - INTERVAL '12 hours'),

    (v_tenant, 'Vadodara MIDC complex driveway', 'corporate', v_src_website, v_stage_new,
     v_owner_mehul, 'Vadodara', 'Gujarat', 1800000, CURRENT_DATE + 45,
     'Bhavin Mehta, Site engineer', '+91-99094-44321', 'Walk-in from website, requires GST quote within a week. Has 8500 sqft of cobble.',
     now() - INTERVAL '1 day', now() - INTERVAL '1 day'),

    (v_tenant, 'Surat Highway service road', 'government', v_src_referral, v_stage_contacted,
     v_owner_mehul, 'Surat', 'Surat South', 8200000, CURRENT_DATE + 90,
     'PWD Junior Engineer (referred by IIA)', '+91-99044-77882', 'Called, asked for sample dispatch. Big-ticket: 28000 sqft heavy paver.',
     now() - INTERVAL '3 days', now() - INTERVAL '1 day'),

    (v_tenant, 'Park Avenue Residency parking', 'architect', v_src_architect, v_stage_qualified,
     v_owner_priya, 'Ahmedabad', 'Surat North', 2400000, CURRENT_DATE + 30,
     'Ar. Mukesh Trivedi', '+91-98980-22113', 'Two site visits done. Specifier confirmed natural finish. Awaiting BOQ from architect.',
     now() - INTERVAL '14 days', now() - INTERVAL '2 days'),

    (v_tenant, 'Skyline plotting scheme', 'dealer', v_src_dealer, v_stage_qualified,
     v_owner_mehul, 'Bharuch', 'Gujarat', 1200000, CURRENT_DATE + 21,
     'Dealer Ramesh Hardware, end-customer Mr. Vora', '+91-93767-91012', 'Dealer brought enquiry. Customer wants antique finish, 4000 sqft.',
     now() - INTERVAL '10 days', now() - INTERVAL '3 days'),

    (v_tenant, 'Greenvista Phase 2 expansion', 'architect', v_src_referral, v_stage_quoted,
     v_owner_priya, 'Surat', 'Surat North', 6500000, CURRENT_DATE + 14,
     'Hetal Joshi (referred from Phase 1)', '+91-98259-12233', 'Phase 1 was won by us last year. Quote sent, awaiting comparison.',
     now() - INTERVAL '21 days', now() - INTERVAL '4 days'),

    (v_tenant, 'CityGate Mall exterior cobble', 'corporate', v_src_exhibition, v_stage_quoted,
     v_owner_mehul, 'Vadodara', 'Gujarat', 3300000, CURRENT_DATE + 21,
     'Mr Kirit Patel (met at Acetech Bombay)', '+91-99988-12234', 'Met at exhibition. Sent quote for 12000 sqft heavy-duty cobble. Decision after Diwali.',
     now() - INTERVAL '18 days', now() - INTERVAL '5 days'),

    (v_tenant, 'Nirma University additional block', 'architect', v_src_referral, v_stage_negotiation,
     v_owner_priya, 'Ahmedabad', 'Surat North', 5100000, CURRENT_DATE + 7,
     'Estate office, attn. Mr. Bhatt', '+91-98980-44567', 'Won earlier blocks. Discount negotiation on RA-bill schedule for 18000 sqft.',
     now() - INTERVAL '35 days', now() - INTERVAL '1 day'),

    (v_tenant, 'Aakar Bungalow plot 41', 'architect', v_src_architect, v_stage_won,
     v_owner_nisha, 'Surat', 'Surat North', 850000, CURRENT_DATE - 5,
     'Mr. Pankaj Doshi', '+91-98794-12111', 'Closed last week. Project under setup. 3200 sqft.',
     now() - INTERVAL '28 days', now() - INTERVAL '5 days'),

    (v_tenant, 'Reflections Plotting Phase 1', 'dealer', v_src_dealer, v_stage_lost,
     v_owner_mehul, 'Bardoli', 'Surat South', 2100000, CURRENT_DATE - 12,
     'Dealer Krishna Sales', '+91-99780-22334', 'Lost — dealer chose Nitco on price.',
     now() - INTERVAL '40 days', now() - INTERVAL '12 days');

  -- Set won/lost outcome on terminal-state leads
  UPDATE lead SET won_at = last_activity_at
    WHERE tenant_id = v_tenant AND current_stage_id = v_stage_won AND won_at IS NULL;
  UPDATE lead SET lost_at = last_activity_at, lost_reason_id = v_loss_price,
                  lost_remark = 'Competitor (Nitco) offered ₹35/sqft less'
    WHERE tenant_id = v_tenant AND current_stage_id = v_stage_lost AND lost_at IS NULL;
END $$;
