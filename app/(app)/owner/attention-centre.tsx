/**
 * AttentionCentre — Section 2 of the Owner Dashboard (Blueprint INT-014).
 *
 * Renders the ranked list of attention items from owner-overview. Items
 * with severity = 'gap' are honest placeholders for data we don't track yet
 * (CS-001 complaints, DEL-007 dispatch SLA, REL-016 credit exposure); they
 * always sort to the bottom and link back to the dashboard rather than a
 * dead page.
 *
 * Per Constitution Principle #6: status is never color-only — each item
 * carries an icon, a label, and aria-friendly markup.
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Wallet,
  TrendingDown,
  ShieldCheck,
  CheckSquare,
  Layers,
  Snowflake,
  FileText,
  MinusCircle,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttentionItem } from '@/lib/read-models/owner-overview'

const CATEGORY_ICON: Record<AttentionItem['category'], typeof AlertCircle> = {
  overdue_invoice:      Wallet,
  stalled_deal:         TrendingDown,
  pending_approval:     ShieldCheck,
  overdue_task:         CheckSquare,
  paving_stage:         Layers,
  cold_lead:            Snowflake,
  stale_quote:          FileText,
  gap_complaint:        MinusCircle,
  gap_dispatch_sla:     MinusCircle,
  gap_credit_exposure:  MinusCircle,
}

const SEVERITY_CONFIG: Record<AttentionItem['severity'], {
  icon: typeof AlertCircle
  label: string
  cardClass: string
  iconBg: string
  iconColor: string
  badgeClass: string
}> = {
  critical: {
    icon: AlertCircle,
    label: 'Critical',
    cardClass: 'border-red-200',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Needs attention',
    cardClass: 'border-amber-200',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  info: {
    icon: Info,
    label: 'Watch',
    cardClass: 'border-border',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  gap: {
    icon: MinusCircle,
    label: 'Not tracked yet',
    cardClass: 'border-dashed border-border bg-muted/30',
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
}

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function AttentionCentre({ items }: { items: AttentionItem[] }) {
  const liveItems = items.filter((i) => i.severity !== 'gap')
  const gapItems = items.filter((i) => i.severity === 'gap')

  if (liveItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-green-50 text-green-600">
            <ShieldCheck className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">All clear.</p>
          <p className="text-sm text-muted-foreground max-w-md">
            No overdue invoices, stalled deals, or pending approvals right now.
            That&rsquo;s rare — well done.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {liveItems.map((item) => (
        <AttentionRow key={`${item.category}-${item.title}`} item={item} />
      ))}

      {gapItems.length > 0 && (
        <>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground/70 px-1">
            Tracked in Blueprint, not built yet
          </p>
          {gapItems.map((item) => (
            <GapRow key={`${item.category}-${item.title}`} item={item} />
          ))}
        </>
      )}
    </div>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const cfg = SEVERITY_CONFIG[item.severity]
  const CatIcon = CATEGORY_ICON[item.category]
  const SevIcon = cfg.icon

  return (
    <Link href={item.drill_href} className="group">
      <Card
        className={cn('transition-shadow group-hover:shadow-sm', cfg.cardClass)}
        size="sm"
      >
        <CardContent className="pt-3 pb-3">
          <div className="flex items-start gap-3">
            <div className={cn(
              'flex size-9 items-center justify-center rounded-lg shrink-0',
              cfg.iconBg, cfg.iconColor,
            )}>
              <CatIcon className="size-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  cfg.badgeClass,
                )}>
                  <SevIcon className="size-3" />
                  {cfg.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {item.subtitle}
              </p>
              {item.top_item_label && (
                <p className="mt-1.5 text-xs text-foreground/80 tabular-nums truncate">
                  ↳ {item.top_item_label}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-0.5 shrink-0">
              {item.total_value != null && item.total_value > 0 && (
                <span className="tabular-nums text-base font-semibold text-foreground">
                  {formatMoney(item.total_value)}
                </span>
              )}
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.count} item{item.count === 1 ? '' : 's'}
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function GapRow({ item }: { item: AttentionItem }) {
  const cfg = SEVERITY_CONFIG[item.severity]
  const CatIcon = CATEGORY_ICON[item.category]

  return (
    <Card className={cn(cfg.cardClass)} size="sm">
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            'flex size-9 items-center justify-center rounded-lg shrink-0',
            cfg.iconBg, cfg.iconColor,
          )}>
            <CatIcon className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
              {item.blueprint_id && (
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 bg-background border border-border rounded px-1.5 py-0.5">
                  {item.blueprint_id}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.subtitle}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
