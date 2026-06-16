import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Upload, Plus, Search, X } from 'lucide-react'

export const dynamic = 'force-dynamic'

const BUCKET_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  current: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Current' },
  '1-30':  { bg: '#FEF3C7', color: '#B45309', label: '1–30 days' },
  '31-60': { bg: '#FED7AA', color: '#C2410C', label: '31–60 days' },
  '60+':   { bg: '#FEE2E2', color: '#B91C1C', label: '60+ days' },
  closed:  { bg: '#DCFCE7', color: '#15803D', label: 'Closed' },
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bucket?: string; status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const bucketFilter = sp.bucket ?? null
  const statusFilter = sp.status ?? null

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
  const allRows = (invoicesRaw ?? []) as unknown as Row[]
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

  // Bucket totals (computed from the full unfiltered set so chips always show real distribution)
  const buckets = ['current', '1-30', '31-60', '60+', 'closed']
  const bucketTotals = buckets.map((b) => ({
    key: b,
    count: allRows.filter((r) => r.ageing_bucket === b).length,
    outstanding: allRows.filter((r) => r.ageing_bucket === b).reduce((s, r) => s + Number(r.outstanding), 0),
  }))

  // Apply filters and search
  let rows = allRows
  if (bucketFilter) rows = rows.filter((r) => r.ageing_bucket === bucketFilter)
  if (statusFilter) rows = rows.filter((r) => r.status === statusFilter)
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => {
      const m = metaById[r.id]
      return (
        r.invoice_number.toLowerCase().includes(needle) ||
        (r.external_invoice_number ?? '').toLowerCase().includes(needle) ||
        (m?.buyer?.name ?? '').toLowerCase().includes(needle) ||
        (m?.project?.name ?? '').toLowerCase().includes(needle)
      )
    })
  }

  const statuses = ['draft', 'sent', 'partial_paid', 'paid', 'cancelled', 'written_off']
  const statusCounts = Object.fromEntries(
    statuses.map((s) => [s, allRows.filter((r) => r.status === s).length])
  )

  function buildQs(opts: { q?: string | null; bucket?: string | null; status?: string | null }) {
    const params = new URLSearchParams()
    if (opts.q) params.set('q', opts.q)
    if (opts.bucket) params.set('bucket', opts.bucket)
    if (opts.status) params.set('status', opts.status)
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length} {rows.length === 1 ? 'invoice' : 'invoices'}
            {(q || bucketFilter || statusFilter) && (
              <>
                {' '}
                <Link href="/invoices" className="text-xs text-primary hover:underline">(clear filters)</Link>
              </>
            )}
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

      {/* Ageing chip cards — clickable filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {bucketTotals.map((b) => {
          const s = BUCKET_STYLES[b.key]
          const active = bucketFilter === b.key
          return (
            <Link key={b.key} href={buildQs({ q, status: statusFilter, bucket: active ? null : b.key })}>
              <Card size="sm" className={`cursor-pointer transition-all ${active ? 'ring-2 ring-primary' : 'hover:bg-muted/30'}`}>
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
            </Link>
          )
        })}
      </div>

      {/* Search + status filter */}
      <Card>
        <CardContent className="pt-3 flex flex-col gap-3">
          <form action="/invoices" method="get" className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="size-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search by invoice number, external number, buyer, or project…"
                className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm shadow-xs"
              />
            </div>
            {bucketFilter && <input type="hidden" name="bucket" value={bucketFilter} />}
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <Button type="submit" size="sm" variant="outline">Search</Button>
            {q && (
              <Button type="button" size="sm" variant="ghost" asChild>
                <Link href={buildQs({ bucket: bucketFilter, status: statusFilter })}>
                  <X className="size-3.5" />
                </Link>
              </Button>
            )}
          </form>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildQs({ q, bucket: bucketFilter })}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                !statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              All statuses
            </Link>
            {statuses.map((s) => {
              const active = statusFilter === s
              const count = statusCounts[s] ?? 0
              if (count === 0 && !active) return null
              return (
                <Link
                  key={s}
                  href={buildQs({ q, bucket: bucketFilter, status: active ? null : s })}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors capitalize ${
                    active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {s.replace('_', ' ')}
                  <span className="tabular-nums font-semibold">{count}</span>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {q || bucketFilter || statusFilter ? 'No invoices match the filters' : 'No invoices yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q || bucketFilter || statusFilter
                ? 'Try clearing filters or a different search term.'
                : 'Create one manually or import from a Tally CSV export.'}
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
