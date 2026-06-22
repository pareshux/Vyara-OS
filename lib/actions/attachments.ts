'use server'

/** ─────────────────────────────────────────────────────────────
 *  Attachment server actions — FO-2 / Blueprint PLAT-013
 *
 *  Generic file storage for every capability. Clients:
 *    1. Upload the file directly to the `ai-uploads` bucket via the
 *       client-side Supabase storage SDK (path under their tenant).
 *    2. Call createAttachment() to record the file against an entity.
 *    3. Call listAttachments() to fetch + getSignedUrl() to display.
 *    4. Call softDeleteAttachment() to remove.
 *
 *  Parent-readability — Blueprint §11 Option C. RLS gives tenant
 *  isolation; this layer adds the per-entity check so a sales-rep
 *  can't list another rep's visit photos:
 *
 *    field_visit  → visit owner (user_id) OR admin/manager
 *    expense      → expense submitter OR admin/manager (when FO-5 ships)
 *    complaint    → assignee / submitter / admin/manager (CS-001)
 *    dispatch     → admin/manager (warehouse role added later)
 *    sample_request → admin/manager/sales_engineer (any same-tenant user)
 *
 *  New entity_type values must register here before createAttachment
 *  will accept them — keeps the framework honest.
 *  ───────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/observability/capture'
import { ATTACHMENT_KINDS, ATTACHMENT_BUCKET, type AttachmentKind } from '@/lib/attachments/path'

export type { AttachmentKind }

const BUCKET = ATTACHMENT_BUCKET

const ENTITY_TYPES = [
  'field_visit',
  'expense',
  'complaint',
  'dispatch',
  'sample_request',
  'project',  // Phase 5b — drawing-approval pack + other project documents
] as const
type EntityType = (typeof ENTITY_TYPES)[number]

export type Attachment = {
  id: string
  entity_type: string
  entity_id: string
  kind: AttachmentKind
  storage_path: string
  mime_type: string
  size_bytes: number | null
  title: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  created_by: string | null
}

async function getActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return {
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id as string,
    role: profile.role as string,
  }
}

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

/**
 * Per-entity-type parent-readability gate. Tenant isolation is already
 * enforced by RLS — this layer rejects same-tenant cross-rep access.
 */
async function canAccessParent(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string,
  userId: string,
  role: string,
): Promise<boolean> {
  if (isAdminish(role)) return true

  switch (entityType) {
    case 'field_visit': {
      const { data } = await supabase
        .from('field_visit')
        .select('user_id')
        .eq('id', entityId)
        .maybeSingle()
      return data?.user_id === userId
    }

    case 'sample_request':
      // Any same-tenant non-rep user role can see samples. Sales engineers
      // see the sample queue too (no per-row gate today); revisit when
      // sample queues become per-rep.
      return role === 'sales_engineer'

    case 'expense':
    case 'complaint':
    case 'dispatch':
      // Consumers ship later (FO-5, CS-001, DEL-005). Until then only
      // admin/manager — caught by isAdminish above.
      return false

    case 'project':
      // Phase 5b: any same-tenant user can attach to projects (drawing
      // packs, approval letters, BOM, BOQ). RLS on the underlying project
      // table already enforces tenant isolation. Per-role tightening
      // (e.g. only owner/manager can attach approval-pack) can come later.
      return true
  }
}

/* ─────────────────────────────────────────────────────────────
   createAttachment — called after the client uploads to storage.
   ──────────────────────────────────────────────────────────── */
