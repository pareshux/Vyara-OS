import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ChevronRight } from 'lucide-react'
import { NewLeadPageClient } from './page-client'

export const dynamic = 'force-dynamic'

export default async function NewLeadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  // Tenant feature flag for business card capture — same RLS workaround
  // as other AI surfaces (direct tenant SELECT is gated by current_tenant_id).
  let businessCardEnabled = false
  if (profile?.tenant_id) {
    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: tenantRow } = await svc
      .from('tenant')
      .select('settings')
      .eq('id', profile.tenant_id)
      .single()
    const tenantSettings = (tenantRow?.settings ?? null) as
      | { ai?: { business_card_enabled?: boolean } }
      | null
    businessCardEnabled = tenantSettings?.ai?.business_card_enabled === true
  }

  const canUseAI =
    businessCardEnabled &&
    !!profile &&
    ['admin', 'manager', 'sales_engineer'].includes(profile.role)

  const [{ data: sources }, { data: owners }, { data: firms }, { data: contacts }] = await Promise.all([
    supabase.from('lead_source').select('id, code, label').is('deleted_at', null).order('sort_order'),
    supabase
      .from('user_profile')
      .select('id, full_name, role')
      .eq('is_active', true)
      .in('role', ['admin', 'manager', 'sales_engineer'])
      .order('full_name'),
    supabase.from('firm').select('id, name, type').is('deleted_at', null).order('name'),
    supabase.from('contact').select('id, full_name, firm_id').is('deleted_at', null).order('full_name'),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/leads" className="hover:text-foreground">Leads</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">New lead</span>
      </div>

      <h1 className="text-lg font-semibold">Capture a new lead</h1>

      <NewLeadPageClient
        sources={(sources ?? []) as { id: string; code: string; label: string }[]}
        owners={(owners ?? []) as { id: string; full_name: string; role: string }[]}
        firms={(firms ?? []) as { id: string; name: string; type: string }[]}
        contacts={(contacts ?? []) as { id: string; full_name: string; firm_id: string | null }[]}
        defaultOwnerId={user.id}
        tenantId={profile?.tenant_id ?? null}
        businessCardEnabled={canUseAI}
      />
    </div>
  )
}
