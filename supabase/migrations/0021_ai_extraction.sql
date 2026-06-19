-- ─── AI extraction plumbing (Stage 0) ───────────────────────────────────────
-- Tables that back every AI surface in Vyara: extract photo/voice/PDF → human
-- reviews a suggestion card → Accept/Edit/Reject. We log every call AND every
-- per-row decision so accuracy is measured, not assumed.
--
-- Principle #6 (AI assists, humans decide) is enforced in the application
-- layer — no extraction row directly creates business records; the user must
-- Accept, which calls the existing server action (scheduleDispatch,
-- createInvoiceManual, etc.) so the same guards apply.
--
-- This migration is intentionally generic across surfaces (dispatch_diary,
-- invoice_photo, voice_quote, …) — one schema, many entity_kinds.


-- ─── 1. ai_extraction ────────────────────────────────────────────────────────
-- One row per upload → Claude call. Either the call succeeded (status='extracted')
-- and parsed_output holds the structured data, or it failed (status in
-- 'parse_failed' | 'api_error' | 'timeout' | 'no_rows') and error_detail explains.
CREATE TABLE ai_extraction (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  entity_kind           TEXT NOT NULL
                          CHECK (entity_kind IN (
                            'dispatch_diary', 'invoice_photo', 'voice_quote',
                            'voice_sample_outcome', 'whatsapp_ptp', 'playground'
                          )),
  source_storage_path   TEXT NOT NULL,         -- ai-uploads/<tenant_id>/...
  source_mime_type      TEXT,
  source_size_bytes     INTEGER,

  model                 TEXT NOT NULL,         -- e.g. 'claude-sonnet-4-6'
  prompt_version        TEXT NOT NULL,         -- bumped manually when prompts change

  status                TEXT NOT NULL
                          CHECK (status IN (
                            'extracted', 'parse_failed', 'api_error',
                            'timeout', 'rate_limited', 'no_rows', 'abandoned'
                          )),
  raw_output            JSONB,                 -- full Claude response (text + usage)
  parsed_output         JSONB,                 -- zod-validated payload, null on failure
  error_detail          TEXT,

  input_tokens          INTEGER,
  output_tokens         INTEGER,
  cache_read_tokens     INTEGER,
  latency_ms            INTEGER,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id)
);

ALTER TABLE ai_extraction ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON ai_extraction
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON ai_extraction
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- Append-only — we never mutate an extraction row. Decisions live on
-- ai_extraction_row (which has its own append-only policy).
REVOKE UPDATE, DELETE ON ai_extraction FROM authenticated;

CREATE INDEX ai_extraction_tenant_kind_idx
  ON ai_extraction (tenant_id, entity_kind, created_at DESC);

COMMENT ON TABLE ai_extraction IS
  'One row per upload → AI extraction call. Append-only. Drives /admin/ai-quality dashboard.';


-- ─── 2. ai_extraction_row ────────────────────────────────────────────────────
-- One row per parsed entry (e.g. one diary line). decision tracks what the
-- human did with the AI suggestion; if accepted, target_entity_id points to
-- the dispatch/invoice/quote row that was actually created.
CREATE TABLE ai_extraction_row (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  extraction_id         UUID NOT NULL REFERENCES ai_extraction(id) ON DELETE CASCADE,
  row_index             INTEGER NOT NULL,      -- 1-based, preserves AI output order

  decision              TEXT NOT NULL DEFAULT 'pending'
                          CHECK (decision IN ('pending', 'accepted', 'edited', 'rejected')),
  original_values       JSONB NOT NULL,        -- what AI returned for this row
  final_values          JSONB,                 -- what user actually accepted (= original on plain Accept)
  -- Average per-field confidence from the model, in [0..1]. Used to drive UI
  -- treatment (amber/red banners). Distinct from per-field confidence which
  -- lives inside original_values.
  avg_confidence        NUMERIC(4,3),

  target_entity_type    TEXT,                  -- 'dispatch' | 'invoice' | 'quotation' | ...
  target_entity_id      UUID,                  -- the row that the Accept created

  decided_at            TIMESTAMPTZ,
  decided_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (extraction_id, row_index)
);

ALTER TABLE ai_extraction_row ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON ai_extraction_row
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON ai_extraction_row
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- decision + final_values + decided_* are mutated as the user acts on the
-- suggestion. Allow UPDATE so a 'pending' row can transition to a terminal
-- decision exactly once. DELETE is forbidden — audit trail is permanent.
REVOKE DELETE ON ai_extraction_row FROM authenticated;

CREATE INDEX ai_extraction_row_extraction_idx
  ON ai_extraction_row (extraction_id, row_index);
CREATE INDEX ai_extraction_row_decision_idx
  ON ai_extraction_row (tenant_id, decision, created_at DESC);

COMMENT ON TABLE ai_extraction_row IS
  'Per-row Accept/Edit/Reject decisions on an AI extraction. Drives accuracy metrics.';


-- ─── 3. Storage bucket: ai-uploads ───────────────────────────────────────────
-- Raw photos / PDFs / audio uploaded for extraction. Lifecycle = 90 days
-- (handled by the policy below + a future scheduled cleanup; for now the
-- 90-day TTL is documented as a convention, enforced lazily).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-uploads',
  'ai-uploads',
  false,
  10 * 1024 * 1024,  -- 10 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf',
    'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: tenant prefix path. We store paths as `<tenant_id>/<kind>/<yyyy>/<mm>/<hash>.jpg`
-- and gate reads/writes to the user's own tenant_id prefix. The path's first
-- segment (folder) is the tenant_id.

CREATE POLICY "ai_uploads_tenant_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'ai-uploads'
    AND (storage.foldername(name))[1] = current_tenant_id()::text
  );

CREATE POLICY "ai_uploads_tenant_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'ai-uploads'
    AND (storage.foldername(name))[1] = current_tenant_id()::text
  );

-- We deliberately do NOT add UPDATE / DELETE policies for end users — uploads
-- are append-only. A separate scheduled job (future) will prune expired
-- objects using the service role.


-- ─── 4. Extend activity.type for AI events ───────────────────────────────────
-- Already includes 'notification' / 'system' which we use today. Add a
-- dedicated 'ai_extraction' so the project timeline can show "Dispatch diary
-- extracted: 5 rows, 3 accepted, 1 edited, 1 rejected" without sharing the
-- generic notification namespace.
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
                  'stock_movement', 'stock_adjustment', 'stock_transfer', 'stock_reservation',
                  -- AI plumbing (Stage 0)
                  'ai_extraction'));
