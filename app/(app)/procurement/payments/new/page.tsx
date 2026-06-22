/**
 * /procurement/payments/new — book a new vendor payment.
 *
 * Two modes:
 *   1. ?vendor=<id> — pre-bound to a vendor. Lists their outstanding
 *      bills with checkboxes + allocation amounts.
 *   2. No vendor param — vendor picker. Shows vendors with outstanding
 *      balances + how many bills.
 *
 * Multi-bill payment is the default flow (one vendor, N bills).
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  listVendorsWithOutstanding,
  getBillsForPayment,
} from '@/lib/actions/vendor-payments'
import { Card, CardContent } from '@/components/ui/card'
import { NewVendorPaymentForm } from './form'
import { ChevronLeft, Banknote, AlertCircle } from 'lucide-react'

function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}

interface PageProps {
  searchParams: Promise<{ vendor?: string; bill?: string }>
}

export default async function NewVendorPaymentPage({ searchParams }: PageProps) {
  const sp = await searchParams

  // Resolve vendor from ?bill= if vendor missing — find the bill's vendor
  if (sp.bill && !sp.vendor) {
    // Best-effort redirect — the form lookup will validate
    redirect(`/procurement/payments/new?bill=${sp.bill}`)
  }

  if (!sp.vendor) {
    const vendors = (await listVendorsWithOutstanding()).filter((v) => v.outstanding > 0)
    return (
      <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/procurement/payments" className="hover:text-foreground inline-flex items-center gap-0.5">
            <ChevronLeft className="size-3.5" /> Payments
          </Link>
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">New payment</h1>
          <p className="text-sm text-muted-foreground">Pick the vendor you&apos;re paying.</p>
        </div>

        {vendors.length === 0 ? (
          <Card>
            <CardContent className="flex items-start gap-2 text-sm">
              <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">No outstanding bills</div>
                <div className="text-muted-foreground">
                  Approve some vendor bills first — payments are booked against approved or partly-paid bills.
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-1.5">
            {vendors.map((v) => {
              const isMsme = v.msme_status && v.msme_status !== 'not_msme'
              return (
                <Link
                  key={v.id}
                  href={`/procurement/payments/new?vendor=${v.id}`}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <Banknote className="size-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{v.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{v.code}</span> · {v.vendor_type}
                      {isMsme && <span className="text-amber-700"> · MSME {v.msme_status}</span>}
                      {!v.pan && <span className="text-rose-700"> · no PAN (TDS @ §206AA rate)</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">{v.bill_count} bill{v.bill_count === 1 ? '' : 's'}</div>
                    <div className="text-sm font-medium tabular-nums">{formatMoneyShort(v.outstanding)}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Vendor pre-bound
  const [vendors, bills] = await Promise.all([
    listVendorsWithOutstanding(),
    getBillsForPayment(sp.vendor),
  ])
  const vendor = vendors.find((v) => v.id === sp.vendor)
  if (!vendor) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-3 max-w-4xl">
        <Link href="/procurement/payments" className="text-sm text-muted-foreground hover:text-foreground">← Payments</Link>
        <Card><CardContent>Vendor not found.</CardContent></Card>
      </div>
    )
  }
  if (bills.length === 0 || bills.every((b) => b.amount_outstanding <= 0)) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl">
        <Link href="/procurement/payments" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Payments
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">New payment · {vendor.name}</h1>
          <Card className="mt-3">
            <CardContent className="flex items-start gap-2 text-sm">
              <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">No outstanding bills for this vendor</div>
                <div className="text-muted-foreground">All bills are fully paid or cancelled.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement/payments" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Payments
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">New payment · {vendor.name}</h1>
        <p className="text-sm text-muted-foreground">
          Pick which bills this payment settles. TDS auto-suggests based on vendor type; override if needed.
          Net = gross − TDS goes to the vendor; TDS deposited to govt by 7th of next month.
        </p>
      </div>

      <NewVendorPaymentForm
        vendor={{
          id: vendor.id,
          name: vendor.name,
          code: vendor.code,
          vendor_type: vendor.vendor_type,
          msme_status: vendor.msme_status,
          pan: vendor.pan,
        }}
        bills={bills}
        preselectedBillId={sp.bill ?? null}
      />
    </div>
  )
}
