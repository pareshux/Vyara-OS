import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'stage_changed'
  | 'approved'
  | 'rejected'
  | 'viewed'
  | 'exported'
  | 'ai_action';

export type AuditEntry = {
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  actor_id: string;
  actor_role: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

/**
 * Appends an entry to the immutable audit_log.
 * Call this from every service method that mutates data.
 * Never call from DB triggers — we want to capture actor intent, not raw mutations.
 */
export async function audit(db: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await db.from('audit_log').insert(entry);
  if (error) {
    // Audit failures must never silently corrupt the business operation.
    // Log the failure and continue — the primary operation already committed.
    console.error('[audit] Failed to write audit log entry', { entry, error });
  }
}
