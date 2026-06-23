'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  ArrowRight, CheckCircle2, XCircle, UserCog, MessageSquare, Phone, MapPin, Pencil,
} from 'lucide-react'
import {
  advanceLeadStage, assignLead, markLeadWon, markLeadLost, logLeadActivity,
} from '@/lib/actions/leads'

interface Stage {
  id: string
  stage_key: string
  label: string
  color: string
  order_index: number
  is_terminal: boolean
  is_won: boolean
  is_lost: boolean
}

type Dialog =
  | { kind: 'advance'; stageId: string }
  | { kind: 'won' }
  | { kind: 'lost' }
  | { kind: 'assign' }
  | { kind: 'activity'; type: 'call' | 'visit' | 'note' | 'lead_meeting' }
  | null

const ACTIVITY_LABELS: Record<NonNullable<Dialog & { kind: 'activity' }>['type'], string> = {
  call: 'Log a call',
  visit: 'Log a site visit',
  note: 'Add a note',
  lead_meeting: 'Log a meeting',
}

export function LeadActions({
  leadId, currentStageId, isTerminal, stages, lossReasons, owners, currentOwnerId, wonProjectId,
}: {
  leadId: string
  currentStageId: string
  isTerminal: boolean
  stages: Stage[]
  lossReasons: { id: string; code: string; label: string }[]
  owners: { id: string; full_name: string; role: string }[]
  currentOwnerId: string
  wonProjectId: string | null
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [isPending, startTransition] = useTransition()

  const orderedStages = [...stages].sort((a, b) => a.order_index - b.order_index)
  const currentIdx = orderedStages.findIndex((s) => s.id === currentStageId)
  const nextStage = currentIdx >= 0 && currentIdx < orderedStages.length - 1
    ? orderedStages.slice(currentIdx + 1).find((s) => !s.is_terminal) ?? null
    : null

  // ── Action firers ────────────────────────────────────────────────────────
  function fireAdvance(stageId: string, remark?: string) {
    startTransition(async () => {
      const res = await advanceLeadStage(leadId, stageId, remark)
      if ('error' in res) { toast.error(res.error); return }
      toast.success('Stage advanced')
      setDialog(null)
      router.refresh()
    })
  }

  function fireWon(remark?: string) {
    startTransition(async () => {
      const res = await markLeadWon(leadId, { remark, create_project: true })
      if ('error' in res) { toast.error(res.error); return }
      toast.success(res.project_id ? 'Won — project created' : 'Won')
      setDialog(null)
      router.refresh()
    })
  }

  function fireLost(reason_id: string, remark?: string) {
    startTransition(async () => {
      const res = await markLeadLost(leadId, { reason_id, remark })
      if ('error' in res) { toast.error(res.error); return }
      toast.success('Lead marked lost')
      setDialog(null)
      router.refresh()
    })
  }

  function fireAssign(newOwnerId: string) {
    startTransition(async () => {
      const res = await assignLead(leadId, newOwnerId)
      if ('error' in res) { toast.error(res.error); return }
      toast.success('Lead reassigned')
      setDialog(null)
      router.refresh()
    })
  }

  function fireActivity(type: 'call' | 'visit' | 'note' | 'lead_meeting', note: string) {
    startTransition(async () => {
      const res = await logLeadActivity({ lead_id: leadId, type, note })
      if ('error' in res) { toast.error(res.error); return }
      toast.success('Activity logged')
      setDialog(null)
      router.refresh()
    })
  }

  if (isTerminal) {
    return (
      <div className="text-xs text-muted-foreground italic flex items-center gap-2">
        Lead in terminal state — no further actions.
        {wonProjectId && (
          <span className="text-emerald-700">· Linked project created.</span>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {nextStage && (
          <Button size="sm" onClick={() => setDialog({ kind: 'advance', stageId: nextStage.id })} disabled={isPending}>
            <ArrowRight className="size-4 mr-1.5" />
            Advance to {nextStage.label}
          </Button>
        )}
        <Button
          size="sm" variant="outline"
          className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          onClick={() => setDialog({ kind: 'won' })}
          disabled={isPending}
        >
          <CheckCircle2 className="size-4 mr-1.5" />
          Mark Won
        </Button>
        <Button
          size="sm" variant="outline"
          className="text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => setDialog({ kind: 'lost' })}
          disabled={isPending}
        >
          <XCircle className="size-4 mr-1.5" />
          Mark Lost
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'assign' })} disabled={isPending}>
          <UserCog className="size-4 mr-1.5" />
          Reassign
        </Button>

        <span className="text-xs text-muted-foreground mx-1">·</span>

        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'activity', type: 'call' })}>
          <Phone className="size-4 mr-1.5" /> Log call
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'activity', type: 'visit' })}>
          <MapPin className="size-4 mr-1.5" /> Visit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'activity', type: 'lead_meeting' })}>
          <MessageSquare className="size-4 mr-1.5" /> Meeting
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'activity', type: 'note' })}>
          <Pencil className="size-4 mr-1.5" /> Note
        </Button>
      </div>

      {/* Advance — confirm with optional remark */}
      <RemarkDialog
        open={dialog?.kind === 'advance'}
        title={dialog?.kind === 'advance' ? `Advance to ${orderedStages.find((s) => s.id === dialog.stageId)?.label}` : ''}
        placeholder="What's the rationale for advancing? (optional)"
        confirmLabel="Advance"
        onOpenChange={(v) => !v && setDialog(null)}
        onSubmit={(remark) => dialog?.kind === 'advance' && fireAdvance(dialog.stageId, remark || undefined)}
        busy={isPending}
        requireRemark={false}
      />

      {/* Won */}
      <RemarkDialog
        open={dialog?.kind === 'won'}
        title="Mark as won — auto-creates project"
        placeholder="How did we close this? (decision-maker, final commitment, anything for the audit trail)"
        confirmLabel="Confirm won"
        onOpenChange={(v) => !v && setDialog(null)}
        onSubmit={(remark) => fireWon(remark || undefined)}
        busy={isPending}
        requireRemark={false}
        variant="emerald"
      />

      {/* Lost — needs a reason */}
      <LostDialog
        open={dialog?.kind === 'lost'}
        reasons={lossReasons}
        onOpenChange={(v) => !v && setDialog(null)}
        onSubmit={(reason_id, remark) => fireLost(reason_id, remark)}
        busy={isPending}
      />

      {/* Reassign */}
      <AssignDialog
        open={dialog?.kind === 'assign'}
        owners={owners}
        currentOwnerId={currentOwnerId}
        onOpenChange={(v) => !v && setDialog(null)}
        onSubmit={(id) => fireAssign(id)}
        busy={isPending}
      />

      {/* Activity log */}
      <RemarkDialog
        open={dialog?.kind === 'activity'}
        title={dialog?.kind === 'activity' ? ACTIVITY_LABELS[dialog.type] : ''}
        placeholder={
          dialog?.kind === 'activity' && dialog.type === 'call' ? 'Who did you speak with? What did they say?' :
          dialog?.kind === 'activity' && dialog.type === 'visit' ? 'What did you see on site? Photos / outcomes?' :
          dialog?.kind === 'activity' && dialog.type === 'lead_meeting' ? 'Who attended? Key outcomes / next steps?' :
          'What\'s worth remembering?'
        }
        confirmLabel="Log activity"
        onOpenChange={(v) => !v && setDialog(null)}
        onSubmit={(note) => dialog?.kind === 'activity' && fireActivity(dialog.type, note)}
        busy={isPending}
        requireRemark={true}
      />
    </>
  )
}

