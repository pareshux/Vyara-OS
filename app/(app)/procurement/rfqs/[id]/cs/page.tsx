/**
 * /procurement/rfqs/[id]/cs — Comparative Statement.
 *
 * Vendor × Line matrix showing rate / total / delivery per vendor.
 * Per-line L1/L2/L3 designation. User picks a vendor per line, can
 * override L1 with a justification, then finalises → flips RFQ to
 * cs_finalised. From there, "Create PO from CS" creates the PO with
 * the selected rates + sets rfq.linked_po_id + flips rfq.status.
 *
 * Multi-vendor PO is the v1 simplification — if multiple vendors are
 * selected (different vendors picked across lines), the user picks ONE
 * vendor to create the PO for (the others stay marked is_selected for
 * audit but don't get their own PO yet). P4δ would add multi-PO from
 * one CS.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getRfq } from '@/lib/actions/rfqs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CsForm } from './form'
import { ChevronLeft, BarChart3 } from 'lucide-react'

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ComparativeStatementPage({ params }: PageProps) {
  const { id } = await params
  const rfq = await getRfq(id)
  if (!rfq) notFound()
  if (!['sent', 'quotes_collected', 'cs_finalised'].includes(rfq.status)) {
    redirect(`/procurement/rfqs/${id}`)
  }

  // Build matrix: per line, per vendor — the response (or null)
  const respByLineAndVendor = new Map<string, Map<string, typeof rfq.responses[number]>>()
  for (const r of rfq.responses) {
    if (!respByLineAndVendor.has(r.rfq_line_id)) respByLineAndVendor.set(r.rfq_line_id, new Map())
    respByLineAndVendor.get(r.rfq_line_id)!.set(r.vendor_id, r)
  }

  // Compute L1 (lowest amount_total) per line for display
  function l1ForLine(lineId: string): string | null {
    const vmap = respByLineAndVendor.get(lineId)
    if (!vmap) return null
    let l1VendorId: string | null = null
    let minTotal = Infinity
    for (const [vendorId, resp] of vmap) {
      if (resp.amount_total != null && resp.amount_total < minTotal) {
        minTotal = resp.amount_total
        l1VendorId = vendorId
      }
    }
    return l1VendorId
  }

  // Pre-existing selections (when CS already finalised)
  const initialSelections = new Map<string, string>()  // lineId → vendorId
  for (const r of rfq.responses) {
    if (r.is_selected) initialSelections.set(r.rfq_line_id, r.vendor_id)
  }

  const isFinalised = rfq.status === 'cs_finalised' || rfq.status === 'po_raised'
  const canCreatePo = isFinalised && !rfq.linked_po_id

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/procurement/rfqs/${id}`} className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> {rfq.rfq_number}
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
          <BarChart3 className="size-5" /> Comparative Statement · <span className="font-mono">{rfq.rfq_number}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a vendor per line. L1 (lowest landed cost) auto-highlights; override with a justification if you pick L2/L3.
          {isFinalised && <span className="text-emerald-700 font-medium ml-1"> · CS already finalised.</span>}
        </p>
      </div>

      {rfq.responses.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">No responses recorded yet. Record at least one vendor&apos;s quote first.</div>
          </CardContent>
        </Card>
      ) : (
        <CsForm
          rfqId={id}
          rfqStatus={rfq.status}
          lines={rfq.lines}
          vendors={rfq.vendors}
          responses={rfq.responses}
          l1ByLine={Object.fromEntries(rfq.lines.map((l) => [l.id, l1ForLine(l.id)]))}
          initialSelections={Object.fromEntries(initialSelections)}
          canCreatePo={canCreatePo}
          linkedPoId={rfq.linked_po_id}
          linkedPoNumber={rfq.linked_po_number}
        />
      )}

      {/* Vendor totals summary */}
      {rfq.responses.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="text-sm font-medium">Per-vendor grand total</div>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Vendor</th>
                    <th className="text-right px-2 py-2 font-medium">Lines responded</th>
                    <th className="text-right px-2 py-2 font-medium">Avg delivery (days)</th>
                    <th className="text-right px-2 py-2 font-medium">Quote total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.vendors.map((v) => {
                    const vresps = rfq.responses.filter((r) => r.vendor_id === v.vendor_id)
                    const total = vresps.reduce((s, r) => s + (r.amount_total ?? 0), 0)
                    const deliveryDays = vresps.filter((r) => r.delivery_days != null).map((r) => r.delivery_days!)
                    const avgDelivery = deliveryDays.length > 0 ? Math.round(deliveryDays.reduce((s, d) => s + d, 0) / deliveryDays.length) : null
                    return (
                      <tr key={v.id} className="border-t border-border">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{v.vendor_code}</span>
                            <span>{v.vendor_name}</span>
                            {!v.responded_at && <Badge variant="outline" className="bg-muted text-[10px]">No response</Badge>}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{vresps.length}/{rfq.lines.length}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{avgDelivery ?? '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-medium">{total > 0 ? `₹${formatINR(total)}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
