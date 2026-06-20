/**
 * OwnerBriefCard — async server component that renders the AI Owner Brief.
 * Blueprint INT-014.
 *
 * Cached 6h in ai_extraction via getOwnerBrief. Soft-fails on AI errors
 * (renders a discreet "could not generate" message rather than blocking
 * the page).
 */
import { Sparkles, AlertCircle, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, Lightbulb } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getOwnerBrief } from '@/lib/actions/owner-brief'
import type { OwnerBriefResult } from '@/lib/ai/prompts/owner-brief'

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

  const hasOpps = brief.top_opportunities.length > 0
  const hasRisks = brief.top_risks.length > 0
  const hasRecs = brief.recommendations.length > 0

  return (
    <Card className={cfg.cardClass}>
      <CardContent className="pt-4 flex flex-col gap-3">
        {/* Header */}
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
            <p className="mt-1.5 text-sm text-foreground leading-snug">{brief.headline}</p>
          </div>
        </div>

        {/* Three-column body — opportunities · risks · recommendations */}
        {(hasOpps || hasRisks || hasRecs) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            {hasOpps && (
              <BriefList
                icon={<ArrowUp className="size-3.5" />}
                title="Opportunities"
                items={brief.top_opportunities}
                accentClass="text-green-700"
              />
            )}
            {hasRisks && (
              <BriefList
                icon={<ArrowDown className="size-3.5" />}
                title="Risks"
                items={brief.top_risks}
                accentClass="text-red-700"
              />
            )}
            {hasRecs && (
              <BriefList
                icon={<Lightbulb className="size-3.5" />}
                title="Recommendations"
                items={brief.recommendations}
                accentClass="text-amber-700"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BriefList({
  icon, title, items, accentClass,
}: { icon: React.ReactNode; title: string; items: string[]; accentClass: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`flex items-center gap-1.5 ${accentClass} text-xs font-medium uppercase tracking-wide`}>
        {icon}
        {title}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((s, i) => (
          <li key={i} className="flex items-start gap-1.5 text-sm text-foreground/90 leading-snug">
            <span className="mt-1.5 size-1 rounded-full bg-foreground/40 shrink-0" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OwnerBriefSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
