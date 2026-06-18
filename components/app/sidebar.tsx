'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  UserPlus,
  CheckSquare,
  BuildingIcon,
  Package,
  Truck,
  FileText,
  Wallet,
  TrendingUp,
  Warehouse,
  Boxes,
  Store,
  Settings,
  MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Field', href: '/field', icon: MapPin },
  { label: 'Leads', href: '/leads', icon: UserPlus },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Orders', href: '/orders', icon: Package },
  { label: 'Inventory', href: '/inventory', icon: Boxes },
  { label: 'Warehouses', href: '/warehouses', icon: Warehouse },
  { label: 'Dispatches', href: '/dispatches', icon: Truck },
  { label: 'Invoices', href: '/invoices', icon: FileText },
  { label: 'Collections', href: '/collections', icon: Wallet },
  { label: 'Finance', href: '/finance', icon: TrendingUp },
  { label: 'Dealers', href: '/dealers', icon: Store },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare },
]

interface SidebarProps {
  userRole?: string
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()
  const isAdminish = userRole === 'admin' || userRole === 'manager'

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
          <BuildingIcon className="size-4" />
        </div>
        <span className="font-semibold text-sidebar-foreground tracking-tight">CRMOS</span>
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

        {isAdminish && (
          <>
            <div className="mt-3 mb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Admin
            </div>
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === '/admin' || pathname.startsWith('/admin/')
                  ? 'bg-sidebar-primary/10 text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Settings className="size-4 shrink-0" />
              Settings
            </Link>
          </>
        )}
      </nav>
    </aside>
  )
}
