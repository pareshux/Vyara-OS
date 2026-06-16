import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const MOVEMENT_STYLES: Record<string, { bg: string; color: string; label: string; direction: '+' | '−' | '=' }> = {
  receipt:          { bg: '#DCFCE7', color: '#15803D', label: 'Receipt',           direction: '+' },
  transfer_in:      { bg: '#DBEAFE', color: '#1D4ED8', label: 'Transfer in',       direction: '+' },
  adjustment_plus:  { bg: '#DCFCE7', color: '#15803D', label: 'Adjustment +',      direction: '+' },
  direct_issue:     { bg: '#FEE2E2', color: '#B91C1C', label: 'Issue',             direction: '−' },
  transfer_out:     { bg: '#FEE2E2', color: '#B91C1C', label: 'Transfer out',      direction: '−' },
  adjustment_minus: { bg: '#FEE2E2', color: '#B91C1C', label: 'Adjustment −',      direction: '−' },
  sample_issue:    { bg: '#F3E8FF', color: '#7E22CE', label: 'Sample issue',      direction: '−' },
  dispatch_issue:   { bg: '#FEE2E2', color: '#B91C1C', label: 'Dispatch (issue)',  direction: '−' },
  reservation_in:   { bg: '#FEF3C7', color: '#B45309', label: 'Reservation +',     direction: '=' },
  reservation_out:  { bg: '#FEF3C7', color: '#B45309', label: 'Reservation −',     direction: '=' },
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string; product?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const warehouseId = sp.warehouse ?? null
  const productId = sp.product ?? null

  const [{ data: warehouses }, { data: products }] = await Promise.all([
    supabase.from('warehouse').select('id, code, name').is('deleted_at', null).order('code'),
    supabase.from('product').select('id, sku_code, name').is('deleted_at', null).order('sku_code'),
  ])

  // Build the ledger query
  let q = supabase
    .from('stock_movement')
    .select(
      `id, movement_type, quantity, reason_code, remark, created_at, related_entity_type, related_entity_id,
       warehouse:warehouse_id(id, code, name),
       product:product_id(id, sku_code, name, unit),
       actor:actor_id(id)`
    )
    .order('created_at', { ascending: false })
    .limit(100)
  if (warehouseId) q = q.eq('warehouse_id', warehouseId)
  if (productId) q = q.eq('product_id', productId)
  const { data: movements } = await q

  // Current balance for header (if both filters present)
  let currentStock: { available: number; reserved: number; min?: number | null; max?: number | null } | null = null
  if (warehouseId && productId) {
    const { data: stk } = await supabase
      .from('stock')
      .select('available_qty, reserved_qty, min_level, max_level')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', productId)
      .maybeSingle()
    if (stk) {
      currentStock = {
        available: Number(stk.available_qty),
        reserved: Number(stk.reserved_qty),
        min: stk.min_level != null ? Number(stk.min_level) : null,
        max: stk.max_level != null ? Number(stk.max_level) : null,
      }
    }
  }

  type Mov = {
    id: string
    movement_type: string
    quantity: number
    reason_code: string | null
    remark: string | null
    created_at: string
    related_entity_type: string | null
    related_entity_id: string | null
    warehouse: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null
    product: { id: string; sku_code: string; name: string; unit: string } | { id: string; sku_code: string; name: string; unit: string }[] | null
  }
  const movs = (movements ?? []) as unknown as Mov[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/inventory" className="hover:text-foreground">Inventory</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Stock ledger</span>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Stock movement ledger</h1>
        <p className="text-sm text-muted-foreground">
          Append-only log of every stock change. Newest 100 shown.
        </p>
      </div>

      {/* Filter chips via Select */}
      <Card>
        <CardContent className="pt-4 flex flex-col sm:flex-row gap-3">
          <FilterSelect
            label="Warehouse"
            name="warehouse"
            current={warehouseId}
            otherName="product"
            other={productId}
            options={(warehouses ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
          />
          <FilterSelect
            label="Product"
            name="product"
            current={productId}
            otherName="warehouse"
            other={warehouseId}
            options={(products ?? []).map((p) => ({ value: p.id, label: `${p.sku_code} — ${p.name}` }))}
          />
        </CardContent>
      </Card>

      {currentStock && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-4 gap-3">
            <KV label="Available" value={currentStock.available.toLocaleString('en-IN')} />
            <KV label="Reserved" value={currentStock.reserved.toLocaleString('en-IN')} />
            <KV label="Min level" value={currentStock.min != null ? currentStock.min.toLocaleString('en-IN') : '—'} />
            <KV label="Max level" value={currentStock.max != null ? currentStock.max.toLocaleString('en-IN') : '—'} />
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {movs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">When</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Warehouse</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Product</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Related</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Remark</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => {
                const ms = MOVEMENT_STYLES[m.movement_type] ?? { bg: '#F3F4F6', color: '#6B7280', label: m.movement_type, direction: '=' as const }
                const wh = Array.isArray(m.warehouse) ? m.warehouse[0] : m.warehouse
                const pr = Array.isArray(m.product) ? m.product[0] : m.product
                return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: ms.bg, color: ms.color }}>
                        {ms.label}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2 font-mono text-xs md:table-cell">{wh?.code ?? '—'}</td>
                    <td className="hidden px-3 py-2 lg:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">{pr?.sku_code ?? '—'}</span>
                      <span className="ml-2 text-xs">{pr?.name ?? ''}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: ms.color }}>
                      {ms.direction}{Number(m.quantity).toLocaleString('en-IN')}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                      {m.related_entity_type ? `${m.related_entity_type}` : '—'}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell truncate max-w-[200px]">
                      {m.remark ?? m.reason_code ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function FilterSelect({
  label, name, current, otherName, other, options,
}: {
  label: string
  name: 'warehouse' | 'product'
  current: string | null
  otherName: 'warehouse' | 'product'
  other: string | null
  options: { value: string; label: string }[]
}) {
  // Server-friendly: just render anchor tags styled as a select
  return (
    <form action="/inventory/ledger" method="get" className="flex flex-col gap-1.5 flex-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={current ?? ''}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {other && <input type="hidden" name={otherName} value={other} />}
      <button type="submit" className="hidden">Apply</button>
    </form>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular-nums text-base font-semibold">{value}</span>
    </div>
  )
}
