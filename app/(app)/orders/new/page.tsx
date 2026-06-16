import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { NewOrderForm } from './form'

export const dynamic = 'force-dynamic'

export default async function NewOrderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  const [{ data: projects }, { data: firms }, { data: products }] = await Promise.all([
    supabase
      .from('project')
      .select('id, name, buyer_firm_id')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('firm')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('product')
      .select('id, sku_code, name, unit, mrp, base_price')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sku_code'),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-lg font-semibold">New sales order</h1>
      <p className="text-sm text-muted-foreground">
        Create an order directly (without a prior quote). For quote-driven orders, use the &quot;Create order&quot; button on the project&apos;s Quotes tab instead.
      </p>
      <Card>
        <CardContent className="pt-4">
          <NewOrderForm
            projects={(projects ?? []) as { id: string; name: string; buyer_firm_id: string | null }[]}
            firms={(firms ?? []) as { id: string; name: string }[]}
            products={(products ?? []) as { id: string; sku_code: string; name: string; unit: string; mrp: number | null; base_price: number | null }[]}
            userRole={profile?.role ?? 'sales_engineer'}
          />
        </CardContent>
      </Card>
    </div>
  )
}
