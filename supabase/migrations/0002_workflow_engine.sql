-- ============================================================
-- 0002_workflow_engine.sql
-- Workflow engine: templates, instances, transition log
-- ============================================================

-- ─── Template (the config) ───────────────────────────────────────────────────

CREATE TABLE workflow_template (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,   -- 'system' or UUID ref; TEXT to allow 'system'
  workflow_type  TEXT NOT NULL,   -- project | quotation | sample | collection | complaint
  segment        TEXT,            -- architect | dealer | tender | retail | government | corporate | NULL
  version        INTEGER NOT NULL DEFAULT 1,
  label          TEXT NOT NULL,
  config         JSONB NOT NULL,  -- full WorkflowTemplate JSON (stages + transitions)
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workflow_type, segment, version)
);

-- Tenants can read system templates and their own overrides
ALTER TABLE workflow_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_or_system" ON workflow_template
  FOR SELECT USING (tenant_id = 'system' OR tenant_id = current_tenant_id()::TEXT);

CREATE POLICY "write_own" ON workflow_template
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::TEXT);

CREATE POLICY "update_own" ON workflow_template
  FOR UPDATE USING (tenant_id = current_tenant_id()::TEXT);

CREATE INDEX wf_template_lookup ON workflow_template (tenant_id, workflow_type, segment, is_active);

-- ─── Instance (one per tracked entity) ──────────────────────────────────────

CREATE TABLE workflow_instance (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(id),
  template_id      UUID NOT NULL REFERENCES workflow_template(id),
  entity_type      TEXT NOT NULL,
  entity_id        UUID NOT NULL,
  current_stage    TEXT NOT NULL,
  sla_deadline_at  TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)  -- one active instance per entity
);

ALTER TABLE workflow_instance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON workflow_instance
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE INDEX wf_instance_entity ON workflow_instance (tenant_id, entity_type, entity_id);
CREATE INDEX wf_instance_sla    ON workflow_instance (tenant_id, sla_deadline_at) WHERE sla_deadline_at IS NOT NULL;

-- ─── Transition log (immutable audit) ───────────────────────────────────────

CREATE TABLE workflow_transition_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  instance_id     UUID NOT NULL REFERENCES workflow_instance(id),
  transition_id   TEXT NOT NULL,
  from_stage      TEXT NOT NULL,
  to_stage        TEXT NOT NULL,
  is_back_flow    BOOLEAN NOT NULL DEFAULT false,
  actor_id        UUID NOT NULL REFERENCES auth.users(id),
  actor_role      TEXT NOT NULL,
  remark          TEXT,
  guard_results   JSONB NOT NULL DEFAULT '[]',
  actions_queued  JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflow_transition_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON workflow_transition_log
  FOR ALL USING (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON workflow_transition_log FROM authenticated;

CREATE INDEX wf_log_instance ON workflow_transition_log (tenant_id, instance_id, created_at DESC);

-- ─── Atomic transition RPC ───────────────────────────────────────────────────
-- Called from engine.ts — updates instance + inserts log in one transaction.

CREATE OR REPLACE FUNCTION commit_workflow_transition(
  p_instance_id     UUID,
  p_to_stage        TEXT,
  p_sla_deadline_at TIMESTAMPTZ,
  p_transition_id   TEXT,
  p_from_stage      TEXT,
  p_is_back_flow    BOOLEAN,
  p_actor_id        UUID,
  p_actor_role      TEXT,
  p_remark          TEXT,
  p_guard_results   JSONB,
  p_actions_queued  JSONB
) RETURNS workflow_transition_log AS $$
DECLARE
  v_tenant_id UUID;
  v_log workflow_transition_log;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM workflow_instance WHERE id = p_instance_id;

  UPDATE workflow_instance
  SET current_stage = p_to_stage,
      sla_deadline_at = p_sla_deadline_at,
      updated_at = now()
  WHERE id = p_instance_id;

  INSERT INTO workflow_transition_log (
    tenant_id, instance_id, transition_id, from_stage, to_stage,
    is_back_flow, actor_id, actor_role, remark, guard_results, actions_queued
  ) VALUES (
    v_tenant_id, p_instance_id, p_transition_id, p_from_stage, p_to_stage,
    p_is_back_flow, p_actor_id, p_actor_role, p_remark, p_guard_results, p_actions_queued
  )
  RETURNING * INTO v_log;

  RETURN v_log;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
