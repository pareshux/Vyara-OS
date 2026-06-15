-- ============================================================
-- 0008_tally_sync.sql  — Slice 2 / Step 5: Tally sync infra
--
-- Per Slice 2 spec, Step 5: "Two-way invoice/receipt sync with
-- reconciliation + drift logging. If Tally access isn't ready, keep
-- manual/CSV and mark this deferred — don't block the slice."
--
-- This migration lays down the persistence layer so that when Tally
-- credentials are wired in, no schema work is needed. Drift detection
-- + sync runs are recorded immutably for audit.
-- ============================================================


-- ─── 1. TALLY_SYNC_LOG ───────────────────────────────────────────────────────
-- One row per sync attempt. Append-only.

CREATE TABLE tally_sync_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  direction           TEXT NOT NULL CHECK (direction IN ('pull', 'push', 'reconcile')),
  trigger             TEXT NOT NULL DEFAULT 'manual'
                        CHECK (trigger IN ('manual', 'cron', 'event')),
  status              TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial', 'no_op', 'deferred')),
  invoices_pushed     INTEGER NOT NULL DEFAULT 0,
  invoices_pulled     INTEGER NOT NULL DEFAULT 0,
  receipts_pushed     INTEGER NOT NULL DEFAULT 0,
  receipts_pulled     INTEGER NOT NULL DEFAULT 0,
  drift_detected      INTEGER NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INTEGER,
  errors              JSONB NOT NULL DEFAULT '[]',
  message             TEXT,
  actor_id            UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tally_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON tally_sync_log
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON tally_sync_log
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON tally_sync_log FROM authenticated;

CREATE INDEX tally_sync_log_idx ON tally_sync_log (tenant_id, created_at DESC);


-- ─── 2. TALLY_DRIFT ──────────────────────────────────────────────────────────
-- Records each discrepancy between our source-of-truth and Tally's record.
-- Resolved when an operator reconciles manually or a follow-up sync fixes it.

CREATE TABLE tally_drift (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  detected_in     UUID REFERENCES tally_sync_log(id),
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('invoice', 'receipt', 'firm')),
  entity_id       UUID,                          -- our local id (NULL if Tally-only)
  external_id     TEXT,                          -- Tally voucher / id (NULL if local-only)
  field           TEXT,                          -- e.g. 'total', 'paid_amount', 'status'
  our_value       JSONB,
  tally_value     JSONB,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'resolved', 'ignored', 'manual_review')),
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES auth.users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tally_drift ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON tally_drift
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON tally_drift
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX tally_drift_status_idx ON tally_drift (tenant_id, status, created_at DESC);
CREATE INDEX tally_drift_entity_idx ON tally_drift (entity_type, entity_id);
