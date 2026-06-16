import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, BookmarkIcon } from 'lucide-react'
import { DealerTierForm } from './tier-form'
import { DealerTierRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

export default async function DealerTiersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  // Tiers + a count of dealers using each
  const [{ data: tiers }, { data: dealerTierLinks }] = await Promise.all([
    supabase
      .from('dealer_tier')
      .select('id, code, label, color, bg_color, sort_order, is_active, notes')
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('dealer')
      .select('tier_id')
      .is('deleted_at', null),
  ])

  const usageByTierId: Record<string, number> = {}
  for (const d of dealerTierLinks ?? []) {
    if (!d.tier_id) continue
    usageByTierId[d.tier_id] = (usageByTierId[d.tier_id] ?? 0) + 1
  }

  const list = tiers ?? []

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Dealer tiers</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BookmarkIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Dealer tiers</h1>
            <p className="text-sm text-muted-foreground">
              {list.filter((t) => t.is_active).length} active · {list.length} total · drives dealer-list badge styling
            </p>
          </div>
        </div>
        <DealerTierForm mode="create" />
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookmarkIcon className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No tiers configured</p>
            <p className="mt-1 text-sm text-muted-foreground">Define the ranks you use for dealers — Bronze/Silver/Gold/Platinum, or whatever fits your channel.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Preview</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Colors</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Sort</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dealers</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="border-0 text-xs capitalize" style={{ backgroundColor: t.bg_color, color: t.color }}>
                      {t.label}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2 text-xs font-mono text-muted-foreground md:table-cell">
                    <span style={{ color: t.color }}>{t.color}</span> · <span>{t.bg_color}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.sort_order}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {usageByTierId[t.id] ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {t.is_active ? (
                      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DealerTierRowActions
                      id={t.id}
                      code={t.code}
                      label={t.label}
                      color={t.color}
                      bg_color={t.bg_color}
                      sortOrder={t.sort_order}
                      notes={t.notes ?? ''}
                      isActive={t.is_active}
                      usageCount={usageByTierId[t.id] ?? 0}
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
