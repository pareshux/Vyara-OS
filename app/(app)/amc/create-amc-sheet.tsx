'use client'

/**
 * Create-AMC bottom sheet — Phase 7c.
 */

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { createAmcContract } from '@/lib/actions/amc'

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  scope: z.string().optional(),
  firm_id: z.string().min(1, 'Customer is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  value: z.string().refine((s) => !isNaN(Number(s)) && Number(s) >= 0, 'Value must be ≥0'),
  visit_frequency: z.enum(['monthly', 'quarterly', 'bi_annual', 'annual', 'custom']),
  activate: z.boolean(),
}).refine((d) => new Date(d.end_date) > new Date(d.start_date), {
  message: 'End date must be after start date', path: ['end_date'],
})

type FormValues = z.infer<typeof schema>

export type FirmOption = { value: string; label: string }

export function CreateAmcSheet({ firms }: { firms: FirmOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Sensible defaults: today + 1 year, quarterly, activate immediately
  const today = new Date().toISOString().slice(0, 10)
  const oneYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        start_date: today, end_date: oneYear,
        visit_frequency: 'quarterly', activate: true, value: '0',
      },
    })

  const onSubmit = (v: FormValues) => {
    startTransition(async () => {
      const r = await createAmcContract({
        title: v.title,
        scope: v.scope,
        firm_id: v.firm_id,
        start_date: v.start_date,
        end_date: v.end_date,
        value: Number(v.value),
        visit_frequency: v.visit_frequency,
        activate: v.activate,
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`AMC ${r.data.contract_number} created · ${r.data.visits_scheduled} visits scheduled`)
      reset()
      setOpen(false)
      router.push(`/amc/${r.data.id}`)
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> New AMC</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Create AMC contract</SheetTitle>
          <SheetDescription>
            On activation, scheduled visits are auto-generated evenly across the period based on the chosen frequency.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 flex-1 px-1 py-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input id="title" {...register('title')} placeholder="Anand Pharma — Plant 2 Electrical AMC" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scope">Scope</Label>
            <Textarea id="scope" {...register('scope')} rows={3} placeholder="What's covered: preventive maintenance, thermal scans, oil sampling, breakdown response…" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Customer <span className="text-destructive">*</span></Label>
            <Select value={watch('firm_id') ?? ''} onValueChange={(v) => setValue('firm_id', v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Choose customer…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {firms.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.firm_id && <p className="text-xs text-destructive">{errors.firm_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_date">Start date <span className="text-destructive">*</span></Label>
              <Input id="start_date" type="date" {...register('start_date')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="end_date">End date <span className="text-destructive">*</span></Label>
              <Input id="end_date" type="date" {...register('end_date')} />
              {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="value">Contract value (₹)</Label>
              <Input id="value" type="number" step="1" {...register('value')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Visit frequency</Label>
              <Select value={watch('visit_frequency')} onValueChange={(v) => setValue('visit_frequency', v as FormValues['visit_frequency'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly (12/yr)</SelectItem>
                  <SelectItem value="quarterly">Quarterly (4/yr)</SelectItem>
                  <SelectItem value="bi_annual">Bi-annual (2/yr)</SelectItem>
                  <SelectItem value="annual">Annual (1/yr)</SelectItem>
                  <SelectItem value="custom">Custom (no auto-schedule)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={watch('activate')}
              onChange={(e) => setValue('activate', e.target.checked)}
              className="size-4 rounded border-border"
            />
            <span>Activate immediately (skip draft state, auto-generate visit schedule)</span>
          </label>
        </form>

        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={() => { reset(); setOpen(false) }} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isPending}>{isPending ? 'Creating…' : 'Create AMC'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
