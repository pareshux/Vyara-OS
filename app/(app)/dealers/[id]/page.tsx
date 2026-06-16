import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, MapPin, Phone, AlertTriangle, Calendar } from 'lucide-react'
import { EditDealerButton } from './edit-dialog'
import { UsersSection } from './users-section'

export const dynamic = 'force-dynamic'

export default async function DealerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: dealer },
    { data: dealerUsers },
    { data: recentOrdersRaw },
    { data: recentInvoicesRaw },
    { data: ledgerRaw },
    { data: tiersRaw },
    { data: territoriesRaw },
  ] = await Promise.all([
    supabase
      .from('dealer')
      .select(
        `id, dealer_code, tier_id, territory_id, credit_limit, credit_period_days,
         dormancy_threshold_days, is_active, onboarded_at, notes, created_at,
         firm:firm_id(id, name, city, gstin, phone, email),
         tier:tier_id(label, color, bg_color),
         territory:territory_id(label)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('dealer_user')
      .select('id, auth_user_id, is_active, invited_at, accepted_at, revoked_at, revoke_reason')
      .eq('dealer_id', id)
      .order('invited_at', { ascending: false }),
    supabase
      .from('sales_order')
      .select('id, order_number, value, order_date, stage:current_stage_id(label, color)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('invoice')
      .select('id, invoice_number, total, billed_amount, paid_amount, due_date, status')
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .limit(5),
    supabase
      .from('dealer_ledger_v')
      .select('*')
      .eq('dealer_id', id)
      .order('txn_date', { ascending: false })
      .limit(10),
    supabase
      .from('dealer_tier')
      .select('id, label')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('territory')
      .select('id, label, level')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('level').order('sort_order'),
  ])

  if (!dealer) notFound()

  const firm = (Array.isArray(dealer.firm) ? dealer.firm[0] : dealer.firm) as
    | { id: string; name: string; city: string | null; gstin: string | null; phone: string | null; email: string | null }
    | null
  const tierObj = (Array.isArray(dealer.tier) ? dealer.tier[0] : dealer.tier) as
    | { label: string; color: string; bg_color: string }
    | null
  const territoryObj = (Array.isArray(dealer.territory) ? dealer.territory[0] : dealer.territory) as
    | { label: string }
    | null

  // Filter orders + invoices to those belonging to this dealer's firm
  type Order = { id: string; order_number: string; value: number; order_date: string; stage: { label: string; color: string } | { label: string; color: string }[] | null }
  type Inv = { id: string; invoice_number: string; total: number; billed_amount: number; paid_amount: number; due_date: string; status: string }
  const recentOrders = (recentOrdersRaw ?? []) as unknown as Order[]
  const recentInvoices = (recentInvoicesRaw ?? []) as unknown as Inv[]

  // Profile lookup for dealer users (full_name)
  const userIds = (dealerUsers ?? []).map((u) => u.auth_user_id)
  let profilesById: Record<string, { full_name: string; is_active: boolean }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profile')
      .select('id, full_name, is_active')
      .in('id', userIds)
    profilesById = Object.fromEntries((profiles ?? []).map((p) => [p.id, { full_name: p.full_name, is_active: p.is_active }]))
  }

  // Outstanding total
  let outstanding = 0
  for (const inv of recentInvoices) {
    if (['paid', 'cancelled', 'written_off'].includes(inv.status)) continue
    outstanding += Math.max(0, Number(inv.billed_amount) - Number(inv.paid_amount))
  }

  // Last order date + dormancy
  const lastOrder = recentOrders[0]?.order_date ?? null
  const daysSinceLast = lastOrder
    ? Math.floor((Date.now() - new Date(lastOrder).getTime()) / 86_400_000)
    : null
  const isDormant = dealer.is_active && (
    (daysSinceLast != null && daysSinceLast > (dealer.dormancy_threshold_days as number)) ||
    (daysSinceLast == null && Math.floor((Date.now() - new Date(dealer.onboarded_at as string).getTime()) / 86_400_000) > (dealer.dormancy_threshold_days as number))
  )

  type LedgerRow = { txn_date: string; txn_type: string; source_ref: string; debit: number; credit: number; description: string; running_balance: number }
  const ledger = (ledgerRaw ?? []) as unknown as LedgerRow[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dealers" className="hover:text-foreground">Dealers</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-mono">{dealer.dealer_code as string}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{firm?.name ?? '—'}</h1>
                <span className="font-mono text-xs text-muted-foreground">{dealer.dealer_code as string}</span>
                {tierObj && (
                  <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: tierObj.bg_color, color: tierObj.color }}>
                    {tierObj.label}
                  </Badge>
                )}
                {!dealer.is_active ? (
                  <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                ) : isDormant ? (
                  <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                    <AlertTriangle className="size-3 mr-0.5" /> Dormant
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {territoryObj && <span>{territoryObj.label}</span>}
                {firm?.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {firm.city}</span>}
                {firm?.phone && <span className="flex items-center gap-1"><Phone className="size-3.5" /> {firm.phone}</span>}
                <span className="flex items-center gap-1"><Calendar className="size-3.5" /> Onboarded {new Date(dealer.onboarded_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
            <EditDealerButton
              dealerId={dealer.id as string}
              initial={{
                tier_id: (dealer.tier_id as string) ?? null,
                territory_id: (dealer.territory_id as string) ?? null,
                credit_limit: dealer.credit_limit != null ? Number(dealer.credit_limit) : null,
                credit_period_days: Number(dealer.credit_period_days),
                dormancy_threshold_days: Number(dealer.dormancy_threshold_days),
                notes: (dealer.notes as string) ?? null,
                is_active: dealer.is_active as boolean,
              }}
              tiers={tiersRaw ?? []}
              territories={territoriesRaw ?? []}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Commercial terms</p>
            <Row label="Credit limit" value={dealer.credit_limit != null ? `₹${Number(dealer.credit_limit).toLocaleString('en-IN')}` : '—'} />
            <Row label="Credit period" value={`${dealer.credit_period_days} days`} />
            <Row label="Dormancy threshold" value={`${dealer.dormancy_threshold_days} days`} />
            <Row label="Last order" value={lastOrder
              ? `${new Date(lastOrder).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} (${daysSinceLast}d ago)`
              : 'Never'} />
            <Row label="Outstanding" value={outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '—'} />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Firm details</p>
            <Row label="GSTIN" value={firm?.gstin ?? '—'} />
            <Row label="Email" value={firm?.email ?? '—'} />
            <Row label="Phone" value={firm?.phone ?? '—'} />
            <Row label="City" value={firm?.city ?? '—'} />
          </CardContent>
        </Card>
      </div>

      {dealer.notes && (
        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{dealer.notes as string}</p>
          </CardContent>
        </Card>
      )}

      {/* Users section — invite + revoke */}
      <UsersSection
        dealerId={dealer.id as string}
        users={(dealerUsers ?? []).map((u) => ({
          id: u.id,
          auth_user_id: u.auth_user_id,
          is_active: u.is_active,
          invited_at: u.invited_at,
          accepted_at: u.accepted_at,
          revoked_at: u.revoked_at,
          revoke_reason: u.revoke_reason,
          full_name: profilesById[u.auth_user_id]?.full_name ?? '—',
        }))}
      />

      {/* Ledger snapshot */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Ledger (latest 10)</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {ledger.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No ledger transactions yet. Invoices and receipts to this dealer&apos;s firm will appear here.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ref</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                      {new Date(row.txn_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.txn_type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.source_ref}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.debit) > 0 ? `₹${Number(row.debit).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.credit) > 0 ? `₹${Number(row.credit).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">₹{Number(row.running_balance).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold mb-2">Recent orders</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {recentOrders.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No recent orders.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentOrders.map((o) => {
                  const stage = Array.isArray(o.stage) ? o.stage[0] : o.stage
                  return (
                    <li key={o.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                      <Link href={`/orders/${o.id}`} className="font-mono text-xs hover:text-primary flex-1">{o.order_number}</Link>
                      {stage && (
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>
                          {stage.label}
                        </Badge>
                      )}
                      <span className="tabular-nums text-xs text-muted-foreground">₹{Number(o.value).toLocaleString('en-IN')}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2">Recent invoices</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {recentInvoices.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No recent invoices.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentInvoices.map((inv) => {
                  const out = Math.max(0, Number(inv.billed_amount) - Number(inv.paid_amount))
                  return (
                    <li key={inv.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                      <Link href={`/invoices/${inv.id}`} className="font-mono text-xs hover:text-primary flex-1">{inv.invoice_number}</Link>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Due {new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="tabular-nums text-xs font-medium">{out > 0 ? `₹${out.toLocaleString('en-IN')}` : 'Paid'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right tabular-nums">{value}</span>
    </div>
  )
}
