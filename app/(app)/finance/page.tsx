import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  Wallet,
  FileText,
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

const BUCKET_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  current: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Current' },
  '1-30':  { bg: '#FEF3C7', color: '#B45309', label: '1–30 days' },
  '31-60': { bg: '#FED7AA', color: '#C2410C', label: '31–60 days' },
  '60+':   { bg: '#FEE2E2', color: '#B91C1C', label: '60+ days' },
}

export default async function FinancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const last30Start = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)

  const [
    { data: ageing },
    { data: invoicesL30 },
    { data: receiptsL30 },
    { data: recentReceipts },
    { data: openCollections },
    { data: recentDunning },
  ] = await Promise.all([
    supabase.from('invoice_ageing_v').select('outstanding, ageing_bucket, days_overdue, billed_amount, paid_amount, invoice_date, due_date, status'),
    supabase.from('invoice').select('total, billed_amount, invoice_date, status').is('deleted_at', null).gte('invoice_date', last30Start),
    supabase.from('receipt').select('amount, received_at, payment_mode').is('deleted_at', null).gte('received_at', last30Start),
    supabase
      .from('receipt')
      .select(
        `id, amount, payment_mode, payment_reference, received_at,
         invoice:invoice_id(id, invoice_number, buyer:buyer_firm_id(name))`
      )
      .is('deleted_at', null)
      .order('received_at', { ascending: false })
      .limit(8),
    supabase
      .from('collection')
      .select(`id, invoice:invoice_id(id, invoice_number, due_date, billed_amount, paid_amount, status, buyer:buyer_firm_id(name))`)
      .is('deleted_at', null)
      .is('closed_at', null),
    supabase
      .from('collection_activity')
      .select(
        `id, channel, template_key, outcome, external_id, created_at,
         collection:collection_id(invoice:invoice_id(invoice_number, buyer:buyer_firm_id(name)))`
      )
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  type AgRow = { outstanding: number; ageing_bucket: string; days_overdue: number; billed_amount: number; paid_amount: number; invoice_date: string; due_date: string; status: string }
  const ageingRows = (ageing ?? []) as unknown as AgRow[]
  const liveRows = ageingRows.filter((r) => r.ageing_bucket !== 'closed')

  const totalOutstanding = liveRows.reduce((s, r) => s + Number(r.outstanding), 0)
  const totalInvoicedL30 = ((invoicesL30 ?? []) as { total: number }[]).reduce((s, r) => s + Number(r.total), 0)
  const totalBilledL30   = ((invoicesL30 ?? []) as { billed_amount: number }[]).reduce((s, r) => s + Number(r.billed_amount), 0)
  const totalReceivedL30 = ((receiptsL30 ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0)

  // Simple DSO: outstanding / (last-30-days billed / 30)
  const dailyRevenue = totalBilledL30 / 30
  const dso = dailyRevenue > 0 ? totalOutstanding / dailyRevenue : 0
  const collectionRate = totalBilledL30 > 0 ? (totalReceivedL30 / totalBilledL30) * 100 : 0

  // Ageing breakdown
  const buckets = ['current', '1-30', '31-60', '60+'] as const
  const bucketTotals = buckets.map((b) => ({
    key: b,
    total: liveRows.filter((r) => r.ageing_bucket === b).reduce((s, r) => s + Number(r.outstanding), 0),
    count: liveRows.filter((r) => r.ageing_bucket === b).length,
  }))
  const totalForBars = bucketTotals.reduce((s, b) => s + b.total, 0) || 1

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-6xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Finance</h1>
            <p className="text-sm text-muted-foreground">Receivables, DSO, and collection performance.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/finance/tally">Tally sync<ArrowRight className="size-3.5 ml-1" /></Link>
        </Button>
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          icon={<Wallet className="size-4" />}
          label="Outstanding"
          value={`₹${totalOutstanding.toLocaleString('en-IN')}`}
          hint={`${liveRows.length} open invoices`}
        />
        <KPI
          icon={<CalendarClock className="size-4" />}
          label="DSO (days)"
          value={dso > 0 ? dso.toFixed(0) : '—'}
          hint="outstanding ÷ avg daily revenue (30d)"
        />
        <KPI
          icon={<FileText className="size-4" />}
          label="Invoiced (30d)"
          value={`₹${totalInvoicedL30.toLocaleString('en-IN')}`}
        />
        <KPI
          icon={<TrendingUp className="size-4" />}
          label="Collected (30d)"
          value={`₹${totalReceivedL30.toLocaleString('en-IN')}`}
          hint={`${collectionRate.toFixed(0)}% of billed`}
        />
      </div>

      {/* Ageing breakdown bars */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Ageing</h2>
        <Card>
          <CardContent className="pt-4 flex flex-col gap-3">
            {bucketTotals.every((b) => b.total === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No outstanding invoices.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {bucketTotals.map((b) => {
                  const s = BUCKET_STYLES[b.key]
                  const pct = b.total > 0 ? (b.total / totalForBars) * 100 : 0
                  return (
                    <div key={b.key} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium" style={{ color: s.color }}>{s.label}</span>
                        <span className="text-sm tabular-nums text-foreground">
                          ₹{b.total.toLocaleString('en-IN')}
                          <span className="ml-2 text-xs text-muted-foreground">({b.count})</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${s.color}20` }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: s.color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="border-t border-border pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total outstanding</span>
              <span className="tabular-nums text-base font-semibold">
                ₹{totalForBars.toLocaleString('en-IN')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent receipts */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Recent receipts</h2>
          <Card>
            <CardContent className="pt-2">
              {(recentReceipts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No receipts yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(recentReceipts ?? []).map((r) => {
                    const inv = (Array.isArray(r.invoice) ? r.invoice[0] : r.invoice) as unknown as { id: string; invoice_number: string; buyer: { name: string } | { name: string }[] | null } | null
                    const buyer = inv ? ((Array.isArray(inv.buyer) ? inv.buyer[0] : inv.buyer) as { name: string } | null) : null
                    return (
                      <li key={r.id as string} className="py-2 flex items-center gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {inv && (
                              <Link href={`/invoices/${inv.id}`} className="font-mono text-xs hover:text-primary">
                                {inv.invoice_number}
                              </Link>
                            )}
                            <Badge variant="secondary" className="text-[10px] uppercase">{r.payment_mode as string}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {buyer?.name ?? '—'} · {r.payment_reference ? `Ref ${r.payment_reference}` : '—'}
                          </p>
                        </div>
                        <span className="tabular-nums font-medium">₹{Number(r.amount).toLocaleString('en-IN')}</span>
                        <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                          {new Date(r.received_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent dunning */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Recent dunning</h2>
          <Card>
            <CardContent className="pt-2">
              {(recentDunning ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No dunning sent yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(recentDunning ?? []).map((d) => {
                    const c = (Array.isArray(d.collection) ? d.collection[0] : d.collection) as unknown as { invoice: { invoice_number: string; buyer: { name: string } | { name: string }[] | null } | { invoice_number: string; buyer: { name: string } | { name: string }[] | null }[] | null } | null
                    const inv = c ? ((Array.isArray(c.invoice) ? c.invoice[0] : c.invoice) as { invoice_number: string; buyer: { name: string } | { name: string }[] | null } | null) : null
                    const buyer = inv ? ((Array.isArray(inv.buyer) ? inv.buyer[0] : inv.buyer) as { name: string } | null) : null
                    return (
                      <li key={d.id as string} className="py-2 flex items-center gap-3 text-sm">
                        <Send className="size-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs">{inv?.invoice_number ?? '—'}</span>
                            <Badge variant="secondary" className="text-[10px] uppercase">{d.channel as string}</Badge>
                            <Badge variant={d.outcome === 'sent' || d.outcome === 'delivered' ? 'secondary' : 'destructive'} className="text-[10px] uppercase">
                              {d.outcome as string}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{buyer?.name ?? '—'}</p>
                        </div>
                        <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                          {new Date(d.created_at as string).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-start gap-3 text-sm">
        <AlertCircle className="size-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-muted-foreground">
          DSO is a 30-day rolling estimate (outstanding ÷ average daily revenue).
          Open collections: {(openCollections ?? []).length}.
          When Tally credentials are wired in, the Tally sync page will reconcile
          ledgers automatically.
        </p>
      </div>
    </div>
  )
}

function KPI({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent className="pt-3 pb-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="tabular-nums text-2xl font-semibold text-foreground">{value}</p>
        {hint && <p className="text-xs text-muted-foreground tabular-nums">{hint}</p>}
      </CardContent>
    </Card>
  )
}
