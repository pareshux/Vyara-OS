import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Settings, Percent, Calendar, Truck, BadgePercent, BookmarkIcon, Map } from 'lucide-react'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  {
    href: '/admin/taxes',
    title: 'Tax rates',
    blurb: 'GST percentages applied to invoices. Default rate drops onto every product without an override.',
    icon: Percent,
    available: true,
  },
  {
    href: '/admin/payment-terms',
    title: 'Payment terms',
    blurb: 'Net-N day templates. Default term auto-fills on new invoices for customers without an override.',
    icon: Calendar,
    available: true,
  },
  {
    href: '/admin/price-lists',
    title: 'Price lists',
    blurb: 'Per-product pricing with effective dates. Auto-fills onto quotes + orders.',
    icon: BadgePercent,
    available: true,
  },
  {
    href: '/admin/vendors',
    title: 'Vendors',
    blurb: 'Suppliers, transporters, contractors, service providers. Reference data; not procurement.',
    icon: Truck,
    available: false,
  },
  {
    href: '/admin/dealer-tiers',
    title: 'Dealer tiers',
    blurb: 'Configurable ladder for dealer ranking (replaces free-text tier field).',
    icon: BookmarkIcon,
    available: false,
  },
  {
    href: '/admin/territories',
    title: 'Territories',
    blurb: 'Regional hierarchy. Used for projects, dealers, and salesperson assignment.',
    icon: Map,
    available: false,
  },
]

export default async function AdminIndexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'manager') {
    redirect('/dashboard')
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Settings className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Tenant configuration. Changes apply across the platform immediately.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const inner = (
            <Card className={s.available ? 'hover:bg-muted/30 transition-colors cursor-pointer' : 'opacity-60'}>
              <CardContent className="pt-4 flex gap-3 items-start">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted shrink-0">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {s.title}
                    {!s.available && <span className="ml-2 text-xs text-muted-foreground italic font-normal">— coming in this slice</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.blurb}</p>
                </div>
              </CardContent>
            </Card>
          )
          return s.available ? <Link key={s.href} href={s.href}>{inner}</Link> : <div key={s.href}>{inner}</div>
        })}
      </div>

      <p className="text-xs text-muted-foreground italic">
        Master changes are recorded in the audit log. CSV imports for bulk setup are on the roadmap.
      </p>
    </div>
  )
}
