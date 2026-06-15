import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewInvoiceForm } from './form'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function NewInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: projects }, { data: firms }, { data: orders }] = await Promise.all([
    supabase.from('project').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('firm').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('sales_order').select('id, order_number, value, project_id, buyer_firm_id').is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      <h1 className="text-lg font-semibold">New invoice</h1>
      <Card>
        <CardContent className="pt-4">
          <NewInvoiceForm
            projects={(projects ?? []) as { id: string; name: string }[]}
            firms={(firms ?? []) as { id: string; name: string }[]}
            orders={(orders ?? []) as { id: string; order_number: string; value: number; project_id: string; buyer_firm_id: string | null }[]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
