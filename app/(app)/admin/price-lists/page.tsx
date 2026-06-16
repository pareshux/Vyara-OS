import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, BadgePercent, Star } from 'lucide-react'
import { NewPriceListSheet } from './new-price-list-sheet'

export const dynamic = 'force-dynamic'

export default async function PriceListsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const { data: lists } = await supabase
    .from('price_list')
    .select(
      `id, code, label, segment, region, currency, effective_from, effective_to,
       is_default, is_active, notes,
       entries:price_list_entry(id)`
    )
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('label')

  type Row = {
    id: string
    code: string
    label: string
    segment: string | null
    region: string | null
    currency: string
    effective_from: string
    effective_to: string | null
    is_default: boolean
    is_active: boolean
    notes: string | null
    entries: { id: string }[]
  }
  const rows = (lists ?? []) as Row[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Price lists</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BadgePercent className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Price lists</h1>
            <p className="text-sm text-muted-foreground">{rows.filter((r) => r.is_active).length} active · {rows.length} total</p>
          </div>
        </div>
        <NewPriceListSheet />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BadgePercent className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No price lists configured</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your tenant-default first; add segment- or region-specific lists later.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell">Scope</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Effective</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Entries</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/admin/price-lists/${r.id}`} className="text-foreground hover:text-primary">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/price-lists/${r.id}`} className="text-foreground hover:text-primary">
                      {r.label}
                    </Link>
                    {r.is_default && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                        <Star className="size-3 mr-0.5" /> Default
                      </Badge>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground text-xs sm:table-cell">
                    {r.segment ? <span className="capitalize">{r.segment}</span> : <span className="italic">any segment</span>}
                    {r.region && <> · {r.region}</>}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground text-xs tabular-nums md:table-cell">
                    {new Date(r.effective_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' – '}
                    {r.effective_to ? new Date(r.effective_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : <span className="italic">open</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.entries.length}</td>
                  <td className="px-3 py-2">
                    {r.is_active ? (
                      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                    )}
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
