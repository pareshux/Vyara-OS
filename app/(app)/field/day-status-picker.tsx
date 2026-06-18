'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Home, CalendarOff, PartyPopper, Undo2 } from 'lucide-react'
import { setDayStatus } from '@/lib/actions/field-attendance'

const OPTIONS: Array<{
  status: 'wfh' | 'leave' | 'holiday'
  label: string
  icon: typeof Home
  toast: string
}> = [
  { status: 'wfh',     label: 'Working from home', icon: Home,         toast: 'Marked as WFH for today' },
  { status: 'leave',   label: 'On leave',          icon: CalendarOff,  toast: 'Marked as on leave' },
  { status: 'holiday', label: 'Holiday',           icon: PartyPopper,  toast: 'Marked as holiday' },
]

/**
 * Two modes:
 *  - "not-going-out" → 3 status options to skip going on field today.
 *  - "undo"          → single button to flip back to going on field.
 */
export function DayStatusPicker({ mode }: { mode: 'not-going-out' | 'undo' }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function setStatus(status: 'on_duty' | 'wfh' | 'leave' | 'holiday', successMsg: string) {
    startTransition(async () => {
      const r = await setDayStatus(status)
      if ('error' in r) { toast.error(r.error); return }
      toast.success(successMsg)
      router.refresh()
    })
  }

  if (mode === 'undo') {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setStatus('on_duty', 'Switched back — ready to check in')}
        disabled={busy}
      >
        <Undo2 className="size-3.5 mr-1.5" /> Going on field after all
      </Button>
    )
  }

  return (
    <Card className="bg-muted/20">
      <CardContent className="py-4">
        <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
          Not going out today?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ status, label, icon: Icon, toast: t }) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatus(status, t)}
              disabled={busy}
              className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card px-2 py-3 text-xs hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="leading-tight text-center">{label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
