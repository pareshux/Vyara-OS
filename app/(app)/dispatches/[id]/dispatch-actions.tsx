'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { advanceDispatchStage, recordPOD } from '@/lib/actions/dispatches'
import { Truck, Upload } from 'lucide-react'

interface Props {
  dispatchId: string
  stageKey: string
  isTerminal: boolean
  podUrl: string | null
}

export function DispatchActions({ dispatchId, stageKey, isTerminal, podUrl }: Props) {
  const router = useRouter()
  const [podOpen, setPodOpen] = useState(false)
  const [signature, setSignature] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function fire(stage: 'in_transit' | 'delivered' | 'cancelled' | 'closed') {
    setErr(null)
    startTransition(async () => {
      const res = await advanceDispatchStage(dispatchId, stage)
      if ('error' in res) {
        setErr(res.error)
        toast.error(res.error)
      } else {
        toast.success(`Marked ${stage.replace('_', ' ')}`)
        router.refresh()
      }
    })
  }

  async function handlePodSubmit() {
    if (!file) {
      setErr('Choose a POD photo or PDF')
      return
    }
    setErr(null)
    startTransition(async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        // tenant_id from user_profile (RLS will reject if mismatch)
        const { data: profile } = await supabase
          .from('user_profile')
          .select('tenant_id')
          .eq('id', user.id)
          .single()
        if (!profile) throw new Error('No profile')

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${profile.tenant_id}/${dispatchId}/${Date.now()}_${safeName}`

        const { error: upErr } = await supabase.storage
          .from('dispatch-pod')
          .upload(path, file, { upsert: false, contentType: file.type })
        if (upErr) throw upErr

        const res = await recordPOD({
          dispatch_id: dispatchId,
          pod_url: path,
          signature_name: signature.trim() || undefined,
        })
        if ('error' in res) throw new Error(res.error)

        toast.success('POD captured')
        setPodOpen(false)
        setFile(null)
        setSignature('')
        router.refresh()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed'
        setErr(msg)
        toast.error(msg)
      }
    })
  }

  if (isTerminal) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Dispatch in terminal state. No further actions.
      </p>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {stageKey === 'scheduled' && (
          <Button size="sm" onClick={() => fire('in_transit')} disabled={busy}>
            <Truck className="size-4 mr-1.5" />
            Mark in-transit
          </Button>
        )}
        {(stageKey === 'in_transit' || stageKey === 'scheduled') && (
          <Button size="sm" variant="outline" onClick={() => fire('delivered')} disabled={busy}>
            Mark delivered
          </Button>
        )}
        {(stageKey === 'delivered' || stageKey === 'in_transit') && !podUrl && (
          <Button size="sm" variant="outline" onClick={() => setPodOpen(true)} disabled={busy}>
            <Upload className="size-4 mr-1.5" />
            Upload POD
          </Button>
        )}
        {stageKey !== 'pod_uploaded' && stageKey !== 'closed' && (
          <Button size="sm" variant="ghost" onClick={() => fire('cancelled')} disabled={busy}>
            Cancel dispatch
          </Button>
        )}
        {stageKey === 'pod_uploaded' && (
          <Button size="sm" variant="outline" onClick={() => fire('closed')} disabled={busy}>
            Close out
          </Button>
        )}
      </div>
      {err && <p className="text-xs text-destructive mt-2">{err}</p>}

      <Dialog open={podOpen} onOpenChange={setPodOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Capture proof of delivery</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pod-sig">Received by (name)</Label>
              <Input
                id="pod-sig"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Receiver / signatory name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pod-file">POD photo or PDF</Label>
              <Input
                ref={fileInput}
                id="pod-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Max 10MB. Photos work great on mobile.
              </p>
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setPodOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handlePodSubmit} disabled={busy || !file}>
                {busy ? 'Uploading…' : 'Save POD'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
