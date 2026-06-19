'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Camera, Upload, Sparkles, CheckCircle2, AlertCircle, IdCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  extractBusinessCard,
  type ExtractBusinessCardResult,
} from '@/lib/actions/business-card'
import type { LeadAIPrefill } from './form'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
const MAX_BYTES = 10 * 1024 * 1024

type Phase =
  | { kind: 'pick' }
  | { kind: 'extracting'; previewUrl: string }
  | { kind: 'review'; previewUrl: string; result: Extract<ExtractBusinessCardResult, { ok: true }> }
  | { kind: 'failed'; previewUrl: string | null; error: string }

const SEGMENT_FROM_HINT: Record<string, LeadAIPrefill['segment']> = {
  architect: 'architect',
  contractor: 'corporate',
  developer: 'corporate',
  owner: 'retail',
  dealer: 'dealer',
  government: 'government',
  corporate: 'corporate',
  other: 'generic',
}

export function CaptureBusinessCardButton({
  tenantId,
  onPrefill,
}: {
  tenantId: string
  onPrefill: (prefill: LeadAIPrefill) => void
}) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    if ('previewUrl' in phase && phase.previewUrl) URL.revokeObjectURL(phase.previewUrl)
    setPhase({ kind: 'pick' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  function handleClose() {
    setOpen(false)
    setTimeout(reset, 200)
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
    setPhase({ kind: 'extracting', previewUrl })

    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const path = `${tenantId}/business_card/${yyyy}/${mm}/${Date.now()}_${safeName}`

    const { error: upErr } = await supabase.storage
      .from('ai-uploads')
      .upload(path, file, { upsert: false, contentType: file.type })

    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`)
      setPhase({ kind: 'failed', previewUrl, error: upErr.message })
      return
    }

    startTransition(async () => {
      const result = await extractBusinessCard(path)
      if (!result.ok) {
        toast.error(`Extraction failed: ${result.error}`)
        setPhase({ kind: 'failed', previewUrl, error: result.error })
        return
      }
      toast.success(`Card read in ${(result.latency_ms / 1000).toFixed(1)}s`)
      setPhase({ kind: 'review', previewUrl, result })
    })
  }

  function useExtractedValues() {
    if (phase.kind !== 'review' || !phase.result.ok) return
    const d = phase.result.data
    const firm = d.firm_candidates[0] ?? null
    const existingContact = d.contact_candidates[0] ?? null

    // If we found a matching contact at very high confidence, the user
    // probably wants to attach the lead to them rather than create a new one.
    // We pass the firm_id forward; the lead form will surface this.
    const segment = d.segment_hint ? SEGMENT_FROM_HINT[d.segment_hint] ?? null : null

    const confidences = [
      d.full_name_confidence,
      d.firm_name_confidence,
    ].filter((c) => typeof c === 'number') as number[]
    const avg_confidence =
      confidences.length > 0
        ? confidences.reduce((s, c) => s + c, 0) / confidences.length
        : null

    const notesParts: string[] = []
    if (d.role_title) notesParts.push(`Role: ${d.role_title}`)
    if (d.website) notesParts.push(`Web: ${d.website}`)
    if (d.address) notesParts.push(`Address: ${d.address}`)
    if (existingContact) {
      notesParts.push(
        `⚠ Existing contact match: ${existingContact.full_name}${existingContact.firm_name ? ` (${existingContact.firm_name})` : ''} — consider linking instead of duplicating.`
      )
    }
    if (d.notes) notesParts.push(d.notes)

    const prefill: LeadAIPrefill = {
      buyer_firm_id: firm?.id ?? null,
      segment,
      contact_name: d.full_name,
      contact_phone: d.phone,
      contact_email: d.email,
      city: d.city,
      notes: notesParts.length > 0 ? notesParts.join('\n') : null,
      extraction_id: phase.result.extraction_id,
      avg_confidence,
      original_values: {
        full_name: d.full_name,
        role_title: d.role_title,
        firm_name: d.firm_name,
        phone: d.phone,
        email: d.email,
        website: d.website,
        gstin: d.gstin,
        address: d.address,
        city: d.city,
        state: d.state,
        segment_hint: d.segment_hint,
      },
    }

    onPrefill(prefill)
    handleClose()
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
          if (file) { setOpen(true); handleFile(file) }
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        <IdCard className="size-4 mr-1.5" />
        Capture business card
      </Button>

      <Sheet
        open={open}
        onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}
      >
        <SheetContent side="right" className="w-full sm:max-w-[min(95vw,1100px)] flex flex-col p-0">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {phase.kind === 'pick' && 'Capture business card'}
              {phase.kind === 'extracting' && 'Reading your card…'}
              {phase.kind === 'review' && 'Review extracted card'}
              {phase.kind === 'failed' && 'Extraction failed'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            {phase.kind === 'pick' && (
              <div className="p-6 flex flex-col items-center justify-center gap-3 min-h-[300px]">
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pick or capture a business card to begin.</p>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
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
                    alt="Uploaded business card"
                    className="w-full h-auto max-h-[60vh] object-contain"
                  />
                </div>
                <div className="flex flex-col items-center justify-center gap-3 min-h-[300px] text-center">
                  <Sparkles className="size-6 animate-pulse text-primary" />
                  <p className="text-sm font-medium">
                    {isPending ? 'Reading the card…' : 'Uploading…'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Typically 5–8 seconds. Name, firm, phone, email come back first.
                  </p>
                </div>
              </div>
            )}

            {phase.kind === 'review' && phase.result.ok && (
              <ReviewBody
                previewUrl={phase.previewUrl}
                result={phase.result}
                onUse={useExtractedValues}
                onCancel={handleClose}
              />
            )}

            {phase.kind === 'failed' && (
              <div className="p-6 flex flex-col gap-4 max-w-2xl">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  <p className="font-medium mb-1">Couldn’t read this card.</p>
                  <p>{phase.error}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Fill the form manually below.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleClose}>Close</Button>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Camera className="size-4 mr-1.5" />
                    Try another card
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

function ReviewBody({
  previewUrl,
  result,
  onUse,
  onCancel,
}: {
  previewUrl: string
  result: Extract<ExtractBusinessCardResult, { ok: true }>
  onUse: () => void
  onCancel: () => void
}) {
  const d = result.data
  const firm = d.firm_candidates[0]
  const existingContact = d.contact_candidates[0]

  return (
    <div className="grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-4 p-4 md:p-6">
      {/* Card preview */}
      <div className="flex flex-col gap-3 md:sticky md:top-0 md:self-start">
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          <img
            src={previewUrl}
            alt="Uploaded business card"
            className="w-full h-auto max-h-[60vh] object-contain"
          />
        </div>
        <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground tabular-nums flex flex-wrap gap-x-3 gap-y-1">
          <span>
            page:{' '}
            <span className={
              d.page_quality === 'clear' ? 'text-emerald-700' :
              d.page_quality === 'partial' ? 'text-amber-700' :
              'text-destructive'
            }>{d.page_quality}</span>
          </span>
          <span>{(result.latency_ms / 1000).toFixed(1)}s</span>
          <span>in {result.usage.input_tokens.toLocaleString('en-IN')} tok</span>
          <span>out {result.usage.output_tokens.toLocaleString('en-IN')} tok</span>
        </div>
        {d.warnings.length > 0 && (
          <div className="text-xs text-amber-700 italic flex flex-col gap-0.5">
            {d.warnings.map((w, i) => <div key={i}>· {w}</div>)}
          </div>
        )}
      </div>

      {/* Extracted */}
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Extracted</p>

        {existingContact && existingContact.score >= 0.8 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>{existingContact.full_name}</strong>
              {existingContact.firm_name && <> ({existingContact.firm_name})</>} already exists in your contacts (
              {Math.round(existingContact.score * 100)}% · {existingContact.match_kind.replace('_', ' ')}). Consider linking instead of creating a duplicate.
            </span>
          </div>
        )}

        <div className="rounded-lg border border-primary/30 bg-card overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground break-words">
              {d.full_name ?? '(no name)'}
              {d.role_title && <span className="text-sm font-normal text-muted-foreground ml-2">· {d.role_title}</span>}
            </p>
            <p className="text-sm text-muted-foreground break-words">
              {d.firm_name ?? '(no firm)'}
              {d.gstin && <span className="ml-1 font-mono text-xs">[{d.gstin}]</span>}
            </p>
          </div>

          {/* Body */}
          <div className="px-4 py-3 flex flex-col gap-2 text-sm">
            <NumericRow label="Phone" value={d.phone ?? '—'} />
            {d.phone_alt && <NumericRow label="Alt phone" value={d.phone_alt} />}
            <NumericRow label="Email" value={d.email ?? '—'} />
            {d.website && <NumericRow label="Website" value={d.website} />}
            <NumericRow label="City / State" value={[d.city, d.state].filter(Boolean).join(', ') || '—'} />
            {d.address && <NumericRow label="Address" value={d.address} />}
            <div className="flex items-baseline justify-between gap-3 text-sm pt-2 border-t border-border">
              <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">Firm match</span>
              {firm ? (
                <span className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                  <span className="font-medium text-right break-words">{firm.name}</span>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px] uppercase shrink-0">
                    <CheckCircle2 className="size-3 mr-0.5" /> {Math.round(firm.score * 100)}% · {firm.match_kind.replace('_', ' ')}
                  </Badge>
                </span>
              ) : (
                <span className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                  <span className="text-muted-foreground italic">—</span>
                  {d.firm_name && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px] uppercase shrink-0">
                      <AlertCircle className="size-3 mr-0.5" /> New firm
                    </Badge>
                  )}
                </span>
              )}
            </div>
            {d.segment_hint && (
              <NumericRow label="Suggested segment" value={d.segment_hint} />
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Discard</Button>
          <Button onClick={onUse}>
            <CheckCircle2 className="size-4 mr-1.5" />
            Use these values
          </Button>
        </div>
      </div>
    </div>
  )
}

function NumericRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap shrink-0">
        {label}
      </span>
      <span className="font-medium text-right break-words min-w-0">{value}</span>
    </div>
  )
}
