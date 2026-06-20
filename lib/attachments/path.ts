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

/**
 * Allowed kinds — lives here (alongside the path util) instead of in
 * lib/actions/attachments.ts so client components and consumers can
 * import it without dragging the 'use server' module across the
 * client/server boundary. Server actions can also import this.
 */
export const ATTACHMENT_KINDS = [
  'photo',
  'document',
  'voice_note',
  'signature',
  'receipt',
] as const

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]
