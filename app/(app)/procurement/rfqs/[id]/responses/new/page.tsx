/**
 * /procurement/rfqs/[id]/responses/new?vendor=X — capture a vendor's
 * response to one of our RFQs.
 *
 * In real life this happens when the vendor emails / WhatsApps their
 * quote PDF; accounts types it in. P5γ may add OCR for PDF parsing.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getRfq } from '@/lib/actions/rfqs'
import { ResponseForm } from './form'
import { ChevronLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vendor?: string }>
}

export default async function NewRfqResponsePage({ params, searchParams }: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  if (!sp.vendor) redirect(`/procurement/rfqs/${id}`)

  const rfq = await getRfq(id)
  if (!rfq) notFound()
  const vendor = rfq.vendors.find((v) => v.vendor_id === sp.vendor)
  if (!vendor) notFound()
  if (!['sent', 'quotes_collected'].includes(rfq.status)) redirect(`/procurement/rfqs/${id}`)

  // Pre-populate any existing per-line responses for this vendor (edit mode)
  const existingByLineId = new Map(
    rfq.responses.filter((r) => r.vendor_id === sp.vendor).map((r) => [r.rfq_line_id, r]),
  )

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/procurement/rfqs/${id}`} className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> {rfq.rfq_number}
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Record response · <span className="font-mono text-base">{vendor.vendor_code}</span> · {vendor.vendor_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Type in the vendor&apos;s quote details — per-line rate, GST, delivery days. Once 2+ vendors respond you can open the Comparative Statement.
        </p>
      </div>

      <ResponseForm
        rfqId={id}
        vendor={{
          id: vendor.vendor_id,
          name: vendor.vendor_name,
          code: vendor.vendor_code,
          existing_quote_no: vendor.vendor_quote_no,
          existing_quote_date: vendor.vendor_quote_date,
          existing_quote_validity: vendor.vendor_quote_validity,
          existing_payment_terms_days: vendor.payment_terms_days,
          existing_delivery_terms: vendor.delivery_terms,
          existing_notes: vendor.notes,
        }}
        lines={rfq.lines.map((l) => {
          const existing = existingByLineId.get(l.id)
          return {
            id: l.id,
            line_no: l.line_no,
            description: l.description,
            unit: l.unit,
            quantity: l.quantity,
            hsn_code: l.hsn_code,
            existing_rate: existing?.rate ?? null,
            existing_discount: existing?.discount_pct ?? null,
            existing_gst: existing?.gst_rate_pct ?? null,
            existing_delivery_days: existing?.delivery_days ?? null,
            existing_notes: existing?.notes ?? null,
          }
        })}
      />
    </div>
  )
}
