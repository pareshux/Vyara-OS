'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { UserPlus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addProjectStakeholder } from '@/lib/actions/projects'

const ROLE_LABELS: Record<string, string> = {
  specifier: 'Specifier',
  buyer: 'Buyer',
  influencer: 'Influencer',
  decision_maker: 'Decision Maker',
  contractor: 'Contractor',
}

const schema = z.object({
  contact_id: z.string().min(1, 'Select a contact'),
  role: z.enum(['specifier', 'buyer', 'influencer', 'decision_maker', 'contractor']),
  is_primary: z.boolean().optional(),
})

type FormValues = z.infer<typeof schema>

interface Contact {
  id: string
  full_name: string
  role_title: string | null
  firm: { name: string } | null
}

interface Stakeholder {
  role: string
  is_primary: boolean
  contact: {
    full_name: string
    role_title: string | null
    phone: string | null
    firm: { name: string } | null
  } | null
}

interface StakeholdersTabProps {
  projectId: string
  stakeholders: Stakeholder[]
  contacts: Contact[]
}

export function StakeholdersTab({ projectId, stakeholders, contacts }: StakeholdersTabProps) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'specifier', is_primary: false },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await addProjectStakeholder({
        project_id: projectId,
        contact_id: values.contact_id,
        role: values.role,
        is_primary: values.is_primary,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Stakeholder added')
      reset({ role: 'specifier', is_primary: false })
      setSheetOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          People involved in this project and their roles.
        </p>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <UserPlus className="size-3.5 mr-1.5" />
          Add stakeholder
        </Button>
      </div>

      {stakeholders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <UserPlus className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No stakeholders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the specifier, buyer, and other key contacts on this project.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
            Add stakeholder
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Role</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Firm</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Phone</th>
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.contact?.full_name ?? '—'}</div>
                    {s.contact?.role_title && (
                      <div className="text-xs text-muted-foreground">{s.contact.role_title}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {ROLE_LABELS[s.role] ?? s.role}
                      {s.is_primary && <CheckCircle2 className="size-3 ml-1 text-primary" />}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {s.contact?.firm?.name ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground tabular-nums lg:table-cell">
                    {s.contact?.phone ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add stakeholder</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Contact *</Label>
              <Controller
                control={control}
                name="contact_id"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select contact…" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-medium">{c.full_name}</span>
                          {c.firm && (
                            <span className="ml-1.5 text-muted-foreground text-xs">
                              · {c.firm.name}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.contact_id && (
                <p className="text-xs text-destructive">{errors.contact_id.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Role *</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select role…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="specifier">Specifier — designs/specifies the product</SelectItem>
                      <SelectItem value="buyer">Buyer — places the order and pays</SelectItem>
                      <SelectItem value="influencer">Influencer — site engineer, recommends</SelectItem>
                      <SelectItem value="decision_maker">Decision Maker — final approval</SelectItem>
                      <SelectItem value="contractor">Contractor — executes the work</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && (
                <p className="text-xs text-destructive">{errors.role.message}</p>
              )}
            </div>

            <Controller
              control={control}
              name="is_primary"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <input
                    id="is_primary"
                    type="checkbox"
                    checked={field.value ?? false}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="size-4 rounded border-border accent-primary cursor-pointer"
                  />
                  <Label htmlFor="is_primary" className="font-normal cursor-pointer">
                    Primary contact for this role
                  </Label>
                </div>
              )}
            />

            <SheetFooter className="px-0 pt-2">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Adding…' : 'Add stakeholder'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
