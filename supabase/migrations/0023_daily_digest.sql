-- ─── Daily digest (manager-facing AI summary) ─────────────────────────────
-- One row per (tenant, date). Generated daily by an Inngest cron at 06:00 IST,
-- or on-demand by admin/manager from the dashboard.
--
-- The narrative_text is what shows up at the top of /dashboard for managers.
-- The focus_items is a structured 3-4 item list of what to attend to today.
-- The stats column carries the raw numbers Claude used so we can audit the
-- AI's narrative against ground truth.

CREATE TABLE daily_digest (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  digest_date     DATE NOT NULL,                          -- the day being summarised (yesterday)

  -- The headline narrative — 2-3 sentence paragraph
  narrative_text  TEXT NOT NULL,

  -- Structured "what should I focus on today" — array of {type, title, detail}
  focus_items     JSONB NOT NULL DEFAULT '[]',

  -- Overall health signal — 'on_track' | 'attention' | 'concerning'
  health_signal   TEXT NOT NULL DEFAULT 'on_track'
                    CHECK (health_signal IN ('on_track', 'attention', 'concerning')),

  -- Raw stats Claude saw (for audit + future re-prompting on the same data)
  stats           JSONB NOT NULL,

  -- AI provenance
  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  latency_ms      INTEGER,

  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by    UUID REFERENCES auth.users(id),         -- NULL = cron, set = on-demand
  -- Idempotency — one digest per tenant per day
  UNIQUE (tenant_id, digest_date)
);

ALTER TABLE daily_digest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON daily_digest
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON daily_digest
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- Append-only — we regenerate via DELETE + INSERT, never UPDATE, to keep
-- audit clean. Service-role bypasses for cron + on-demand regeneration.
REVOKE UPDATE ON daily_digest FROM authenticated;

CREATE INDEX daily_digest_tenant_date_idx
  ON daily_digest (tenant_id, digest_date DESC);

COMMENT ON TABLE daily_digest IS
  'AI-generated daily executive summary. One row per (tenant, date). Drives the dashboard top card.';
