'use client'

/**
 * One labelled field inside an AISuggestionCard.
 *
 * Renders with per-field confidence colouring so the user sees at a glance
 * which fields the model wasn't sure about and may need correction. The raw
 * extracted text (what the model actually saw) is shown as a tooltip-like
 * hint so the user can decide if it's a misread vs a real value.
 */
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface AISuggestionRowProps {
  label: string
  // Confidence in [0..1]. <0.4 = red, <0.7 = amber, otherwise neutral.
  confidence?: number | null
  // The model's raw extracted text for this field, if different from the
  // parsed value — surfaced as a small hint underneath.
  rawText?: string | null
  // Optional hint shown next to the label (e.g. "matched: VT-SO-2026-0099").
  hint?: ReactNode
  // The actual editable / display body — usually an Input or a Select.
  children: ReactNode
}

export function AISuggestionRow({
  label,
  confidence,
  rawText,
  hint,
  children,
}: AISuggestionRowProps) {
  const tone =
    confidence == null
      ? 'neutral'
      : confidence < 0.4
      ? 'red'
      : confidence < 0.7
      ? 'amber'
      : 'neutral'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'text-[11px] font-medium uppercase tracking-wide',
            tone === 'neutral' && 'text-muted-foreground',
            tone === 'amber' && 'text-amber-700',
            tone === 'red' && 'text-destructive'
          )}
        >
          {label}
          {tone === 'amber' && <span className="ml-1 normal-case font-normal italic">· low confidence</span>}
          {tone === 'red' && <span className="ml-1 normal-case font-normal italic">· verify</span>}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {rawText && (
        <span className="text-[10px] text-muted-foreground italic">
          raw: <span className="font-mono">{rawText}</span>
        </span>
      )}
    </div>
  )
}
