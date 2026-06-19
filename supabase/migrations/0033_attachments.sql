-- ============================================================
-- 0033_attachments.sql — FO-2 (Blueprint PLAT-013)
--
-- Generic attachment table used by every capability that needs to
-- store user-supplied files: visit photos, expense receipts,
-- customer signatures, complaint attachments, dispatch PODs (when
-- the dispatch module migrates), sample-request photos, etc.
--
-- Today's pattern (ad-hoc TEXT[] photo columns on individual
-- tables — field_visit.photo_urls, etc.) stays in place for one
-- slice for backwards-compat. New consumers write to attachment;
-- old consumers continue working until they're migrated in Sprint 3.
--
-- Storage: reuses the existing `ai-uploads` bucket (RLS already
-- configured) with a separate path prefix:
--
--   <tenant_id>/attachment/<entity_type>/<yyyy>/<mm>/<id>_<safename>
--
-- A separate bucket would be conceptually cleaner but requires
-- Supabase storage policy migration which isn't pure SQL. The
-- bucket rename can happen later without changing app code.
--
-- entity_type intentionally free-text (no CHECK / master). The
-- values map 1:1 with table names that have to exist for the
-- framework to be useful — no master would add value. Convention
-- documented in lib/actions/attachments.ts.
-- ============================================================

CREATE TABLE attachment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  entity_type     TEXT NOT NULL,                  -- 'field_visit' | 'expense' | 'complaint' | ...
  entity_id       UUID NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN
                    ('photo', 'document', 'voice_note', 'signature', 'receipt')),
  storage_path    TEXT NOT NULL,                  -- path within ai-uploads bucket
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER,
  title           TEXT,                            -- optional human title (filename or rep-supplied)
  notes           TEXT,                            -- optional rep note about the attachment
  metadata        JSONB NOT NULL DEFAULT '{}',     -- exif, lat/lng, ai_confidence, signature dimensions, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ
);

ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;

-- Tenant isolation only. Parent-entity readability is enforced at
-- the application layer (lib/actions/attachments.ts) so each entity
-- type can apply its own check (e.g. field_visit needs user_id =
-- auth.uid() OR admin/manager). Pushing parent check into RLS would
-- require per-entity-type policies, which become a maintenance
-- burden as new entity types are added.
CREATE POLICY "tenant_isolation" ON attachment
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

-- Hot path: "show every attachment for this entity, newest first."
CREATE INDEX attachment_entity_idx
  ON attachment (entity_type, entity_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- For "my recent uploads" surfaces (rep day summary, etc.).
CREATE INDEX attachment_creator_idx
  ON attachment (created_by, created_at DESC)
  WHERE deleted_at IS NULL;

-- For storage cleanup jobs (find dangling rows / orphaned files).
CREATE INDEX attachment_tenant_kind_idx
  ON attachment (tenant_id, kind, created_at DESC)
  WHERE deleted_at IS NULL;
