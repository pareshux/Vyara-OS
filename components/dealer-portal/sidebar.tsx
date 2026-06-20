'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  FileText,
  BookOpen,
  User,
  BuildingIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dealer-portal/dashboard', icon: LayoutDashboard },
  { label: 'My orders', href: '/dealer-portal/orders', icon: Package },
  { label: 'My invoices', href: '/dealer-portal/invoices', icon: FileText },
  { label: 'Ledger', href: '/dealer-portal/ledger', icon: BookOpen },
  { label: 'Profile', href: '/dealer-portal/profile', icon: User },
]

export function DealerSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
          <BuildingIcon className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-sidebar-foreground tracking-tight text-sm">CRMOS</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Dealer portal</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary/10 text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
