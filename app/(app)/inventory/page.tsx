import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Boxes, Upload, AlertTriangle, Warehouse, Pencil, ArrowLeftRight, Search, X } from 'lucide-react'
import { AdjustButton } from './adjust-button'
import { ReceiveButton } from './receive-button'
import { LimitsButton } from './limits-button'

export const dynamic = 'force-dynamic'

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string; q?: string; status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filterWarehouse = sp.warehouse ?? null
  const q = (sp.q ?? '').trim()
  const statusFilter = sp.status ?? null

  const [{ data: warehouses }, stockRes] = await Promise.all([
    supabase
      .from('warehouse')
      .select('id, code, name, type, is_active')
      .is('deleted_at', null)
      .order('code'),
    (async () => {
      let q = supabase
        .from('stock')
        .select(
          `id, available_qty, reserved_qty, min_level, max_level, last_movement_at,
           warehouse:warehouse_id(id, code, name, type),
           product:product_id(id, sku_code, name, unit, category, mrp)`
        )
        .order('available_qty', { ascending: true })
      if (filterWarehouse) q = q.eq('warehouse_id', filterWarehouse)
      return q
    })(),
  ])

  const { data: stockRows } = stockRes

  type Row = {
    id: string
    available_qty: number
    reserved_qty: number
    min_level: number | null
    max_level: number | null
    last_movement_at: string | null
    warehouse: { id: string; code: string; name: string; type: string } | { id: string; code: string; name: string; type: string }[] | null
    product: { id: string; sku_code: string; name: string; unit: string; category: string; mrp: number | null } | { id: string; sku_code: string; name: string; unit: string; category: string; mrp: number | null }[] | null
  }
  const allRows = (stockRows ?? []) as unknown as Row[]

  // Apply search + status filter (in-memory, pilot scale)
  let rows = allRows
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => {
      const pr = Array.isArray(r.product) ? r.product[0] : r.product
      return (pr?.sku_code ?? '').toLowerCase().includes(needle)
        || (pr?.name ?? '').toLowerCase().includes(needle)
    })
  }
  if (statusFilter === 'low') {
    rows = rows.filter((r) => r.min_level != null && Number(r.available_qty) < Number(r.min_level))
  } else if (statusFilter === 'empty') {
    rows = rows.filter((r) => Number(r.available_qty) === 0)
  } else if (statusFilter === 'ok') {
    rows = rows.filter((r) => Number(r.available_qty) > 0 && !(r.min_level != null && Number(r.available_qty) < Number(r.min_level)))
  }

  const totalSkus = rows.length
  const lowStock = allRows.filter((r) => r.min_level != null && Number(r.available_qty) < Number(r.min_level)).length
  const emptyStock = allRows.filter((r) => Number(r.available_qty) === 0).length
  const okStock = allRows.length - lowStock - emptyStock
  const totalAvailable = rows.reduce((s, r) => s + Number(r.available_qty), 0)
  const totalReserved = rows.reduce((s, r) => s + Number(r.reserved_qty), 0)

  function buildQs(opts: { warehouse?: string | null; q?: string | null; status?: string | null }) {
    const params = new URLSearchParams()
    if (opts.warehouse) params.set('warehouse', opts.warehouse)
    if (opts.q) params.set('q', opts.q)
    if (opts.status) params.set('status', opts.status)
    const s = params.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Boxes className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {totalSkus} stock rows · {lowStock} low-stock
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ReceiveButton variant="default" label="Receive stock" />
          <Button size="sm" variant="outline" asChild>
            <Link href="/inventory/adjustments"><Pencil className="size-4 mr-1.5" />Adjustments</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/inventory/transfers"><ArrowLeftRight className="size-4 mr-1.5" />Transfers</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/inventory/import"><Upload className="size-4 mr-1.5" />Import CSV</Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <form action="/inventory" method="get" className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="size-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by SKU code or product name…"
            className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm shadow-xs"
          />
        </div>
        {filterWarehouse && <input type="hidden" name="warehouse" value={filterWarehouse} />}
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <Button type="submit" size="sm" variant="outline">Search</Button>
        {q && (
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href={buildQs({ warehouse: filterWarehouse, status: statusFilter })}>
              <X className="size-3.5" />
            </Link>
          </Button>
        )}
      </form>

      {/* Warehouse filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildQs({ q, status: statusFilter })}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
            !filterWarehouse ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          All warehouses
        </Link>
        {(warehouses ?? []).map((w) => {
          const isActive = filterWarehouse === w.id
          return (
            <Link
              key={w.id}
              href={buildQs({ warehouse: isActive ? null : w.id, q, status: statusFilter })}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <Warehouse className="size-3" />
              {w.code}
            </Link>
          )
        })}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildQs({ warehouse: filterWarehouse, q })}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
            !statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          All
        </Link>
        <Link
          href={buildQs({ warehouse: filterWarehouse, q, status: statusFilter === 'low' ? null : 'low' })}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
            statusFilter === 'low' ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-red-50 text-red-700 border-transparent hover:bg-red-100'
          }`}
        >
          <AlertTriangle className="size-3" /> Low <span className="tabular-nums font-semibold">{lowStock}</span>
        </Link>
        <Link
          href={buildQs({ warehouse: filterWarehouse, q, status: statusFilter === 'empty' ? null : 'empty' })}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
            statusFilter === 'empty' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-transparent hover:bg-amber-100'
          }`}
        >
          Empty <span className="tabular-nums font-semibold">{emptyStock}</span>
        </Link>
        <Link
          href={buildQs({ warehouse: filterWarehouse, q, status: statusFilter === 'ok' ? null : 'ok' })}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
            statusFilter === 'ok' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-transparent hover:bg-emerald-100'
          }`}
        >
          OK <span className="tabular-nums font-semibold">{okStock}</span>
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card size="sm"><CardContent className="pt-3 pb-3 flex flex-col">
          <span className="text-xs uppercase text-muted-foreground">SKUs tracked</span>
          <span className="tabular-nums text-2xl font-semibold">{totalSkus}</span>
        </CardContent></Card>
        <Card size="sm"><CardContent className="pt-3 pb-3 flex flex-col">
          <span className="text-xs uppercase text-muted-foreground">Total available</span>
          <span className="tabular-nums text-2xl font-semibold">{totalAvailable.toLocaleString('en-IN')}</span>
        </CardContent></Card>
        <Card size="sm"><CardContent className="pt-3 pb-3 flex flex-col">
          <span className="text-xs uppercase text-muted-foreground">Total reserved</span>
          <span className="tabular-nums text-2xl font-semibold">{totalReserved.toLocaleString('en-IN')}</span>
        </CardContent></Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Boxes className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No stock recorded yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Import opening stock from CSV, or record receipts per warehouse as production happens.
            </p>
            <Button size="sm" asChild className="mt-3">
              <Link href="/inventory/import"><Upload className="size-4 mr-1.5" />Import CSV</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell">Warehouse</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Available</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">Reserved</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground lg:table-cell">Min</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wh = Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse
                const pr = Array.isArray(r.product) ? r.product[0] : r.product
                const isLow = r.min_level != null && Number(r.available_qty) < Number(r.min_level)
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{pr?.sku_code ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="text-foreground">{pr?.name ?? '—'}</div>
                      {pr?.unit && <div className="text-xs text-muted-foreground">{pr.unit}</div>}
                    </td>
                    <td className="hidden px-3 py-2 sm:table-cell">
                      {wh && (
                        <Link href={`/warehouses/${wh.id}`} className="font-mono text-xs hover:text-primary">
                          {wh.code}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {Number(r.available_qty).toLocaleString('en-IN')}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground md:table-cell">
                      {Number(r.reserved_qty).toLocaleString('en-IN')}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground lg:table-cell">
                      {r.min_level != null ? Number(r.min_level).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {isLow ? (
                        <Badge variant="destructive" className="text-[10px] uppercase">
                          <AlertTriangle className="size-3 mr-0.5" /> Low
                        </Badge>
                      ) : Number(r.available_qty) === 0 ? (
                        <Badge variant="outline" className="text-[10px] uppercase border-amber-300 text-amber-700">Empty</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] uppercase">OK</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {wh && pr && (
                        <div className="flex justify-end items-center gap-1 flex-wrap">
                          <ReceiveButton
                            variant="ghost"
                            label="Receive"
                            warehouseId={wh.id}
                            warehouseCode={wh.code}
                            productId={pr.id}
                            productSkuCode={pr.sku_code}
                            productName={pr.name}
                          />
                          <AdjustButton
                            warehouseId={wh.id}
                            productId={pr.id}
                            skuCode={pr.sku_code}
                            productName={pr.name}
                            currentAvailable={Number(r.available_qty)}
                            estimatedUnitPrice={pr.mrp ?? undefined}
                          />
                          <LimitsButton
                            warehouseId={wh.id}
                            productId={pr.id}
                            skuCode={pr.sku_code}
                            productName={pr.name}
                            unit={pr.unit}
                            currentMin={r.min_level != null ? Number(r.min_level) : null}
                            currentMax={r.max_level != null ? Number(r.max_level) : null}
                          />
                          <Link
                            href={`/inventory/ledger?warehouse=${wh.id}&product=${pr.id}`}
                            className="text-xs text-primary hover:underline ml-1"
                          >
                            Ledger
                          </Link>
                        </div>
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
