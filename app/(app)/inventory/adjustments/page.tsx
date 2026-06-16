import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ChevronRight, Pencil } from 'lucide-react'
import { AdjustmentRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:       { bg: '#FEF3C7', color: '#B45309', label: 'Pending approval' },
  approved:      { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
  auto_approved: { bg: '#DCFCE7', color: '#15803D', label: 'Auto-approved' },
  rejected:      { bg: '#FEE2E2', color: '#B91C1C', label: 'Rejected' },
}

export default async function AdjustmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('user_profile').select('role').eq('id', user.id).single()
  const isManager = profile?.role === 'manager' || profile?.role === 'admin'

  const { data: adjustments } = await supabase
    .from('stock_adjustment')
    .select(
      `id, adjustment_type, quantity_delta, estimated_value, reason, status, rejected_reason, created_at,
       warehouse:warehouse_id(id, code, name),
       product:product_id(id, sku_code, name, unit),
       requested:requested_by(id),
       approved:approved_by(id)`
    )
    .order('created_at', { ascending: false })
    .limit(50)

  type Row = {
    id: string
    adjustment_type: string
    quantity_delta: number
    estimated_value: number | null
    reason: string
    status: string
    rejected_reason: string | null
    created_at: string
    warehouse: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null
    product: { id: string; sku_code: string; name: string; unit: string } | { id: string; sku_code: string; name: string; unit: string }[] | null
  }
  const rows = (adjustments ?? []) as unknown as Row[]
  const pendingCount = rows.filter((r) => r.status === 'pending').length

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/inventory" className="hover:text-foreground">Inventory</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Adjustments</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stock adjustments</h1>
          <p className="text-sm text-muted-foreground">
            Damage, count differences, corrections. Above-threshold adjustments need manager approval.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            <AlertTriangle className="size-3 mr-1" /> {pendingCount} pending
          </Badge>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Pencil className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No adjustments yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the &quot;Adjust&quot; action on any stock row to record a damage write-off or count correction.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU @ warehouse</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Delta</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">Est. value</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Reason</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">When</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wh = Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse
                const pr = Array.isArray(r.product) ? r.product[0] : r.product
                const ss = STATUS_STYLES[r.status] ?? STATUS_STYLES.pending
                const isPositive = Number(r.quantity_delta) > 0
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 capitalize">{r.adjustment_type.replace('_', ' ')}</td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-muted-foreground">{pr?.sku_code}</div>
                      <div className="text-xs">{pr?.name} <span className="text-muted-foreground">@ {wh?.code}</span></div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${isPositive ? 'text-emerald-700' : 'text-destructive'}`}>
                      {isPositive ? '+' : ''}{Number(r.quantity_delta).toLocaleString('en-IN')}
                      <span className="text-xs text-muted-foreground ml-1">{pr?.unit}</span>
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground md:table-cell">
                      {r.estimated_value != null ? `₹${Number(r.estimated_value).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground truncate max-w-[220px] lg:table-cell">{r.reason}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: ss.bg, color: ss.color }}>
                        {ss.label}
                      </Badge>
                      {r.status === 'rejected' && r.rejected_reason && (
                        <div className="text-[10px] text-muted-foreground italic mt-0.5">— {r.rejected_reason}</div>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums text-xs md:table-cell whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isManager && r.status === 'pending' && (
                        <AdjustmentRowActions adjustmentId={r.id} />
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
