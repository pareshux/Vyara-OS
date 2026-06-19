/**
 * Conventional storage path for an attachment upload. Pure function;
 * safe to call on the client so every upload surface produces the same
 * shape: <tenant_id>/attachment/<entity_type>/<yyyy>/<mm>/<ts>_<safename>
 *
 * Storage path = the bucket key inside `ai-uploads`. Used by both the
 * client (to upload) and the server action (to verify the path begins
 * with the tenant id).
 */
export function buildAttachmentPath(input: {
  tenantId: string
  entityType: string
  filename: string
}): string {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `${input.tenantId}/attachment/${input.entityType}/${yyyy}/${mm}/${Date.now()}_${safeName}`
}

export const ATTACHMENT_BUCKET = 'ai-uploads'
