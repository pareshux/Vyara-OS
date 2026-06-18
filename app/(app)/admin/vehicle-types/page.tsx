import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Bike } from 'lucide-react'
import { VehicleTypeForm } from './type-form'
import { VehicleTypeRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

export default async function VehicleTypesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const [{ data: types }, { data: vehicles }] = await Promise.all([
    supabase
      .from('vehicle_type')
      .select('id, code, label, sort_order, is_active')
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('vehicle')
      .select('vehicle_type_id')
      .is('deleted_at', null),
  ])

  const usage: Record<string, number> = {}
  for (const v of vehicles ?? []) {
    if (!v.vehicle_type_id) continue
    usage[v.vehicle_type_id] = (usage[v.vehicle_type_id] ?? 0) + 1
  }

  const list = types ?? []

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Vehicle types</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bike className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Vehicle types</h1>
            <p className="text-sm text-muted-foreground">
              {list.filter((t) => t.is_active).length} active · {list.length} total · drives the rate matrix and vehicle form
            </p>
          </div>
        </div>
        <VehicleTypeForm mode="create" />
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bike className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No vehicle types configured</p>
            <p className="mt-1 text-sm text-muted-foreground">Add the categories your team uses — bike, car, auto, pickup, van…</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Sort</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Vehicles</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                  <td className="px-3 py-2">{t.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.sort_order}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usage[t.id] ?? 0}</td>
                  <td className="px-3 py-2">
                    {t.is_active ? (
                      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <VehicleTypeRowActions
                      id={t.id}
                      code={t.code}
                      label={t.label}
                      sortOrder={t.sort_order}
                      isActive={t.is_active}
                      usageCount={usage[t.id] ?? 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
