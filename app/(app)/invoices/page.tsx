import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Upload, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

const BUCKET_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  current: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Current' },
  '1-30':  { bg: '#FEF3C7', color: '#B45309', label: '1–30 days' },
  '31-60': { bg: '#FED7AA', color: '#C2410C', label: '31–60 days' },
  '60+':   { bg: '#FEE2E2', color: '#B91C1C', label: '60+ days' },
  closed:  { bg: '#DCFCE7', color: '#15803D', label: 'Closed' },
}

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoicesRaw } = await supabase
    .from('invoice_ageing_v')
    .select('*')
    .order('due_date', { ascending: true })

  // Pull invoice metadata in parallel
  const { data: meta } = await supabase
    .from('invoice')
    .select('id, source, is_running_bill, running_bill_seq, project:project_id(id, name), buyer:buyer_firm_id(name)')
    .is('deleted_at', null)

  type Row = {
    id: string
    invoice_number: string
    external_invoice_number: string | null
    project_id: string | null
    sales_order_id: string | null
    invoice_date: string
    due_date: string
    total: number
    retention_amount: number
    billed_amount: number
    paid_amount: number
    status: string
    outstanding: number
    days_overdue: number
    ageing_bucket: string
  }
  const rows = (invoicesRaw ?? []) as unknown as Row[]
  const metaById = Object.fromEntries(
    ((meta ?? []) as unknown as Array<{ id: string; source: string; is_running_bill: boolean; running_bill_seq: number | null; project: { id: string; name: string } | { id: string; name: string }[] | null; buyer: { name: string } | { name: string }[] | null }>).map((m) => [
      m.id,
      {
        source: m.source,
        is_running_bill: m.is_running_bill,
        running_bill_seq: m.running_bill_seq,
        project: (Array.isArray(m.project) ? m.project[0] : m.project) as { id: string; name: string } | null,
        buyer: (Array.isArray(m.buyer) ? m.buyer[0] : m.buyer) as { name: string } | null,
      },
    ])
  )

  // Bucket totals
  const buckets = ['current', '1-30', '31-60', '60+', 'closed']
  const bucketTotals = buckets.map((b) => ({
    key: b,
    count: rows.filter((r) => r.ageing_bucket === b).length,
    outstanding: rows.filter((r) => r.ageing_bucket === b).reduce((s, r) => s + Number(r.outstanding), 0),
  }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length} {rows.length === 1 ? 'invoice' : 'invoices'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/invoices/import"><Upload className="size-4 mr-1.5" />Import CSV</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/invoices/new"><Plus className="size-4 mr-1.5" />New invoice</Link>
          </Button>
        </div>
      </div>

      {/* Ageing chips */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {bucketTotals.map((b) => {
          const s = BUCKET_STYLES[b.key]
          return (
            <Card key={b.key} size="sm">
              <CardContent className="pt-3 pb-3 flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
                <span className="tabular-nums text-lg font-semibold text-foreground">
                  ₹{b.outstanding.toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {b.count} {b.count === 1 ? 'invoice' : 'invoices'}
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No invoices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one manually or import from a Tally CSV export.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Invoice #</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Buyer</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Project</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Due</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ageing</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Outstanding</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">Total</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = metaById[r.id]
                const bs = BUCKET_STYLES[r.ageing_bucket]
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/invoices/${r.id}`} className="text-foreground hover:text-primary">
                        {r.invoice_number}
                      </Link>
                      {m?.is_running_bill && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          (RA-Bill {m.running_bill_seq})
                        </span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                      {m?.buyer?.name ?? '—'}
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell">
                      {m?.project ? (
                        <Link href={`/projects/${m.project.id}`} className="text-foreground hover:text-primary">
                          {m.project.name}
                        </Link>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {new Date(r.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {r.days_overdue > 0 && (
                        <span className="ml-1 text-xs text-destructive">+{r.days_overdue}d</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: bs.bg, color: bs.color }}>
                        {bs.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      ₹{Number(r.outstanding).toLocaleString('en-IN')}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                      ₹{Number(r.total).toLocaleString('en-IN')}
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell">
                      <Badge variant="secondary" className="text-[10px] uppercase">{m?.source ?? 'manual'}</Badge>
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
