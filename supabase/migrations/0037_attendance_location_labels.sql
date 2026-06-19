-- ============================================================
-- 0037_attendance_location_labels.sql
--
-- Add human-readable location labels to field_attendance (check-in
-- and check-out stamps) — matching the existing
-- field_visit.location_label column. Reverse-geocoded at write time
-- by lib/geo/reverse-geocode.ts; UI prefers label over raw coords.
--
-- Nullable — historical rows (and rows without GPS) just stay null
-- and the UI falls back to the Maps deep-link as it does today.
-- ============================================================

ALTER TABLE field_attendance
  ADD COLUMN IF NOT EXISTS check_in_location_label  TEXT,
  ADD COLUMN IF NOT EXISTS check_out_location_label TEXT;
