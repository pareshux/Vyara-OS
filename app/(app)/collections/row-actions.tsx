'use client'

import { useState, useTransition } from 'react'
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Send, Wallet, Calendar, AlertTriangle, XCircle, Sparkles } from 'lucide-react'
import {
  recordReceipt,
  recordPromiseToPay,
  sendDunningWhatsApp,
  markCollectionDisputed,
  writeOffCollection,
} from '@/lib/actions/collections'
import { extractWhatsappPTP } from '@/lib/actions/whatsapp-ptp'

interface Props {
  collectionId: string
  invoiceId: string
  invoiceNumber: string
  outstanding: number
  buyerName: string
  buyerPhone: string | null
  aiWhatsappEnabled?: boolean
}

type DialogKind = 'receipt' | 'ptp' | 'dunning' | 'dispute' | 'writeoff' | null

export function CollectionRowActions({
  collectionId,
  invoiceId,
  invoiceNumber,
  outstanding,
  buyerName,
  buyerPhone,
  aiWhatsappEnabled,
}: Props) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogKind>(null)

  function close() { setDialog(null) }
  function refresh() {
    router.refresh()
    close()
  }

  return (
    <>
      <div className="flex items-center gap-1 justify-end">
        <Button size="sm" onClick={() => setDialog('receipt')} className="h-8">
          <Wallet className="size-3.5 mr-1" /> Receipt
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 px-2">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialog('dunning')} disabled={!buyerPhone}>
              <Send className="size-3.5 mr-2" /> Send WhatsApp dunning
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog('ptp')}>
              <Calendar className="size-3.5 mr-2" /> Record promise to pay
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog('dispute')}>
              <AlertTriangle className="size-3.5 mr-2" /> Mark disputed
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog('writeoff')}>
              <XCircle className="size-3.5 mr-2" /> Write off
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReceiptDialog
        open={dialog === 'receipt'}
        onOpenChange={(v) => !v && close()}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        outstanding={outstanding}
        onSuccess={refresh}
      />
      <PTPDialog
        open={dialog === 'ptp'}
        onOpenChange={(v) => !v && close()}
        collectionId={collectionId}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        outstanding={outstanding}
        onSuccess={refresh}
        aiWhatsappEnabled={aiWhatsappEnabled ?? false}
      />
      <DunningDialog
        open={dialog === 'dunning'}
        onOpenChange={(v) => !v && close()}
        collectionId={collectionId}
        invoiceNumber={invoiceNumber}
        outstanding={outstanding}
        buyerName={buyerName}
        buyerPhone={buyerPhone}
        onSuccess={refresh}
      />
      <RemarkDialog
        open={dialog === 'dispute'}
        onOpenChange={(v) => !v && close()}
        title="Mark as disputed"
        placeholder="What is disputed? Quality / quantity / billing?"
        onSubmit={async (remark) => {
          const r = await markCollectionDisputed(collectionId, remark)
          if ('error' in r) toast.error(r.error)
          else { toast.success('Marked disputed'); refresh() }
        }}
      />
      <RemarkDialog
        open={dialog === 'writeoff'}
        onOpenChange={(v) => !v && close()}
        title="Write off invoice"
        placeholder="Reason for writing off — required for audit"
        confirmLabel="Write off"
        destructive
        onSubmit={async (remark) => {
          const r = await writeOffCollection(collectionId, remark)
          if ('error' in r) toast.error(r.error)
          else { toast.success('Written off'); refresh() }
        }}
      />
    </>
  )
}

// ── Receipt dialog ────────────────────────────────────────────────────────────

