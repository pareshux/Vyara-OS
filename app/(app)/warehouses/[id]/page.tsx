import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, MapPin, User, AlertTriangle, BookOpen } from 'lucide-react'
import { ReceiveButton } from '@/app/(app)/inventory/receive-button'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, { bg: string; color: string; label: string }> = {
  own_plant:          { bg: '#DBEAFE', color: '#1D4ED8', label: 'Own plant' },
  samples:            { bg: '#F3E8FF', color: '#7E22CE', label: 'Samples' },
  transit:            { bg: '#FEF3C7', color: '#B45309', label: 'Transit' },
  dealer_consignment: { bg: '#FFEDD5', color: '#C2410C', label: 'Dealer consignment' },
  other:              { bg: '#F3F4F6', color: '#6B7280', label: 'Other' },
}

export default async function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: warehouse }, { data: stockRows }] = await Promise.all([
    supabase
      .from('warehouse')
      .select(
        `id, code, name, type, city, state, address, notes, is_active, created_at,
         manager:manager_id(full_name, role)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('stock')
      .select(
        `id, available_qty, reserved_qty, min_level, max_level,
         product:product_id(id, sku_code, name, unit)`
      )
      .eq('warehouse_id', id)
      .order('available_qty', { ascending: true }),
  ])

  if (!warehouse) notFound()

  type Sk = {
    id: string
    available_qty: number
    reserved_qty: number
    min_level: number | null
    max_level: number | null
    product: { id: string; sku_code: string; name: string; unit: string } | { id: string; sku_code: string; name: string; unit: string }[] | null
  }
  const stock = (stockRows ?? []) as unknown as Sk[]
  const lowCount = stock.filter((s) => s.min_level != null && Number(s.available_qty) < Number(s.min_level)).length

  const manager = (Array.isArray(warehouse.manager) ? warehouse.manager[0] : warehouse.manager) as
    | { full_name: string; role: string }
    | null
  const tl = TYPE_LABELS[warehouse.type as string] ?? TYPE_LABELS.other

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/warehouses" className="hover:text-foreground">Warehouses</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-mono">{warehouse.code as string}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{warehouse.name as string}</h1>
                <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: tl.bg, color: tl.color }}>
                  {tl.label}
                </Badge>
                {!warehouse.is_active && (
                  <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                )}
              </div>
              <p className="font-mono text-xs text-muted-foreground">{warehouse.code as string}</p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {warehouse.city && (
                  <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {warehouse.city as string}</span>
                )}
                {manager && (
                  <span className="flex items-center gap-1"><User className="size-3.5" /> {manager.full_name}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Address</p>
            <p className="text-sm">{(warehouse.address as string) ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              {(warehouse.city as string) ?? '—'}, {(warehouse.state as string) ?? '—'}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
            <p className="text-sm">{(warehouse.notes as string) ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            Stock at this warehouse
            {lowCount > 0 && (
              <Badge variant="destructive" className="text-[10px] uppercase">
                <AlertTriangle className="size-3 mr-0.5" /> {lowCount} low
              </Badge>
            )}
          </h2>
          <div className="flex gap-2">
            <ReceiveButton
              warehouseId={warehouse.id as string}
              warehouseCode={warehouse.code as string}
              label="Receive stock"
            />
            <Button size="sm" variant="outline" asChild>
              <Link href={`/inventory/ledger?warehouse=${warehouse.id}`}>
                <BookOpen className="size-4 mr-1.5" /> Full ledger
              </Link>
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {stock.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No stock recorded yet. Import opening stock from <Link href="/inventory/import" className="text-primary hover:underline">CSV</Link>.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Available</th>
                  <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">Reserved</th>
                  <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">Min</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => {
                  const pr = Array.isArray(s.product) ? s.product[0] : s.product
                  const isLow = s.min_level != null && Number(s.available_qty) < Number(s.min_level)
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{pr?.sku_code ?? '—'}</td>
                      <td className="px-3 py-2">
                        {pr?.name ?? '—'}
                        {isLow && <AlertTriangle className="size-3 ml-1 inline text-destructive" />}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {Number(s.available_qty).toLocaleString('en-IN')} <span className="text-xs text-muted-foreground">{pr?.unit}</span>
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                        {Number(s.reserved_qty).toLocaleString('en-IN')}
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground md:table-cell">
                        {s.min_level != null ? Number(s.min_level).toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {pr && (
                          <Link
                            href={`/inventory/ledger?warehouse=${warehouse.id}&product=${pr.id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
