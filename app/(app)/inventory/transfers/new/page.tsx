import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { NewTransferForm } from './form'

export const dynamic = 'force-dynamic'

export default async function NewTransferPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: warehouses }, { data: products }] = await Promise.all([
    supabase.from('warehouse').select('id, code, name, type').is('deleted_at', null).eq('is_active', true).order('code'),
    supabase.from('product').select('id, sku_code, name, unit').is('deleted_at', null).order('sku_code'),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-lg font-semibold">New stock transfer</h1>
      <Card>
        <CardContent className="pt-4">
          <NewTransferForm
            warehouses={(warehouses ?? []) as { id: string; code: string; name: string; type: string }[]}
            products={(products ?? []) as { id: string; sku_code: string; name: string; unit: string }[]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
