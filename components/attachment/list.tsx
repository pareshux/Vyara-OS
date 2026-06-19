'use client'

/**
 * AttachmentList — render attachments for an entity. Two presentations:
 *
 *   - photo / signature / receipt (image MIME) → thumbnail grid
 *   - document / voice_note         → row list with filename + size
 *
 * Signed URLs are fetched lazily per row. The 1-hour default is fine
 * for a page view; once the page is open longer the user re-renders
 * by interacting (delete, upload) and URLs refresh.
 *
 * Delete is creator-only or admin/manager (gated by server action).
 */
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  listAttachments,
  softDeleteAttachment,
  getSignedAttachmentUrl,
  type Attachment,
} from '@/lib/actions/attachments'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2, FileText, Mic, ExternalLink, ImageIcon } from 'lucide-react'

type SignedRow = Attachment & { signedUrl?: string }

function isImageMime(m: string) {
  return m.startsWith('image/')
}

function formatBytes(b: number | null): string {
  if (b == null) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentList({
  entityType,
  entityId,
  // 'all' (default) | restrict to specific kinds
  kinds,
  // Empty-state label when there's nothing to show. Set null to hide entirely.
  emptyLabel = 'No attachments yet.',
  refreshKey,
}: {
  entityType: string
  entityId: string
  kinds?: Attachment['kind'][]
  emptyLabel?: string | null
  // Change this number to force a re-fetch (e.g. after upload).
  refreshKey?: number
}) {
  const [rows, setRows] = useState<SignedRow[] | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    setRows(null)

    async function load() {
      const result = await listAttachments(entityType, entityId)
      if (cancelled) return
      if (!result.ok) {
        toast.error(result.error)
        setRows([])
        return
      }

      const filtered = kinds
        ? result.attachments.filter((a) => kinds.includes(a.kind))
        : result.attachments

      // Sign all image URLs upfront so the grid paints in one pass.
      // For non-image rows we sign on-demand when the user clicks open.
      const withSigned: SignedRow[] = await Promise.all(
        filtered.map(async (a) => {
          if (!isImageMime(a.mime_type)) return a
          const sig = await getSignedAttachmentUrl(a.id)
          return sig.ok ? { ...a, signedUrl: sig.url } : a
        }),
      )

      if (!cancelled) setRows(withSigned)
    }

    load()
    return () => { cancelled = true }
  }, [entityType, entityId, kinds, refreshKey])

  async function handleOpen(a: SignedRow) {
    if (a.signedUrl) {
      window.open(a.signedUrl, '_blank', 'noopener,noreferrer')
      return
    }
    const sig = await getSignedAttachmentUrl(a.id)
    if (!sig.ok) {
      toast.error(sig.error)
      return
    }
    window.open(sig.url, '_blank', 'noopener,noreferrer')
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this attachment?')) return
    startTransition(async () => {
      const r = await softDeleteAttachment(id)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setRows((prev) => (prev ?? []).filter((a) => a.id !== id))
      toast.success('Attachment removed')
    })
  }

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading attachments…
      </div>
    )
  }

  if (rows.length === 0) {
    return emptyLabel ? (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    ) : null
  }

  const images = rows.filter((a) => isImageMime(a.mime_type))
  const files = rows.filter((a) => !isImageMime(a.mime_type))

  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {images.map((a) => (
            <div key={a.id} className="relative aspect-square group rounded-md overflow-hidden border bg-muted">
              {a.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.signedUrl}
                  alt={a.title ?? a.kind}
                  className="size-full object-cover cursor-pointer"
                  onClick={() => handleOpen(a)}
                />
              ) : (
                <div className="size-full flex items-center justify-center">
                  <ImageIcon className="size-5 text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                className="absolute top-1 right-1 rounded-full bg-background/90 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete attachment"
              >
                <Trash2 className="size-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col divide-y border rounded-md">
          {files.map((a) => {
            const Icon = a.kind === 'voice_note' ? Mic : FileText
            return (
              <li key={a.id} className="flex items-center gap-2 px-2.5 py-2 text-sm">
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.title ?? a.storage_path.split('/').pop()}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {a.kind} · {formatBytes(a.size_bytes)}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleOpen(a)}>
                  <ExternalLink className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(a.id)}>
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
