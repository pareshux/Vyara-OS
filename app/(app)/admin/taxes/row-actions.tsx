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
import { MoreHorizontal, Star, XCircle, RotateCcw } from 'lucide-react'
import { TaxRateForm } from './tax-rate-form'
import { updateTaxRate, setDefaultTaxRate } from '@/lib/actions/masters'

export function TaxRateRowActions({
  id, label, rate, sortOrder, notes, isDefault, isActive,
}: {
  id: string
  label: string
  rate: number
  sortOrder: number
  notes: string
  isDefault: boolean
  isActive: boolean
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function makeDefault() {
    startTransition(async () => {
      const r = await setDefaultTaxRate(id)
      if ('error' in r) toast.error(r.error)
      else { toast.success(`${label} is now the default`); router.refresh() }
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const r = await updateTaxRate(id, { is_active: !isActive })
      if ('error' in r) toast.error(r.error)
      else { toast.success(isActive ? 'Deactivated' : 'Re-activated'); router.refresh() }
    })
  }

  return (
    <div className="flex justify-end items-center gap-1">
      <TaxRateForm
        mode="edit"
        initial={{ id, code: '', label, rate_pct: rate, sort_order: sortOrder, notes, is_default: isDefault }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isDefault && isActive && (
            <DropdownMenuItem onClick={makeDefault} disabled={busy}>
              <Star className="size-3.5 mr-2" /> Make default
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={toggleActive} disabled={busy}>
            {isActive ? <XCircle className="size-3.5 mr-2" /> : <RotateCcw className="size-3.5 mr-2" />}
            {isActive ? 'Deactivate' : 'Re-activate'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
