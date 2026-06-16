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

// ─── TAX RATE ────────────────────────────────────────────────────────────────

export async function createTaxRate(params: {
  code: string
  label: string
  rate_pct: number
  is_default?: boolean
  sort_order?: number
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage tax rates' }
  if (!params.code.trim() || !params.label.trim()) return { error: 'Code and label are required' }
  if (params.rate_pct < 0 || params.rate_pct > 100) return { error: 'Rate must be between 0 and 100' }

  // If this is being created as default, unset any existing default first
  if (params.is_default) {
    await ctx.supabase
      .from('tax_rate')
      .update({ is_default: false, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId)
      .eq('is_default', true)
  }

  const { data, error } = await ctx.supabase
    .from('tax_rate')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '_'),
      label: params.label.trim(),
      rate_pct: params.rate_pct,
      is_default: params.is_default ?? false,
      sort_order: params.sort_order ?? 0,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/taxes')
  return { id: data.id }
}

export async function updateTaxRate(
  id: string,
  patch: Partial<{ label: string; rate_pct: number; sort_order: number; notes: string | null; is_active: boolean }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage tax rates' }
  if (patch.rate_pct != null && (patch.rate_pct < 0 || patch.rate_pct > 100)) {
    return { error: 'Rate must be between 0 and 100' }
  }

  const { error } = await ctx.supabase
    .from('tax_rate')
    .update({ ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/taxes')
  return { success: true }
}

export async function setDefaultTaxRate(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can change defaults' }

  // Atomic-ish swap: unset existing default, then set the new one.
  // O1 partial unique index enforces single-default per tenant; this
  // sequence is the safe path.
  await ctx.supabase
    .from('tax_rate')
    .update({ is_default: false, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId)
    .eq('is_default', true)
    .neq('id', id)

  const { error } = await ctx.supabase
    .from('tax_rate')
    .update({ is_default: true, is_active: true, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/taxes')
  return { success: true }
}

// ─── PAYMENT TERM ────────────────────────────────────────────────────────────

export async function createPaymentTerm(params: {
  code: string
  label: string
  days: number
  description?: string
  is_default?: boolean
  sort_order?: number
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage payment terms' }
  if (!params.code.trim() || !params.label.trim()) return { error: 'Code and label are required' }
  if (params.days < 0) return { error: 'Days must be non-negative' }

  if (params.is_default) {
    await ctx.supabase
      .from('payment_term')
      .update({ is_default: false, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId)
      .eq('is_default', true)
  }

  const { data, error } = await ctx.supabase
    .from('payment_term')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '_'),
      label: params.label.trim(),
      days: params.days,
      description: params.description?.trim() || null,
      is_default: params.is_default ?? false,
      sort_order: params.sort_order ?? 0,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/payment-terms')
  return { id: data.id }
}

export async function updatePaymentTerm(
  id: string,
  patch: Partial<{ label: string; days: number; description: string | null; sort_order: number; is_active: boolean }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage payment terms' }
  if (patch.days != null && patch.days < 0) return { error: 'Days must be non-negative' }

  const { error } = await ctx.supabase
    .from('payment_term')
    .update({ ...patch, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/payment-terms')
  return { success: true }
}

export async function setDefaultPaymentTerm(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can change defaults' }

  await ctx.supabase
    .from('payment_term')
    .update({ is_default: false, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId)
    .eq('is_default', true)
    .neq('id', id)

  const { error } = await ctx.supabase
    .from('payment_term')
    .update({ is_default: true, is_active: true, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/payment-terms')
  return { success: true }
}
