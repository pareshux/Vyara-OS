'use client'

/**
 * SignaturePad — canvas-based signature capture.
 *
 * Captures a finger / stylus / mouse signature, renders a PNG, uploads
 * to ai-uploads, and creates an attachment with kind='signature'. Used
 * by FO-3 (visit completion proof), eventually POD (Delivery) and
 * complaint resolution (Customer Success).
 *
 * Tap "Sign" → modal pad → "Save". The dialog is responsive: 95vw on
 * mobile, ~500px on desktop. Stroke smoothing isn't needed for this
 * resolution; raw pointer points + lineCap='round' looks clean.
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PenLine, Eraser, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createAttachment } from '@/lib/actions/attachments'
import { ATTACHMENT_BUCKET, buildAttachmentPath } from '@/lib/attachments/path'

export function SignaturePad({
  tenantId,
  entityType,
  entityId,
  // Pre-fill the signer name to record in metadata.
  signerName,
  // Render this label on the trigger button.
  triggerLabel = 'Capture signature',
  variant = 'outline',
  size = 'default',
  onSaved,
}: {
  tenantId: string
  entityType: string
  entityId: string
  signerName?: string
  triggerLabel?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  // Resize the canvas to its container at devicePixelRatio. Stroke
  // crispness on retina depends on this. Run on open.
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1C1B19'
    setHasInk(false)
  }, [open])

  function posFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    lastPoint.current = posFromEvent(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const p = posFromEvent(e)
    const last = lastPoint.current ?? p
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPoint.current = p
    if (!hasInk) setHasInk(true)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false
    lastPoint.current = null
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }

  function clearPad() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasInk(false)
  }

  async function handleSave() {
    if (!hasInk) {
      toast.error('Please sign before saving.')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return

    setBusy(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) {
        toast.error('Could not generate signature image.')
        return
      }

      const supabase = createClient()
      const filename = `signature_${Date.now()}.png`
      const path = buildAttachmentPath({ tenantId, entityType, filename })

      const { error: upErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, blob, { upsert: false, contentType: 'image/png' })

      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`)
        return
      }

      const r = await createAttachment({
        entityType,
        entityId,
        kind: 'signature',
        storagePath: path,
        mimeType: 'image/png',
        sizeBytes: blob.size,
        title: signerName ? `Signature — ${signerName}` : 'Signature',
        metadata: {
          signed_at: new Date().toISOString(),
          signer_name: signerName ?? null,
          canvas_w: canvas.width,
          canvas_h: canvas.height,
        },
      })

      if (!r.ok) {
        toast.error(r.error)
        return
      }

      toast.success('Signature saved')
      setOpen(false)
      onSaved?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        <PenLine className="size-4 mr-1.5" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Sign here</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              className="block w-full h-[220px] touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={clearPad} disabled={busy}>
              <Eraser className="size-4 mr-1.5" /> Clear
            </Button>
            <Button type="button" onClick={handleSave} disabled={busy || !hasInk}>
              {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              {busy ? 'Saving…' : 'Save signature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
