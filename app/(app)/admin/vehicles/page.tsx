import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Car } from 'lucide-react'
import { VehicleForm } from './vehicle-form'
import { VehicleRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

interface RateRow {
  vehicle_type_id: string
  fuel_type_id: string
  rate_per_km: number
}

export default async function VehiclesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const [
    { data: vehicles },
    { data: types },
    { data: fuels },
    { data: rates },
    { data: users },
  ] = await Promise.all([
    supabase
      .from('vehicle')
      .select(`
        id, vehicle_number, ownership, custom_rate_per_km, make_model, notes, is_active,
        vehicle_type_id, fuel_type_id, assigned_user_id,
        vehicle_type:vehicle_type_id(id, label),
        fuel_type:fuel_type_id(id, label),
        assignee:assigned_user_id(id, full_name, role)
      `)
      .is('deleted_at', null)
      .order('vehicle_number'),
    supabase
      .from('vehicle_type')
      .select('id, label, sort_order')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('fuel_type')
      .select('id, label, sort_order')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('vehicle_reimbursement_rate')
      .select('vehicle_type_id, fuel_type_id, rate_per_km')
      .is('deleted_at', null)
      .is('effective_to', null),
    supabase
      .from('user_profile')
      .select('id, full_name, role')
      .eq('is_active', true)
      .in('role', ['admin', 'manager', 'sales_engineer'])
      .order('full_name'),
  ])

  const rateMap = new Map<string, number>()
  for (const r of (rates ?? []) as RateRow[]) {
    rateMap.set(`${r.vehicle_type_id}::${r.fuel_type_id}`, Number(r.rate_per_km))
  }

  const list = vehicles ?? []
  const typeOptions = (types ?? []).map((t) => ({ id: t.id, label: t.label }))
  const fuelOptions = (fuels ?? []).map((f) => ({ id: f.id, label: f.label }))
  const userOptions = (users ?? []).map((u) => ({ id: u.id, label: u.full_name, role: u.role }))

  function effectiveRate(v: typeof list[number]): { rate: number; source: 'override' | 'matrix' | 'none' } {
    if (v.custom_rate_per_km != null) return { rate: Number(v.custom_rate_per_km), source: 'override' }
    const m = rateMap.get(`${v.vehicle_type_id}::${v.fuel_type_id}`)
    if (m != null) return { rate: m, source: 'matrix' }
    return { rate: 0, source: 'none' }
  }

  const activeCount = list.filter((v) => v.is_active).length
  const assignedCount = list.filter((v) => v.assigned_user_id).length

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Vehicles</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Car className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Vehicles</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} active · {assignedCount} assigned · {list.length} total
            </p>
          </div>
        </div>
        <VehicleForm
          mode="create"
          vehicleTypes={typeOptions}
          fuelTypes={fuelOptions}
          users={userOptions}
        />
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Car className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No vehicles added</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add vehicles your team uses for field visits. Assign each to a sales engineer or manager — they'll see it on their check-in screen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Number</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type · Fuel</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Make / model</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ownership</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Assigned to</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">₹/km</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => {
                const eff = effectiveRate(v)
                // Supabase types FK joins as arrays in some shapes; coerce.
                const type = Array.isArray(v.vehicle_type) ? v.vehicle_type[0] : v.vehicle_type
                const fuel = Array.isArray(v.fuel_type) ? v.fuel_type[0] : v.fuel_type
                const assignee = Array.isArray(v.assignee) ? v.assignee[0] : v.assignee

                return (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{v.vehicle_number}</td>
                    <td className="px-3 py-2 text-xs">
                      {type?.label ?? '—'} · <span className="text-muted-foreground">{fuel?.label ?? '—'}</span>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{v.make_model || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-muted text-muted-foreground">
                        {v.ownership}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {assignee ? (
                        <div className="flex flex-col">
                          <span className="text-sm">{assignee.full_name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{assignee.role}</span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {eff.source === 'none' ? (
                        <span className="text-xs italic text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="font-medium">₹{eff.rate.toFixed(2)}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {eff.source === 'override' ? 'custom' : 'matrix'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {v.is_active ? (
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <VehicleRowActions
                        id={v.id}
                        vehicleNumber={v.vehicle_number}
                        vehicleTypeId={v.vehicle_type_id}
                        fuelTypeId={v.fuel_type_id}
                        ownership={v.ownership as 'company' | 'personal'}
                        assignedUserId={v.assigned_user_id ?? null}
                        assignedUserLabel={assignee?.full_name ?? null}
                        customRatePerKm={v.custom_rate_per_km != null ? Number(v.custom_rate_per_km) : null}
                        makeModel={v.make_model ?? ''}
                        notes={v.notes ?? ''}
                        isActive={v.is_active}
                        vehicleTypes={typeOptions}
                        fuelTypes={fuelOptions}
                        users={userOptions}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground italic">
        Resolution order on the rep's claim: per-vehicle custom rate &gt; (type × fuel) matrix &gt; manual entry by manager.
      </p>
    </div>
  )
}
