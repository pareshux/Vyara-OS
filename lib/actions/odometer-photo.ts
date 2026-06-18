'use server'

/**
 * Odometer photo → km — server action.
 *
 * Client uploads a photo to ai-uploads/<tenant>/odometer_photo/...
 * then calls this with the path. We extract the reading and return
 * it for the OdometerInput to pre-fill. Storage path is also stored
 * on the field_visit / field_attendance row for audit (manager can
 * eyeball the photo if a claim looks off).
 *
 * Per Principle #6: AI assists, humans decide. This action never
 * writes business data — it returns the parsed value; the caller
 * decides to use, edit, or reject it.
 */
import { createClient } from '@/lib/supabase/server'
import { extractFromImage } from '@/lib/ai/extract'
import {
  OdometerPhotoSchema,
  ODOMETER_PHOTO_SYSTEM_PROMPT,
  ODOMETER_PHOTO_USER_PROMPT,
  ODOMETER_PHOTO_PROMPT_VERSION,
  type OdometerPhotoResult,
} from '@/lib/ai/prompts/odometer-photo'

export type ExtractOdometerPhotoResult =
  | {
      ok: true
      extraction_id: string
      upload_path: string
      data: OdometerPhotoResult
      usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number }
      latency_ms: number
    }
  | { ok: false; error: string; latency_ms: number }

export async function extractOdometerPhoto(
  uploadPath: string,
): Promise<ExtractOdometerPhotoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated', latency_ms: 0 }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { ok: false, error: 'No profile', latency_ms: 0 }

  if (!['admin', 'manager', 'sales_engineer'].includes(profile.role)) {
    return { ok: false, error: 'Permission denied', latency_ms: 0 }
  }
  if (!uploadPath.startsWith(`${profile.tenant_id}/`)) {
    return { ok: false, error: 'Upload path does not belong to your tenant', latency_ms: 0 }
  }

  const result = await extractFromImage({
    uploadPath,
    tenantId: profile.tenant_id,
    userId: user.id,
    entityKind: 'odometer_photo',
    promptVersion: ODOMETER_PHOTO_PROMPT_VERSION,
    systemPrompt: ODOMETER_PHOTO_SYSTEM_PROMPT,
    userPrompt: ODOMETER_PHOTO_USER_PROMPT,
    schema: OdometerPhotoSchema,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message, latency_ms: result.latency_ms }
  }

  return {
    ok: true,
    extraction_id: result.extraction_id,
    upload_path: uploadPath,
    data: result.data,
    usage: result.usage,
    latency_ms: result.latency_ms,
  }
}
