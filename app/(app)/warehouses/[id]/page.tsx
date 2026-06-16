import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, MapPin, User } from 'lucide-react'

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

  const { data: warehouse } = await supabase
    .from('warehouse')
    .select(
      `id, code, name, type, city, state, address, notes, is_active, created_at,
       manager:manager_id(full_name, role)`
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!warehouse) notFound()

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

      <Card>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Stock dashboard and ledger will appear here in Step 2.
        </CardContent>
      </Card>
    </div>
  )
}
