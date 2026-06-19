'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles, AlertCircle, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw,
} from 'lucide-react'
import { generateDailyDigest } from '@/lib/actions/daily-digest'

interface FocusItem {
  type: 'urgent' | 'momentum' | 'risk' | 'win'
  title: string
  detail: string
}

interface Digest {
  id: string
  digest_date: string
  narrative_text: string
  focus_items: FocusItem[]
  health_signal: 'on_track' | 'attention' | 'concerning'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any
  generated_at: string
}

const HEALTH_STYLES: Record<Digest['health_signal'], { bg: string; border: string; label: string; color: string }> = {
  on_track:   { bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'On track',   color: 'text-emerald-700' },
  attention:  { bg: 'bg-amber-50',   border: 'border-amber-200',   label: 'Attention',  color: 'text-amber-700' },
  concerning: { bg: 'bg-red-50',     border: 'border-red-200',     label: 'Concerning', color: 'text-red-700' },
}

const ITEM_ICONS: Record<FocusItem['type'], React.ComponentType<{ className?: string }>> = {
  urgent:   AlertCircle,
  risk:     AlertTriangle,
  momentum: TrendingUp,
  win:      CheckCircle2,
}

const ITEM_STYLES: Record<FocusItem['type'], string> = {
  urgent:   'text-red-700 bg-red-50 border-red-200',
  risk:     'text-amber-700 bg-amber-50 border-amber-200',
  momentum: 'text-blue-700 bg-blue-50 border-blue-200',
  win:      'text-emerald-700 bg-emerald-50 border-emerald-200',
}

export function DigestCard({
  digest: initialDigest, canGenerate,
}: {
  digest: Digest | null
  canGenerate: boolean
}) {
  const router = useRouter()
  const [digest, setDigest] = useState<Digest | null>(initialDigest)
  const [busy, startTransition] = useTransition()

  function generate(force = false) {
    startTransition(async () => {
      const res = await generateDailyDigest({ force })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setDigest(res.digest)
      toast.success(res.cached ? 'Loaded cached digest' : 'Briefing generated')
      router.refresh()
    })
  }

  if (!digest) {
    if (!canGenerate) return null
    return (
      <Card className="border-dashed border-2">
        <CardContent className="pt-4 pb-4 flex flex-col items-center gap-2 text-center">
          <Sparkles className="size-5 text-primary" />
          <p className="text-sm font-medium">Today&apos;s briefing isn&apos;t ready yet.</p>
          <p className="text-xs text-muted-foreground">
            Generate yesterday&apos;s summary in a few seconds.
          </p>
          <Button size="sm" onClick={() => generate(false)} disabled={busy} className="mt-1">
            {busy ? 'Composing…' : 'Generate briefing'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const hs = HEALTH_STYLES[digest.health_signal]
  const dateLabel = new Date(digest.digest_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })

  return (
    <Card className={`${hs.bg} ${hs.border}`}>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="size-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Yesterday&apos;s briefing · {dateLabel}
            </span>
            <Badge variant="outline" className={`border-0 text-[10px] uppercase ${hs.color}`}>
              {hs.label}
            </Badge>
          </div>
          {canGenerate && (
            <Button
              variant="ghost" size="sm"
              className="h-7 text-xs text-muted-foreground"
              disabled={busy}
              onClick={() => generate(true)}
            >
              <RefreshCw className={`size-3.5 mr-1 ${busy ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          )}
        </div>

        <p className="text-sm text-foreground leading-relaxed">
          {digest.narrative_text}
        </p>

        {digest.focus_items.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-2">
            {digest.focus_items.map((item, i) => {
              const Icon = ITEM_ICONS[item.type]
              return (
                <div
                  key={i}
                  className={`rounded-md border px-3 py-2 flex items-start gap-2 ${ITEM_STYLES[item.type]}`}
                >
                  <Icon className="size-3.5 shrink-0 mt-0.5" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold leading-snug">{item.title}</span>
                    <span className="text-xs leading-snug text-foreground/70 mt-0.5">{item.detail}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
