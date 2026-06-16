'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronRight, CheckCircle2, Circle } from 'lucide-react'
import { advanceStage } from '@/lib/actions/projects'
import { cn } from '@/lib/utils'

interface PipelineStage {
  id: string
  label: string
  color: string
  order_index: number
  is_terminal: boolean
}

interface StageStepperProps {
  stages: PipelineStage[]
  currentStageId: string
  projectId: string
  /**
   * 'full' (default) renders the stepper row + the advance action.
   * 'advance-only' renders just the advance action — use when the
   * stepper is already shown by the ScannableProgressHeader to
   * avoid a visually duplicated stepper.
   */
  displayMode?: 'full' | 'advance-only'
}

export function StageStepper({ stages, currentStageId, projectId, displayMode = 'full' }: StageStepperProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showRemark, setShowRemark] = useState(false)
  const [remark, setRemark] = useState('')

  const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index)
  const currentIndex = sortedStages.findIndex((s) => s.id === currentStageId)
  const currentStage = sortedStages[currentIndex]
  const nextStage = sortedStages[currentIndex + 1]
  const canAdvance = nextStage && !currentStage?.is_terminal

  function handleAdvance() {
    if (!nextStage) return

    startTransition(async () => {
      const result = await advanceStage(projectId, nextStage.id, remark || undefined)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Stage advanced to ${nextStage.label}`)
      setRemark('')
      setShowRemark(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {displayMode === 'full' && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {sortedStages.map((stage, index) => {
            const isPast = index < currentIndex
            const isCurrent = stage.id === currentStageId

            return (
              <div key={stage.id} className="flex items-center gap-1 shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1">
                    {isPast ? (
                      <CheckCircle2
                        className="size-4 shrink-0"
                        style={{ color: stage.color }}
                      />
                    ) : isCurrent ? (
                      <div
                        className="size-3 rounded-full shrink-0 ring-2 ring-offset-2 ring-current"
                        style={{ backgroundColor: stage.color, color: stage.color }}
                      />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground/40" />
                    )}
                    <span
                      className={cn(
                        'text-xs font-medium whitespace-nowrap',
                        isCurrent ? 'text-foreground' : isPast ? 'text-muted-foreground' : 'text-muted-foreground/50'
                      )}
                      style={isCurrent ? { color: stage.color } : undefined}
                    >
                      {stage.label}
                    </span>
                  </div>
                </div>
                {index < sortedStages.length - 1 && (
                  <ChevronRight className="size-3.5 text-muted-foreground/30 shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      )}

      {canAdvance && (
        <div className="flex flex-col gap-2">
          {showRemark ? (
            <div className="flex items-center gap-2">
              <Input
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={`Remark for advancing to ${nextStage.label}…`}
                className="flex-1 h-8 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdvance()
                  if (e.key === 'Escape') { setShowRemark(false); setRemark('') }
                }}
              />
              <Button size="sm" onClick={handleAdvance} disabled={isPending}>
                {isPending ? 'Advancing…' : 'Confirm'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowRemark(false); setRemark('') }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRemark(true)}
                disabled={isPending}
              >
                Advance to {nextStage.label}
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
