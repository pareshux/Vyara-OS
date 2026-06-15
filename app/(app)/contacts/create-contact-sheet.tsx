'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createContact, createFirm } from '@/lib/actions/contacts'

const FIRM_TYPES = ['Architect', 'Contractor', 'Developer', 'Dealer', 'Other'] as const

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  firm_id: z.string().optional(),
  new_firm_name: z.string().optional(),
  new_firm_type: z.string().optional(),
  role_title: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  city: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Firm {
  id: string
  name: string
  type: string
}

interface CreateContactSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  firms: Firm[]
}

export function CreateContactSheet({ open, onOpenChange, firms }: CreateContactSheetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showNewFirm, setShowNewFirm] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const firmIdValue = watch('firm_id')

  function handleFirmChange(value: string) {
    if (value === '__new__') {
      setShowNewFirm(true)
      setValue('firm_id', undefined)
    } else {
      setShowNewFirm(false)
      setValue('firm_id', value)
    }
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      let firmId = values.firm_id

      if (showNewFirm && values.new_firm_name) {
        const result = await createFirm({
          name: values.new_firm_name,
          type: values.new_firm_type ?? 'Other',
        })
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        firmId = result.id
      }

      const result = await createContact({
        full_name: values.full_name,
        firm_id: firmId,
        role_title: values.role_title,
        phone: values.phone,
        email: values.email,
        city: values.city,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Contact created')
      reset()
      setShowNewFirm(false)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Contact</SheetTitle>
          <SheetDescription>Add a specifier, buyer, or influencer to your contacts.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Full name *</Label>
            <Input id="full_name" {...register('full_name')} placeholder="Ravi Mehta" />
            {errors.full_name && (
              <p className="text-xs text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firm_select">Firm</Label>
            <Select
              value={showNewFirm ? '__new__' : (firmIdValue ?? '')}
              onValueChange={handleFirmChange}
            >
              <SelectTrigger id="firm_select" className="w-full">
                <SelectValue placeholder="Select firm…" />
              </SelectTrigger>
              <SelectContent>
                {firms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
                <SelectItem value="__new__">+ New firm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showNewFirm && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new_firm_name">Firm name *</Label>
                <Input id="new_firm_name" {...register('new_firm_name')} placeholder="Firm name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new_firm_type">Firm type</Label>
                <Select onValueChange={(v) => setValue('new_firm_type', v)}>
                  <SelectTrigger id="new_firm_type" className="w-full">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {FIRM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role_title">Role / designation</Label>
            <Input id="role_title" {...register('role_title')} placeholder="Principal Architect" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register('phone')} type="tel" placeholder="+91 98765 43210" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" {...register('email')} type="email" placeholder="ravi@firm.com" />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" {...register('city')} placeholder="Surat" />
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? 'Saving…' : 'Save contact'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
