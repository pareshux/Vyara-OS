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

type FeatureKey =
  | 'enable_field_sales'
  | 'enable_inventory'
  | 'enable_warehouse'
  | 'enable_dispatches'
  | 'enable_collections'
  | 'enable_finance'
  | 'enable_dealer_portal'

// Capability-aligned nav per Blueprint v3 §0.2. Groups render in
// declared order. 'home' + 'utility' groups render without a header
// (daily-use + miscellany). Capability groups (relationship, revenue,
// delivery, finance) render under uppercase muted labels matching the
// existing "Admin" section style.
type GroupKey = 'home' | 'relationship' | 'revenue' | 'delivery' | 'finance' | 'utility'

const GROUP_LABEL: Record<GroupKey, string | null> = {
  home:         null,           // no header
  relationship: 'Relationship',
  revenue:      'Revenue',
  delivery:     'Delivery',
  finance:      'Finance',
  utility:      null,           // no header
}

const GROUP_ORDER: GroupKey[] = ['home', 'relationship', 'revenue', 'delivery', 'finance', 'utility']

type NavItem = {
  label: string
  href: string
  icon: typeof LayoutDashboard
  group: GroupKey
  feature?: FeatureKey
}

const NAV_ITEMS: NavItem[] = [
  // Home — daily-use surfaces, no group header.
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard, group: 'home' },
  { label: 'Field',       href: '/field',       icon: MapPin,          group: 'home',          feature: 'enable_field_sales' },

  // Relationship — people + organisations (Blueprint capability §2.1).
  // Dealer is a relationship type, not a separate module — lives here.
  { label: 'Leads',       href: '/leads',       icon: UserPlus,        group: 'relationship' },
  { label: 'Contacts',    href: '/contacts',    icon: Users,           group: 'relationship' },
  { label: 'Dealers',     href: '/dealers',     icon: Store,           group: 'relationship',  feature: 'enable_dealer_portal' },

  // Revenue — generate business (Blueprint §2.2).
  { label: 'Projects',    href: '/projects',    icon: FolderKanban,    group: 'revenue' },
  { label: 'Orders',      href: '/orders',      icon: Package,         group: 'revenue' },

  // Delivery — fulfil commitments (Blueprint §2.3).
  { label: 'Inventory',   href: '/inventory',   icon: Boxes,           group: 'delivery',      feature: 'enable_inventory' },
  { label: 'Warehouses',  href: '/warehouses',  icon: Warehouse,       group: 'delivery',      feature: 'enable_warehouse' },
  { label: 'Dispatches',  href: '/dispatches',  icon: Truck,           group: 'delivery',      feature: 'enable_dispatches' },

  // Finance — receivables, payables, claims (Blueprint §2.6).
  { label: 'Invoices',    href: '/invoices',    icon: FileText,        group: 'finance' },
  { label: 'Collections', href: '/collections', icon: Wallet,          group: 'finance',       feature: 'enable_collections' },
  { label: 'Finance',     href: '/finance',     icon: TrendingUp,      group: 'finance',       feature: 'enable_finance' },

  // Utility — cross-cutting platform surfaces.
  { label: 'Tasks',       href: '/tasks',       icon: CheckSquare,     group: 'utility' },
]

interface SidebarProps {
  userRole?: string
  features?: Partial<Record<FeatureKey, boolean>>
}

export function Sidebar({ userRole, features }: SidebarProps) {
  const pathname = usePathname()
  const isAdminish = userRole === 'admin' || userRole === 'manager'

  // Hide items whose feature flag is explicitly false. Absence of the
  // flag from the prop = "show" (backwards-compat).
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.feature || features?.[item.feature] !== false,
  )

  // Bucket by group so headers can sit between sections.
  const itemsByGroup = GROUP_ORDER.reduce<Record<GroupKey, NavItem[]>>(
    (acc, group) => ({ ...acc, [group]: visibleItems.filter((i) => i.group === group) }),
    {} as Record<GroupKey, NavItem[]>,
  )

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
          <BuildingIcon className="size-4" />
        </div>
        <span className="font-semibold text-sidebar-foreground tracking-tight">CRMOS</span>
      </div>

      <nav className="flex flex-1 flex-col p-3">
        {GROUP_ORDER.map((group) => {
          const items = itemsByGroup[group]
          if (items.length === 0) return null
          const header = GROUP_LABEL[group]

          return (
            <div key={group} className={cn('flex flex-col gap-0.5', header ? 'mt-3' : 'mt-0')}>
              {header && (
                <div className="mb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {header}
                </div>
              )}
              {items.map(({ label, href, icon: Icon }) => {
                // Field link is role-aware: admin / manager land on the
                // team dashboard by default. Both pages stay reachable
                // via cross-links.
                const resolvedHref = href === '/field' && isAdminish ? '/field/team' : href
                const isActive = pathname === resolvedHref || pathname.startsWith(resolvedHref + '/')
                return (
                  <Link
                    key={href}
                    href={resolvedHref}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-primary/10 text-sidebar-primary'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          )
        })}

        {isAdminish && (
          <div className="mt-3 flex flex-col gap-0.5">
            <div className="mb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Admin
            </div>
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === '/admin' || pathname.startsWith('/admin/')
                  ? 'bg-sidebar-primary/10 text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Settings className="size-4 shrink-0" />
              Settings
            </Link>
          </div>
        )}
      </nav>
    </aside>
  )
}
