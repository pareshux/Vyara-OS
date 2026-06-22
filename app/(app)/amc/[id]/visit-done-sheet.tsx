'use client'

/**
 * AmcVisitDoneSheet — replaces the one-click "Mark done" form-action
 * with a proper completion capture form. Required: service notes.
 * Optional: customer sign-off contact, additional findings.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2 } from 'lucide-react'
import { markAmcVisitDone } from '@/lib/actions/amc'

const schema = z.object({
  notes: z.string().min(5, 'Service notes are required (at least 5 chars — what was done)'),
  confirmed_by_contact_id: z.string().optional(),
  extra: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export type ContactOption = { id: string; full_name: string; role_title: string | null }

export function AmcVisitDoneSheet({
  visitId,
  visitNumber,
  scheduledDate,
  contacts,
}: {
  visitId: string
  visitNumber: number
  scheduledDate: string
  contacts: ContactOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } =
    useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = (v: FormValues) => {
    startTransition(async () => {
      // Combine service notes + extra findings into a single notes string
      const fullNotes = v.extra?.trim()
        ? `${v.notes.trim()}\n\nObservations: ${v.extra.trim()}`
        : v.notes.trim()

      const r = await markAmcVisitDone({
        visit_id: visitId,
        notes: fullNotes,
        confirmed_by_contact_id: v.confirmed_by_contact_id || null,
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`Visit #${visitNumber} marked done`)
      reset()
      setOpen(false)
      router.refresh()
    })
  }

  const niceDate = new Date(scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <CheckCircle2 className="size-3.5 mr-1" />
          Mark done
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Complete visit #{visitNumber}</SheetTitle>
          <SheetDescription>Scheduled {niceDate}. Capture what was actually done and who signed off.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 flex-1 px-1 py-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Service notes <span className="text-destructive">*</span></Label>
            <Textarea
              id="notes"
              {...register('notes')}
              rows={5}
              placeholder="Routine preventive maintenance — checked panel temperature, cleaned air filters, tightened cable terminations, oil sample taken for transformer. All parameters in spec."
            />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
            <p className="text-[11px] text-muted-foreground">What was actually done. Becomes the audit record + future reference for the next visit.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Confirmed by (customer sign-off)</Label>
            {contacts.length > 0 ? (
              <Select value={watch('confirmed_by_contact_id') ?? ''} onValueChange={(v) => setValue('confirmed_by_contact_id', v)}>
                <SelectTrigger><SelectValue placeholder="Pick customer contact who signed off…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                      {c.role_title ? <span className="text-muted-foreground text-xs"> · {c.role_title}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground italic px-2 py-1.5 rounded border border-dashed border-border">
                No contacts on file for this customer. Add a contact in the customer&apos;s profile first to record sign-off.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">Optional but recommended — captures the customer rep who confirmed the work.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="extra">Observations / next-visit notes</Label>
            <Textarea
              id="extra"
              {...register('extra')}
              rows={3}
              placeholder="Cable tray 3 needs paint touch-up next month. Customer mentioned planning UPS upgrade in Q4."
            />
            <p className="text-[11px] text-muted-foreground">Optional — anything the next engineer should know.</p>
          </div>
        </form>

        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={() => { reset(); setOpen(false) }} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isPending}>
            {isPending ? 'Recording…' : 'Mark done'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