function ReceiptDialog({
  open, onOpenChange, invoiceId, invoiceNumber, outstanding, onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoiceId: string
  invoiceNumber: string
  outstanding: number
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState(outstanding)
  const [mode, setMode] = useState<'cheque' | 'neft' | 'rtgs' | 'upi' | 'cash' | 'card' | 'other'>('neft')
  const [ref, setRef] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    if (amount <= 0) { setErr('Amount must be greater than zero'); return }
    startTransition(async () => {
      const r = await recordReceipt({
        invoice_id: invoiceId,
        amount,
        payment_mode: mode,
        payment_reference: ref.trim() || undefined,
        received_at: date,
        notes: notes.trim() || undefined,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error) }
      else { toast.success(`Receipt for ${invoiceNumber} recorded`); onSuccess() }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record receipt — {invoiceNumber}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amt">Amount</Label>
              <Input id="amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="neft">NEFT</SelectItem>
                  <SelectItem value="rtgs">RTGS</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ref">Reference / UTR / Cheque #</Label>
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dt">Received on</Label>
            <Input id="dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rec-notes">Notes</Label>
            <Textarea id="rec-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save receipt'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── PTP dialog ────────────────────────────────────────────────────────────────

function PTPDialog({
  open, onOpenChange, collectionId, invoiceId, invoiceNumber, outstanding, onSuccess, aiWhatsappEnabled,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  collectionId: string
  invoiceId: string
  invoiceNumber: string
  outstanding: number
  onSuccess: () => void
  aiWhatsappEnabled: boolean
}) {
  const [amount, setAmount] = useState(outstanding)
  const inSevenDays = (() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  })()
  const [date, setDate] = useState(inSevenDays)
  const [notes, setNotes] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // WhatsApp-paste AI affordance state
  const [showWhatsapp, setShowWhatsapp] = useState(false)
  const [waText, setWaText] = useState('')
  const [waExtracting, setWaExtracting] = useState(false)
  const [waBanner, setWaBanner] = useState<{ intent: string; confidence: number; warnings: string[] } | null>(null)

  async function extractFromWhatsApp() {
    if (waText.trim().length < 5) { toast.error('Paste a message first'); return }
    setWaExtracting(true)
    setWaBanner(null)
    const res = await extractWhatsappPTP(waText)
    setWaExtracting(false)
    if (!res.ok) { toast.error(res.error); return }
    const d = res.data
    if (d.intent !== 'promise_to_pay') {
      // Other intents — show banner explaining we won't pre-fill
      setWaBanner({
        intent: d.intent,
        confidence: d.intent_confidence,
        warnings: [
          ...(d.intent === 'dispute' && d.dispute_reason ? [`Dispute reason: ${d.dispute_reason}`] : []),
          ...d.warnings,
        ],
      })
      toast.warning(`Detected intent: ${d.intent} — not a promise to pay`)
      return
    }
    // Apply PTP fields
    if (d.amount != null && d.amount > 0) setAmount(d.amount)
    if (d.promise_date) setDate(d.promise_date)
    const noteParts: string[] = []
    noteParts.push(`From WhatsApp: "${waText.replace(/\s+/g, ' ').trim().slice(0, 160)}${waText.length > 160 ? '…' : ''}"`)
    if (d.mode_hint && d.mode_hint !== 'unknown') noteParts.push(`Mode: ${d.mode_hint}`)
    if (d.contact_name_mentioned) noteParts.push(`Contact: ${d.contact_name_mentioned}`)
    if (d.urgency && d.urgency !== 'normal') noteParts.push(`Urgency: ${d.urgency}`)
    if (d.notes) noteParts.push(d.notes)
    setNotes(noteParts.join('\n'))
    setWaBanner({
      intent: d.intent,
      confidence: d.intent_confidence,
      warnings: d.warnings,
    })
    toast.success(`Pre-filled from WhatsApp (${(res.latency_ms / 1000).toFixed(1)}s)`)
  }

  function submit() {
    setErr(null)
    if (amount <= 0) { setErr('Amount must be greater than zero'); return }
    startTransition(async () => {
      const r = await recordPromiseToPay({
        collection_id: collectionId,
        invoice_id: invoiceId,
        amount,
        promise_date: date,
        notes: notes.trim() || undefined,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error) }
      else { toast.success(`PTP for ${invoiceNumber} recorded`); onSuccess() }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Promise to pay — {invoiceNumber}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          {aiWhatsappEnabled && (
            <div className="rounded-md border border-border bg-muted/30 p-2 flex flex-col gap-2">
              {!showWhatsapp ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start h-7 text-xs"
                  onClick={() => setShowWhatsapp(true)}
                >
                  <Sparkles className="size-3.5 mr-1.5 text-primary" />
                  Paste WhatsApp reply to pre-fill
                </Button>
              ) : (
                <>
                  <Label className="text-xs flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    Paste the buyer&apos;s WhatsApp message
                  </Label>
                  <Textarea
                    rows={3}
                    placeholder={`e.g. "Monday tak transfer kar denge. Account problem hai is week."`}
                    value={waText}
                    onChange={(e) => setWaText(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button" variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => { setShowWhatsapp(false); setWaText(''); setWaBanner(null) }}
                    >
                      Skip
                    </Button>
                    <Button
                      type="button" size="sm" className="h-7 text-xs"
                      onClick={extractFromWhatsApp}
                      disabled={waExtracting || waText.trim().length < 5}
                    >
                      {waExtracting ? 'Reading…' : 'Extract'}
                    </Button>
                  </div>
                  {waBanner && (
                    <div
                      className={`text-xs px-2 py-1.5 rounded ${
                        waBanner.intent === 'promise_to_pay'
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      <div className="font-medium">
                        Intent: {waBanner.intent.replace('_', ' ')} ({Math.round(waBanner.confidence * 100)}%)
                      </div>
                      {waBanner.warnings.length > 0 && (
                        <ul className="mt-0.5 italic">
                          {waBanner.warnings.map((w, i) => <li key={i}>· {w}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ptp-amt">Promised amount</Label>
              <Input id="ptp-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ptp-date">By date</Label>
              <Input id="ptp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ptp-notes">Notes / contact context</Label>
            <Textarea id="ptp-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record PTP'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Dunning dialog ────────────────────────────────────────────────────────────

function DunningDialog({
  open, onOpenChange, collectionId, invoiceNumber, outstanding, buyerName, buyerPhone, onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  collectionId: string
  invoiceNumber: string
  outstanding: number
  buyerName: string
  buyerPhone: string | null
  onSuccess: () => void
}) {
  const defaultMsg = `Reminder: Invoice ${invoiceNumber} for ₹${outstanding.toLocaleString('en-IN')} is overdue. Please settle at the earliest. — Vyara Tiles.`
  const [msg, setMsg] = useState(defaultMsg)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    if (!buyerPhone) { setErr('No phone number on buyer firm'); return }
    startTransition(async () => {
      const r = await sendDunningWhatsApp({
        collection_id: collectionId,
        template_key: 'vyara_dunning_v1',
        to_phone: buyerPhone,
        message_text: msg,
        invoice_number: invoiceNumber,
        amount: outstanding.toLocaleString('en-IN'),
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error) }
      else {
        toast.success(`Dunning ${r.mode === 'stub' ? '(stub) ' : ''}sent to ${buyerName}`)
        onSuccess()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send WhatsApp dunning</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            To: <span className="font-medium text-foreground">{buyerName}</span>
            {buyerPhone && <span className="ml-1 font-mono tabular-nums text-xs">({buyerPhone})</span>}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msg">Message (preview)</Label>
            <Textarea id="msg" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              In production this is sent via the AiSensy template <span className="font-mono">vyara_dunning_v1</span>.
              In dev (no AISENSY_API_KEY set), it is logged and counted as &quot;stub&quot;.
            </p>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !buyerPhone}>
              <Send className="size-3.5 mr-1.5" />
              {busy ? 'Sending…' : 'Send dunning'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Generic remark dialog (dispute/writeoff) ──────────────────────────────────

function RemarkDialog({
  open, onOpenChange, title, placeholder, confirmLabel, destructive, onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  placeholder: string
  confirmLabel?: string
  destructive?: boolean
  onSubmit: (remark: string) => Promise<void>
}) {
  const [remark, setRemark] = useState('')
  const [busy, startTransition] = useTransition()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={placeholder} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={busy || !remark.trim()}
              onClick={() => startTransition(async () => { await onSubmit(remark.trim()); setRemark('') })}
            >
              {busy ? 'Working…' : (confirmLabel ?? 'Confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
