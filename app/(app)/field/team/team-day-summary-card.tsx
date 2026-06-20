'use client'

/**
 * TeamDaySummaryCard — AI digest at the top of /field/team.
 *
 * Fires on mount, shows skeleton → headline + bullets + (optional)
 * focus chip. Cached at the action layer for ~30 min so navigation
 * doesn't re-pay the AI call.
 */
import { useEffect, useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, Loader2, RefreshCw, AlertTriangle, Target } from 'lucide-react'
import { getTeamDaySummary } from '@/lib/actions/team-day-summary'
import type { TeamDaySummaryResult } from '@/lib/ai/prompts/team-day-summary'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: TeamDaySummaryResult; cached: boolean }
  | { kind: 'error'; message: string }

export function TeamDaySummaryCard({ date }: { date?: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [, startTransition] = useTransition()

  function load() {
    setState({ kind: 'loading' })
    startTransition(async () => {
      const r = await getTeamDaySummary(date)
      if (!r.ok) { setState({ kind: 'error', message: r.error }); return }
      setState({ kind: 'ready', summary: r.summary, cached: r.cached })
    })
  }

  useEffect(() => { load() }, [date])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
            <Sparkles className="size-3.5" />
            Today's brief
          </div>
          <button
            type="button"
            onClick={load}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            disabled={state.kind === 'loading'}
          >
            {state.kind === 'loading' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Refresh
          </button>
        </div>

        {state.kind === 'loading' && (
          <p className="text-sm text-muted-foreground italic">Reading the day…</p>
        )}

        {state.kind === 'error' && (
          <p className="text-sm text-amber-700">Couldn't generate today's brief — {state.message}</p>
        )}

        {state.kind === 'ready' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{state.summary.headline}</p>

            {state.summary.bullets.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {state.summary.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary/60 mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {state.summary.focus && (
              <div className="flex items-start gap-1.5 text-xs text-amber-900 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 mt-1">
                <Target className="size-3.5 shrink-0 mt-0.5" />
                <span><span className="font-medium uppercase tracking-wide text-[10px] mr-1.5">Focus</span>{state.summary.focus}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
