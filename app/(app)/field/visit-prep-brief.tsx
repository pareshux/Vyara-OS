'use client'

/**
 * VisitPrepBrief — small inline card on the in-progress visit card.
 *
 * Fires once on mount (or when "Refresh" tapped); shows loading,
 * then the brief. AI is cached at the action layer so re-renders
 * are free.
 *
 * Per Constitution #6: AI assists, humans decide — we render the brief,
 * the rep ignores or uses it. Nothing it says writes back to data.
 */
import { useEffect, useState, useTransition } from 'react'
import { Sparkles, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { getVisitPrepBrief } from '@/lib/actions/visit-prep-brief'
import type { VisitPrepBriefResult } from '@/lib/ai/prompts/visit-prep-brief'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; brief: VisitPrepBriefResult; cached: boolean }
  | { kind: 'error'; message: string }

export function VisitPrepBrief({ visitId }: { visitId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [, startTransition] = useTransition()

  function load() {
    setState({ kind: 'loading' })
    startTransition(async () => {
      const r = await getVisitPrepBrief(visitId)
      if (!r.ok) { setState({ kind: 'error', message: r.error }); return }
      setState({ kind: 'ready', brief: r.brief, cached: r.cached })
    })
  }

  useEffect(() => { load() }, [visitId])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" />
          Prep brief
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
        <p className="text-xs text-muted-foreground italic">Reading the context…</p>
      )}

      {state.kind === 'error' && (
        <p className="text-xs text-amber-700">
          Couldn't generate the brief — {state.message}
        </p>
      )}

      {state.kind === 'ready' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{state.brief.headline}</p>
          {state.brief.bullets.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {state.brief.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-primary/60 mt-0.5">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {state.brief.caution && (
            <div className="flex items-start gap-1.5 text-xs text-amber-800 rounded-md bg-amber-50 px-2 py-1 mt-1">
              <AlertTriangle className="size-3 shrink-0 mt-0.5" />
              <span>{state.brief.caution}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
