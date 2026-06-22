/**
 * /procurement/grns/[id]/return — create an RTV against a posted GRN.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getGrnForReturn } from '@/lib/actions/return-to-vendor'
import { Card, CardContent } from '@/components/ui/card'
import { ReturnToVendorForm } from './form'
import { ChevronLeft, AlertCircle } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CreateRtvPage({ params }: PageProps) {
  const { id } = await params
  const grn = await getGrnForReturn(id)
  if (!grn) notFound()

  if (grn.status !== 'posted') {
    redirect(`/procurement/grns/${id}`)
  }

  const anyReturnable = grn.lines.some((l) => l.qty_returnable > 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/procurement/grns/${id}`} className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> {grn.grn_number}
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">Return to vendor · against {grn.grn_number}</h1>
        <p className="text-sm text-muted-foreground">
          To <span className="font-medium text-foreground">{grn.vendor_name}</span> · from <span className="font-medium text-foreground">{grn.warehouse_name}</span>.
          Posting reverses qty on the PO line, recomputes parent PO status, and writes a negative stock_movement for product-linked lines.
          A debit note is implied; record the vendor&apos;s credit note number when it arrives.
        </p>
      </div>

      {!anyReturnable ? (
        <Card>
          <CardContent className="flex items-start gap-2 text-sm">
            <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-foreground">Nothing left to return</div>
              <div className="text-muted-foreground">
                Every accepted qty on this GRN has already been returned via prior RTVs.
              </div>
              <div className="mt-2">
                <Link href={`/procurement/grns/${id}`} className="text-primary hover:underline text-sm">← Back to {grn.grn_number}</Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ReturnToVendorForm grn={grn} />
      )}
    </div>
  )
}