export async function createAttachment(input: {
  entityType: string
  entityId: string
  kind: AttachmentKind
  storagePath: string
  mimeType: string
  sizeBytes?: number | null
  title?: string | null
  notes?: string | null
  metadata?: Record<string, unknown>
}): Promise<{ ok: true; attachment: Attachment } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  if (!ENTITY_TYPES.includes(input.entityType as EntityType)) {
    return { ok: false, error: `Unknown entity_type: ${input.entityType}` }
  }
  if (!ATTACHMENT_KINDS.includes(input.kind)) {
    return { ok: false, error: `Unknown kind: ${input.kind}` }
  }
  if (!input.storagePath.startsWith(`${actor.tenantId}/`)) {
    return { ok: false, error: 'Storage path does not belong to your tenant' }
  }

  const canAccess = await canAccessParent(
    actor.supabase,
    input.entityType as EntityType,
    input.entityId,
    actor.userId,
    actor.role,
  )
  if (!canAccess) return { ok: false, error: 'Permission denied' }

  const { data, error } = await actor.supabase
    .from('attachment')
    .insert({
      tenant_id: actor.tenantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      kind: input.kind,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes ?? null,
      title: input.title ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
      created_by: actor.userId,
    })
    .select(
      'id, entity_type, entity_id, kind, storage_path, mime_type, size_bytes, title, notes, metadata, created_at, created_by',
    )
    .single()

  if (error) {
    captureError(error, {
      action_name: 'createAttachment',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      extra: { kind: input.kind },
    })
    return { ok: false, error: error.message }
  }

  // Revalidate the entity-detail URL when possible. Caller can also
  // pass through router.refresh() on the client.
  if (input.entityType === 'field_visit') {
    revalidatePath(`/field/visits/${input.entityId}`)
  }

  return { ok: true, attachment: data as Attachment }
}

/* ─────────────────────────────────────────────────────────────
   listAttachments — newest first.
   ──────────────────────────────────────────────────────────── */
export async function listAttachments(
  entityType: string,
  entityId: string,
): Promise<{ ok: true; attachments: Attachment[] } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  if (!ENTITY_TYPES.includes(entityType as EntityType)) {
    return { ok: false, error: `Unknown entity_type: ${entityType}` }
  }

  const canAccess = await canAccessParent(
    actor.supabase,
    entityType as EntityType,
    entityId,
    actor.userId,
    actor.role,
  )
  if (!canAccess) return { ok: false, error: 'Permission denied' }

  const { data, error } = await actor.supabase
    .from('attachment')
    .select(
      'id, entity_type, entity_id, kind, storage_path, mime_type, size_bytes, title, notes, metadata, created_at, created_by',
    )
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (error) {
    captureError(error, {
      action_name: 'listAttachments',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_type: entityType,
      entity_id: entityId,
    })
    return { ok: false, error: error.message }
  }

  return { ok: true, attachments: (data ?? []) as Attachment[] }
}

/* ─────────────────────────────────────────────────────────────
   softDeleteAttachment — creator OR admin/manager.
   File stays in storage (orphan cleanup job, not built yet).
   ──────────────────────────────────────────────────────────── */
export async function softDeleteAttachment(
  attachmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: row } = await actor.supabase
    .from('attachment')
    .select('id, entity_type, entity_id, created_by')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Attachment not found' }

  if (row.created_by !== actor.userId && !isAdminish(actor.role)) {
    return { ok: false, error: 'Permission denied' }
  }

  const { error } = await actor.supabase
    .from('attachment')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', attachmentId)

  if (error) {
    captureError(error, {
      action_name: 'softDeleteAttachment',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_id: attachmentId,
    })
    return { ok: false, error: error.message }
  }

  if (row.entity_type === 'field_visit') {
    revalidatePath(`/field/visits/${row.entity_id}`)
  }
  return { ok: true }
}

/* ─────────────────────────────────────────────────────────────
   getSignedUrl — sign for read. Default 1h. Caller decides cadence
   (gallery thumbnails refresh per render; downloads can re-sign).
   ──────────────────────────────────────────────────────────── */
export async function getSignedAttachmentUrl(
  attachmentId: string,
  expiresInSec = 3600,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated' }

  const { data: row } = await actor.supabase
    .from('attachment')
    .select('storage_path, entity_type, entity_id')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Attachment not found' }

  const canAccess = await canAccessParent(
    actor.supabase,
    row.entity_type as EntityType,
    row.entity_id,
    actor.userId,
    actor.role,
  )
  if (!canAccess) return { ok: false, error: 'Permission denied' }

  const { data, error } = await actor.supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, expiresInSec)

  if (error || !data) {
    captureError(error ?? new Error('Sign URL failed'), {
      action_name: 'getSignedAttachmentUrl',
      tenant_id: actor.tenantId,
      user_id: actor.userId,
      entity_id: attachmentId,
    })
    return { ok: false, error: error?.message ?? 'Sign URL failed' }
  }
  return { ok: true, url: data.signedUrl }
}

