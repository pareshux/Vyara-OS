/**
 * FirmBrief — server component for the Customer 360 Overview tab.
 * Calls getFirmBrief (cached 24h), renders health badge + headline + bullets.
 * Blueprint REL-011.
 */
import { Sparkles, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { getFirmBrief } from '@/lib/actions/firm-brief'
import type { FirmBriefResult } from '@/lib/ai/prompts/firm-brief'

const HEALTH_CONFIG: Record<
  FirmBriefResult['health'],
  { icon: typeof CheckCircle2; label: string; cardClass: string; iconClass: string; badgeClass: string }
> = {
  healthy: {
    icon: CheckCircle2,
    label: 'Healthy',
    cardClass: 'border-green-100 bg-green-50/30',
    iconClass: 'text-green-600',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
  },
  needs_attention: {
    icon: AlertTriangle,
    label: 'Needs attention',
    cardClass: 'border-amber-100 bg-amber-50/30',
    iconClass: 'text-amber-600',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  critical: {
    icon: AlertCircle,
    label: 'Critical',
    cardClass: 'border-red-100 bg-red-50/30',
    iconClass: 'text-red-600',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
}

export async function FirmBrief({ firmId }: { firmId: string }) {
  const result = await getFirmBrief(firmId)

  if (!result.ok) {
    // Soft failure — keep the page usable
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">AI insights</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Could not generate brief — {result.error}.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { brief, cached } = result
  const cfg = HEALTH_CONFIG[brief.health]
  const Icon = cfg.icon

  return (
    <Card className={cfg.cardClass}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className={`flex size-8 items-center justify-center rounded-full shrink-0 ${brief.health === 'healthy' ? 'bg-green-100' : brief.health === 'critical' ? 'bg-red-100' : 'bg-amber-100'}`}>
            <Icon className={`size-4 ${cfg.iconClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-foreground">AI insights</p>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cfg.badgeClass}`}>
                {cfg.label}
              </span>
              {cached && (
                <span className="text-[10px] text-muted-foreground">cached</span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-foreground">{brief.headline}</p>
            {brief.bullets.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {brief.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <span className="mt-1.5 size-1 rounded-full bg-muted-foreground/50 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
