'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, XCircle, RotateCcw } from 'lucide-react'
import { VehicleTypeForm } from './type-form'
import { updateVehicleType } from '@/lib/actions/vehicle-types'

export function VehicleTypeRowActions({
  id, code, label, sortOrder, isActive, usageCount,
}: {
  id: string
  code: string
  label: string
  sortOrder: number
  isActive: boolean
  usageCount: number
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function toggleActive() {
    if (isActive && usageCount > 0) {
      const ok = confirm(`Deactivate "${label}"? ${usageCount} vehicle${usageCount === 1 ? '' : 's'} currently use this type — they'll stay assigned, but the type won't appear in new-vehicle dropdowns.`)
      if (!ok) return
    }
    startTransition(async () => {
      const r = await updateVehicleType(id, { is_active: !isActive })
      if ('error' in r) toast.error(r.error)
      else { toast.success(isActive ? 'Deactivated' : 'Re-activated'); router.refresh() }
    })
  }

  return (
    <div className="flex justify-end items-center gap-1">
      <VehicleTypeForm mode="edit" initial={{ id, code, label, sort_order: sortOrder }} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={toggleActive} disabled={busy}>
            {isActive ? <XCircle className="size-3.5 mr-2" /> : <RotateCcw className="size-3.5 mr-2" />}
            {isActive ? 'Deactivate' : 'Re-activate'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
