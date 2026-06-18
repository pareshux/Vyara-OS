-- ============================================================
-- 0026_field_visit_raw_contact.sql — Field Sales Step 4 patch
--
-- Reps in the field often meet someone whose contact record doesn't
-- exist in the system yet. We don't want to force them to first create
-- a contact (which itself needs a firm, role, etc.). Instead, capture
-- the raw name + phone on the visit; promotion to a real contact_id
-- happens later, either by an admin or an automated resolver.
--
-- is_interested elevates the "did they bite or not" signal above the
-- generic visit_outcome master. The outcome master stays for nuance
-- (Sample requested / Quote requested / Lost / Follow-up) and is only
-- shown when is_interested = true.
-- ============================================================

ALTER TABLE field_visit
  ADD COLUMN IF NOT EXISTS contact_name_raw  TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone_raw TEXT,
  ADD COLUMN IF NOT EXISTS is_interested     BOOLEAN;

-- For quickly finding visits where the contact still needs to be
-- promoted to a real contact record.
CREATE INDEX IF NOT EXISTS field_visit_raw_contact_idx
  ON field_visit (tenant_id, created_at DESC)
  WHERE contact_id IS NULL
    AND contact_phone_raw IS NOT NULL
    AND deleted_at IS NULL;
