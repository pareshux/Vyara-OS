import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Package, PlusCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DealerOrdersListPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS scopes to this dealer's firm automatically
  const { data: orders } = await supabase
    .from('sales_order')
    .select(
      `id, order_number, value, order_date, expected_delivery_at, created_via,
       stage:current_stage_id(stage_key, label, color, is_terminal)`
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  type Order = {
    id: string
    order_number: string
    value: number
    order_date: string
    expected_delivery_at: string | null
    created_via: string
    stage: { stage_key: string; label: string; color: string; is_terminal: boolean } | { stage_key: string; label: string; color: string; is_terminal: boolean }[] | null
  }
  const rows = (orders ?? []) as unknown as Order[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">My orders</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length} {rows.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/dealer-portal/orders/new"><PlusCircle className="size-4 mr-1.5" />New order</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Place your first order from the portal.
            </p>
            <Button size="sm" asChild className="mt-3">
              <Link href="/dealer-portal/orders/new"><PlusCircle className="size-4 mr-1.5" />New order</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Order #</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Placed</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell">Expected</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const stage = Array.isArray(o.stage) ? o.stage[0] : o.stage
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/dealer-portal/orders/${o.id}`} className="text-foreground hover:text-primary">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs">
                      {new Date(o.order_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2">
                      {stage ? (
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>
                          {stage.label}
                        </Badge>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums text-xs sm:table-cell">
                      {o.expected_delivery_at
                        ? new Date(o.expected_delivery_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      ₹{Number(o.value).toLocaleString('en-IN')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
