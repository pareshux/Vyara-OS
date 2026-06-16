import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, ArrowRight } from 'lucide-react'
import { TransferActions } from './actions'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:      { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
  in_transit: { bg: '#FEF3C7', color: '#B45309', label: 'In transit' },
  completed:  { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
  cancelled:  { bg: '#FEE2E2', color: '#B91C1C', label: 'Cancelled' },
}

export default async function TransferDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: transfer } = await supabase
    .from('stock_transfer')
    .select(
      `id, transfer_number, status, scheduled_at, shipped_at, completed_at, notes, created_at,
       from_wh:from_warehouse_id(id, code, name),
       to_wh:to_warehouse_id(id, code, name),
       lines:stock_transfer_line(id, quantity, sort_order, notes, product:product_id(sku_code, name, unit))`
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!transfer) notFound()

  const f = (Array.isArray(transfer.from_wh) ? transfer.from_wh[0] : transfer.from_wh) as { id: string; code: string; name: string } | null
  const t = (Array.isArray(transfer.to_wh) ? transfer.to_wh[0] : transfer.to_wh) as { id: string; code: string; name: string } | null
  const ss = STATUS_STYLES[transfer.status as string]

  type Line = { id: string; quantity: number; sort_order: number; notes: string | null; product: { sku_code: string; name: string; unit: string } | { sku_code: string; name: string; unit: string }[] | null }
  const lines = ((transfer.lines ?? []) as Line[]).sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/inventory/transfers" className="hover:text-foreground">Transfers</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium font-mono">{transfer.transfer_number as string}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold font-mono">{transfer.transfer_number as string}</h1>
                <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: ss.bg, color: ss.color }}>
                  {ss.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href={`/warehouses/${f?.id}`} className="font-mono hover:text-foreground">{f?.code}</Link>
                <ArrowRight className="size-3.5" />
                <Link href={`/warehouses/${t?.id}`} className="font-mono hover:text-foreground">{t?.code}</Link>
              </div>
            </div>
          </div>

          <TransferActions transferId={transfer.id as string} status={transfer.status as string} />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">Lines</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const pr = Array.isArray(l.product) ? l.product[0] : l.product
                return (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{pr?.sku_code ?? '—'}</td>
                    <td className="px-3 py-2">{pr?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(l.quantity).toLocaleString('en-IN')} <span className="text-xs text-muted-foreground">{pr?.unit}</span>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{l.notes ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {transfer.notes && (
        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm">{transfer.notes as string}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
