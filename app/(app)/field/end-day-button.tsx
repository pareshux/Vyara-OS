'use client'

import { useState } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { CheckOutCard } from './check-out-card'

/**
 * "End my day" button that opens the CheckOutCard in a sheet. Keeps the
 * personal /field page focused on the plan + visits during the day; the
 * full check-out form only appears when the rep deliberately ends the day.
 */
export function EndDayButton({
  checkInOdometerKm,
  vehicleEffectiveRate,
  autoApproveThresholdRupees,
  tenantId,
}: {
  checkInOdometerKm: number | null
  vehicleEffectiveRate: number | null
  autoApproveThresholdRupees: number
  tenantId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-10 w-full">
          <LogOut className="size-4 mr-2" /> End my day
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>End the day</SheetTitle>
        </SheetHeader>
        <div className="mt-4 max-w-md mx-auto">
          <CheckOutCard
            checkInOdometerKm={checkInOdometerKm}
            vehicleEffectiveRate={vehicleEffectiveRate}
            autoApproveThresholdRupees={autoApproveThresholdRupees}
            tenantId={tenantId}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
