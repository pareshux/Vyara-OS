'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

/** Lazy service-role client — only used for auth admin operations (invite). */
function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// ─── createDealerFromFirm ────────────────────────────────────────────────────

export async function createDealerFromFirm(params: {
  firm_id: string
  tier?: string
  territory?: string
  credit_limit?: number
  credit_period_days?: number
  dormancy_threshold_days?: number
  notes?: string
}): Promise<{ id: string; dealer_code: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    return { error: 'Only admins or managers can create dealers' }
  }

  // Confirm firm exists and isn't already a dealer
  const { data: firm } = await ctx.supabase
    .from('firm')
    .select('id, name')
    .eq('id', params.firm_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!firm) return { error: 'Firm not found' }

  const { data: existing } = await ctx.supabase
    .from('dealer')
    .select('id')
    .eq('firm_id', params.firm_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (existing) return { error: 'This firm is already registered as a dealer' }

  const { data, error } = await ctx.supabase
    .from('dealer')
    .insert({
      tenant_id: ctx.tenantId,
      firm_id: params.firm_id,
      tier: params.tier?.trim() || null,
      territory: params.territory?.trim() || null,
      credit_limit: params.credit_limit ?? null,
      credit_period_days: params.credit_period_days ?? 30,
      dormancy_threshold_days: params.dormancy_threshold_days ?? 90,
      notes: params.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id, dealer_code')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/dealers')
  return { id: data.id, dealer_code: data.dealer_code as string }
}

// ─── updateDealer ────────────────────────────────────────────────────────────

export async function updateDealer(
  dealerId: string,
  patch: Partial<{
    tier: string | null
    territory: string | null
    credit_limit: number | null
    credit_period_days: number
    dormancy_threshold_days: number
    notes: string | null
    is_active: boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    return { error: 'Only admins or managers can edit dealers' }
  }

  const { error } = await ctx.supabase
    .from('dealer')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', dealerId)
  if (error) return { error: error.message }

  revalidatePath('/dealers')
  revalidatePath(`/dealers/${dealerId}`)
  return { success: true }
}

// ─── deactivate / reactivate ────────────────────────────────────────────────

export async function setDealerActive(
  dealerId: string,
  isActive: boolean
): Promise<{ success: true } | { error: string }> {
  return updateDealer(dealerId, { is_active: isActive })
}

// ─── inviteDealerUser ────────────────────────────────────────────────────────
/**
 * Creates an auth.users row via Supabase Admin API (sends magic-link email
 * by default), creates a user_profile with role='dealer', then links via
 * dealer_user. If email send fails (SMTP not configured), the magic link
 * is returned in the result so the operator can copy it manually.
 */
export async function inviteDealerUser(params: {
  dealer_id: string
  email: string
  full_name: string
}): Promise<
  { id: string; user_id: string; magic_link?: string; email_sent: boolean }
  | { error: string }
> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    return { error: 'Only admins or managers can invite dealer users' }
  }
  const email = params.email.trim().toLowerCase()
  const fullName = params.full_name.trim()
  if (!email || !fullName) return { error: 'Email and full name are required' }

  // Confirm dealer exists in same tenant
  const { data: dealer } = await ctx.supabase
    .from('dealer')
    .select('id, dealer_code, firm:firm_id(name)')
    .eq('id', params.dealer_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!dealer) return { error: 'Dealer not found' }

  const admin = adminClient()

  // Try the invite (sends email + creates auth.users in one call).
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, dealer_id: params.dealer_id, role: 'dealer' },
  })

  let authUserId: string
  let emailSent = false
  let magicLink: string | undefined

  if (inviteErr) {
    // If the email is already a user (common in dev), generate a magic link instead so the operator can share manually.
    if (inviteErr.status === 422 || /already/i.test(inviteErr.message ?? '')) {
      // Look up the existing user
      const { data: existing } = await admin.auth.admin.listUsers()
      const existingUser = existing?.users?.find((u) => u.email?.toLowerCase() === email)
      if (!existingUser) return { error: `Email '${email}' exists but cannot be retrieved` }
      authUserId = existingUser.id

      // Generate a magic link for them (covers re-invites and adding an existing user as a dealer)
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
      if (linkErr) return { error: linkErr.message }
      magicLink = link?.properties?.action_link
    } else {
      return { error: inviteErr.message }
    }
  } else {
    authUserId = inviteData.user.id
    emailSent = true
  }

  // Create or update user_profile with role='dealer' (idempotent via upsert)
  const { error: profileErr } = await admin
    .from('user_profile')
    .upsert(
      {
        id: authUserId,
        tenant_id: ctx.tenantId,
        role: 'dealer',
        full_name: fullName,
        is_active: true,
      },
      { onConflict: 'id' }
    )
  if (profileErr) return { error: `Failed to create profile: ${profileErr.message}` }

  // Create dealer_user link (UNIQUE constraint catches duplicates)
  const { data: link, error: linkErr } = await admin
    .from('dealer_user')
    .insert({
      tenant_id: ctx.tenantId,
      dealer_id: params.dealer_id,
      auth_user_id: authUserId,
      invited_by: ctx.userId,
    })
    .select('id')
    .single()
  if (linkErr) {
    if (linkErr.code === '23505') {
      return { error: 'This user is already linked to this dealer' }
    }
    return { error: `Failed to link user to dealer: ${linkErr.message}` }
  }

  revalidatePath(`/dealers/${params.dealer_id}`)
  return { id: link.id, user_id: authUserId, magic_link: magicLink, email_sent: emailSent }
}

// ─── revokeDealerUser ────────────────────────────────────────────────────────

export async function revokeDealerUser(
  dealerUserId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    return { error: 'Only admins or managers can revoke dealer users' }
  }
  if (!reason.trim()) return { error: 'Revocation reason is required' }

  const { data: link } = await ctx.supabase
    .from('dealer_user')
    .select('dealer_id, auth_user_id, is_active')
    .eq('id', dealerUserId)
    .single()
  if (!link) return { error: 'Dealer-user link not found' }
  if (!link.is_active) return { error: 'This dealer user is already revoked' }

  const { error } = await ctx.supabase
    .from('dealer_user')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: ctx.userId,
      revoke_reason: reason.trim(),
    })
    .eq('id', dealerUserId)
  if (error) return { error: error.message }

  // Also deactivate the user_profile so they can't log in at all
  // (Revoke = lose access entirely, since for pilot a dealer user belongs to one dealer)
  await ctx.supabase
    .from('user_profile')
    .update({ is_active: false })
    .eq('id', link.auth_user_id)

  revalidatePath(`/dealers/${link.dealer_id}`)
  return { success: true }
}

// ─── reactivateDealerUser ────────────────────────────────────────────────────

export async function reactivateDealerUser(
  dealerUserId: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.role !== 'admin' && ctx.role !== 'manager') {
    return { error: 'Only admins or managers can reactivate dealer users' }
  }

  const { data: link } = await ctx.supabase
    .from('dealer_user')
    .select('dealer_id, auth_user_id')
    .eq('id', dealerUserId)
    .single()
  if (!link) return { error: 'Dealer-user link not found' }

  await ctx.supabase
    .from('dealer_user')
    .update({
      is_active: true,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
    })
    .eq('id', dealerUserId)

  await ctx.supabase
    .from('user_profile')
    .update({ is_active: true })
    .eq('id', link.auth_user_id)

  revalidatePath(`/dealers/${link.dealer_id}`)
  return { success: true }
}
