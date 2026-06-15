'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, FolderKanban, PlusCircle, Search, User } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createTask } from '@/lib/actions/tasks'

const LEFT_TABS = [
  { label: 'Today', href: '/dashboard', icon: Home },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
]

const RIGHT_TABS = [
  { label: 'Search', href: '/contacts', icon: Search },
  { label: 'Me', href: '/profile', icon: User },
]

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createTask({ title: title.trim(), priority: 'medium' })
      if ('error' in result) {
        setError(result.error)
      } else {
        setTitle('')
        setOpen(false)
        router.refresh()
      }
    })
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setTitle('')
      setError(null)
    }
  }

  const allTabs = [...LEFT_TABS, ...RIGHT_TABS]

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe pb-8">
          <SheetHeader className="pb-2">
            <SheetTitle>Quick Add Task</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleAddTask} className="flex flex-col gap-3 px-4 pb-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-title" className="text-sm font-medium">
                What needs to be done?
              </Label>
              <Input
                id="qa-title"
                placeholder="e.g. Follow up with Ramesh"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isPending || !title.trim()}
              className="w-full"
            >
              {isPending ? 'Adding…' : 'Add Task'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <nav className="fixed bottom-0 inset-x-0 z-20 flex h-14 items-center justify-around border-t border-border bg-card md:hidden">
        {LEFT_TABS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          )
        })}

        {/* Add button — centre position */}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium text-primary transition-colors active:scale-95"
        >
          <PlusCircle className="size-6" />
          <span>Add</span>
        </button>

        {RIGHT_TABS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
