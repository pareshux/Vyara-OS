'use client'

/**
 * AttachmentUploadButton — generic file picker used across Vyara
 * (FO-3 visit photos, FO-5 expense receipts, complaint photos, …).
 *
 * Flow:
 *   1. User picks a file (mobile camera or picker).
 *   2. Client uploads it directly to the `ai-uploads` bucket.
 *   3. Client calls createAttachment() to record metadata.
 *   4. Parent gets a toast + onUploaded callback to refresh.
 *
 * The component is the single contract for "uploading a file to an
 * entity" — variant + kind + accept default per kind. Callers don't
 * touch storage themselves.
 */
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Camera, Paperclip, Loader2, FileText, Mic } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createAttachment } from '@/lib/actions/attachments'
import { ATTACHMENT_BUCKET, buildAttachmentPath, type AttachmentKind } from '@/lib/attachments/path'

const ACCEPT_BY_KIND: Record<AttachmentKind, string> = {
  photo: 'image/*',
  document: 'application/pdf,image/*',
  voice_note: 'audio/*',
  signature: 'image/png', // signatures use SignaturePad, not this button
  receipt: 'image/*,application/pdf',
}

const MAX_BYTES_BY_KIND: Record<AttachmentKind, number> = {
  photo: 8 * 1024 * 1024,
  document: 16 * 1024 * 1024,
  voice_note: 16 * 1024 * 1024,
  signature: 1 * 1024 * 1024,
  receipt: 8 * 1024 * 1024,
}

const ICON_BY_KIND: Record<AttachmentKind, typeof Camera> = {
  photo: Camera,
  document: Paperclip,
  voice_note: Mic,
  signature: FileText,
  receipt: Camera,
}

const DEFAULT_LABEL_BY_KIND: Record<AttachmentKind, string> = {
  photo: 'Add photo',
  document: 'Attach file',
  voice_note: 'Voice note',
  signature: 'Signature',
  receipt: 'Add receipt',
}

export function AttachmentUploadButton({
  tenantId,
  entityType,
  entityId,
  kind,
  label,
  variant = 'outline',
  size = 'default',
  className,
  // For photo / receipt kinds we open the back camera on mobile.
  preferCamera,
  onUploaded,
}: {
  tenantId: string
  entityType: string
  entityId: string
  kind: AttachmentKind
  label?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
  preferCamera?: boolean
  onUploaded?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const Icon = ICON_BY_KIND[kind]
  const buttonLabel = label ?? DEFAULT_LABEL_BY_KIND[kind]
  const accept = ACCEPT_BY_KIND[kind]
  const maxBytes = MAX_BYTES_BY_KIND[kind]
  const useCameraCapture = preferCamera ?? (kind === 'photo' || kind === 'receipt')

  async function handleFile(file: File) {
    if (file.size > maxBytes) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${maxBytes / 1024 / 1024} MB.`)
      return
    }

    setBusy(true)
    try {
      const supabase = createClient()
      const path = buildAttachmentPath({ tenantId, entityType, filename: file.name })

      const { error: upErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type })

      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`)
        return
      }

      const result = await createAttachment({
        entityType,
        entityId,
        kind,
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
        title: file.name,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(`${DEFAULT_LABEL_BY_KIND[kind]} saved`)
      onUploaded?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        {...(useCameraCapture ? { capture: 'environment' as const } : {})}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Icon className="size-4 mr-1.5" />}
        {busy ? 'Uploading…' : buttonLabel}
      </Button>
    </>
  )
}
