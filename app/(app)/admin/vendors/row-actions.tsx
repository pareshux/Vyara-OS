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
import { VendorForm } from './vendor-form'
import { updateVendor, type VendorType, type MsmeStatus } from '@/lib/actions/vendors'

export function VendorRowActions({
  id, code, name, vendor_type, gstin, pan, msme_status, msme_udyam_no,
  bank_account_no, bank_ifsc, bank_name, payment_terms_days, address,
  contact_name, phone, email, notes, isActive,
}: {
  id: string
  code: string
  name: string
  vendor_type: VendorType
  gstin: string
  pan: string
  msme_status: MsmeStatus | ''
  msme_udyam_no: string
  bank_account_no: string
  bank_ifsc: string
  bank_name: string
  payment_terms_days: number
  address: string
  contact_name: string
  phone: string
  email: string
  notes: string
  isActive: boolean
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function toggleActive() {
    startTransition(async () => {
      const r = await updateVendor(id, { is_active: !isActive })
      if ('error' in r) toast.error(r.error)
      else { toast.success(isActive ? 'Deactivated' : 'Re-activated'); router.refresh() }
    })
  }

  return (
    <div className="flex justify-end items-center gap-1">
      <VendorForm
        mode="edit"
        initial={{
          id, code, name, vendor_type, gstin, pan, msme_status, msme_udyam_no,
          bank_account_no, bank_ifsc, bank_name, payment_terms_days, address,
          contact_name, phone, email, notes,
        }}
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
