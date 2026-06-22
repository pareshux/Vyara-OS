/**
 * /procurement/blanket-pos/[id] — Blanket PO detail.
 *
 * Header card (vendor, item, cap, drawdown bar) + release POs list with
 * per-PO drawdown qty + "Create release PO from blanket" CTA when active.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBlanketPo, type BlanketPoStatus } from '@/lib/actions/blanket-pos'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, FileSignature, Plus, FileText, AlertTriangle } from 'lucide-react'

function fmtMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_META: Record<BlanketPoStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-stone-100', text: 'text-stone-700' },
  active: { label: 'Active', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  exhausted: { label: 'Exhausted', bg: 'bg-amber-100', text: 'text-amber-800' },
  expired: { label: 'Expired', bg: 'bg-stone-200', text: 'text-stone-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-rose-100', text: 'text-rose-800' },
}

export default async function BlanketPoDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const data = await getBlanketPo(id)
  if (!data) notFound()

  const { blanket: b, release_pos } = data
  const meta = STATUS_META[b.status]
  const isExpired = new Date(b.valid_to) < new Date() && b.status !== 'cancelled'

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/procurement/blanket-pos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> Blanket purchase orders
        </Link>
        <div className="flex items-start justify-between gap-4 mt-1">
          <div>
            <h1 className="text-2xl font-semibold font-mono">{b.bpo_number}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{b.vendor_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block px-2.5 py-1 text-xs rounded ${meta.bg} ${meta.text}`}>{meta.label}</span>
            {b.status === 'active' && b.qty_remaining > 0 && (
              <Link href={`/procurement/orders/new?blanket=${b.id}`}>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-3.5" /> Release PO from blanket
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {isExpired && b.status !== 'expired' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="size-4" /> This blanket PO has passed its valid-to date ({fmtDate(b.valid_to)}).
            New releases should be blocked at the PO form. Renew or supersede with a new blanket.
          </CardContent>
        </Card>
      )}

      {/* Item + capacity */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileSignature className="size-4" /> Item
              </h2>
              <div className="space-y-2 text-sm">
                <Field label="Description" value={b.description} />
                <Field label="Unit" value={b.unit} />
                <Field label="Validity" value={`${fmtDate(b.valid_from)} → ${fmtDate(b.valid_to)}`} />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold mb-3">Drawdown</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat label="Cap" value={b.qty_cap.toLocaleString('en-IN')} sublabel={b.unit} />
                  <Stat label="Released" value={b.qty_released.toLocaleString('en-IN')} sublabel={`${b.pct_consumed}%`} />
                  <Stat label="Remaining" value={b.qty_remaining.toLocaleString('en-IN')} sublabel={fmtMoneyShort(b.qty_remaining * b.rate)} />
                </div>
                <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${b.pct_consumed >= 100 ? 'bg-amber-500' : b.pct_consumed >= 75 ? 'bg-sky-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, b.pct_consumed)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded bg-muted/40 p-2">
                    <div className="text-muted-foreground">Locked rate</div>
                    <div className="font-medium tabular-nums">₹{b.rate.toLocaleString('en-IN')}/{b.unit}</div>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <div className="text-muted-foreground">Value cap</div>
                    <div className="font-medium tabular-nums">{fmtMoneyShort(b.value_cap)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Release POs */}
      <Card>
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="size-4" /> Release POs · {release_pos.length}
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {b.qty_released.toLocaleString('en-IN')} {b.unit} drawn
            </span>
          </div>
          {release_pos.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No release POs yet. Use “Release PO from blanket” to draw down against this rate-contract.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">PO #</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-right px-3 py-2 font-medium">Qty drawn</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                  <th className="text-center px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {release_pos.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <Link href={`/procurement/orders/${p.id}`} className="font-mono text-xs text-primary hover:underline">
                        {p.po_number}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-xs">{fmtDate(p.po_date)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.qty_released_on_this_po.toLocaleString('en-IN')} {b.unit}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtMoneyShort(p.total)}</td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant="outline" className="text-[10px] capitalize">{p.status.replace(/_/g, ' ')}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  )
}

function Stat({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sublabel && <div className="text-[11px] text-muted-foreground">{sublabel}</div>}
    </div>
  )
}
