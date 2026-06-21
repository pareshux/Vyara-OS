-- ============================================================
-- 0049_complaint_activity_type_master.sql — Raj Phase 3 follow-up.
--
-- Adds complaint_* activity type codes to activity_type_master. Migration
-- 0048 added them to the activity.type CHECK constraint but missed the
-- master-row INSERTs. The trigger from 0029 validates against the master,
-- not just the CHECK, so complaint inserts (which trigger an activity row)
-- failed with "Unknown activity.type: complaint_logged" until these rows
-- exist.
--
-- Reverse: DELETE FROM activity_type_master WHERE code LIKE 'complaint_%';
-- ============================================================

INSERT INTO activity_type_master (tenant_id, code, label, category, module_code, sort_order) VALUES
  (NULL, 'complaint_logged',      'Complaint logged',       'customer_success', NULL, 410),
  (NULL, 'complaint_triaged',     'Complaint triaged',      'customer_success', NULL, 420),
  (NULL, 'complaint_assigned',    'Complaint assigned',     'customer_success', NULL, 430),
  (NULL, 'complaint_in_progress', 'Complaint in progress',  'customer_success', NULL, 440),
  (NULL, 'complaint_resolved',    'Complaint resolved',     'customer_success', NULL, 450),
  (NULL, 'complaint_closed',      'Complaint closed',       'customer_success', NULL, 460),
  (NULL, 'complaint_rejected',    'Complaint rejected',     'customer_success', NULL, 470),
  (NULL, 'complaint_reopened',    'Complaint reopened',     'customer_success', NULL, 480)
ON CONFLICT DO NOTHING;
