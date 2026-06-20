import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { InvoiceNewPageClient } from './page-client'
import { getInvoiceDefaults } from '@/lib/actions/invoices'

export const dynamic = 'force-dynamic'

export default async function NewInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  // Tenant feature flag for invoice-photo capture. Same RLS workaround as
  // /warehouse — direct tenant SELECTs are gated by current_tenant_id().
  let photoEntryEnabled = false
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
      | { ai?: { invoice_photo_enabled?: boolean } }
      | null
    photoEntryEnabled = tenantSettings?.ai?.invoice_photo_enabled === true
  }

  const canUsePhotoEntry =
    photoEntryEnabled &&
    !!profile &&
    ['admin', 'manager', 'sales_engineer'].includes(profile.role)

  const [{ data: projects }, { data: firms }, { data: orders }, defaultsRes] = await Promise.all([
    supabase.from('project').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('firm').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('sales_order')
      .select('id, order_number, value, project_id, buyer_firm_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    getInvoiceDefaults({ buyer_firm_id: null }),
  ])

  const defaults = 'defaults' in defaultsRes ? defaultsRes.defaults : { tax: null, paymentTerm: null }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      <h1 className="text-lg font-semibold">New invoice</h1>
      <InvoiceNewPageClient
        projects={(projects ?? []) as { id: string; name: string }[]}
        firms={(firms ?? []) as { id: string; name: string }[]}
        orders={(orders ?? []) as { id: string; order_number: string; value: number; project_id: string; buyer_firm_id: string | null }[]}
        initialDefaults={defaults}
        tenantId={profile?.tenant_id ?? null}
        photoEntryEnabled={canUsePhotoEntry}
      />
    </div>
  )
}
