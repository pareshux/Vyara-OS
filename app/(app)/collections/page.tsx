import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wallet, AlertCircle } from 'lucide-react'
import { CollectionRowActions } from './row-actions'
import { ListFilter } from '@/components/app/list-filter'

export const dynamic = 'force-dynamic'

const BUCKET_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  current: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Current' },
  '1-30':  { bg: '#FEF3C7', color: '#B45309', label: '1–30 days' },
  '31-60': { bg: '#FED7AA', color: '#C2410C', label: '31–60 days' },
  '60+':   { bg: '#FEE2E2', color: '#B91C1C', label: '60+ days' },
}

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bucket?: string; stage?: string; buyer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const bucketFilter = sp.bucket ?? null
  const stageFilter = sp.stage ?? null
  const buyerFilter = sp.buyer ?? null  // buyer firm id

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  let whatsappPtpEnabled = false
  if (profile?.tenant_id) {
    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: tenantRow } = await svc
      .from('tenant')
      .select('settings')
      .eq('id', profile.tenant_id)
      .single()
    const tenantSettings = (tenantRow?.settings ?? null) as
      | { ai?: { whatsapp_ptp_enabled?: boolean } }
      | null
    whatsappPtpEnabled = tenantSettings?.ai?.whatsapp_ptp_enabled === true
  }
  const canUseAI =
    whatsappPtpEnabled &&
    !!profile &&
    ['admin', 'manager', 'sales_engineer'].includes(profile.role)

  const [
    { data: collections },
    { data: ageing },
    { data: collectionStages },
  ] = await Promise.all([
    supabase
      .from('collection')
      .select(
        `id, current_stage_id, last_dunning_at,
         stage:current_stage_id(stage_key, label, color),
         invoice:invoice_id(id, invoice_number, due_date, billed_amount, paid_amount, status,
                            project:project_id(id, name),
                            buyer:buyer_firm_id(id, name, phone))`
      )
      .is('deleted_at', null)
      .is('closed_at', null)
      .order('updated_at', { ascending: false }),
    supabase.from('invoice_ageing_v').select('id, ageing_bucket, days_overdue, outstanding'),
    supabase.from('collection_stage').select('id, stage_key, label, color').order('order_index'),
  ])

  type Row = {
    id: string
    current_stage_id: string
    last_dunning_at: string | null
    stage: { stage_key: string; label: string; color: string } | { stage_key: string; label: string; color: string }[] | null
    invoice: {
      id: string
      invoice_number: string
      due_date: string
      billed_amount: number
      paid_amount: number
      status: string
      project: { id: string; name: string } | { id: string; name: string }[] | null
      buyer: { id: string; name: string; phone: string | null } | { id: string; name: string; phone: string | null }[] | null
    } | { id: string; invoice_number: string; due_date: string; billed_amount: number; paid_amount: number; status: string; project: { id: string; name: string } | null; buyer: { id: string; name: string; phone: string | null } | null }[] | null
  }
  const allRows = (collections ?? []) as unknown as Row[]
  const ageingByInvoice: Record<string, { bucket: string; days_overdue: number; outstanding: number }> =
    Object.fromEntries((ageing ?? []).map((a) => [a.id as string, { bucket: a.ageing_bucket as string, days_overdue: Number(a.days_overdue), outstanding: Number(a.outstanding) }]))

  // Bucket totals from the full set
  const buckets = ['current', '1-30', '31-60', '60+'] as const
  const bucketTotals = buckets.map((b) => {
    const inBucket = allRows.filter((r) => {
      const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
      if (!inv) return false
      return ageingByInvoice[inv.id]?.bucket === b
    })
    const total = inBucket.reduce((s, r) => {
      const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
      if (!inv) return s
      return s + (ageingByInvoice[inv.id]?.outstanding ?? 0)
    }, 0)
    return { key: b, count: inBucket.length, total }
  })

  // Derive buyer options from the full set
  const buyerMap = new Map<string, string>()
  for (const r of allRows) {
    const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
    if (!inv) continue
    const buyer = (Array.isArray(inv.buyer) ? inv.buyer[0] : inv.buyer) as { id: string; name: string } | null
    if (buyer?.id && buyer.name) buyerMap.set(buyer.id, buyer.name)
  }
  const buyerOptions = [...buyerMap.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ value: id, label: name }))

  // Apply filters in-memory
  let rows = allRows
  if (bucketFilter) {
    rows = rows.filter((r) => {
      const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
      if (!inv) return false
      return ageingByInvoice[inv.id]?.bucket === bucketFilter
    })
  }
  if (stageFilter) {
    rows = rows.filter((r) => r.current_stage_id === stageFilter)
  }
  if (buyerFilter) {
    rows = rows.filter((r) => {
      const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
      if (!inv) return false
      const buyer = (Array.isArray(inv.buyer) ? inv.buyer[0] : inv.buyer) as { id: string } | null
      return buyer?.id === buyerFilter
    })
  }
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => {
      const inv = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice
      if (!inv) return false
      const buyer = (Array.isArray(inv.buyer) ? inv.buyer[0] : inv.buyer) as { name: string } | null
      return (
        inv.invoice_number.toLowerCase().includes(needle) ||
        (buyer?.name ?? '').toLowerCase().includes(needle)
      )
    })
  }

  const grandOutstanding = bucketTotals.reduce((s, b) => s + b.total, 0)
  const overdueCount = (bucketTotals[1].count ?? 0) + (bucketTotals[2].count ?? 0) + (bucketTotals[3].count ?? 0)

  function bucketHref(key: string) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (stageFilter) params.set('stage', stageFilter)
    if (buyerFilter) params.set('buyer', buyerFilter)
    if (bucketFilter !== key) params.set('bucket', key)
    const qs = params.toString()
    return `/collections${qs ? `?${qs}` : ''}`
  }

  const stageOptions = (collectionStages ?? []).map((s) => ({
    value: s.id as string,
    label: s.label as string,
    color: s.color as string,
  }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Wallet className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Collections</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            ₹{grandOutstanding.toLocaleString('en-IN')} outstanding · {allRows.length} open · {overdueCount} overdue
          </p>
        </div>
      </div>

      {/* Bucket KPI cards — now clickable filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {bucketTotals.map((b) => {
          const s = BUCKET_STYLES[b.key]
          const active = bucketFilter === b.key
          return (
            <Link key={b.key} href={bucketHref(b.key)}>
              <Card size="sm" className={`cursor-pointer transition-all ${active ? 'ring-2 ring-primary' : 'hover:bg-muted/30'}`}>
                <CardContent className="pt-3 pb-3 flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
                  <span className="tabular-nums text-lg font-semibold text-foreground">
                    ₹{b.total.toLocaleString('en-IN')}
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
        searchPlaceholder="Search by buyer or invoice number…"
        selects={[
          ...(stageOptions.length > 0
            ? [{ key: 'stage', label: 'Stage', placeholder: 'All stages', options: stageOptions }]
            : []),
          ...(buyerOptions.length > 1
            ? [{ key: 'buyer', label: 'Buyer', placeholder: 'All buyers', options: buyerOptions }]
            : []),
        ]}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Wallet className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {q || bucketFilter || stageFilter ? 'No collections match the filters' : 'All collected — nothing open.'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q || bucketFilter || stageFilter
                ? 'Try clearing some filters.'
                : 'When invoices are created, they show up here for follow-up.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Invoice</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Buyer · Project</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Due</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ageing</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Outstanding</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const inv = (Array.isArray(r.invoice) ? r.invoice[0] : r.invoice) as
                  | { id: string; invoice_number: string; due_date: string; billed_amount: number; paid_amount: number; status: string; project: { id: string; name: string } | null; buyer: { id: string; name: string; phone: string | null } | null }
                  | null
                if (!inv) return null
                const project = (Array.isArray(inv.project) ? inv.project[0] : inv.project) as { id: string; name: string } | null
                const buyer = (Array.isArray(inv.buyer) ? inv.buyer[0] : inv.buyer) as { id: string; name: string; phone: string | null } | null
                const a = ageingByInvoice[inv.id]
                const bs = a ? BUCKET_STYLES[a.bucket] : null
                const stage = Array.isArray(r.stage) ? r.stage[0] : r.stage
                const outstanding = a?.outstanding ?? Math.max(0, Number(inv.billed_amount) - Number(inv.paid_amount))

                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/invoices/${inv.id}`} className="text-foreground hover:text-primary">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      <div className="text-foreground">{buyer?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {project ? (
                          <Link href={`/projects/${project.id}`} className="hover:text-foreground">{project.name}</Link>
                        ) : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-3 py-2">
                      {bs ? (
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: bs.bg, color: bs.color }}>
                          {a.days_overdue > 0 ? `${a.days_overdue}d` : 'OK'}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {stage ? (
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>
                          {stage.label}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      ₹{outstanding.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CollectionRowActions
                        collectionId={r.id}
                        invoiceId={inv.id}
                        invoiceNumber={inv.invoice_number}
                        outstanding={outstanding}
                        buyerName={buyer?.name ?? ''}
                        buyerPhone={buyer?.phone ?? null}
                        aiWhatsappEnabled={canUseAI}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground italic">
        <AlertCircle className="size-3 inline mr-1" />
        Inngest cron <span className="font-mono">collection-daily-check</span> runs at 10:00 IST: advances pre-due → overdue, fires WhatsApp dunning after 3 days overdue (and 5-day cool-down).
      </p>
    </div>
  )
}
