-- ============================================================
-- 0018_pipeline_substage_gates.sql
--
-- Configures the finalized Tiles / Architect pipeline as data-driven
-- config. No new modules — extends the existing pipeline_stage table.
--
-- Macro spine (renamed in-place to preserve project FKs):
--   Specified → Tracking → Paving → Closeout → Closed
--   (Lost stays as an off-pipeline terminal stage)
--
-- Paving sub-pipeline (new table):
--   Quote → Order → Reserve stock → Ready → Dispatch → Installation
--   (Billing is NOT a sub-stage — the header billing mini-bar represents it.)
--
-- Gates declared on stage transitions:
--   Paving → Closeout: supply + installation complete + final RA bill issued
--   Closeout → Closed: final acceptance + retention released + paid in full
-- ============================================================


-- ─── 1. pipeline_substage ────────────────────────────────────────────────────
-- Hangs off a pipeline_stage row. Same scoping model: tenant_id NULL = system.

CREATE TABLE pipeline_substage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenant(id),
  pipeline_stage_id UUID NOT NULL REFERENCES pipeline_stage(id) ON DELETE CASCADE,
  substage_key      TEXT NOT NULL,
  label             TEXT NOT NULL,
  order_index       INTEGER NOT NULL,
  color             TEXT NOT NULL DEFAULT '#94a3b8',
  is_watch_stage    BOOLEAN NOT NULL DEFAULT false,  -- true = informational, never gates money/logic
  sla_days          INTEGER,                          -- amber if a project sits longer; NULL = no SLA
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pipeline_substage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON pipeline_substage
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "write_own" ON pipeline_substage
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX pipeline_substage_system_uniq
  ON pipeline_substage (pipeline_stage_id, substage_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX pipeline_substage_tenant_uniq
  ON pipeline_substage (tenant_id, pipeline_stage_id, substage_key) WHERE tenant_id IS NOT NULL;
CREATE INDEX pipeline_substage_stage_idx ON pipeline_substage (pipeline_stage_id, order_index);


-- ─── 2. gate_requirement ─────────────────────────────────────────────────────
-- A gate hangs off a stage or sub-stage. Two kinds of requirement:
--   - required_document_type: a document with this type_key must be on file
--   - required_field_name: a field on project (or stage-scoped entity) must be populated
--
-- is_hard = true → blocks the stage exit (red gate on the header)
-- is_hard = false → soft (amber chip; doesn't block, just warns)

CREATE TABLE gate_requirement (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID REFERENCES tenant(id),
  pipeline_stage_id      UUID REFERENCES pipeline_stage(id) ON DELETE CASCADE,
  pipeline_substage_id   UUID REFERENCES pipeline_substage(id) ON DELETE CASCADE,
  -- exactly one of {required_document_type, required_field_name} per row
  required_document_type TEXT,
  required_field_name    TEXT,
  label                  TEXT NOT NULL,   -- human-readable e.g. "Final RA bill issued"
  is_hard                BOOLEAN NOT NULL DEFAULT true,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gate_target_exactly_one
    CHECK (
      (pipeline_stage_id IS NOT NULL)::int + (pipeline_substage_id IS NOT NULL)::int = 1
    ),
  CONSTRAINT gate_requirement_exactly_one
    CHECK (
      (required_document_type IS NOT NULL)::int + (required_field_name IS NOT NULL)::int = 1
    )
);

ALTER TABLE gate_requirement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON gate_requirement
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "write_own" ON gate_requirement
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX gate_requirement_stage_idx    ON gate_requirement (pipeline_stage_id) WHERE pipeline_stage_id IS NOT NULL;
CREATE INDEX gate_requirement_substage_idx ON gate_requirement (pipeline_substage_id) WHERE pipeline_substage_id IS NOT NULL;


-- ─── 3. Add sla_days to pipeline_stage (was missing) ────────────────────────
ALTER TABLE pipeline_stage
  ADD COLUMN IF NOT EXISTS sla_days INTEGER;


-- ─── 4. Rename existing system stages to the finalized spine ─────────────────
-- In-place updates preserve every project's current_stage_id FK.
-- Existing: Specified → Tracking → Paving Stage → Quoting → Won / Lost
-- Target:   Specified → Tracking → Paving       → Closeout → Closed
-- "Lost" stays as off-pipeline terminal.

UPDATE pipeline_stage
SET label = 'Paving', sla_days = 60
WHERE tenant_id IS NULL AND segment = 'architect' AND stage_key = 'paving_stage';

UPDATE pipeline_stage
SET stage_key = 'closeout', label = 'Closeout', is_paving_stage = false, sla_days = 30,
    color = '#9333ea'
WHERE tenant_id IS NULL AND segment = 'architect' AND stage_key = 'quoting';

UPDATE pipeline_stage
SET stage_key = 'closed', label = 'Closed', is_terminal = true,
    color = '#22c55e'
WHERE tenant_id IS NULL AND segment = 'architect' AND stage_key = 'won';

-- Bump SLAs on the earlier macro stages for the amber-on-stall trigger
UPDATE pipeline_stage SET sla_days = 90
  WHERE tenant_id IS NULL AND segment = 'architect' AND stage_key = 'specified' AND sla_days IS NULL;
UPDATE pipeline_stage SET sla_days = 60
  WHERE tenant_id IS NULL AND segment = 'architect' AND stage_key = 'tracking' AND sla_days IS NULL;


-- ─── 5. Seed Paving sub-pipeline ────────────────────────────────────────────
-- Quote → Order → Reserve stock → Ready → Dispatch → Installation
-- Installation is the WATCH-stage (informational, never gates money).
-- Billing is NOT a sub-stage — represented by the header billing mini-bar.

INSERT INTO pipeline_substage (id, pipeline_stage_id, substage_key, label, order_index, color, is_watch_stage, sla_days, notes)
SELECT
  uuid_in(md5('paving_sub_' || sub.substage_key)::cstring),
  ps.id,
  sub.substage_key, sub.label, sub.order_index, sub.color, sub.is_watch, sub.sla_days, sub.notes
FROM pipeline_stage ps
CROSS JOIN (VALUES
  ('quote',         'Quote',          1, '#a78bfa', false, 14, 'Quotation issued; awaiting customer acceptance.'),
  ('order',         'Order',          2, '#3b82f6', false, 7,  'Order confirmed; commercial contract in place.'),
  ('reserve_stock', 'Reserve stock',  3, '#0ea5e9', false, 7,  'Order lines reserved against warehouse stock.'),
  ('ready',         'Ready',          4, '#06b6d4', false, 14, 'Production complete; goods ready to dispatch.'),
  ('dispatch',      'Dispatch',       5, '#f97316', false, NULL, 'Dispatching in tranches to site. Multi-tranche is the norm.'),
  ('installation',  'Installation',   6, '#84cc16', true,  NULL, 'Watch-stage — informational; never gates money or hard logic.')
) AS sub(substage_key, label, order_index, color, is_watch, sla_days, notes)
WHERE ps.tenant_id IS NULL AND ps.segment = 'architect' AND ps.stage_key = 'paving_stage'
ON CONFLICT DO NOTHING;


-- ─── 6. Seed gate_requirements ───────────────────────────────────────────────
-- Paving → Closeout: supply + installation complete + final RA bill issued
-- Closeout → Closed: final acceptance + retention released + paid in full

-- Gates on Paving (must be satisfied to exit Paving)
INSERT INTO gate_requirement (id, pipeline_stage_id, required_document_type, required_field_name, label, is_hard, sort_order)
SELECT
  uuid_in(md5('gate_paving_' || g.key)::cstring),
  ps.id,
  g.doc_type, g.field_name, g.label, g.is_hard, g.sort_order
FROM pipeline_stage ps
CROSS JOIN (VALUES
  ('all_pods',        'pod',           NULL,                       'All dispatch tranches have POD',         true, 10),
  ('final_ra_bill',   'final_ra_bill', NULL,                       'Final RA bill issued',                   true, 20),
  ('installation_done', NULL,         'installation_completed_at', 'Installation marked complete (watch)',   false, 30)
) AS g(key, doc_type, field_name, label, is_hard, sort_order)
WHERE ps.tenant_id IS NULL AND ps.segment = 'architect' AND ps.stage_key = 'paving_stage'
ON CONFLICT DO NOTHING;

-- Gates on Closeout (must be satisfied to exit Closeout → Closed)
INSERT INTO gate_requirement (id, pipeline_stage_id, required_document_type, required_field_name, label, is_hard, sort_order)
SELECT
  uuid_in(md5('gate_closeout_' || g.key)::cstring),
  ps.id,
  g.doc_type, g.field_name, g.label, g.is_hard, g.sort_order
FROM pipeline_stage ps
CROSS JOIN (VALUES
  ('acceptance',        'final_acceptance', NULL,                      'Final acceptance certificate on file', true, 10),
  ('retention_released', NULL,              'retention_released_at',   'Retention released',                    true, 20),
  ('paid_in_full',       NULL,              'paid_in_full',            'All invoices paid (no outstanding)',    true, 30)
) AS g(key, doc_type, field_name, label, is_hard, sort_order)
WHERE ps.tenant_id IS NULL AND ps.segment = 'architect' AND ps.stage_key = 'closeout'
ON CONFLICT DO NOTHING;
