'use server'

/**
 * Demo-mode sign-in action — Raj demo Phase 1.
 *
 * Thin wrapper around supabase.auth.signInWithPassword. Always redirects
 * (success → /dashboard; failure → /demo?error=...). Form-action-prop
 * compatible (Promise<void> shape) unlike the standard signIn action
 * which returns {error} for inline form display.
 *
 * Hardcoded demo creds live in app/demo/page.tsx — see security note there.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function demoSignIn(formData: FormData): Promise<void> {
  const email = (formData.get('email') as string | null) ?? ''
  const password = (formData.get('password') as string | null) ?? ''

  if (!email || !password) {
    redirect('/demo?error=missing_creds')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Fail visibly — common case for the Raj tenant is "user not provisioned yet"
    redirect(`/demo?error=${encodeURIComponent(error.message)}`)
  }

  // Successful sign-in. Land on /dashboard for the demo flow rather than
  // /projects (which is where standard /login lands) so the prospect sees
  // the highest-signal surface first.
  redirect('/dashboard')
}
