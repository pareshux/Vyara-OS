import { Badge } from '@/components/ui/badge'
import {
  Sparkles, ArrowRight, CheckCircle2, XCircle, MessageSquare, Phone, MapPin, Pencil, UserCog, Bell, Clock,
} from 'lucide-react'

type SafeJoin<T> = T | T[] | null

interface Activity {
  id: string
  type: string
  content: unknown
  created_at: string
  actor: SafeJoin<{ full_name: string }>
}

interface StageHist {
  id: string
  remark: string | null
  created_at: string
  from_stage: SafeJoin<{ label: string; color: string }>
  to_stage: SafeJoin<{ label: string; color: string }>
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Sparkles,
  stage_changed: ArrowRight,
  lead_won: CheckCircle2,
  lead_lost: XCircle,
  lead_assigned: UserCog,
  lead_meeting: MessageSquare,
  call: Phone,
  visit: MapPin,
  note: Pencil,
  notification: Bell,
}

function one<T>(x: SafeJoin<T>): T | null {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null)
}

export function LeadTimeline({
  activities, stageHistory,
}: {
  activities: Activity[]
  stageHistory: StageHist[]
}) {
  // Merge activities and stage history by created_at, descending. Drop the
  // generic stage_changed activity if we have a stage_history row at the same
  // second (avoids dupes — the history row is richer with colored chips).
  type Row =
    | { kind: 'activity'; a: Activity }
    | { kind: 'stage'; h: StageHist }

  const stageStamps = new Set(stageHistory.map((h) => h.created_at.slice(0, 19)))
  const rows: Row[] = [
    ...activities
      .filter((a) => !(a.type === 'stage_changed' && stageStamps.has(a.created_at.slice(0, 19))))
      .map<Row>((a) => ({ kind: 'activity', a })),
    ...stageHistory.map<Row>((h) => ({ kind: 'stage', h })),
  ].sort((x, y) => {
    const xt = x.kind === 'activity' ? x.a.created_at : x.h.created_at
    const yt = y.kind === 'activity' ? y.a.created_at : y.h.created_at
    return yt.localeCompare(xt)
  })

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Clock className="size-5" />
        Nothing logged yet. Use the action buttons above to log a call, visit, or note.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <ul className="divide-y divide-border">
        {rows.map((row, i) => {
          if (row.kind === 'stage') {
            const from = one(row.h.from_stage)
            const to = one(row.h.to_stage)
            return (
              <li key={`s-${row.h.id}`} className="px-4 py-3 flex items-start gap-3">
                <div className="flex size-7 items-center justify-center rounded-full bg-muted shrink-0 mt-0.5">
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm">Stage changed</span>
                    {from && (
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${from.color}20`, color: from.color }}>
                        {from.label}
                      </Badge>
                    )}
                    <ArrowRight className="size-3 text-muted-foreground" />
                    {to && (
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${to.color}20`, color: to.color }}>
                        {to.label}
                      </Badge>
                    )}
                  </div>
                  {row.h.remark && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">{row.h.remark}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {new Date(row.h.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            )
          }
          const a = row.a
          const Icon = ICONS[a.type] ?? Bell
          const actor = one(a.actor)
          const content = (a.content ?? {}) as { note?: string; remark?: string }
          return (
            <li key={`a-${a.id}-${i}`} className="px-4 py-3 flex items-start gap-3">
              <div className="flex size-7 items-center justify-center rounded-full bg-muted shrink-0 mt-0.5">
                <Icon className="size-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm capitalize">{a.type.replace('_', ' ')}</span>
                  {actor && <span className="text-xs text-muted-foreground">· {actor.full_name}</span>}
                </div>
                {content.note && <p className="text-sm mt-0.5">{content.note}</p>}
                {content.remark && <p className="text-xs text-muted-foreground italic mt-0.5">{content.remark}</p>}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
