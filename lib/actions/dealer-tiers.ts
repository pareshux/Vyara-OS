'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getActorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export async function createDealerTier(params: {
  code: string
  label: string
  color: string
  bg_color: string
  sort_order?: number
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage dealer tiers' }
  if (!params.code.trim() || !params.label.trim()) return { error: 'Code and label are required' }
  if (!HEX_RE.test(params.color) || !HEX_RE.test(params.bg_color)) {
    return { error: 'Color values must be 6-digit hex (e.g. #C2410C)' }
  }

  const { data, error } = await ctx.supabase
    .from('dealer_tier')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '_'),
      label: params.label.trim(),
      color: params.color,
      bg_color: params.bg_color,
      sort_order: params.sort_order ?? 0,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/dealer-tiers')
  revalidatePath('/dealers')
  return { id: data.id }
}

export async function updateDealerTier(
  id: string,
  patch: Partial<{
    label: string
    color: string
    bg_color: string
    sort_order: number
    notes: string | null
    is_active: boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage dealer tiers' }
  if (patch.color != null && !HEX_RE.test(patch.color)) return { error: 'Color must be 6-digit hex' }
  if (patch.bg_color != null && !HEX_RE.test(patch.bg_color)) return { error: 'Background must be 6-digit hex' }

  const { error } = await ctx.supabase
    .from('dealer_tier')
    .update({ ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/dealer-tiers')
  revalidatePath('/dealers')
  return { success: true }
}
