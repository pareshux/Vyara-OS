// Project header — Scannable Project Tracking pattern.
// Encodes POSITION (macro stepper) + HEALTH (rolled-up pill) + COMPLETENESS
// (sub-pipeline, gates, mini-bars, next action) in one component.
//
// Reads from the project-progress read-model only; does NOT touch
// Order / Dispatch / Invoice tables directly.

import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Truck,
  Wallet,
  Package,
  Calendar,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectProgress, Health, Substage } from '@/lib/read-models/project-progress'

const HEALTH_META: Record<Health, { label: string; bg: string; text: string; dot: string; icon: React.ReactNode }> = {
  on_track:       { label: 'On track',       bg: 'bg-emerald-50', text: 'text-emerald-700', dot: '#10b981', icon: <ShieldCheck className="size-3.5" /> },
  needs_attention:{ label: 'Needs attention',bg: 'bg-amber-50',   text: 'text-amber-700',   dot: '#f59e0b', icon: <AlertTriangle className="size-3.5" /> },
  blocked:        { label: 'Blocked',        bg: 'bg-rose-50',    text: 'text-rose-700',    dot: '#e11d48', icon: <ShieldAlert className="size-3.5" /> },
}

function timeUntil(due: string | null): string {
  if (!due) return ''
  const ms = new Date(due).getTime() - Date.now()
  const days = Math.round(ms / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `due in ${days}d`
}

export function ScannableProgressHeader({ progress }: { progress: ProjectProgress }) {
  const health = HEALTH_META[progress.health]
  const currentIdx = progress.macro_stages.findIndex((s) => s.id === progress.current_stage?.id)

  return (
    <div className="flex flex-col gap-4">
      {/* Top row: health pill + reason */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border-0',
          health.bg, health.text,
        )}>
          {health.icon}
          {health.label}
        </span>
        <span className="text-xs text-muted-foreground">· {progress.health_reason}</span>
      </div>

      {/* Macro stepper (POSITION) — current segment tinted by HEALTH */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {progress.macro_stages.map((stage, index) => {
          const isPast = index < currentIdx
          const isCurrent = index === currentIdx
          const tint = isCurrent ? health.dot : stage.color
          return (
            <div key={stage.id} className="flex items-center gap-1 shrink-0">
              <div className="flex items-center gap-1.5">
                {isPast ? (
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: stage.color }} />
                ) : isCurrent ? (
                  <div
                    className="size-3 rounded-full shrink-0 ring-2 ring-offset-2"
                    style={{ backgroundColor: tint, '--tw-ring-color': tint } as React.CSSProperties}
                  />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground/40" />
                )}
                <span
                  className={cn(
                    'text-xs font-medium whitespace-nowrap',
                    isCurrent ? 'text-foreground' : isPast ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  )}
                  style={isCurrent ? { color: tint } : undefined}
                >
                  {stage.label}
                </span>
              </div>
              {index < progress.macro_stages.length - 1 && (
                <ChevronRight className="size-3.5 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {/* Sub-pipeline expansion (COMPLETENESS a) — only when the current stage has substages.
          Each substage shows its own count/status signal (parallel activity model,
          not a serial position). Watch-stages render dashed/italic with no signal. */}
      {progress.current_substages.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            {progress.current_stage?.label} sub-pipeline
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
            {progress.current_substages.map((sub) => (
              <SubstageCell key={sub.id} sub={sub} />
            ))}
          </div>
        </div>
      )}

      {/* Gates (COMPLETENESS b) — chips: green if satisfied, red if hard+unsatisfied, amber if soft+unsatisfied */}
      {progress.gates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            Gates to leave {progress.current_stage?.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {progress.gates.map((g) => {
              const color = g.is_satisfied
                ? { bg: 'bg-emerald-50', text: 'text-emerald-700' }
                : g.is_hard
                ? { bg: 'bg-rose-50', text: 'text-rose-700' }
                : { bg: 'bg-amber-50', text: 'text-amber-700' }
              return (
                <span
                  key={g.id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border-0',
                    color.bg, color.text,
                  )}
                  title={g.is_satisfied ? 'Satisfied' : g.is_hard ? 'Blocked — required' : 'Soft warning'}
                >
                  {g.is_satisfied
                    ? <CheckCircle2 className="size-3" />
                    : <Circle className="size-3" />}
                  {g.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Phased mini-bars (COMPLETENESS c) — only render the ones with data */}
      {(progress.dispatch || progress.billing || progress.reservation) && (
        <div className="grid gap-2 sm:grid-cols-3">
          {progress.reservation && (
            <MiniBarCard
              icon={<Package className="size-3.5" />}
              label="Reserved"
              done={progress.reservation.formatted_done}
              total={progress.reservation.formatted_total}
              pct={progress.reservation.pct}
            />
          )}
          {progress.dispatch && (
            <MiniBarCard
              icon={<Truck className="size-3.5" />}
              label="Dispatched"
              done={progress.dispatch.formatted_done}
              total={progress.dispatch.formatted_total}
              pct={progress.dispatch.pct}
              suffix="tranches"
            />
          )}
          {progress.billing && (
            <MiniBarCard
              icon={<Wallet className="size-3.5" />}
              label="Billed"
              done={progress.billing.formatted_done}
              total={progress.billing.formatted_total}
              pct={progress.billing.pct}
            />
          )}
        </div>
      )}

      {/* Next action banner (COMPLETENESS d) */}
      {progress.next_action && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
            <Calendar className="size-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground/80 font-medium">Next action</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{progress.next_action.title}</p>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              {progress.next_action.assignee_name && (
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {progress.next_action.assignee_name}
                </span>
              )}
              {progress.next_action.due_at && (
                <span className="tabular-nums">{timeUntil(progress.next_action.due_at)}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Per-substage cell — label + status dot + the signal computed in the
// read-model. Watch-stages render dashed/italic with no signal (informational).
function SubstageCell({ sub }: { sub: Substage }) {
  const isWatch = sub.is_watch_stage
  const status = sub.signal?.status ?? 'empty'

  // Status → dot tint (active uses the substage's own colour; done = emerald;
  // empty = muted). Watch-stage uses its own dashed treatment.
  const dotStyle =
    status === 'done'
      ? { backgroundColor: '#10b981' }
      : status === 'active'
      ? { backgroundColor: sub.color }
      : { backgroundColor: '#d1d5db' }

  if (isWatch) {
    return (
      <div
        className="flex items-start gap-2 rounded-md border border-dashed px-2 py-1.5"
        style={{ borderColor: sub.color, opacity: 0.8 }}
        title="Watch-stage — informational only, never gates money or hard logic"
      >
        <Eye className="size-3 text-muted-foreground/70 mt-0.5 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] italic text-muted-foreground/80 leading-tight">
            {sub.label}
          </span>
          <span className="text-[10px] text-muted-foreground/60 leading-tight">
            watch
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div
        className="size-2 rounded-full shrink-0 mt-1"
        style={dotStyle}
      />
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-medium text-foreground/80 leading-tight">
          {sub.label}
        </span>
        {sub.signal ? (
          <>
            <span
              className={cn(
                'text-[11px] tabular-nums leading-tight',
                status === 'done'
                  ? 'text-emerald-700 font-medium'
                  : status === 'active'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground/60 italic'
              )}
            >
              {sub.signal.primary}
            </span>
            {sub.signal.secondary && (
              <span className="text-[10px] text-muted-foreground/70 leading-tight">
                {sub.signal.secondary}
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 italic leading-tight">—</span>
        )}
      </div>
    </div>
  )
}

function MiniBarCard({
  icon, label, done, total, pct, suffix,
}: {
  icon: React.ReactNode
  label: string
  done: string
  total: string
  pct: number
  suffix?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">{icon} {label}</span>
        <span className="tabular-nums font-medium text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{done}</span> of {total}
        {suffix && <span className="text-muted-foreground/70"> {suffix}</span>}
      </p>
    </div>
  )
}

// Status dot for list/dashboard views — same Health vocabulary, a11y-safe (label as title/aria).
export function ScannableStatusDot({
  health, label,
}: {
  health: Health
  label?: string
}) {
  const meta = HEALTH_META[health]
  return (
    <span
      className="inline-flex items-center gap-1"
      title={label ?? meta.label}
      aria-label={label ?? meta.label}
    >
      <span
        className="size-2 rounded-full inline-block shrink-0"
        style={{ backgroundColor: meta.dot }}
      />
      <span className={cn('text-[10px] uppercase font-medium', meta.text)}>{meta.label}</span>
    </span>
  )
}
