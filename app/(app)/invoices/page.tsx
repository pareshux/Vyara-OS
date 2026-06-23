import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Upload, Plus } from 'lucide-react'
import { ListFilter } from '@/components/app/list-filter'

export const dynamic = 'force-dynamic'

const BUCKET_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  current: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Current' },
  '1-30':  { bg: '#FEF3C7', color: '#B45309', label: '1–30 days' },
  '31-60': { bg: '#FED7AA', color: '#C2410C', label: '31–60 days' },
  '60+':   { bg: '#FEE2E2', color: '#B91C1C', label: '60+ days' },
  closed:  { bg: '#DCFCE7', color: '#15803D', label: 'Closed' },
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial_paid: 'Partial paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
  written_off: 'Written off',
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bucket?: string; status?: string; buyer?: string; month?: string; source?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const bucketFilter = sp.bucket ?? null
  const statusFilter = sp.status ?? null
  const buyerFilter = sp.buyer ?? null   // buyer_firm_id UUID
  const monthFilter = sp.month ?? null   // YYYY-MM
  const sourceFilter = sp.source ?? null

  const [{ data: invoicesRaw }, { data: meta }] = await Promise.all([
    supabase
      .from('invoice_ageing_v')
      .select('*')
      .order('due_date', { ascending: true }),
    supabase
      .from('invoice')
      .select('id, source, is_running_bill, running_bill_seq, buyer_firm_id, project:project_id(id, name), buyer:buyer_firm_id(id, name)')
      .is('deleted_at', null),
  ])

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
  type MetaRow = {
    id: string
    source: string
    is_running_bill: boolean
    running_bill_seq: number | null
    buyer_firm_id: string | null
    project: { id: string; name: string } | { id: string; name: string }[] | null
    buyer: { id: string; name: string } | { id: string; name: string }[] | null
  }

  const allRows = (invoicesRaw ?? []) as unknown as Row[]
  const metaList = (meta ?? []) as unknown as MetaRow[]
  const metaById = Object.fromEntries(
    metaList.map((m) => [
      m.id,
      {
        source: m.source,
        is_running_bill: m.is_running_bill,
        running_bill_seq: m.running_bill_seq,
        buyer_firm_id: m.buyer_firm_id,
        project: (Array.isArray(m.project) ? m.project[0] : m.project) as { id: string; name: string } | null,
        buyer: (Array.isArray(m.buyer) ? m.buyer[0] : m.buyer) as { id: string; name: string } | null,
      },
    ])
  )

  // ── Derive filter options from full data set ─────────────────────────────────
  const buyerMap = new Map<string, string>()
  for (const m of metaList) {
    const buyer = (Array.isArray(m.buyer) ? m.buyer[0] : m.buyer) as { id: string; name: string } | null
    if (m.buyer_firm_id && buyer?.name) buyerMap.set(m.buyer_firm_id, buyer.name)
  }
  const buyerOptions = [...buyerMap.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ value: id, label: name }))

  const monthSet = new Set<string>()
  for (const r of allRows) {
    const d = new Date(r.invoice_date)
    monthSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthOptions = [...monthSet]
    .sort((a, b) => b.localeCompare(a))
    .map((ym) => {
      const [yr, mo] = ym.split('-')
      const d = new Date(parseInt(yr), parseInt(mo) - 1)
      return { value: ym, label: d.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) }
    })

  const sourceOptions = [...new Set(metaList.map((m) => m.source).filter(Boolean))]
    .sort()
    .map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))

  // ── Bucket totals from the full set (always show real distribution) ──────────
  const buckets = ['current', '1-30', '31-60', '60+', 'closed']
  const bucketTotals = buckets.map((b) => ({
    key: b,
    count: allRows.filter((r) => r.ageing_bucket === b).length,
    outstanding: allRows.filter((r) => r.ageing_bucket === b).reduce((s, r) => s + Number(r.outstanding), 0),
  }))

  // ── Apply filters ────────────────────────────────────────────────────────────
  let rows = allRows
  if (bucketFilter) rows = rows.filter((r) => r.ageing_bucket === bucketFilter)
  if (statusFilter) rows = rows.filter((r) => r.status === statusFilter)
  if (buyerFilter) {
    const matchIds = new Set(metaList.filter((m) => m.buyer_firm_id === buyerFilter).map((m) => m.id))
    rows = rows.filter((r) => matchIds.has(r.id))
  }
  if (monthFilter) {
    rows = rows.filter((r) => {
      const d = new Date(r.invoice_date)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === monthFilter
    })
  }
  if (sourceFilter) {
    const matchIds = new Set(metaList.filter((m) => m.source === sourceFilter).map((m) => m.id))
    rows = rows.filter((r) => matchIds.has(r.id))
  }
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

  const statuses = Object.keys(STATUS_LABELS)
  const statusCounts = Object.fromEntries(
    statuses.map((s) => [s, allRows.filter((r) => r.status === s).length])
  )

  function bucketHref(key: string) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (statusFilter) params.set('status', statusFilter)
    if (buyerFilter) params.set('buyer', buyerFilter)
    if (monthFilter) params.set('month', monthFilter)
    if (sourceFilter) params.set('source', sourceFilter)
    if (bucketFilter !== key) params.set('bucket', key)
    const qs = params.toString()
    return `/invoices${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length}{rows.length < allRows.length ? ` of ${allRows.length}` : ''} {rows.length === 1 ? 'invoice' : 'invoices'}
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

      {/* Ageing bucket cards — clickable filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {bucketTotals.map((b) => {
          const s = BUCKET_STYLES[b.key]
          const active = bucketFilter === b.key
          return (
            <Link key={b.key} href={bucketHref(b.key)}>
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

      {/* Filter bar */}
      <ListFilter
        searchPlaceholder="Search by invoice #, buyer, or project…"
        selects={[
          {
            key: 'status',
            label: 'Status',
            placeholder: 'All statuses',
            options: statuses
              .filter((s) => (statusCounts[s] ?? 0) > 0)
              .map((s) => ({ value: s, label: `${STATUS_LABELS[s]} (${statusCounts[s]})` })),
          },
          ...(buyerOptions.length > 1
            ? [{ key: 'buyer', label: 'Buyer', placeholder: 'All buyers', options: buyerOptions }]
            : []),
          ...(monthOptions.length > 1
            ? [{ key: 'month', label: 'Month', placeholder: 'All months', options: monthOptions }]
            : []),
          ...(sourceOptions.length > 1
            ? [{ key: 'source', label: 'Source', placeholder: 'All sources', options: sourceOptions }]
            : []),
        ]}
      />

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
