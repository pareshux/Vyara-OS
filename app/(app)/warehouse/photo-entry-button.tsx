'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Camera, Upload, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  extractDispatchDiary,
  type ExtractDispatchDiaryResult,
} from '@/lib/actions/dispatch-diary'
import { DiaryReview } from './diary-review'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
const MAX_BYTES = 10 * 1024 * 1024

type Phase =
  | { kind: 'pick' }
  | { kind: 'extracting'; previewUrl: string }
  | { kind: 'review'; previewUrl: string; uploadPath: string; result: Extract<ExtractDispatchDiaryResult, { ok: true }> }
  | { kind: 'failed'; previewUrl: string; error: string }

export function PhotoEntryButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    if ('previewUrl' in phase) URL.revokeObjectURL(phase.previewUrl)
    setPhase({ kind: 'pick' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    setOpen(false)
    setTimeout(reset, 200) // wait for sheet close anim
  }

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type as typeof ACCEPTED_TYPES[number])) {
      toast.error(`Unsupported file type: ${file.type || 'unknown'}`)
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Photo too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`)
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setPhase({ kind: 'extracting', previewUrl })

    // Upload to ai-uploads bucket under <tenantId>/dispatch_diary/<ts>_<name>
    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const path = `${tenantId}/dispatch_diary/${yyyy}/${mm}/${Date.now()}_${safeName}`

    const { error: upErr } = await supabase.storage
      .from('ai-uploads')
      .upload(path, file, { upsert: false, contentType: file.type })

    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`)
      setPhase({ kind: 'failed', previewUrl, error: upErr.message })
      return
    }

    startTransition(async () => {
      const result = await extractDispatchDiary(path)
      if (!result.ok) {
        toast.error(`Extraction failed: ${result.error}`)
        setPhase({ kind: 'failed', previewUrl, error: result.error })
        return
      }
      toast.success(
        `Extracted ${result.entries.length} entr${result.entries.length === 1 ? 'y' : 'ies'} in ${(result.latency_ms / 1000).toFixed(1)}s`
      )
      setPhase({ kind: 'review', previewUrl, uploadPath: path, result })
    })
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            setOpen(true)
            handleFile(file)
          }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera className="size-4 mr-1.5" />
        Photo entry
      </Button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) handleClose()
          else setOpen(true)
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-5xl flex flex-col p-0"
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {phase.kind === 'pick' && 'Photo entry'}
              {phase.kind === 'extracting' && 'Reading your diary…'}
              {phase.kind === 'review' && 'Review extracted entries'}
              {phase.kind === 'failed' && 'Extraction failed'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            {phase.kind === 'pick' && (
              <div className="p-6 flex flex-col items-center justify-center gap-3 min-h-[300px]">
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Pick or capture a photo to begin.
                </p>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="size-4 mr-1.5" />
                  Choose photo
                </Button>
              </div>
            )}

            {phase.kind === 'extracting' && (
              <div className="grid md:grid-cols-2 gap-4 p-4 md:p-6">
                <div className="rounded-lg border border-border bg-muted/30 overflow-hidden self-start">
                  <img
                    src={phase.previewUrl}
                    alt="Uploaded diary page"
                    className="w-full h-auto max-h-[70vh] object-contain"
                  />
                </div>
                <div className="flex flex-col items-center justify-center gap-3 min-h-[300px] text-center">
                  <Sparkles className="size-6 animate-pulse text-primary" />
                  <p className="text-sm font-medium">
                    {isPending ? 'Reading diary entries…' : 'Uploading…'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Typically 8–12 seconds. Each entry will appear here when ready.
                  </p>
                </div>
              </div>
            )}

            {phase.kind === 'review' && (
              <DiaryReview
                tenantId={tenantId}
                previewUrl={phase.previewUrl}
                uploadPath={phase.uploadPath}
                extractionId={phase.result.extraction_id}
                pageQuality={phase.result.page_quality}
                entries={phase.result.entries}
                warnings={phase.result.warnings}
                usage={phase.result.usage}
                latencyMs={phase.result.latency_ms}
                onClose={handleClose}
              />
            )}

            {phase.kind === 'failed' && (
              <div className="p-6 flex flex-col gap-4 max-w-2xl">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  <p className="font-medium mb-1">Couldn’t read this photo.</p>
                  <p>{phase.error}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use the regular <span className="font-medium text-foreground">Schedule dispatch</span> sheet to enter manually, or try a sharper photo.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleClose}>Close</Button>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Camera className="size-4 mr-1.5" />
                    Try another photo
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
