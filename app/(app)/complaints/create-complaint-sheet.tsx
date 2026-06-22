'use client'

/**
 * Create-complaint bottom sheet — Phase 7b.
 * Server-action wrapper around lib/actions/complaints.createComplaint.
 * Dropdowns hydrated by parent server component.
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
import { createComplaint } from '@/lib/actions/complaints'

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type_code: z.string().min(1, 'Type is required'),
  severity_code: z.string().min(1, 'Severity is required'),
  firm_id: z.string().min(1, 'Customer is required'),
})

type FormValues = z.infer<typeof schema>

export type DropdownOption = { value: string; label: string }

export function CreateComplaintSheet({
  firms, types, severities,
}: {
  firms: DropdownOption[]
  types: DropdownOption[]
  severities: DropdownOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } =
    useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { severity_code: 'medium' } })

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const r = await createComplaint({
        title: values.title,
        description: values.description ?? null,
        type_code: values.type_code,
        severity_code: values.severity_code,
        firm_id: values.firm_id,
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(`Complaint ${r.data.complaint_number} logged`)
      reset()
      setOpen(false)
      router.push(`/complaints/${r.data.id}`)
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" /> New complaint</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Log a complaint</SheetTitle>
          <SheetDescription>Capture what the customer told you. You can assign + advance state after.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 flex-1 px-1 py-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input id="title" {...register('title')} placeholder="HT switchgear tripped repeatedly" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">What happened</Label>
            <Textarea id="description" {...register('description')} rows={4} placeholder="Initial details: when, where, what the customer observed…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={watch('type_code') ?? ''} onValueChange={(v) => setValue('type_code', v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.type_code && <p className="text-xs text-destructive">{errors.type_code.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Severity <span className="text-destructive">*</span></Label>
              <Select value={watch('severity_code') ?? 'medium'} onValueChange={(v) => setValue('severity_code', v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {severities.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.severity_code && <p className="text-xs text-destructive">{errors.severity_code.message}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Customer (firm) <span className="text-destructive">*</span></Label>
            <Select value={watch('firm_id') ?? ''} onValueChange={(v) => setValue('firm_id', v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Choose customer…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {firms.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.firm_id && <p className="text-xs text-destructive">{errors.firm_id.message}</p>}
          </div>
        </form>

        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={() => { reset(); setOpen(false) }} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isPending}>{isPending ? 'Logging…' : 'Log complaint'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
