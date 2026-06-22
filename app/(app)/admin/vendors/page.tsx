import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Truck, Building2, Wrench, MoreHorizontal } from 'lucide-react'
import { VendorForm } from './vendor-form'
import { VendorRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

const TYPE_META: Record<string, { label: string; bg: string; color: string }> = {
  supplier:   { label: 'Supplier',   bg: '#DBEAFE', color: '#1E40AF' },
  contractor: { label: 'Contractor', bg: '#FEF3C7', color: '#92400E' },
  service:    { label: 'Service',    bg: '#DCFCE7', color: '#166534' },
  other:      { label: 'Other',      bg: '#F1F5F9', color: '#475569' },
}

export default async function VendorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const { data: vendors } = await supabase
    .from('vendor')
    .select(`
      id, code, name, vendor_type, gstin, pan, msme_status, msme_udyam_no,
      bank_account_no, bank_ifsc, bank_name, payment_terms_days, address,
      contact_name, phone, email, is_active, notes
    `)
    .is('deleted_at', null)
    .order('vendor_type')
    .order('name')

  const list = vendors ?? []
  const counts = {
    all: list.length,
    active: list.filter((v) => v.is_active).length,
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Vendors</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Truck className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Vendors</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {counts.active} active · {counts.all} total
            </p>
          </div>
        </div>
        <VendorForm mode="create" />
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No vendors yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Add suppliers, contractors, and service providers as you onboard them. Reference data only — purchase orders aren&apos;t in this slice.
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
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">GSTIN</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Contact</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  <MoreHorizontal className="size-4 inline" />
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => {
                const tm = TYPE_META[v.vendor_type] ?? TYPE_META.other
                return (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{v.code}</td>
                    <td className="px-3 py-2 text-foreground">{v.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-[10px] uppercase" style={{ backgroundColor: tm.bg, color: tm.color }}>
                        {v.vendor_type === 'contractor' && <Wrench className="size-3 mr-0.5" />}
                        {tm.label}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2 text-xs font-mono text-muted-foreground md:table-cell">
                      {v.gstin ?? '—'}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                      {v.contact_name ?? '—'}
                      {v.phone && <div className="text-muted-foreground/70">{v.phone}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {v.is_active ? (
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] uppercase">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <VendorRowActions
                        id={v.id}
                        code={v.code}
                        name={v.name}
                        vendor_type={v.vendor_type as 'supplier' | 'contractor' | 'service' | 'other'}
                        gstin={v.gstin ?? ''}
                        pan={(v as { pan: string | null }).pan ?? ''}
                        msme_status={((v as { msme_status: string | null }).msme_status ?? '') as 'not_msme' | 'micro' | 'small' | 'medium' | ''}
                        msme_udyam_no={(v as { msme_udyam_no: string | null }).msme_udyam_no ?? ''}
                        bank_account_no={(v as { bank_account_no: string | null }).bank_account_no ?? ''}
                        bank_ifsc={(v as { bank_ifsc: string | null }).bank_ifsc ?? ''}
                        bank_name={(v as { bank_name: string | null }).bank_name ?? ''}
                        payment_terms_days={(v as { payment_terms_days: number | null }).payment_terms_days ?? 30}
                        address={(v as { address: string | null }).address ?? ''}
                        contact_name={v.contact_name ?? ''}
                        phone={v.phone ?? ''}
                        email={v.email ?? ''}
                        notes={v.notes ?? ''}
                        isActive={v.is_active}
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
