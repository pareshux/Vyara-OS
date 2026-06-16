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

export async function createTerritory(params: {
  code: string
  label: string
  parent_id?: string | null
  sort_order?: number
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage territories' }
  if (!params.code.trim() || !params.label.trim()) return { error: 'Code and label are required' }

  // Resolve parent → compute level (root=0, child=parent.level+1)
  let level = 0
  if (params.parent_id) {
    const { data: parent } = await ctx.supabase
      .from('territory')
      .select('id, level, tenant_id')
      .eq('id', params.parent_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parent) return { error: 'Parent territory not found' }
    if (parent.tenant_id !== ctx.tenantId) return { error: 'Parent territory belongs to a different tenant' }
    level = Number(parent.level) + 1
  }

  const { data, error } = await ctx.supabase
    .from('territory')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '-'),
      label: params.label.trim(),
      parent_id: params.parent_id ?? null,
      level,
      sort_order: params.sort_order ?? 0,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/territories')
  return { id: data.id }
}

export async function updateTerritory(
  id: string,
  patch: Partial<{
    label: string
    sort_order: number
    notes: string | null
    is_active: boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage territories' }

  // parent_id + level intentionally NOT in patch — moving a territory across
  // the tree changes its descendants' level too and isn't a Step-3 concern.

  const { error } = await ctx.supabase
    .from('territory')
    .update({ ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/territories')
  return { success: true }
}
