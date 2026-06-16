import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, BadgePercent, Star } from 'lucide-react'
import { EntriesEditor } from './entries-editor'
import { PriceListActions } from './price-list-actions'

export const dynamic = 'force-dynamic'

export default async function PriceListDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const [{ data: list }, { data: entries }, { data: products }] = await Promise.all([
    supabase
      .from('price_list')
      .select('id, code, label, segment, region, currency, effective_from, effective_to, is_default, is_active, notes')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('price_list_entry')
      .select('id, product_id, unit_price, min_qty, valid_from, valid_to, notes, product:product_id(sku_code, name, unit, mrp)')
      .eq('price_list_id', id)
      .order('min_qty', { ascending: false }),
    supabase
      .from('product')
      .select('id, sku_code, name, unit, mrp')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sku_code'),
  ])

  if (!list) notFound()

  type Entry = {
    id: string
    product_id: string
    unit_price: number
    min_qty: number
    valid_from: string | null
    valid_to: string | null
    notes: string | null
    product: { sku_code: string; name: string; unit: string; mrp: number | null } | { sku_code: string; name: string; unit: string; mrp: number | null }[] | null
  }
  const entryList = ((entries ?? []) as unknown as Entry[]).map((e) => ({
    ...e,
    product: (Array.isArray(e.product) ? e.product[0] : e.product) ?? null,
  }))
  type Product = { id: string; sku_code: string; name: string; unit: string; mrp: number | null }
  const productList = (products ?? []) as Product[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <Link href="/admin/price-lists" className="hover:text-foreground">Price lists</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-mono">{list.code as string}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{list.label as string}</h1>
                <span className="font-mono text-xs text-muted-foreground">{list.code as string}</span>
                {list.is_default && (
                  <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                    <Star className="size-3 mr-0.5" /> Default
                  </Badge>
                )}
                {!list.is_active && (
                  <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span>
                  {list.segment ? <span className="capitalize">{list.segment as string} segment</span> : <span className="italic">Any segment</span>}
                </span>
                {list.region && <span>· {list.region as string}</span>}
                <span>· {list.currency as string}</span>
                <span className="tabular-nums">
                  · {new Date(list.effective_from as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' – '}
                  {list.effective_to ? new Date(list.effective_to as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : <span className="italic">open</span>}
                </span>
              </div>
              {list.notes && <p className="text-sm text-muted-foreground italic mt-1">{list.notes as string}</p>}
            </div>
            <PriceListActions priceListId={list.id as string} isActive={list.is_active as boolean} isDefault={list.is_default as boolean} />
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">Entries ({entryList.length})</h2>
        <EntriesEditor
          priceListId={list.id as string}
          entries={entryList.map((e) => ({
            id: e.id,
            product_id: e.product_id,
            sku_code: e.product?.sku_code ?? '—',
            product_name: e.product?.name ?? '—',
            unit: e.product?.unit ?? '',
            mrp: e.product?.mrp != null ? Number(e.product.mrp) : null,
            unit_price: Number(e.unit_price),
            min_qty: Number(e.min_qty),
            valid_from: e.valid_from,
            valid_to: e.valid_to,
            notes: e.notes,
          }))}
          products={productList}
        />
      </div>
    </div>
  )
}
