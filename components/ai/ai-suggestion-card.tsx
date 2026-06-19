'use client'

/**
 * AI suggestion card — reusable shell for every AI-extracted row across Vyara.
 *
 * The pattern: AI extracts → renders inside this card → user clicks
 * Accept / Edit / Reject. Per Principle #6 the card itself doesn't write
 * business data; the caller's onAccept handler does (and should call the
 * existing server action, e.g. scheduleDispatch, so guards apply uniformly).
 *
 * Visual cues:
 *   - subtle accent border + sparkle glyph signal "this came from AI"
 *   - amber banner above the body when overall confidence is low
 *   - red banner when an error needs the user's attention (matched-order
 *     missing, over-dispatch, etc.) — set via the `error` prop
 */
import { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, Check, Pencil, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SuggestionStatus = 'pending' | 'accepted' | 'edited' | 'rejected'

export interface AISuggestionCardProps {
  title: string
  subtitle?: string
  status?: SuggestionStatus
  // Average confidence in [0..1] for the whole row; drives the amber banner.
  // Anything below 0.5 surfaces a "verify carefully" warning.
  avgConfidence?: number | null
  // Block-level error (red banner). Use for hard mismatches the user must fix
  // before Accept can succeed (order not found, over-dispatch, etc.).
  error?: string | null
  // Disable Accept while inline edits are pending or while busy.
  disableAccept?: boolean
  busy?: boolean
  onAccept?: () => void
  onEdit?: () => void
  onReject?: () => void
  acceptLabel?: string
  children: ReactNode
}

export function AISuggestionCard({
  title,
  subtitle,
  status = 'pending',
  avgConfidence,
  error,
  disableAccept,
  busy,
  onAccept,
  onEdit,
  onReject,
  acceptLabel = 'Accept',
  children,
}: AISuggestionCardProps) {
  const isTerminal = status !== 'pending'
  const showLowConfidence = !error && avgConfidence != null && avgConfidence < 0.5

  return (
    <Card
      size="sm"
      className={cn(
        'border-l-2 transition-colors',
        status === 'accepted' && 'border-l-emerald-500 bg-emerald-50/30',
        status === 'edited' && 'border-l-blue-500 bg-blue-50/30',
        status === 'rejected' && 'border-l-muted opacity-60',
        status === 'pending' && 'border-l-primary'
      )}
    >
      <CardContent className="pt-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Sparkles className="size-3.5 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{title}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {isTerminal && (
            <Badge variant="outline" className="text-[10px] uppercase border-0 shrink-0">
              {status === 'accepted' && (
                <span className="text-emerald-700 flex items-center gap-1">
                  <Check className="size-3" /> Created
                </span>
              )}
              {status === 'edited' && (
                <span className="text-blue-700 flex items-center gap-1">
                  <Pencil className="size-3" /> Edited
                </span>
              )}
              {status === 'rejected' && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <X className="size-3" /> Discarded
                </span>
              )}
            </Badge>
          )}
        </div>

        {showLowConfidence && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 flex items-start gap-1.5 text-xs text-amber-900">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              Low confidence — verify the fields below before accepting.
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-2.5 py-1.5 flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-2">{children}</div>

        {!isTerminal && (onAccept || onEdit || onReject) && (
          <div className="flex items-center gap-1.5 pt-1 justify-end">
            {onReject && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={onReject}
              >
                <X className="size-3 mr-1" /> Reject
              </Button>
            )}
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={onEdit}
              >
                <Pencil className="size-3 mr-1" /> Edit
              </Button>
            )}
            {onAccept && (
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={busy || disableAccept || !!error}
                onClick={onAccept}
              >
                <Check className="size-3 mr-1" />
                {busy ? 'Saving…' : acceptLabel}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
