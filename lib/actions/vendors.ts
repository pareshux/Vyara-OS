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

export type VendorType = 'supplier' | 'contractor' | 'service' | 'other'
export type MsmeStatus = 'not_msme' | 'micro' | 'small' | 'medium'

const VENDOR_TYPES: VendorType[] = ['supplier', 'contractor', 'service', 'other']
const MSME_STATUSES: MsmeStatus[] = ['not_msme', 'micro', 'small', 'medium']

/**
 * GSTIN format check: 15 chars total — 2-digit state code + 10-char
 * PAN + 1 entity-no + 1 'Z' + 1 checksum. We accept the spec layout
 * and don't recompute the checksum (rare server-side; vendors fix at
 * onboarding when invoices reject).
 */
function looksLikeGstin(raw: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(raw)
}

/** PAN format: 5 alpha + 4 numeric + 1 alpha (e.g. ABCDE1234F). */
function looksLikePan(raw: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(raw)
}

export async function createVendor(params: {
  code: string
  name: string
  vendor_type: VendorType
  gstin?: string
  pan?: string
  msme_status?: MsmeStatus
  msme_udyam_no?: string
  bank_account_no?: string
  bank_ifsc?: string
  bank_name?: string
  payment_terms_days?: number
  contact_name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage vendors' }
  if (!params.code.trim() || !params.name.trim()) return { error: 'Code and name are required' }
  if (!VENDOR_TYPES.includes(params.vendor_type)) return { error: 'Invalid vendor type' }

  const gstin = params.gstin?.trim().toUpperCase() || null
  if (gstin && !looksLikeGstin(gstin)) return { error: 'GSTIN format invalid (15 chars: NN AAAAA NNNN A N Z N)' }

  const pan = params.pan?.trim().toUpperCase() || null
  if (pan && !looksLikePan(pan)) return { error: 'PAN format invalid (10 chars: AAAAA9999A)' }

  if (params.msme_status && !MSME_STATUSES.includes(params.msme_status)) {
    return { error: 'Invalid MSME status' }
  }

  const paymentTerms = params.payment_terms_days
  if (paymentTerms !== undefined && (paymentTerms < 0 || paymentTerms > 365)) {
    return { error: 'Payment terms must be between 0 and 365 days' }
  }

  const gstStateCode = gstin ? gstin.substring(0, 2) : null

  const { data, error } = await ctx.supabase
    .from('vendor')
    .insert({
      tenant_id: ctx.tenantId,
      code: params.code.trim().toUpperCase().replace(/\s+/g, '-'),
      name: params.name.trim(),
      vendor_type: params.vendor_type,
      gstin,
      gst_state_code: gstStateCode,
      pan,
      msme_status: params.msme_status ?? null,
      msme_udyam_no: params.msme_udyam_no?.trim() || null,
      bank_account_no: params.bank_account_no?.trim() || null,
      bank_ifsc: params.bank_ifsc?.trim().toUpperCase() || null,
      bank_name: params.bank_name?.trim() || null,
      payment_terms_days: paymentTerms ?? 30,
      contact_name: params.contact_name?.trim() || null,
      phone: params.phone?.trim() || null,
      email: params.email?.trim().toLowerCase() || null,
      address: params.address?.trim() || null,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin/vendors')
  return { id: data.id }
}

export async function updateVendor(
  id: string,
  patch: Partial<{
    name: string
    vendor_type: VendorType
    gstin: string | null
    pan: string | null
    msme_status: MsmeStatus | null
    msme_udyam_no: string | null
    bank_account_no: string | null
    bank_ifsc: string | null
    bank_name: string | null
    payment_terms_days: number
    contact_name: string | null
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    is_active: boolean
  }>,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can manage vendors' }
  if (patch.vendor_type && !VENDOR_TYPES.includes(patch.vendor_type)) {
    return { error: 'Invalid vendor type' }
  }

  // Normalise + validate the new fields when present.
  const updates: Record<string, unknown> = { ...patch }

  if (patch.gstin !== undefined) {
    const v = patch.gstin?.trim().toUpperCase() || null
    if (v && !looksLikeGstin(v)) return { error: 'GSTIN format invalid' }
    updates.gstin = v
    updates.gst_state_code = v ? v.substring(0, 2) : null
  }
  if (patch.pan !== undefined) {
    const v = patch.pan?.trim().toUpperCase() || null
    if (v && !looksLikePan(v)) return { error: 'PAN format invalid' }
    updates.pan = v
  }
  if (patch.msme_status !== undefined && patch.msme_status !== null) {
    if (!MSME_STATUSES.includes(patch.msme_status)) return { error: 'Invalid MSME status' }
  }
  if (patch.bank_ifsc !== undefined) {
    updates.bank_ifsc = patch.bank_ifsc?.trim().toUpperCase() || null
  }
  if (patch.payment_terms_days !== undefined) {
    if (patch.payment_terms_days < 0 || patch.payment_terms_days > 365) {
      return { error: 'Payment terms must be between 0 and 365 days' }
    }
  }

  updates.updated_by = ctx.userId
  updates.updated_at = new Date().toISOString()

  const { error } = await ctx.supabase
    .from('vendor')
    .update(updates)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/vendors')
  return { success: true }
}
