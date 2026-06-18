'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, XCircle, RotateCcw, UserPlus, UserX, Pencil } from 'lucide-react'
import { VehicleForm } from './vehicle-form'
import { updateVehicle, setVehicleAssignment } from '@/lib/actions/vehicles'

interface Props {
  id: string
  vehicleNumber: string
  vehicleTypeId: string
  fuelTypeId: string
  ownership: 'company' | 'personal'
  assignedUserId: string | null
  assignedUserLabel: string | null
  customRatePerKm: number | null
  makeModel: string
  notes: string
  isActive: boolean
  vehicleTypes: { id: string; label: string }[]
  fuelTypes: { id: string; label: string }[]
  users: { id: string; label: string; role: string }[]
}

export function VehicleRowActions(props: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function toggleActive() {
    startTransition(async () => {
      const r = await updateVehicle(props.id, { is_active: !props.isActive })
      if ('error' in r) toast.error(r.error)
      else { toast.success(props.isActive ? 'Deactivated' : 'Re-activated'); router.refresh() }
    })
  }

  function assignTo(userId: string | null, userLabel: string | null) {
    if (userId === props.assignedUserId) return
    startTransition(async () => {
      const r = await setVehicleAssignment({
        vehicle_id: props.id,
        user_id: userId,
        reason: 'Reassigned from vehicle row menu',
      })
      if ('error' in r) toast.error(r.error)
      else {
        toast.success(userId ? `Assigned to ${userLabel}` : 'Unassigned')
        router.refresh()
      }
    })
  }

  return (
    <div className="flex justify-end items-center gap-1">
      <VehicleForm
        mode="edit"
        vehicleTypes={props.vehicleTypes}
        fuelTypes={props.fuelTypes}
        users={props.users}
        initial={{
          id: props.id,
          vehicle_number: props.vehicleNumber,
          vehicle_type_id: props.vehicleTypeId,
          fuel_type_id: props.fuelTypeId,
          ownership: props.ownership,
          assigned_user_id: props.assignedUserId,
          custom_rate_per_km: props.customRatePerKm,
          make_model: props.makeModel,
          notes: props.notes,
        }}
        trigger={
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <Pencil className="size-3 mr-1" /> Edit
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
            Assign to
          </DropdownMenuLabel>
          {props.assignedUserId && (
            <DropdownMenuItem onClick={() => assignTo(null, null)} disabled={busy}>
              <UserX className="size-3.5 mr-2" /> Unassign
            </DropdownMenuItem>
          )}
          {props.users.map((u) => (
            <DropdownMenuItem
              key={u.id}
              onClick={() => assignTo(u.id, u.label)}
              disabled={busy || u.id === props.assignedUserId}
            >
              <UserPlus className="size-3.5 mr-2" />
              <span className="flex-1">{u.label}</span>
              <span className="ml-2 text-[10px] text-muted-foreground uppercase">{u.role}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleActive} disabled={busy}>
            {props.isActive ? <XCircle className="size-3.5 mr-2" /> : <RotateCcw className="size-3.5 mr-2" />}
            {props.isActive ? 'Deactivate' : 'Re-activate'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
