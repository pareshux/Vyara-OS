/**
 * /procurement — landing for the procurement module.
 *
 * KPI strip + entry points for the buyer / procurement officer.
 * Reads via listPurchaseOrders() with no filter cap so the totals
 * are exact for the rendered set.
 *
 * Phase 1α: only the PO surface exists. The "Receive" + "Vendor bills"
 * + "Reports" cards are shown as honest "Coming next" placeholders
 * with their Blueprint IDs so future contributors don't accidentally
 * rebuild them outside the plan.
 */
import Link from 'next/link'
import { listPurchaseOrders } from '@/lib/actions/purchase-orders'
import { listPurchaseRequisitions } from '@/lib/actions/purchase-requisitions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingCart,
  ClipboardCheck,
  PackageOpen,
  Receipt,
  ArrowRight,
  CircleAlert,
  ListChecks,
  Undo2,
  Banknote,
  ClipboardList,
} from 'lucide-react'

function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}

export default async function ProcurementPage() {
  const [pos, prs] = await Promise.all([
    listPurchaseOrders({ status: 'all', limit: 500 }),
    listPurchaseRequisitions({ status: 'all', limit: 200 }),
  ])
  const prAwaiting = prs.filter((p) => p.status === 'submitted').length
  const prApproved = prs.filter((p) => p.status === 'approved').length

  // Roll up.
  const openStatuses = ['pending_approval', 'approved', 'sent', 'partly_received'] as const
  const draft = pos.filter((p) => p.status === 'draft').length
  const pendingApproval = pos.filter((p) => p.status === 'pending_approval').length
  const approved = pos.filter((p) => p.status === 'approved').length
  const sent = pos.filter((p) => p.status === 'sent').length
  const partly = pos.filter((p) => p.status === 'partly_received').length
  const received = pos.filter((p) => p.status === 'received').length
  const openCount = pos.filter((p) => (openStatuses as readonly string[]).includes(p.status)).length
  const openValue = pos
    .filter((p) => (openStatuses as readonly string[]).includes(p.status))
    .reduce((s, p) => s + Number(p.total ?? 0), 0)

  // Recent — top 5 by date for the quick-list card.
  const recent = pos.slice(0, 5)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Procurement</h1>
          <p className="text-sm text-muted-foreground">
            Vendors, purchase orders, goods receipt. The inbound side of inventory.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/procurement/requisitions/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            <ClipboardList className="size-4" /> New requisition
          </Link>
          <Link
            href="/procurement/orders/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <ShoppingCart className="size-4" /> New purchase order
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClipboardCheck className="size-3.5" /> Open POs
            </div>
            <div className="text-lg font-semibold tabular-nums">{openCount}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">{formatMoneyShort(openValue)} open value</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleAlert className="size-3.5" /> Awaiting approval
            </div>
            <div className="text-lg font-semibold tabular-nums">{pendingApproval}</div>
            <div className="text-[11px] text-muted-foreground">{approved} approved · {sent} sent</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PackageOpen className="size-3.5" /> Receiving
            </div>
            <div className="text-lg font-semibold tabular-nums">{partly}</div>
            <div className="text-[11px] text-muted-foreground">{received} fully received</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ListChecks className="size-3.5" /> Drafts
            </div>
            <div className="text-lg font-semibold tabular-nums">{draft}</div>
            <div className="text-[11px] text-muted-foreground">Not yet submitted</div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column body */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Recent POs (2 cols) */}
        <Card className="md:col-span-2">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Recent purchase orders</div>
              <Link href="/procurement/orders" className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline">
                View all <ArrowRight className="size-3" />
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No purchase orders yet.
                <div className="mt-2">
                  <Link href="/procurement/orders/new" className="text-primary hover:underline">Create the first PO →</Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {recent.map((po) => (
                  <Link
                    key={po.id}
                    href={`/procurement/orders/${po.id}`}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-mono text-xs">{po.po_number}</span>
                    <span className="text-sm flex-1 truncate">{po.vendor_name}</span>
                    <StatusBadge status={po.status} />
                    <span className="text-sm tabular-nums w-24 text-right">{formatMoneyShort(po.total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coming next — honest gap markers */}
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="text-sm font-medium">Coming next</div>
            <p className="text-xs text-muted-foreground">
              Phase 1β + 2 land these surfaces. Each gap below maps to a Blueprint row.
            </p>
            <div className="flex flex-col gap-2 text-xs">
              <Link href="/procurement/requisitions" className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/40 transition-colors">
                <ClipboardList className="size-3.5 text-violet-600 shrink-0" />
                <span className="flex-1 text-foreground">Purchase requisitions</span>
                {prAwaiting > 0 ? (
                  <span className="text-[10px] text-amber-700">{prAwaiting} pending</span>
                ) : prApproved > 0 ? (
                  <span className="text-[10px] text-emerald-700">{prApproved} approved</span>
                ) : (
                  <span className="text-[10px] text-emerald-700">Live ✓</span>
                )}
              </Link>
              <Link href="/procurement/rfqs" className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/40 transition-colors">
                <ArrowRight className="size-3.5 text-violet-600 shrink-0" />
                <span className="flex-1 text-foreground">RFQ + Comparative Statement</span>
                <span className="text-[10px] text-emerald-700">Live ✓</span>
              </Link>
              <Link href="/procurement/grns" className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/40 transition-colors">
                <PackageOpen className="size-3.5 text-emerald-600 shrink-0" />
                <span className="flex-1 text-foreground">Goods receipts (GRN)</span>
                <span className="text-[10px] text-emerald-700">Live ✓</span>
              </Link>
              <Link href="/procurement/returns" className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/40 transition-colors">
                <Undo2 className="size-3.5 text-rose-600 shrink-0" />
                <span className="flex-1 text-foreground">Returns to vendor (RTV)</span>
                <span className="text-[10px] text-emerald-700">Live ✓</span>
              </Link>
              <Link href="/procurement/bills" className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/40 transition-colors">
                <Receipt className="size-3.5 text-sky-600 shrink-0" />
                <span className="flex-1 text-foreground">Vendor bills + 3-way match</span>
                <span className="text-[10px] text-emerald-700">Live ✓</span>
              </Link>
              <Link href="/procurement/ap-ageing" className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/40 transition-colors">
                <CircleAlert className="size-3.5 text-amber-600 shrink-0" />
                <span className="flex-1 text-foreground">AP ageing + MSME 45-day</span>
                <span className="text-[10px] text-emerald-700">Live ✓</span>
              </Link>
              <Link href="/procurement/payments" className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/40 transition-colors">
                <Banknote className="size-3.5 text-emerald-600 shrink-0" />
                <span className="flex-1 text-foreground">Payment + TDS</span>
                <span className="text-[10px] text-emerald-700">Live ✓</span>
              </Link>
              <GapRow icon={CircleAlert} label="NEFT bank file + Form 16A + MSME-1" tag="P3β · follow-on" />
              <GapRow icon={CircleAlert} label="GSTR-2B reconciliation" tag="FIN-023 · P5" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const STATUS_TINT: Record<string, string> = {
  draft:            'bg-muted text-muted-foreground border-border',
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  approved:         'bg-sky-50 text-sky-800 border-sky-200',
  sent:             'bg-indigo-50 text-indigo-800 border-indigo-200',
  partly_received:  'bg-violet-50 text-violet-800 border-violet-200',
  received:         'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled:        'bg-rose-50 text-rose-800 border-rose-200',
  closed:           'bg-muted text-muted-foreground border-border',
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ')
  return (
    <Badge variant="outline" className={`${STATUS_TINT[status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
      {label}
    </Badge>
  )
}

function GapRow({ icon: Icon, label, tag }: { icon: React.ComponentType<{ className?: string }>; label: string; tag: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 text-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground/80">{tag}</span>
    </div>
  )
}
