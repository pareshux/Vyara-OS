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
import { DealerTierForm } from './tier-form'
import { updateDealerTier } from '@/lib/actions/dealer-tiers'

export function DealerTierRowActions({
  id, code, label, color, bg_color, sortOrder, notes, isActive, usageCount,
}: {
  id: string
  code: string
  label: string
  color: string
  bg_color: string
  sortOrder: number
  notes: string
  isActive: boolean
  usageCount: number
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function toggleActive() {
    if (isActive && usageCount > 0) {
      const ok = confirm(`Deactivate "${label}"? ${usageCount} dealer${usageCount === 1 ? '' : 's'} currently use this tier — their badge will fall back to plain text until reassigned.`)
      if (!ok) return
    }
    startTransition(async () => {
      const r = await updateDealerTier(id, { is_active: !isActive })
      if ('error' in r) toast.error(r.error)
      else { toast.success(isActive ? 'Deactivated' : 'Re-activated'); router.refresh() }
    })
  }

  return (
    <div className="flex justify-end items-center gap-1">
      <DealerTierForm
        mode="edit"
        initial={{ id, code, label, color, bg_color, sort_order: sortOrder, notes }}
      />
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
