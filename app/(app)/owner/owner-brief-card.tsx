/**
 * OwnerBriefCard — async server component that renders the AI Owner Brief.
 * Blueprint INT-014.
 *
 * Slice 3.1 redesign — replaced the 3-column wall of opportunities / risks /
 * recommendations with a tighter shape:
 *   severity chip · headline · up to 3 action chips that drill into list pages.
 *
 * The chips ARE the surface the MD acts on. "Tell me more" lives in the
 * conversational agent (INT-009).
 *
 * Cached 6h in ai_extraction via getOwnerBrief. Soft-fails on AI errors
 * (renders a discreet "could not generate" message rather than blocking
 * the page).
 */
import Link from 'next/link'
import {
  Sparkles, AlertCircle, CheckCircle2, AlertTriangle, ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getOwnerBrief } from '@/lib/actions/owner-brief'
import type { OwnerBriefResult, OwnerAction } from '@/lib/ai/prompts/owner-brief'

const HEALTH_CONFIG: Record<
  OwnerBriefResult['health'],
  { icon: typeof CheckCircle2; label: string; cardClass: string; iconClass: string; badgeClass: string; iconBg: string }
> = {
  healthy: {
    icon: CheckCircle2,
    label: 'Healthy',
    cardClass: 'border-green-200 bg-green-50/40',
    iconBg: 'bg-green-100',
    iconClass: 'text-green-600',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
  },
  needs_attention: {
    icon: AlertTriangle,
    label: 'Needs attention',
    cardClass: 'border-amber-200 bg-amber-50/40',
    iconBg: 'bg-amber-100',
    iconClass: 'text-amber-600',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  critical: {
    icon: AlertCircle,
    label: 'Critical',
    cardClass: 'border-red-200 bg-red-50/40',
    iconBg: 'bg-red-100',
    iconClass: 'text-red-600',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
}

/** Map (target, search) → URL. List pages that don't support `q` ignore it gracefully. */
function actionHref(action: OwnerAction): string {
  const base = `/${action.target}`
  return action.search ? `${base}?q=${encodeURIComponent(action.search)}` : base
}

export async function OwnerBriefCard() {
  const result = await getOwnerBrief()

  if (!result.ok) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Sparkles className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Executive brief</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Couldn&rsquo;t generate brief right now — {result.error}.
                Sections below still reflect live data.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { brief, cached, generated_at } = result
  const cfg = HEALTH_CONFIG[brief.health]
  const Icon = cfg.icon
  const generatedLabel = new Date(generated_at).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  return (
    <Card className={cfg.cardClass}>
      <CardContent className="pt-4 flex flex-col gap-3">
        {/* Header: severity icon + title + chip + freshness + headline */}
        <div className="flex items-start gap-3">
          <div className={`flex size-9 items-center justify-center rounded-lg shrink-0 ${cfg.iconBg}`}>
            <Icon className={`size-4 ${cfg.iconClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-foreground">Executive brief</p>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cfg.badgeClass}`}>
                {cfg.label}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {cached ? 'cached' : 'fresh'} · {generatedLabel}
              </span>
            </div>
            <p className="mt-1.5 text-base text-foreground leading-snug font-medium">
              {brief.headline}
            </p>
          </div>
        </div>

        {/* Action chips row */}
        {brief.actions.length > 0 && (
          <div className="flex flex-col gap-1.5 ml-12">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              What to do today →
            </p>
            <div className="flex flex-wrap gap-2">
              {brief.actions.map((a, i) => (
                <ActionChip key={i} action={a} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActionChip({ action }: { action: OwnerAction }) {
  return (
    <Link
      href={actionHref(action)}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5',
        'text-xs font-medium text-foreground tabular-nums',
        'transition-colors hover:bg-primary/5 hover:border-primary/40 hover:text-primary',
      )}
    >
      <span className="truncate max-w-[18rem] md:max-w-none">{action.label}</span>
      <ArrowRight className="size-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </Link>
  )
}

export function OwnerBriefSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Skeleton className="size-9 rounded-lg shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="ml-12 flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-44 rounded-full" />
            <Skeleton className="h-7 w-52 rounded-full" />
            <Skeleton className="h-7 w-40 rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
