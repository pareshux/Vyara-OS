import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Warehouse } from 'lucide-react'
import { WarehousesClient } from './warehouses-client'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, { bg: string; color: string; label: string }> = {
  own_plant:          { bg: '#DBEAFE', color: '#1D4ED8', label: 'Own plant' },
  samples:            { bg: '#F3E8FF', color: '#7E22CE', label: 'Samples' },
  transit:            { bg: '#FEF3C7', color: '#B45309', label: 'Transit' },
  dealer_consignment: { bg: '#FFEDD5', color: '#C2410C', label: 'Dealer consignment' },
  other:              { bg: '#F3F4F6', color: '#6B7280', label: 'Other' },
}

export default async function WarehousesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: warehouses }, { data: users }] = await Promise.all([
    supabase
      .from('warehouse')
      .select('id, code, name, type, city, state, is_active, manager:manager_id(full_name)')
      .is('deleted_at', null)
      .order('created_at'),
    supabase
      .from('user_profile')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name'),
  ])

  type Row = {
    id: string
    code: string
    name: string
    type: string
    city: string | null
    state: string | null
    is_active: boolean
    manager: { full_name: string } | { full_name: string }[] | null
  }
  const rows = (warehouses ?? []) as unknown as Row[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Warehouse className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Warehouses</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {rows.length} configured
            </p>
          </div>
        </div>
        <WarehousesClient users={(users ?? []) as { id: string; full_name: string }[]} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Warehouse className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No warehouses configured</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Add at least one warehouse so you can hold stock, reserve against orders, and dispatch from it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">City</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Manager</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const tl = TYPE_LABELS[w.type] ?? TYPE_LABELS.other
                const manager = Array.isArray(w.manager) ? w.manager[0] : w.manager
                return (
                  <tr key={w.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/warehouses/${w.id}`} className="text-foreground hover:text-primary">
                        {w.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-foreground">{w.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: tl.bg, color: tl.color }}>
                        {tl.label}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{w.city ?? '—'}</td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{manager?.full_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant={w.is_active ? 'secondary' : 'destructive'} className="text-[10px] uppercase">
                        {w.is_active ? 'Active' : 'Inactive'}
                      </Badge>
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
