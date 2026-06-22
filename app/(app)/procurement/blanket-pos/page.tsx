/**
 * /procurement/blanket-pos — Blanket PO list (P6 lite).
 *
 * Annual rate-contracts for high-velocity items. Each row shows drawdown
 * progress (qty released vs cap) + validity window + release-PO count.
 */
import Link from 'next/link'
import { listBlanketPos, type BlanketPoStatus } from '@/lib/actions/blanket-pos'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Plus, FileSignature, ListChecks } from 'lucide-react'

function fmtMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const STATUS_META: Record<BlanketPoStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-stone-100', text: 'text-stone-700' },
  active: { label: 'Active', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  exhausted: { label: 'Exhausted', bg: 'bg-amber-50', text: 'text-amber-700' },
  expired: { label: 'Expired', bg: 'bg-stone-100', text: 'text-stone-600' },
  cancelled: { label: 'Cancelled', bg: 'bg-rose-50', text: 'text-rose-700' },
}

export default async function BlanketPosPage(props: { searchParams: Promise<{ status?: string }> }) {
  const params = await props.searchParams
  const statusFilter = params.status as BlanketPoStatus | undefined
  const rows = await listBlanketPos(statusFilter ? { status: statusFilter } : undefined)

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/procurement" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3.5" /> Procurement
          </Link>
          <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
            <FileSignature className="size-6" /> Blanket purchase orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Annual rate-contracts. Each blanket caps total qty + locks the rate; release POs draw down against it.
          </p>
        </div>
        <Link href="/procurement/blanket-pos/new">
          <Button size="sm" className="gap-1.5"><Plus className="size-4" /> New blanket PO</Button>
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip href="/procurement/blanket-pos" label="All" active={!statusFilter} />
        {(['active', 'exhausted', 'expired', 'cancelled', 'draft'] as BlanketPoStatus[]).map((s) => (
          <FilterChip
            key={s}
            href={`/procurement/blanket-pos?status=${s}`}
            label={STATUS_META[s].label}
            active={statusFilter === s}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <FileSignature className="size-8 mx-auto mb-2 opacity-40" />
            No blanket POs {statusFilter ? `with status ${STATUS_META[statusFilter].label.toLowerCase()}` : 'yet'}.
            <div className="mt-3">
              <Link href="/procurement/blanket-pos/new" className="text-primary hover:underline">
                Create your first blanket PO →
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Blanket #</th>
                    <th className="text-left px-4 py-2.5 font-medium">Vendor · Item</th>
                    <th className="text-right px-3 py-2.5 font-medium">Cap</th>
                    <th className="text-right px-3 py-2.5 font-medium">Rate</th>
                    <th className="text-left px-3 py-2.5 font-medium">Drawdown</th>
                    <th className="text-right px-3 py-2.5 font-medium">Remaining</th>
                    <th className="text-left px-3 py-2.5 font-medium">Validity</th>
                    <th className="text-center px-3 py-2.5 font-medium">Releases</th>
                    <th className="text-center px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const meta = STATUS_META[r.status]
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 align-top">
                          <Link href={`/procurement/blanket-pos/${r.id}`} className="font-mono text-xs text-primary hover:underline">
                            {r.bpo_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.vendor_name}</div>
                          <div className="text-xs text-muted-foreground">{r.description}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <div>{r.qty_cap.toLocaleString('en-IN')}</div>
                          <div className="text-[10px] text-muted-foreground">{r.unit}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">₹{r.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-3 min-w-[140px]">
                          <div className="text-xs tabular-nums mb-1">
                            <span className="font-medium">{r.qty_released.toLocaleString('en-IN')}</span> of {r.qty_cap.toLocaleString('en-IN')}
                          </div>
                          <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${r.pct_consumed >= 100 ? 'bg-amber-500' : r.pct_consumed >= 75 ? 'bg-sky-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, r.pct_consumed)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{r.pct_consumed}%</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.qty_remaining.toLocaleString('en-IN')}
                          <div className="text-[10px] text-muted-foreground">{fmtMoneyShort(r.qty_remaining * r.rate)}</div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div>{fmtDate(r.valid_from)}</div>
                          <div className="text-muted-foreground">→ {fmtDate(r.valid_to)}</div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge variant="outline" className="font-mono">{r.release_po_count}</Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[11px] rounded ${meta.bg} ${meta.text}`}>
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FilterChip({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 text-xs rounded-full border ${
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
      }`}
    >
      {label}
    </Link>
  )
}