// ── Small reusable dialogs ─────────────────────────────────────────────────

function RemarkDialog({
  open, title, placeholder, confirmLabel, onOpenChange, onSubmit, busy, requireRemark, variant,
}: {
  open: boolean
  title: string
  placeholder: string
  confirmLabel: string
  onOpenChange: (v: boolean) => void
  onSubmit: (remark: string) => void
  busy: boolean
  requireRemark: boolean
  variant?: 'emerald'
}) {
  const [remark, setRemark] = useState('')
  function submit() { onSubmit(remark.trim()); setRemark('') }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Textarea rows={3} placeholder={placeholder} value={remark} onChange={(e) => setRemark(e.target.value)} autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={busy || (requireRemark && !remark.trim())}
            className={variant === 'emerald' ? 'bg-emerald-700 hover:bg-emerald-800' : ''}
          >
            {busy ? 'Saving…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LostDialog({
  open, reasons, onOpenChange, onSubmit, busy,
}: {
  open: boolean
  reasons: { id: string; code: string; label: string }[]
  onOpenChange: (v: boolean) => void
  onSubmit: (reason_id: string, remark?: string) => void
  busy: boolean
}) {
  const [reasonId, setReasonId] = useState<string>('')
  const [remark, setRemark] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Mark lead as lost</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Reason *</Label>
            <Select value={reasonId} onValueChange={setReasonId}>
              <SelectTrigger><SelectValue placeholder="Pick a reason…" /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="What did they say? Anything we can learn from?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !reasonId} onClick={() => onSubmit(reasonId, remark.trim() || undefined)}>
            {busy ? 'Saving…' : 'Mark lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignDialog({
  open, owners, currentOwnerId, onOpenChange, onSubmit, busy,
}: {
  open: boolean
  owners: { id: string; full_name: string; role: string }[]
  currentOwnerId: string
  onOpenChange: (v: boolean) => void
  onSubmit: (id: string) => void
  busy: boolean
}) {
  const [newOwnerId, setNewOwnerId] = useState<string>(currentOwnerId)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Reassign lead</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label>New owner</Label>
          <Select value={newOwnerId} onValueChange={setNewOwnerId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.full_name} <span className="text-xs text-muted-foreground ml-1">· {o.role}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSubmit(newOwnerId)} disabled={busy || newOwnerId === currentOwnerId}>
            {busy ? 'Saving…' : 'Reassign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Unused import suppressor — keeps Input/Label imports referenced even if a future trim removes them.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _unused() { void Input; void Label }
