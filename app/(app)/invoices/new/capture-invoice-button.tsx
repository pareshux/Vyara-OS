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
import { Badge } from '@/components/ui/badge'
import { Camera, Upload, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  extractInvoicePhoto,
  type ExtractInvoicePhotoResult,
} from '@/lib/actions/invoice-photo'
import type { InvoiceAIPrefill } from './form'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
const MAX_BYTES = 10 * 1024 * 1024

type Phase =
  | { kind: 'pick' }
  | { kind: 'extracting'; previewUrl: string; isPdf: boolean }
  | { kind: 'review'; previewUrl: string; isPdf: boolean; result: Extract<ExtractInvoicePhotoResult, { ok: true }> }
  | { kind: 'failed'; previewUrl: string | null; isPdf: boolean; error: string }

export function CaptureInvoiceButton({
  tenantId,
  onPrefill,
}: {
  tenantId: string
  onPrefill: (prefill: InvoiceAIPrefill) => void
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

    const isPdf = file.type === 'application/pdf'
    const previewUrl = URL.createObjectURL(file)
    setPhase({ kind: 'extracting', previewUrl, isPdf })

    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const path = `${tenantId}/invoice_photo/${yyyy}/${mm}/${Date.now()}_${safeName}`

    const { error: upErr } = await supabase.storage
      .from('ai-uploads')
      .upload(path, file, { upsert: false, contentType: file.type })

    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`)
      setPhase({ kind: 'failed', previewUrl, isPdf, error: upErr.message })
      return
    }

    startTransition(async () => {
      const result = await extractInvoicePhoto(path)
      if (!result.ok) {
        toast.error(`Extraction failed: ${result.error}`)
        setPhase({ kind: 'failed', previewUrl, isPdf, error: result.error })
        return
      }
      toast.success(`Invoice read in ${(result.latency_ms / 1000).toFixed(1)}s`)
      setPhase({ kind: 'review', previewUrl, isPdf, result })
    })
  }

  function useExtractedValues() {
    if (phase.kind !== 'review' || !phase.result.ok) return
    const d = phase.result.data
    const buyer = d.buyer_candidates[0] ?? null
    const project = d.project_candidates[0] ?? null
    const order = d.order_candidates[0] ?? null

    const confidences = [
      d.external_invoice_number_confidence,
      d.invoice_date_confidence,
      d.buyer_firm_name_confidence,
      d.total_confidence,
    ].filter((c) => typeof c === 'number') as number[]
    const avg_confidence =
      confidences.length > 0
        ? confidences.reduce((s, c) => s + c, 0) / confidences.length
        : null

    const prefill: InvoiceAIPrefill = {
      external_invoice_number: d.external_invoice_number,
      invoice_date: d.invoice_date,
      project_id: project?.id ?? null,
      buyer_firm_id: buyer?.id ?? null,
      sales_order_id: order?.id ?? null,
      subtotal: d.subtotal,
      gst_pct: d.gst_pct,
      retention_pct: d.retention_pct,
      is_running_bill: d.is_running_bill,
      running_bill_seq: d.running_bill_seq,
      is_final_bill: d.is_final_bill,
      notes: d.notes,
      extraction_id: phase.result.extraction_id,
      avg_confidence,
      original_values: {
        external_invoice_number: d.external_invoice_number,
        invoice_date: d.invoice_date,
        buyer_firm_name: d.buyer_firm_name,
        buyer_gstin: d.buyer_gstin,
        project_or_site: d.project_or_site,
        order_reference: d.order_reference,
        subtotal: d.subtotal,
        gst_pct: d.gst_pct,
        gst_amount: d.gst_amount,
        total: d.total,
        retention_pct: d.retention_pct,
        is_running_bill: d.is_running_bill,
        running_bill_seq: d.running_bill_seq,
        is_final_bill: d.is_final_bill,
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
          if (file) {
            setOpen(true)
            handleFile(file)
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera className="size-4 mr-1.5" />
        Capture invoice
      </Button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) handleClose()
          else setOpen(true)
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-[min(95vw,1200px)] flex flex-col p-0">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {phase.kind === 'pick' && 'Capture invoice'}
              {phase.kind === 'extracting' && 'Reading your invoice…'}
              {phase.kind === 'review' && 'Review extracted invoice'}
              {phase.kind === 'failed' && 'Extraction failed'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            {phase.kind === 'pick' && (
              <div className="p-6 flex flex-col items-center justify-center gap-3 min-h-[300px]">
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pick or capture an invoice to begin.</p>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="size-4 mr-1.5" />
                  Choose photo or PDF
                </Button>
              </div>
            )}

            {phase.kind === 'extracting' && (
              <div className="grid md:grid-cols-2 gap-4 p-4 md:p-6">
                <div className="rounded-lg border border-border bg-muted/30 overflow-hidden self-start">
                  {phase.isPdf ? (
                    <div className="flex items-center justify-center text-sm text-muted-foreground py-16">
                      PDF preview not shown — analysing…
                    </div>
                  ) : (
                    <img
                      src={phase.previewUrl}
                      alt="Uploaded invoice"
                      className="w-full h-auto max-h-[70vh] object-contain"
                    />
                  )}
                </div>
                <div className="flex flex-col items-center justify-center gap-3 min-h-[300px] text-center">
                  <Sparkles className="size-6 animate-pulse text-primary" />
                  <p className="text-sm font-medium">
                    {isPending ? 'Reading invoice fields…' : 'Uploading…'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Typically 8–12 seconds. Headers and totals only — add lines manually if needed.
                  </p>
                </div>
              </div>
            )}

            {phase.kind === 'review' && phase.result.ok && (
              <ReviewBody
                previewUrl={phase.previewUrl}
                isPdf={phase.isPdf}
                result={phase.result}
                onUse={useExtractedValues}
                onCancel={handleClose}
              />
            )}

            {phase.kind === 'failed' && (
              <div className="p-6 flex flex-col gap-4 max-w-2xl">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  <p className="font-medium mb-1">Couldn’t read this invoice.</p>
                  <p>{phase.error}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Fill the form manually below — the New invoice form is still available.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleClose}>Close</Button>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Camera className="size-4 mr-1.5" />
                    Try another file
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
  isPdf,
  result,
  onUse,
  onCancel,
}: {
  previewUrl: string
  isPdf: boolean
  result: Extract<ExtractInvoicePhotoResult, { ok: true }>
  onUse: () => void
  onCancel: () => void
}) {
  const d = result.data
  const buyer = d.buyer_candidates[0]
  const project = d.project_candidates[0]
  const order = d.order_candidates[0]

  return (
    <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4 p-4 md:p-6">
      {/* Source preview */}
      <div className="flex flex-col gap-3 md:sticky md:top-0 md:self-start">
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          {isPdf ? (
            <div className="flex items-center justify-center text-sm text-muted-foreground py-16">
              PDF uploaded (preview not rendered)
            </div>
          ) : (
            <img
              src={previewUrl}
              alt="Uploaded invoice"
              className="w-full h-auto max-h-[70vh] object-contain"
            />
          )}
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

      {/* Extracted summary */}
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Extracted</p>

        <div className="rounded-lg border border-primary/30 bg-card overflow-hidden">
          {/* Header — invoice # + total, both can grow vertically without overlap */}
          <div className="px-4 py-3 border-b border-border flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-foreground break-words min-w-0 flex-1">
                {d.external_invoice_number ?? '(no invoice number)'}
              </p>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Total</p>
                <p className="text-lg font-semibold text-primary tabular-nums">
                  ₹{Number(d.total).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground break-words">
              {d.invoice_date ?? 'date unknown'}
              {d.buyer_firm_name && <> · {d.buyer_firm_name}</>}
              {d.buyer_gstin && <span className="ml-1 font-mono">[{d.buyer_gstin}]</span>}
            </p>
          </div>

          {/* Matched references — three rows, each full width */}
          <div className="px-4 py-3 flex flex-col gap-3 text-sm">
            <KV label="Buyer" matched={buyer?.name ?? null}
              raw={d.buyer_firm_name}
              hint={buyer ? `${Math.round(buyer.score * 100)}% · ${buyer.match_kind.replace('_', ' ')}` : null}
            />
            <KV label="Project" matched={project?.name ?? null}
              raw={d.project_or_site}
              hint={project ? `${Math.round(project.score * 100)}% match` : null}
            />
            <KV label="Order" matched={order?.order_number ?? null}
              raw={d.order_reference}
              hint={order ? `${Math.round(order.score * 100)}% · ${order.project_name ?? order.buyer_name ?? ''}` : null}
            />
          </div>

          {/* Numeric summary — always stacked single column to avoid layout overlap at narrow widths */}
          <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
            <NumericRow label="Subtotal" value={d.subtotal != null ? `₹${Number(d.subtotal).toLocaleString('en-IN')}` : '—'} />
            <NumericRow label="GST" value={d.gst_pct != null ? `${d.gst_pct}%${d.gst_amount != null ? ` · ₹${Number(d.gst_amount).toLocaleString('en-IN')}` : ''}` : '—'} />
            <NumericRow label="Retention" value={d.retention_pct != null && d.retention_pct > 0 ? `${d.retention_pct}%` : 'None'} />
            <NumericRow label="Running bill" value={d.is_running_bill ? `RA-Bill #${d.running_bill_seq ?? '?'}${d.is_final_bill ? ' (final)' : ''}` : 'No'} />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Review then click <span className="font-medium text-foreground">Use these values</span> to pre-fill the form.
          </span>
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

function KV({
  label,
  matched,
  raw,
  hint,
}: {
  label: string
  matched: string | null
  raw?: string | null
  hint?: string | null
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">{label}</span>
      {matched ? (
        <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
          <span className="text-sm text-foreground font-medium break-words min-w-0">{matched}</span>
          {hint && (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px] uppercase shrink-0">
              <CheckCircle2 className="size-3 mr-0.5" /> {hint}
            </Badge>
          )}
        </div>
      ) : (
        <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
          <span className="text-sm text-muted-foreground italic">—</span>
          {raw && (
            <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px] uppercase shrink-0">
              <AlertCircle className="size-3 mr-0.5" /> Not found
            </Badge>
          )}
        </div>
      )}
      {raw && raw !== matched && (
        <span className="text-[10px] text-muted-foreground italic break-words min-w-0">
          raw: <span className="font-mono">{raw}</span>
        </span>
      )}
    </div>
  )
}

function NumericRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap shrink-0">
        {label}
      </span>
      <span className="font-medium text-right tabular-nums break-words min-w-0">{value}</span>
    </div>
  )
}
