import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DealerSidebar } from '@/components/dealer-portal/sidebar'
import { DealerTopbar } from '@/components/dealer-portal/topbar'

export default async function DealerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Role gate (Decision H1) — non-dealer users belong on /dashboard
  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, full_name, role, tenant_id, is_active')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  if (profile.role !== 'dealer') redirect('/dashboard')
  if (!profile.is_active) redirect('/login')

  // Look up the dealer this user belongs to (single active link in the pilot)
  const { data: dealerUser } = await supabase
    .from('dealer_user')
    .select(
      `id, dealer_id, accepted_at,
       dealer:dealer_id(id, dealer_code, tier, is_active, firm:firm_id(name, city))`
    )
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!dealerUser) {
    // User has role='dealer' but no active link — admin must have revoked. Sign them out gracefully.
    redirect('/login?error=dealer-link-revoked')
  }

  // Decision G1 — mark first-time login automatically. Idempotent: only sets if currently null.
  if (!dealerUser.accepted_at) {
    await supabase
      .from('dealer_user')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', dealerUser.id)
      .is('accepted_at', null)
  }

  const dealer = (Array.isArray(dealerUser.dealer) ? dealerUser.dealer[0] : dealerUser.dealer) as
    | { id: string; dealer_code: string; tier: string | null; is_active: boolean; firm: { name: string; city: string | null } | { name: string; city: string | null }[] | null }
    | null

  if (!dealer || !dealer.is_active) {
    redirect('/login?error=dealer-inactive')
  }

  const firm = (Array.isArray(dealer.firm) ? dealer.firm[0] : dealer.firm) as { name: string; city: string | null } | null

  return (
    <div className="flex h-full min-h-screen">
      <DealerSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DealerTopbar
          userName={profile.full_name ?? user.email ?? 'Dealer'}
          dealerCode={dealer.dealer_code}
          firmName={firm?.name ?? '—'}
          firmCity={firm?.city ?? null}
        />
        <main className="flex-1 overflow-auto pb-14 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
