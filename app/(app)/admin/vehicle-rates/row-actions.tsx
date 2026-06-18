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
import { MoreHorizontal, XCircle, Pencil } from 'lucide-react'
import { RateForm } from './rate-form'
import { clearReimbursementRate } from '@/lib/actions/vehicle-rates'

export function RateRowActions({
  vehicleTypeId,
  fuelTypeId,
  vehicleTypeLabel,
  fuelTypeLabel,
  currentRate,
  currentNotes,
}: {
  vehicleTypeId: string
  fuelTypeId: string
  vehicleTypeLabel: string
  fuelTypeLabel: string
  currentRate: number
  currentNotes: string
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function clear() {
    const ok = confirm(
      `Clear the rate for ${vehicleTypeLabel} + ${fuelTypeLabel}? Claims for these vehicles will fall back to per-vehicle override or require manual entry.`,
    )
    if (!ok) return
    startTransition(async () => {
      const r = await clearReimbursementRate({
        vehicle_type_id: vehicleTypeId,
        fuel_type_id: fuelTypeId,
      })
      if ('error' in r) toast.error(r.error)
      else { toast.success('Rate cleared'); router.refresh() }
    })
  }

  return (
    <div className="flex justify-end items-center gap-1">
      <RateForm
        mode="update"
        vehicleTypes={[]}
        fuelTypes={[]}
        fixedVehicleTypeId={vehicleTypeId}
        fixedFuelTypeId={fuelTypeId}
        fixedTypeLabel={vehicleTypeLabel}
        fixedFuelLabel={fuelTypeLabel}
        initialRate={currentRate}
        initialNotes={currentNotes}
        trigger={
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <Pencil className="size-3 mr-1" /> Update
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={clear} disabled={busy}>
            <XCircle className="size-3.5 mr-2" /> Clear rate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
