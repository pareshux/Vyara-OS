import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Map, CornerDownRight } from 'lucide-react'
import { TerritoryForm } from './territory-form'
import { TerritoryRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

type Territory = {
  id: string
  code: string
  label: string
  parent_id: string | null
  level: number
  sort_order: number
  is_active: boolean
  notes: string | null
}

export default async function TerritoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const [{ data: terrs }, { data: dealerLinks }] = await Promise.all([
    supabase
      .from('territory')
      .select('id, code, label, parent_id, level, sort_order, is_active, notes')
      .is('deleted_at', null)
      .order('level')
      .order('sort_order')
      .order('label'),
    supabase
      .from('dealer')
      .select('territory_id')
      .is('deleted_at', null),
  ])

  const usage: Record<string, number> = {}
  for (const d of dealerLinks ?? []) {
    if (!d.territory_id) continue
    usage[d.territory_id] = (usage[d.territory_id] ?? 0) + 1
  }

  const list = (terrs ?? []) as Territory[]

  // Build sorted, indented tree (DFS — roots first, then children under each)
  const childrenByParent: Record<string, Territory[]> = {}
  for (const t of list) {
    const key = t.parent_id ?? 'ROOT'
    if (!childrenByParent[key]) childrenByParent[key] = []
    childrenByParent[key].push(t)
  }
  const ordered: Territory[] = []
  function walk(parentId: string | null) {
    const kids = childrenByParent[parentId ?? 'ROOT'] ?? []
    for (const k of kids) { ordered.push(k); walk(k.id) }
  }
  walk(null)

  const parentOptions = list
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, label: t.label, level: t.level }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Territories</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Map className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Territories</h1>
            <p className="text-sm text-muted-foreground">
              {list.filter((t) => t.is_active).length} active · hierarchical · drives dealer + project geography
            </p>
          </div>
        </div>
        <TerritoryForm mode="create" parentOptions={parentOptions} />
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Map className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No territories configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Define your geography — typically state → city → area. Children sit under a parent.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dealers</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Sort</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                  <td className="px-3 py-2 text-foreground" style={{ paddingLeft: `${0.75 + t.level * 1.25}rem` }}>
                    <span className="inline-flex items-center gap-1.5">
                      {t.level > 0 && <CornerDownRight className="size-3 text-muted-foreground/60" />}
                      {t.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {usage[t.id] ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.sort_order}</td>
                  <td className="px-3 py-2">
                    {t.is_active ? (
                      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TerritoryRowActions
                      id={t.id}
                      label={t.label}
                      sortOrder={t.sort_order}
                      notes={t.notes ?? ''}
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

      <p className="text-xs text-muted-foreground italic">
        Re-parenting a territory isn&apos;t supported yet — create a new one and reassign dealers if you need to move it.
      </p>
    </div>
  )
}
