'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Upload, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { runPlaygroundExtraction, type PlaygroundExtractionResult } from '@/lib/actions/ai-playground'
import { AISuggestionCard } from '@/components/ai/ai-suggestion-card'
import { AISuggestionRow } from '@/components/ai/ai-suggestion-row'

type ExtractionState =
  | { kind: 'idle' }
  | { kind: 'uploading'; previewUrl: string }
  | { kind: 'extracting'; previewUrl: string }
  | { kind: 'done'; previewUrl: string; result: PlaygroundExtractionResult }

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
const ACCEPTED_TYPES_STR = ACCEPTED_TYPES.join(',')
const MAX_BYTES = 10 * 1024 * 1024

export function PlaygroundClient({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<ExtractionState>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function pickFile() {
    fileInputRef.current?.click()
  }

  function reset() {
    if ('previewUrl' in state) URL.revokeObjectURL(state.previewUrl)
    setState({ kind: 'idle' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type as typeof ACCEPTED_TYPES[number])) {
      toast.error(`Unsupported file type: ${file.type || 'unknown'}`)
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`)
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setState({ kind: 'uploading', previewUrl })

    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${tenantId}/playground/${Date.now()}_${safeName}`

    const { error: upErr } = await supabase.storage
      .from('ai-uploads')
      .upload(path, file, { upsert: false, contentType: file.type })

    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`)
      URL.revokeObjectURL(previewUrl)
      setState({ kind: 'idle' })
      return
    }

    setState({ kind: 'extracting', previewUrl })

    startTransition(async () => {
      const result = await runPlaygroundExtraction(path)
      setState({ kind: 'done', previewUrl, result })
      if (!result.ok) {
        toast.error(`Extraction failed: ${result.error}`)
      } else {
        toast.success(
          `Extracted ${result.data.entries.length} entries in ${(result.latency_ms / 1000).toFixed(1)}s`
        )
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES_STR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {state.kind === 'idle' && (
        <div className="flex flex-col gap-3">
          <Label>Test image or PDF</Label>
          <Button variant="outline" onClick={pickFile} className="h-24 flex flex-col gap-1.5">
            <Upload className="size-5" />
            <span className="text-sm">Click to upload a test image</span>
            <span className="text-xs text-muted-foreground font-normal">JPG, PNG, WebP, HEIC, or PDF · up to 10 MB</span>
          </Button>
        </div>
      )}

      {state.kind !== 'idle' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Uploaded</Label>
              {state.kind === 'done' && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>
                  <X className="size-3 mr-1" /> Clear
                </Button>
              )}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
              <img
                src={state.previewUrl}
                alt="Uploaded preview"
                className="w-full h-auto max-h-[480px] object-contain"
              />
            </div>
            {state.kind === 'done' && state.result.ok && (
              <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground tabular-nums flex flex-wrap gap-x-3 gap-y-1">
                <span>in {state.result.usage.input_tokens.toLocaleString('en-IN')} tok</span>
                <span>out {state.result.usage.output_tokens.toLocaleString('en-IN')} tok</span>
                {state.result.usage.cache_read_tokens > 0 && (
                  <span className="text-emerald-700">
                    cache {state.result.usage.cache_read_tokens.toLocaleString('en-IN')} tok
                  </span>
                )}
                <span>{(state.result.latency_ms / 1000).toFixed(1)}s</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Extraction</Label>
            {(state.kind === 'uploading' || state.kind === 'extracting' || isPending) && (
              <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Sparkles className="size-5 animate-pulse text-primary" />
                {state.kind === 'uploading' ? 'Uploading…' : 'Reading the image — ~8–12 seconds.'}
              </div>
            )}

            {state.kind === 'done' && !state.result.ok && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {state.result.error}
              </div>
            )}

            {state.kind === 'done' && state.result.ok && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Page quality:</span>
                  <span className="font-medium">{state.result.data.page_quality}</span>
                  {state.result.data.warnings.length > 0 && (
                    <span className="text-amber-700">
                      · {state.result.data.warnings.length} warning(s)
                    </span>
                  )}
                </div>

                {state.result.data.entries.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    No readable entries detected. Try a sharper photo or a different page.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[480px] overflow-auto pr-1">
                    {state.result.data.entries.map((entry, i) => (
                      <AISuggestionCard
                        key={i}
                        title={entry.label || `Entry ${i + 1}`}
                        subtitle={`Confidence ${Math.round(entry.confidence * 100)}%`}
                        avgConfidence={entry.confidence}
                      >
                        <AISuggestionRow label="Value" confidence={entry.confidence}>
                          <Input value={entry.value} readOnly className="text-sm bg-muted/40" />
                        </AISuggestionRow>
                      </AISuggestionCard>
                    ))}
                  </div>
                )}

                {state.result.data.warnings.length > 0 && (
                  <div className="text-xs text-amber-700 italic">
                    {state.result.data.warnings.map((w, i) => (
                      <div key={i}>· {w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
