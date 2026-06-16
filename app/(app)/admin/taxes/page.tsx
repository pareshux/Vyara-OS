import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Percent, Star } from 'lucide-react'
import { TaxRateForm } from './tax-rate-form'
import { TaxRateRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

export default async function TaxRatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const { data: rates } = await supabase
    .from('tax_rate')
    .select('id, code, label, rate_pct, is_default, sort_order, is_active, notes')
    .is('deleted_at', null)
    .order('sort_order')
    .order('rate_pct')

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Tax rates</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Percent className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Tax rates</h1>
            <p className="text-sm text-muted-foreground">{(rates ?? []).filter((r) => r.is_active).length} active · {(rates ?? []).length} total</p>
          </div>
        </div>
        <TaxRateForm mode="create" />
      </div>

      {(rates ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Percent className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No tax rates configured</p>
            <p className="mt-1 text-sm text-muted-foreground">Add the GST rates you bill at — one of them becomes the tenant default.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Default</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Notes</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(rates ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2 text-foreground">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{Number(r.rate_pct).toFixed(2)}%</td>
                  <td className="px-3 py-2">
                    {r.is_default && (
                      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                        <Star className="size-3 mr-0.5" /> Default
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.is_active ? (
                      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground text-xs md:table-cell truncate max-w-[280px]">
                    {r.notes ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TaxRateRowActions
                      id={r.id}
                      label={r.label}
                      rate={Number(r.rate_pct)}
                      sortOrder={r.sort_order}
                      notes={r.notes ?? ''}
                      isDefault={r.is_default}
                      isActive={r.is_active}
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
