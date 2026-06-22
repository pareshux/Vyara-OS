'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { Bell, LogOutIcon } from 'lucide-react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/contacts': 'Contacts',
  '/tasks': 'Tasks',
  '/notifications': 'Notifications',
}

interface TopbarProps {
  userName: string
  userRole: string
  userJobTitle?: string | null
  notificationCount?: number
}

export function Topbar({ userName, userRole, userJobTitle, notificationCount = 0 }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const title =
    Object.entries(PAGE_TITLES).find(([key]) => pathname === key || pathname.startsWith(key + '/'))?.[1] ??
    'CRMOS'

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <h1 className="text-sm font-medium text-foreground">{title}</h1>

      <div className="flex items-center gap-1">
        {/* Notifications bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
              className="relative flex size-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bell className="size-4 text-muted-foreground" />
              {notificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium tabular-nums text-primary-foreground leading-none">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              {notificationCount > 0 ? (
                <span className="tabular-nums">{notificationCount} unread notification{notificationCount !== 1 ? 's' : ''}</span>
              ) : (
                <span>No unread notifications</span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/notifications">View all notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden md:block font-medium text-foreground">{userName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <div className="font-medium">{userName}</div>
              <div className="text-xs text-muted-foreground capitalize">{userJobTitle ?? userRole.replace('_', ' ')}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
              <LogOutIcon className="mr-1.5 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
