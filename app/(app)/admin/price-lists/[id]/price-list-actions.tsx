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
import { Star, XCircle, RotateCcw, MoreHorizontal } from 'lucide-react'
import { updatePriceList, setDefaultPriceList } from '@/lib/actions/price-lists'

export function PriceListActions({
  priceListId, isActive, isDefault,
}: { priceListId: string; isActive: boolean; isDefault: boolean }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function makeDefault() {
    startTransition(async () => {
      const r = await setDefaultPriceList(priceListId)
      if ('error' in r) toast.error(r.error)
      else { toast.success('Now the tenant default'); router.refresh() }
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const r = await updatePriceList(priceListId, { is_active: !isActive })
      if ('error' in r) toast.error(r.error)
      else { toast.success(isActive ? 'Deactivated' : 'Re-activated'); router.refresh() }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isDefault && isActive && (
          <DropdownMenuItem onClick={makeDefault} disabled={busy}>
            <Star className="size-3.5 mr-2" /> Make tenant default
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={toggleActive} disabled={busy}>
          {isActive ? <XCircle className="size-3.5 mr-2" /> : <RotateCcw className="size-3.5 mr-2" />}
          {isActive ? 'Deactivate' : 'Re-activate'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
