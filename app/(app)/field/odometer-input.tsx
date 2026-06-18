'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Camera, Sparkles, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { extractOdometerPhoto } from '@/lib/actions/odometer-photo'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_BYTES = 8 * 1024 * 1024

type AiState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'extracting' }
  | { kind: 'filled'; km: number; confidence: number | null; warnings: string[] }
  | { kind: 'failed'; message: string }

/**
 * Odometer input with built-in camera capture + AI extraction.
 * The rep can either type the number or tap the camera button.
 *
 * On extract: pre-fills the input and shows a small AI chip. Tapping
 * the chip removes the auto-fill marker (the value stays; this is
 * purely cosmetic so the rep sees we no longer claim it as AI's).
 */
export function OdometerInput({
  id,
  value,
  onChange,
  min,
  placeholder,
  className,
  tenantId,
  autoFocus,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  min?: number
  placeholder?: string
  className?: string
  tenantId: string
  autoFocus?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ai, setAi] = useState<AiState>({ kind: 'idle' })
  const [, startTransition] = useTransition()

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(`Photo type not supported: ${file.type}`)
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Photo too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`)
      return
    }
    setAi({ kind: 'uploading' })

    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const path = `${tenantId}/odometer_photo/${yyyy}/${mm}/${Date.now()}_${safeName}`

    const { error: upErr } = await supabase.storage
      .from('ai-uploads')
      .upload(path, file, { upsert: false, contentType: file.type })

    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`)
      setAi({ kind: 'failed', message: upErr.message })
      return
    }

    setAi({ kind: 'extracting' })
    startTransition(async () => {
      const r = await extractOdometerPhoto(path)
      if (!r.ok) {
        toast.error(`Couldn't read odometer: ${r.error}`)
        setAi({ kind: 'failed', message: r.error })
        return
      }
      if (r.data.km_reading == null) {
        toast.error(r.data.warnings[0] ?? 'Numbers not clear — please type the reading.')
        setAi({ kind: 'failed', message: 'AI couldn\'t read the odometer' })
        return
      }
      const km = r.data.km_reading
      onChange(String(km))
      toast.success(`Read ${km.toLocaleString('en-IN')} km in ${(r.latency_ms / 1000).toFixed(1)}s`)
      setAi({
        kind: 'filled',
        km,
        confidence: r.data.km_reading_confidence ?? null,
        warnings: r.data.warnings ?? [],
      })
    })
  }

  function clearAiMark() { setAi({ kind: 'idle' }) }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    // If user edits after AI filled it, drop the AI marker.
    if (ai.kind === 'filled') setAi({ kind: 'idle' })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min ?? 0}
          step={1}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={className ?? 'h-11 tabular-nums text-base'}
          autoFocus={autoFocus}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={ai.kind === 'uploading' || ai.kind === 'extracting'}
          aria-label="Read odometer from photo"
        >
          {ai.kind === 'uploading' || ai.kind === 'extracting' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
        </Button>
      </div>

      {ai.kind === 'uploading' && (
        <p className="text-[11px] text-muted-foreground italic">Uploading photo…</p>
      )}
      {ai.kind === 'extracting' && (
        <p className="text-[11px] text-muted-foreground italic">
          <Sparkles className="size-3 inline mr-1" />
          Reading the dashboard…
        </p>
      )}
      {ai.kind === 'filled' && (
        <button
          type="button"
          onClick={clearAiMark}
          className="self-start inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wide hover:bg-primary/15"
        >
          <Sparkles className="size-2.5" />
          AI-filled
          {ai.confidence != null && (
            <span className="opacity-70 normal-case tabular-nums ml-0.5">
              · {Math.round(ai.confidence * 100)}%
            </span>
          )}
          <X className="size-2.5 ml-0.5" />
        </button>
      )}
      {ai.kind === 'filled' && ai.warnings.length > 0 && (
        <p className="text-[10px] text-amber-700">⚠ {ai.warnings[0]}</p>
      )}
      {ai.kind === 'failed' && (
        <p className="text-[11px] text-amber-700">
          Couldn't auto-read — please type the reading.
        </p>
      )}
    </div>
  )
}
