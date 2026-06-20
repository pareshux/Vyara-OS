/**
 * FinanceDebtors — Section 4 of the Owner Dashboard (Blueprint INT-014, Slice 2).
 *
 * Top 10 firms by outstanding ₹, ranked from `invoice_ageing_v` grouped by
 * buyer_firm_id. Each row deep-links to /customers/[firmId] (Customer 360 from
 * REL-009) so the owner goes straight to the full debtor relationship view.
 *
 * Density-first per design.md §2: data-dense rows, tabular figures, hairline
 * borders, no decoration. Worst-days chip is colored by severity AND labelled
 * so it's not color-only.
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Users, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TopDebtor } from '@/lib/read-models/owner-overview'

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function severityClass(days: number): string {
  if (days > 60) return 'bg-red-50 text-red-700 border-red-200'
  if (days > 30) return 'bg-orange-50 text-orange-700 border-orange-200'
  if (days > 0)  return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-muted text-muted-foreground border-border'
}

function daysLabel(days: number): string {
  if (days <= 0) return 'Within terms'
  return `${days}d late`
}

export function FinanceDebtors({ debtors }: { debtors: TopDebtor[] }) {
  if (debtors.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Users className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No open receivables.</p>
          <p className="text-sm text-muted-foreground">Nothing outstanding from any customer.</p>
        </CardContent>
      </Card>
    )
  }

  const totalAcrossTop = debtors.reduce((s, d) => s + d.outstanding, 0)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Top {debtors.length}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{formatMoney(totalAcrossTop)}</span> across these {debtors.length} firms
          </p>
        </div>
        <ul className="divide-y">
          {debtors.map((d, idx) => (
            <li key={d.firm_id}>
              <Link
                href={d.drill_href}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <span className="w-5 text-xs text-muted-foreground tabular-nums shrink-0">
                  {idx + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {d.firm_name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums truncate">
                    {d.invoice_count} invoice{d.invoice_count === 1 ? '' : 's'} · oldest {d.oldest_invoice_label}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {formatMoney(d.outstanding)}
                  </span>
                  <span className={cn(
                    'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                    severityClass(d.worst_days),
                  )}>
                    {daysLabel(d.worst_days)}
                  </span>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
