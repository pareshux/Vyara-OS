'use client'

/**
 * Assignee picker — Phase 7b.
 * Inline dropdown on the complaint detail page. Calls assignComplaint
 * server action; auto-advances logged/triaged → assigned state.
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserCircle2 } from 'lucide-react'
import { assignComplaint } from '@/lib/actions/complaints'

export type AssigneeOption = { id: string; full_name: string; role: string }

export function AssigneePicker({
  complaintId,
  currentAssigneeId,
  options,
}: {
  complaintId: string
  currentAssigneeId: string | null
  options: AssigneeOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onChange(value: string) {
    if (value === currentAssigneeId) return
    startTransition(async () => {
      const r = await assignComplaint({ complaint_id: complaintId, assignee_id: value })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Assigned')
      router.refresh()
    })
  }

  return (
    <Select value={currentAssigneeId ?? undefined} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="h-8 text-sm w-auto min-w-44 max-w-64">
        <span className="inline-flex items-center gap-1.5">
          <UserCircle2 className="size-3.5 text-muted-foreground" />
          <SelectValue placeholder="Unassigned — pick an engineer" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <span className="font-medium">{u.full_name}</span>
            <span className="text-xs text-muted-foreground ml-2">{u.role.replace('_', ' ')}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
