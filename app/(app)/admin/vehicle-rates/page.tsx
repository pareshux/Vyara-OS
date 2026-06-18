import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, Gauge } from 'lucide-react'
import { RateForm } from './rate-form'
import { RateRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

interface RateRow {
  id: string
  vehicle_type_id: string
  fuel_type_id: string
  rate_per_km: number
  effective_from: string
  notes: string | null
}

export default async function VehicleRatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const [{ data: types }, { data: fuels }, { data: rates }] = await Promise.all([
    supabase
      .from('vehicle_type')
      .select('id, code, label, sort_order, is_active')
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('fuel_type')
      .select('id, code, label, sort_order, is_active')
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('vehicle_reimbursement_rate')
      .select('id, vehicle_type_id, fuel_type_id, rate_per_km, effective_from, notes')
      .is('deleted_at', null)
      .is('effective_to', null)
      .order('effective_from', { ascending: false }),
  ])

  const typeList = types ?? []
  const fuelList = fuels ?? []
  const rateList = (rates ?? []) as RateRow[]

  const typeById = new Map(typeList.map((t) => [t.id, t]))
  const fuelById = new Map(fuelList.map((f) => [f.id, f]))

  const sortedRates = [...rateList].sort((a, b) => {
    const ta = typeById.get(a.vehicle_type_id)
    const tb = typeById.get(b.vehicle_type_id)
    if ((ta?.sort_order ?? 0) !== (tb?.sort_order ?? 0)) {
      return (ta?.sort_order ?? 0) - (tb?.sort_order ?? 0)
    }
    const fa = fuelById.get(a.fuel_type_id)
    const fb = fuelById.get(b.fuel_type_id)
    return (fa?.sort_order ?? 0) - (fb?.sort_order ?? 0)
  })

  const activeTypes = typeList.filter((t) => t.is_active)
  const activeFuels = fuelList.filter((f) => f.is_active)
  const totalCombos = activeTypes.length * activeFuels.length
  const coverage = totalCombos === 0 ? 0 : Math.round((sortedRates.length / totalCombos) * 100)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Reimbursement rates</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gauge className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Reimbursement rates</h1>
            <p className="text-sm text-muted-foreground">
              {sortedRates.length} of {totalCombos} combos covered ({coverage}%) · per-vehicle override on the vehicle row supersedes this
            </p>
          </div>
        </div>
        <RateForm
          mode="create"
          vehicleTypes={activeTypes.map((t) => ({ id: t.id, label: t.label }))}
          fuelTypes={activeFuels.map((f) => ({ id: f.id, label: f.label }))}
        />
      </div>

      {sortedRates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Gauge className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No rates set</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a rate for each (vehicle type × fuel) combo your fleet uses. Combos without a rate fall back to the per-vehicle custom rate or manual entry.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vehicle type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fuel</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate (₹/km)</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Effective from</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Notes</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRates.map((r) => {
                const t = typeById.get(r.vehicle_type_id)
                const f = fuelById.get(r.fuel_type_id)
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">{t?.label ?? '—'}</td>
                    <td className="px-3 py-2">{f?.label ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      ₹{Number(r.rate_per_km).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.effective_from}</td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{r.notes || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <RateRowActions
                        vehicleTypeId={r.vehicle_type_id}
                        fuelTypeId={r.fuel_type_id}
                        vehicleTypeLabel={t?.label ?? '—'}
                        fuelTypeLabel={f?.label ?? '—'}
                        currentRate={Number(r.rate_per_km)}
                        currentNotes={r.notes ?? ''}
                      />
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
