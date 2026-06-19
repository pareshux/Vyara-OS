'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle2, ThumbsUp, ThumbsDown, Sparkles, Camera } from 'lucide-react'
import { completeVisit, listVisitMasters } from '@/lib/actions/field-visits'
import { extractVoiceVisitNote } from '@/lib/actions/voice-visit-note'
import { VoiceCapture } from './voice-capture'
import { AttachmentUploadButton } from '@/components/attachment/upload-button'
import { AttachmentList } from '@/components/attachment/list'
import { SignaturePad } from '@/components/attachment/signature-pad'

const NONE_VALUE = '__none__'

export function CompleteVisitButton({
  visitId,
  initialContactId,
  tenantId,
}: {
  visitId: string
  initialContactId: string | null
  tenantId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [outcomes, setOutcomes] = useState<Array<{ id: string; label: string; requires_followup: boolean }>>([])
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [notes, setNotes] = useState<string>('')
  const [interested, setInterested] = useState<true | false | null>(null)
  const [outcomeId, setOutcomeId] = useState<string>(NONE_VALUE)
  const [aiPrefilled, setAiPrefilled] = useState(false)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  // Bumped after every attachment upload / delete so the in-dialog
  // list refetches. Cheap because list pulls only this visit's rows.
  const [attachmentKey, setAttachmentKey] = useState(0)
  const bumpAttachments = () => setAttachmentKey((k) => k + 1)

  async function handleVoiceTranscript(transcript: string) {
    const r = await extractVoiceVisitNote(transcript)
    if (!r.ok) { toast.error(r.error); return }
    const d = r.data
    if (d.contact_name && !contactName) setContactName(d.contact_name)
    if (d.contact_phone && !contactPhone) setContactPhone(d.contact_phone)
    if (d.notes) setNotes((prev) => prev ? `${prev}\n${d.notes}` : d.notes)
    if (d.is_interested !== null) setInterested(d.is_interested)
    if (d.resolved_outcome_id) setOutcomeId(d.resolved_outcome_id)
    setAiPrefilled(true)
    toast.success(`Read your note in ${(r.latency_ms / 1000).toFixed(1)}s — please review.`)
  }

  useEffect(() => {
    if (!open) return
    listVisitMasters().then((r) => {
      if ('error' in r) return
      setOutcomes(r.outcomes)
    })
  }, [open])

  function submit() {
    setErr(null)
    if (interested === null) { setErr('Tap Interested or Not interested first'); return }
    startTransition(async () => {
      const r = await completeVisit(visitId, {
        contact_id: initialContactId,
        contact_name_raw: contactName.trim() || null,
        contact_phone_raw: contactPhone.trim() || null,
        is_interested: interested,
        visit_outcome_id: outcomeId === NONE_VALUE ? null : outcomeId,
        notes_text: notes.trim() || null,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success('Visit logged')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setErr(null) }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 className="size-3.5 mr-1.5" /> Visit completed
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Wrap up the visit</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {/* Voice capture — speak the whole summary and AI fills the form */}
          <VoiceCapture onTranscript={handleVoiceTranscript} />

          {aiPrefilled && (
            <p className="text-[10px] text-primary inline-flex items-center gap-1">
              <Sparkles className="size-3" /> Pre-filled from your voice note. Please review before submitting.
            </p>
          )}

          {/* Contact name + phone */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cname" className="text-xs">Who you met</Label>
              <Input
                id="cname"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cphone" className="text-xs">Phone</Label>
              <Input
                id="cphone"
                type="tel"
                inputMode="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="98xxxxxxxx"
                className="w-32 tabular-nums"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes" className="text-xs">What was discussed?</Label>
            <Textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Topic, next steps, anything the team should know…"
            />
          </div>

          {/* ── Proof: photos + document + signature ──────────────
              Uploads attach to the visit row eagerly (so a heavy
              photo doesn't stall the submit). Even if the rep
              cancels the dialog without submitting, the visit row
              still exists in state='in_progress' until they either
              complete or cancel the visit itself. */}
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Camera className="size-3.5" /> Proof
                <span className="text-muted-foreground font-normal">— optional but recommended</span>
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <AttachmentUploadButton
                tenantId={tenantId}
                entityType="field_visit"
                entityId={visitId}
                kind="photo"
                label="Add photo"
                size="sm"
                onUploaded={bumpAttachments}
              />
              <AttachmentUploadButton
                tenantId={tenantId}
                entityType="field_visit"
                entityId={visitId}
                kind="document"
                label="Attach file"
                size="sm"
                onUploaded={bumpAttachments}
              />
              <SignaturePad
                tenantId={tenantId}
                entityType="field_visit"
                entityId={visitId}
                signerName={contactName || undefined}
                triggerLabel="Signature"
                size="sm"
                onSaved={bumpAttachments}
              />
            </div>
            <AttachmentList
              entityType="field_visit"
              entityId={visitId}
              refreshKey={attachmentKey}
              emptyLabel={null}
            />
          </div>

          {/* Interested chips */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Their interest</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInterested(true)}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  interested === true
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <ThumbsUp className="size-4" /> Interested
              </button>
              <button
                type="button"
                onClick={() => { setInterested(false); setOutcomeId(NONE_VALUE) }}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  interested === false
                    ? 'border-rose-600 bg-rose-50 text-rose-800'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <ThumbsDown className="size-4" /> Not interested
              </button>
            </div>
          </div>

          {/* Outcome detail — only when Interested */}
          {interested === true && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">What's next? <span className="text-muted-foreground">— optional</span></Label>
              <Select value={outcomeId} onValueChange={setOutcomeId}>
                <SelectTrigger><SelectValue placeholder="Pick a next step" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>
                    <span className="italic text-muted-foreground">No specific next step</span>
                  </SelectItem>
                  {outcomes
                    .filter((o) => o.label !== 'Lost / no interest')
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {err && <p className="text-xs text-destructive">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Submit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
