import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight, ChevronRight, PlusCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:      { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
  in_transit: { bg: '#FEF3C7', color: '#B45309', label: 'In transit' },
  completed:  { bg: '#DCFCE7', color: '#15803D', label: 'Completed' },
  cancelled:  { bg: '#FEE2E2', color: '#B91C1C', label: 'Cancelled' },
}

export default async function TransfersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: transfers } = await supabase
    .from('stock_transfer')
    .select(
      `id, transfer_number, status, scheduled_at, shipped_at, completed_at, notes, created_at,
       from_wh:from_warehouse_id(id, code, name),
       to_wh:to_warehouse_id(id, code, name),
       lines:stock_transfer_line(id)`
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  type Row = {
    id: string
    transfer_number: string
    status: string
    scheduled_at: string | null
    shipped_at: string | null
    completed_at: string | null
    notes: string | null
    created_at: string
    from_wh: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null
    to_wh: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null
    lines: { id: string }[]
  }
  const rows = (transfers ?? []) as unknown as Row[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/inventory" className="hover:text-foreground">Inventory</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Transfers</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stock transfers</h1>
          <p className="text-sm text-muted-foreground">Move stock between warehouses with full audit.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/inventory/transfers/new"><PlusCircle className="size-4 mr-1.5" /> New transfer</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ArrowLeftRight className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No transfers yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a transfer to move stock from one warehouse to another.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Transfer #</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">From → To</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Lines</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Scheduled</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Shipped</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const f = Array.isArray(r.from_wh) ? r.from_wh[0] : r.from_wh
                const t = Array.isArray(r.to_wh) ? r.to_wh[0] : r.to_wh
                const ss = STATUS_STYLES[r.status]
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/inventory/transfers/${r.id}`} className="text-foreground hover:text-primary">
                        {r.transfer_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{f?.code}</span> <span className="text-muted-foreground">→</span> <span className="font-mono text-xs">{t?.code}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.lines.length}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: ss.bg, color: ss.color }}>
                        {ss.label}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums text-xs md:table-cell">
                      {r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums text-xs md:table-cell">
                      {r.shipped_at ? new Date(r.shipped_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
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
