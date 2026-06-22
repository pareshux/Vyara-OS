import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Wallet,
  Package,
  Truck,
  Award,
  ArrowRight,
  FileText,
  AlertCircle,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DealerDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS scopes everything to this dealer's data
  const [
    { data: invoicesRaw },
    { data: ordersRaw },
    { data: dealerRow },
  ] = await Promise.all([
    supabase
      .from('invoice')
      .select('id, invoice_number, due_date, billed_amount, paid_amount, status, invoice_date')
      .is('deleted_at', null)
      .order('due_date', { ascending: true }),
    supabase
      .from('sales_order')
      .select('id, order_number, value, order_date, stage:current_stage_id(stage_key, label, color, is_terminal)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('dealer')
      .select('id, credit_limit, credit_period_days, firm:firm_id(name)')
      .single(),
  ])

  type Invoice = { id: string; invoice_number: string; due_date: string; billed_amount: number; paid_amount: number; status: string; invoice_date: string }
  type Order = { id: string; order_number: string; value: number; order_date: string; stage: { stage_key: string; label: string; color: string; is_terminal: boolean } | { stage_key: string; label: string; color: string; is_terminal: boolean }[] | null }

  const invoices = (invoicesRaw ?? []) as Invoice[]
  const orders = (ordersRaw ?? []) as unknown as Order[]

  // KPI: outstanding (open + partial + draft + sent)
  const totalOutstanding = invoices
    .filter((i) => !['paid', 'cancelled', 'written_off'].includes(i.status))
    .reduce((s, i) => s + Math.max(0, Number(i.billed_amount) - Number(i.paid_amount)), 0)
  const openInvoiceCount = invoices.filter((i) => !['paid', 'cancelled', 'written_off'].includes(i.status)).length

  // KPI: this-month orders
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthOrders = orders.filter((o) => new Date(o.order_date) >= monthStart)
  const thisMonthValue = thisMonthOrders.reduce((s, o) => s + Number(o.value), 0)

  // KPI: pending fulfilment (orders not yet delivered/closed/cancelled)
  const pendingFulfilment = orders.filter((o) => {
    const stage = Array.isArray(o.stage) ? o.stage[0] : o.stage
    if (!stage) return false
    return !stage.is_terminal && stage.stage_key !== 'delivered'
  })

  // KPI: overdue invoices
  const overdue = invoices.filter((i) => {
    if (['paid', 'cancelled', 'written_off'].includes(i.status)) return false
    return new Date(i.due_date) < now
  })

  const creditLimit = dealerRow?.credit_limit ? Number(dealerRow.credit_limit) : null
  const creditUtilPct = creditLimit && creditLimit > 0 ? Math.min(100, (totalOutstanding / creditLimit) * 100) : null

  // Recent activity feed — top 5 from orders + invoices interleaved by date
  type FeedItem = { kind: 'order' | 'invoice'; id: string; ref: string; amount: number; date: string; status?: string; meta?: string }
  const feed: FeedItem[] = []
  for (const o of orders.slice(0, 10)) {
    const stage = Array.isArray(o.stage) ? o.stage[0] : o.stage
    feed.push({ kind: 'order', id: o.id, ref: o.order_number, amount: Number(o.value), date: o.order_date, meta: stage?.label ?? '' })
  }
  for (const i of invoices.slice(0, 10)) {
    feed.push({ kind: 'invoice', id: i.id, ref: i.invoice_number, amount: Number(i.billed_amount), date: i.invoice_date, status: i.status })
  }
  feed.sort((a, b) => (a.date < b.date ? 1 : -1))
  const recentActivity = feed.slice(0, 8)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      {/* Greeting */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-lg font-semibold text-foreground">
            Welcome back
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here&apos;s a quick view of your dealer account.
          </p>
        </CardContent>
      </Card>

      {/* KPI cards — 4 up */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card size="sm">
          <CardContent className="pt-3 pb-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Wallet className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Outstanding</span>
            </div>
            <p className="tabular-nums text-2xl font-semibold text-foreground">
              ₹{totalOutstanding.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {openInvoiceCount} open {openInvoiceCount === 1 ? 'invoice' : 'invoices'}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 pb-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Package className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">This month</span>
            </div>
            <p className="tabular-nums text-2xl font-semibold text-foreground">
              {thisMonthOrders.length}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              ₹{thisMonthValue.toLocaleString('en-IN')} ordered
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 pb-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Truck className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Pending fulfilment</span>
            </div>
            <p className="tabular-nums text-2xl font-semibold text-foreground">
              {pendingFulfilment.length}
            </p>
            <p className="text-xs text-muted-foreground">orders not yet delivered</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 pb-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Award className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Schemes</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground/60 italic mt-1">Coming soon</p>
            <p className="text-xs text-muted-foreground">Active incentives will appear here</p>
          </CardContent>
        </Card>
      </div>

      {/* Credit utilisation (if credit limit set) */}
      {creditLimit && creditUtilPct != null && (
        <Card>
          <CardContent className="pt-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Credit utilisation</span>
              <span className="tabular-nums text-sm text-foreground">
                ₹{totalOutstanding.toLocaleString('en-IN')} / ₹{creditLimit.toLocaleString('en-IN')}
                {' '}<span className="text-xs text-muted-foreground">({creditUtilPct.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-muted/40">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${creditUtilPct}%`,
                  backgroundColor: creditUtilPct > 90 ? '#B91C1C' : creditUtilPct > 70 ? '#B45309' : '#15803D',
                }}
              />
            </div>
            {creditUtilPct > 90 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="size-3" /> You&apos;re near your credit limit. Settle outstanding to unblock new orders.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Overdue invoices alert */}
      {overdue.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="size-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground">Overdue invoices ({overdue.length})</h2>
          </div>
          <div className="flex flex-col gap-2">
            {overdue.slice(0, 3).map((inv) => {
              const days = Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / 86_400_000)
              const outstanding = Math.max(0, Number(inv.billed_amount) - Number(inv.paid_amount))
              return (
                <Card key={inv.id} size="sm">
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <p className="font-mono text-xs text-foreground">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        <span className="ml-1 text-destructive font-medium">· {days} days overdue</span>
                      </p>
                    </div>
                    <span className="tabular-nums font-medium text-foreground">₹{outstanding.toLocaleString('en-IN')}</span>
                  </CardContent>
                </Card>
              )
            })}
            {overdue.length > 3 && (
              <Button size="sm" variant="ghost" asChild className="self-start text-muted-foreground">
                <Link href="/dealer-portal/invoices">View all overdue<ArrowRight className="size-3.5 ml-1" /></Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Recent activity</h2>
        {recentActivity.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="size-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No recent orders or invoices yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Use <Link href="/dealer-portal/orders" className="text-primary hover:underline">My orders</Link> to place your first order.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {recentActivity.map((item) => (
              <Card key={`${item.kind}-${item.id}`} size="sm">
                <CardContent className="py-3 flex items-center gap-3">
                  {item.kind === 'order' ? <Package className="size-4 text-primary shrink-0" /> : <FileText className="size-4 text-amber-600 shrink-0" />}
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{item.ref}</span>
                      {item.kind === 'order' && item.meta && (
                        <Badge variant="secondary" className="text-[10px]">{item.meta}</Badge>
                      )}
                      {item.kind === 'invoice' && item.status && (
                        <Badge variant="secondary" className="text-[10px] uppercase">{item.status.replace('_', ' ')}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <span className="tabular-nums font-medium text-foreground shrink-0">₹{item.amount.toLocaleString('en-IN')}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
