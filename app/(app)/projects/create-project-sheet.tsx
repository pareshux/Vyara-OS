'use client'

import { useTransition } from 'react'
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
import { createProject } from '@/lib/actions/projects'

const schema = z.object({
  name: z.string().min(1, 'Project name is required'),
  segment: z.string().min(1, 'Segment is required'),
  owner_id: z.string().min(1, 'Owner is required'),
  buyer_firm_id: z.string().optional(),
  architect_firm_id: z.string().optional(),
  city: z.string().optional(),
  estimated_value: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Firm {
  id: string
  name: string
}

interface UserProfile {
  id: string
  full_name: string
}

interface CreateProjectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  firms: Firm[]
  users: UserProfile[]
  currentUserId: string
}

export function CreateProjectSheet({
  open,
  onOpenChange,
  firms,
  users,
  currentUserId,
}: CreateProjectSheetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { owner_id: currentUserId, segment: 'architect' },
  })

  const segment = watch('segment')

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createProject({
        name: values.name,
        segment: values.segment,
        owner_id: values.owner_id,
        buyer_firm_id: values.buyer_firm_id || undefined,
        architect_firm_id: values.architect_firm_id || undefined,
        city: values.city,
        estimated_value: values.estimated_value ? parseFloat(values.estimated_value) : undefined,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Project created')
      reset({ owner_id: currentUserId, segment: 'architect' })
      onOpenChange(false)
      router.push(`/projects/${result.id}`)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Project</SheetTitle>
          <SheetDescription>Create a project to track a specification opportunity.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proj_name">Project name *</Label>
            <Input id="proj_name" {...register('name')} placeholder="Shanti Township — Phase 2" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Segment *</Label>
            <Select defaultValue="architect" onValueChange={(v) => setValue('segment', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select segment…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="architect">Architect</SelectItem>
                <SelectItem value="generic">Generic</SelectItem>
              </SelectContent>
            </Select>
            {errors.segment && <p className="text-xs text-destructive">{errors.segment.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Owner *</Label>
            <Select defaultValue={currentUserId} onValueChange={(v) => setValue('owner_id', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select owner…" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.owner_id && <p className="text-xs text-destructive">{errors.owner_id.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Buyer firm</Label>
            <Select onValueChange={(v) => setValue('buyer_firm_id', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select buyer firm…" />
              </SelectTrigger>
              <SelectContent>
                {firms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {segment === 'architect' && (
            <div className="flex flex-col gap-1.5">
              <Label>Architect firm</Label>
              <Select onValueChange={(v) => setValue('architect_firm_id', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select architect firm…" />
                </SelectTrigger>
                <SelectContent>
                  {firms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proj_city">City</Label>
            <Input id="proj_city" {...register('city')} placeholder="Surat" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proj_value">Estimated value (₹)</Label>
            <Input
              id="proj_value"
              {...register('estimated_value')}
              type="number"
              min="0"
              step="1000"
              placeholder="500000"
              className="tabular-nums"
            />
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? 'Creating…' : 'Create project'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
