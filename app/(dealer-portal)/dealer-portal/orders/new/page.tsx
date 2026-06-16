import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { NewDealerOrderForm } from './form'

export const dynamic = 'force-dynamic'

export default async function NewDealerOrderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: products } = await supabase
    .from('product')
    .select('id, sku_code, name, unit, mrp, category')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('sku_code')

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-lg font-semibold">Place new order</h1>
      <p className="text-sm text-muted-foreground">
        Pick products and quantities. The Vyara team will confirm stock, schedule dispatch, and update you here as your order progresses.
      </p>
      <Card>
        <CardContent className="pt-4">
          <NewDealerOrderForm
            products={(products ?? []) as { id: string; sku_code: string; name: string; unit: string; mrp: number | null; category: string }[]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
