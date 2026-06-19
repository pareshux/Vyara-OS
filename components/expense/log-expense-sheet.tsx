'use client'

/**
 * LogExpenseSheet — capture a single expense line item.
 *
 * Flow: tap "Log expense" → bottom sheet → pick category, enter amount,
 * date defaults to today, optional notes → tap "Save & attach receipt"
 * → creates a draft expense row → uploads receipt photo via the
 * attachment framework against (entity_type='expense', kind='receipt')
 * → on Submit, the engine raises an approval request if a policy
 * matches the amount band; else auto-approves.
 *
 * Used from `/expenses` (top-level) and inside visit cards
 * (subject_type='field_visit', subject_id=visit.id). The subject
 * params are optional — when present the expense ties to the visit
 * and shows up in the visit's read-model.
 */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Receipt, Loader2 } from 'lucide-react'
import {
  createExpense,
  submitExpense,
  cancelExpenseDraft,
  listExpenseCategories,
  type ExpenseCategory,
} from '@/lib/actions/expenses'
import { AttachmentUploadButton } from '@/components/attachment/upload-button'
import { AttachmentList } from '@/components/attachment/list'

type Step = 'capture' | 'receipt' | 'submitting'

function todayInIST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
}

export function LogExpenseSheet({
  tenantId,
  triggerLabel = 'Log expense',
  triggerVariant = 'outline',
  triggerSize = 'sm',
  triggerClassName,
  subjectType,
  subjectId,
  onSubmitted,
}: {
  tenantId: string
  triggerLabel?: string
  triggerVariant?: React.ComponentProps<typeof Button>['variant']
  triggerSize?: React.ComponentProps<typeof Button>['size']
  triggerClassName?: string
  subjectType?: 'field_visit' | 'project' | 'lead' | 'firm'
  subjectId?: string
  onSubmitted?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('capture')

  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [categoryId, setCategoryId] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [expenseDate, setExpenseDate] = useState<string>(todayInIST())
  const [notes, setNotes] = useState<string>('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [attachKey, setAttachKey] = useState(0)
  const [busy, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    listExpenseCategories().then((r) => {
      if (!r.ok) { toast.error(r.error); return }
      setCategories(r.categories)
    })
  }, [open])

  function reset() {
    setStep('capture')
    setCategoryId('')
    setAmount('')
    setExpenseDate(todayInIST())
    setNotes('')
    setDraftId(null)
    setAttachKey(0)
  }

  function handleClose(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      // If we have a draft but didn't submit, soft-cancel it so we
      // don't litter the DB with abandoned drafts.
      if (draftId && step !== 'submitting') {
        cancelExpenseDraft(draftId).catch(() => {})
      }
      reset()
    }
  }

  function saveDraftAndAdvance() {
    if (!categoryId) { toast.error('Pick a category'); return }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter an amount'); return }
    if (!expenseDate) { toast.error('Pick a date'); return }

    startTransition(async () => {
      const r = await createExpense({
        categoryId,
        amount: amt,
        expenseDate,
        notes: notes.trim() || null,
        subjectType: subjectType ?? null,
        subjectId: subjectId ?? null,
      })
      if (!r.ok) { toast.error(r.error); return }
      setDraftId(r.expenseId)
      setStep('receipt')
    })
  }

  function submit() {
    if (!draftId) return
    setStep('submitting')
    startTransition(async () => {
      const r = await submitExpense(draftId)
      if (!r.ok) {
        toast.error(r.error)
        setStep('receipt')
        return
      }
      toast.success(
        r.status === 'approved'
          ? `Expense approved (₹${amount})`
          : r.status === 'submitted'
            ? 'Expense submitted for approval'
            : 'Expense saved',
      )
      // Cleared — the draftId is now a submitted/approved row that
      // shouldn't be cancelled on close.
      setDraftId(null)
      setOpen(false)
      reset()
      onSubmitted?.()
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          <Receipt className="size-4 mr-1.5" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[88vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {step === 'capture' && 'Log an expense'}
            {step === 'receipt' && 'Attach receipt'}
            {step === 'submitting' && 'Submitting…'}
          </SheetTitle>
        </SheetHeader>

        {step === 'capture' && (
          <div className="flex flex-col gap-3 mt-3">
            {/* Category grid (touch-friendly, no select) */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Category</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {categories.map((c) => {
                  const active = categoryId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors text-left ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted/30'
                      }`}
                    >
                      <p className="truncate">{c.label}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Amount + date */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount" className="text-xs">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 450"
                  className="h-11 text-base tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edate" className="text-xs">Date</Label>
                <Input
                  id="edate"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="h-11 text-base tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enotes" className="text-xs">Notes <span className="text-muted-foreground">— optional</span></Label>
              <Textarea
                id="enotes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. dinner with architect Sharma"
              />
            </div>

            <SheetFooter>
              <Button onClick={saveDraftAndAdvance} disabled={busy} className="w-full sm:w-auto">
                {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                {busy ? 'Saving…' : 'Save & attach receipt'}
              </Button>
            </SheetFooter>
          </div>
        )}

        {step === 'receipt' && draftId && (
          <div className="flex flex-col gap-3 mt-3">
            <p className="text-xs text-muted-foreground">
              Snap the receipt now — keeps your claim clean later. You can skip and submit anyway.
            </p>
            <div className="flex flex-wrap gap-2">
              <AttachmentUploadButton
                tenantId={tenantId}
                entityType="expense"
                entityId={draftId}
                kind="receipt"
                label="Snap receipt"
                onUploaded={() => setAttachKey((k) => k + 1)}
              />
            </div>
            <AttachmentList
              entityType="expense"
              entityId={draftId}
              refreshKey={attachKey}
              emptyLabel={null}
            />
            <SheetFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleClose(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                {busy ? 'Submitting…' : 'Submit expense'}
              </Button>
            </SheetFooter>
          </div>
        )}

        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Submitting your expense…</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
