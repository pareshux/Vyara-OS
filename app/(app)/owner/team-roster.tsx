/**
 * TeamRoster — Section 12 of the Owner Dashboard (Blueprint INT-014, Slice 4).
 *
 * Live per-rep status list. Sorted on_duty (by check-in time) first, then
 * wfh, then leave/holiday, then no-record-today (which surfaces as a
 * coaching/attention signal — coloring it amber when non-zero).
 *
 * Each row deep-links to /field/team/[userId] (the manager drill-down page
 * that already exists from FLD-006).
 *
 * Honest gap: live GPS / last-known location only shows the last check-in
 * label (not continuous tracking). Per Blueprint FLD-023 (won't build —
 * privacy + battery cost).
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  CheckCircle2, Home, CalendarOff, AlertCircle, ArrowRight, MapPin, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RosterEntry, RosterStatus } from '@/lib/read-models/owner-overview'

const STATUS_CONFIG: Record<RosterStatus, {
  icon: typeof CheckCircle2
  label: string
  dotClass: string
  badgeClass: string
}> = {
  on_duty: {
    icon: CheckCircle2,
    label: 'On duty',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  wfh: {
    icon: Home,
    label: 'WFH',
    dotClass: 'bg-blue-400',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  leave: {
    icon: CalendarOff,
    label: 'On leave',
    dotClass: 'bg-zinc-400',
    badgeClass: 'bg-zinc-50 text-zinc-700 border-zinc-200',
  },
  holiday: {
    icon: CalendarOff,
    label: 'Holiday',
    dotClass: 'bg-zinc-400',
    badgeClass: 'bg-zinc-50 text-zinc-700 border-zinc-200',
  },
  no_record: {
    icon: AlertCircle,
    label: 'No record today',
    dotClass: 'bg-amber-400',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
}

function timeLabel(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function TeamRoster({ roster }: { roster: RosterEntry[] }) {
  if (roster.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AlertCircle className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No field-eligible reps in this tenant.</p>
          <p className="text-sm text-muted-foreground">Add users with role &lsquo;sales_engineer&rsquo; or &lsquo;manager&rsquo; to populate.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {roster.map((r) => (
            <RosterRow key={r.user_id} entry={r} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RosterRow({ entry }: { entry: RosterEntry }) {
  const cfg = STATUS_CONFIG[entry.status]
  const checkIn = timeLabel(entry.check_in_at)
  const checkOut = timeLabel(entry.check_out_at)

  let primary: string
  if (entry.status === 'on_duty' && checkIn) {
    primary = checkOut ? `Done ${checkOut}` : `On duty since ${checkIn}`
  } else if (entry.status === 'no_record') {
    primary = 'No record today'
  } else {
    primary = cfg.label
  }

  return (
    <li>
      <Link
        href={entry.drill_href}
        className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <span className={cn('size-2 rounded-full shrink-0', cfg.dotClass)} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {entry.role.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {primary}
            </span>
            {entry.visits_completed > 0 && (
              <span>· {entry.visits_completed} visit{entry.visits_completed === 1 ? '' : 's'}</span>
            )}
            {entry.last_location_label && (
              <span className="inline-flex items-center gap-1 truncate">
                <MapPin className="size-3" />
                <span className="truncate max-w-[14rem]">{entry.last_location_label}</span>
              </span>
            )}
            {entry.total_km != null && entry.total_km > 0 && (
              <span>· {entry.total_km}km</span>
            )}
          </p>
        </div>
        <span className={cn(
          'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0',
          cfg.badgeClass,
        )}>
          {cfg.label}
        </span>
        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </Link>
    </li>
  )
}
