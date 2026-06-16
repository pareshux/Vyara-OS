import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, AlertTriangle } from 'lucide-react'
import { NewDealerSheet } from './new-dealer-sheet'

export const dynamic = 'force-dynamic'

const TIER_STYLES: Record<string, { bg: string; color: string }> = {
  platinum: { bg: '#E5E7EB', color: '#374151' },
  gold:     { bg: '#FEF3C7', color: '#B45309' },
  silver:   { bg: '#F1F5F9', color: '#475569' },
  bronze:   { bg: '#FFEDD5', color: '#C2410C' },
}

export default async function DealersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: 'active' | 'inactive' | 'dormant' }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filter = sp.filter ?? null

  const [
    { data: dealersRaw },
    { data: ageingRaw },
    { data: lastOrderRaw },
    { data: firms },
  ] = await Promise.all([
    supabase
      .from('dealer')
      .select(
        `id, dealer_code, tier, territory, credit_limit, credit_period_days,
         dormancy_threshold_days, is_active, onboarded_at, notes,
         firm:firm_id(id, name, city, phone)`
      )
      .is('deleted_at', null)
      .order('dealer_code'),
    // Outstanding per dealer firm_id (via invoice_ageing_v + firm_id join)
    supabase
      .from('invoice')
      .select('buyer_firm_id, billed_amount, paid_amount, status')
      .is('deleted_at', null),
    // Last order date per dealer firm
    supabase
      .from('sales_order')
      .select('buyer_firm_id, order_date')
      .is('deleted_at', null)
      .order('order_date', { ascending: false }),
    // Firms that ARE eligible to be converted to dealer (no current dealer link)
    supabase
      .from('firm')
      .select('id, name, type, city')
      .is('deleted_at', null)
      .order('name'),
  ])

  type Dealer = {
    id: string
    dealer_code: string
    tier: string | null
    territory: string | null
    credit_limit: number | null
    credit_period_days: number
    dormancy_threshold_days: number
    is_active: boolean
    onboarded_at: string
    notes: string | null
    firm: { id: string; name: string; city: string | null; phone: string | null } | { id: string; name: string; city: string | null; phone: string | null }[] | null
  }
  const dealers = (dealersRaw ?? []) as unknown as Dealer[]

  // Outstanding per firm_id
  const outstandingByFirm: Record<string, number> = {}
  for (const inv of (ageingRaw ?? []) as { buyer_firm_id: string | null; billed_amount: number; paid_amount: number; status: string }[]) {
    if (!inv.buyer_firm_id) continue
    if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'written_off') continue
    outstandingByFirm[inv.buyer_firm_id] = (outstandingByFirm[inv.buyer_firm_id] ?? 0)
      + Math.max(0, Number(inv.billed_amount) - Number(inv.paid_amount))
  }

  // Last order date per firm_id (first row in DESC-ordered list)
  const lastOrderByFirm: Record<string, string> = {}
  for (const o of (lastOrderRaw ?? []) as { buyer_firm_id: string | null; order_date: string }[]) {
    if (!o.buyer_firm_id) continue
    if (!lastOrderByFirm[o.buyer_firm_id]) lastOrderByFirm[o.buyer_firm_id] = o.order_date
  }

  // Eligible firms for "New dealer" sheet (not already dealers, active)
  const dealerFirmIds = new Set(dealers.map((d) => {
    const f = Array.isArray(d.firm) ? d.firm[0] : d.firm
    return f?.id
  }).filter(Boolean) as string[])
  const eligibleFirms = (firms ?? [])
    .filter((f) => !dealerFirmIds.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, type: f.type, city: f.city }))

  // Compute statuses + apply filter
  const now = new Date()
  type Row = Dealer & {
    firmObj: { id: string; name: string; city: string | null; phone: string | null } | null
    outstanding: number
    lastOrderDate: string | null
    daysSinceOrder: number | null
    isDormant: boolean
  }
  const rows: Row[] = dealers.map((d) => {
    const firmObj = (Array.isArray(d.firm) ? d.firm[0] : d.firm) ?? null
    const fid = firmObj?.id
    const outstanding = fid ? (outstandingByFirm[fid] ?? 0) : 0
    const lastOrderDate = fid ? lastOrderByFirm[fid] ?? null : null
    let daysSinceOrder: number | null = null
    let isDormant = false
    if (lastOrderDate) {
      daysSinceOrder = Math.floor((now.getTime() - new Date(lastOrderDate).getTime()) / 86_400_000)
      isDormant = d.is_active && daysSinceOrder > d.dormancy_threshold_days
    } else if (d.is_active) {
      // Never ordered — dormant if onboarded > threshold ago
      const daysSinceOnboard = Math.floor((now.getTime() - new Date(d.onboarded_at).getTime()) / 86_400_000)
      isDormant = daysSinceOnboard > d.dormancy_threshold_days
    }
    return { ...d, firmObj, outstanding, lastOrderDate, daysSinceOrder, isDormant }
  })

  const filtered = rows.filter((r) => {
    if (filter === 'active') return r.is_active && !r.isDormant
    if (filter === 'inactive') return !r.is_active
    if (filter === 'dormant') return r.isDormant
    return true
  })

  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.is_active && !r.isDormant).length,
    dormant: rows.filter((r) => r.isDormant).length,
    inactive: rows.filter((r) => !r.is_active).length,
  }
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Dealers</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {rows.length} dealers · ₹{totalOutstanding.toLocaleString('en-IN')} outstanding
            </p>
          </div>
        </div>
        <NewDealerSheet eligibleFirms={eligibleFirms} />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: null,        label: 'All',      count: counts.all,      tone: 'default' as const },
          { key: 'active',    label: 'Active',   count: counts.active,   tone: 'emerald' as const },
          { key: 'dormant',   label: 'Dormant',  count: counts.dormant,  tone: 'amber'   as const },
          { key: 'inactive',  label: 'Inactive', count: counts.inactive, tone: 'gray'    as const },
        ]).map((c) => {
          const active = filter === c.key
          const href = c.key ? `/dealers?filter=${c.key}` : '/dealers'
          return (
            <Link
              key={c.label}
              href={href}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {c.label}
              <span className="tabular-nums font-semibold">{c.count}</span>
            </Link>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {filter ? `No ${filter} dealers` : 'No dealers yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {filter
                ? 'Try clearing the filter.'
                : 'Convert an existing firm to a dealer to start tracking the channel.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Firm</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Tier</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Territory</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Last order</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Outstanding</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const ts = r.tier ? TIER_STYLES[r.tier.toLowerCase()] ?? TIER_STYLES.bronze : null
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/dealers/${r.id}`} className="text-foreground hover:text-primary">
                        {r.dealer_code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/dealers/${r.id}`} className="text-foreground hover:text-primary">
                        {r.firmObj?.name ?? '—'}
                      </Link>
                      {r.firmObj?.city && (
                        <div className="text-xs text-muted-foreground">{r.firmObj.city}</div>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      {ts && r.tier ? (
                        <Badge variant="outline" className="border-0 text-xs capitalize" style={{ backgroundColor: ts.bg, color: ts.color }}>
                          {r.tier}
                        </Badge>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                      {r.territory ?? '—'}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums text-xs lg:table-cell">
                      {r.lastOrderDate
                        ? new Date(r.lastOrderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Never'}
                      {r.daysSinceOrder != null && (
                        <span className="ml-1 text-muted-foreground/60">({r.daysSinceOrder}d)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {r.outstanding > 0
                        ? `₹${r.outstanding.toLocaleString('en-IN')}`
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {!r.is_active ? (
                        <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                      ) : r.isDormant ? (
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                          <AlertTriangle className="size-3 mr-0.5" /> Dormant
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">
                          Active
                        </Badge>
                      )}
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
