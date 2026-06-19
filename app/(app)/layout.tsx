import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/app/sidebar'
import { Topbar } from '@/components/app/topbar'
import { MobileNav } from '@/components/app/mobile-nav'
import { pickFeatures } from '@/lib/auth/features'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, { count: notificationCount }, navFeatures] = await Promise.all([
    supabase
      .from('user_profile')
      .select('full_name, role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('notification')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    pickFeatures([
      'enable_field_sales',
      'enable_inventory',
      'enable_warehouse',
      'enable_dispatches',
      'enable_collections',
      'enable_finance',
      'enable_dealer_portal',
    ]),
  ])

  // Role gate (Decision H1) — dealer-role users belong in /dealer-portal/*.
  // Internal layout always redirects them out, so dealers never see internal pages.
  if (profile?.role === 'dealer') {
    redirect('/dealer-portal/dashboard')
  }

  const userName = profile?.full_name ?? user.email ?? 'User'
  const userRole = profile?.role ?? 'sales_engineer'

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar userRole={userRole} features={navFeatures} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userName={userName} userRole={userRole} notificationCount={notificationCount ?? 0} />
        <main className="flex-1 overflow-auto pb-14 md:pb-0">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
