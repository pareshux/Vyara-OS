/**
 * /procurement/blanket-pos/new — Create blanket PO form.
 *
 * Server form using createBlanketPoForm action (Next.js form action prop).
 * Vendor + product pickers; capacity (qty_cap + rate); validity window.
 */
import Link from 'next/link'
import { createBlanketPoForm } from '@/lib/actions/blanket-pos'
import { listVendorsForPrPicker } from '@/lib/actions/purchase-requisitions'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ChevronLeft, AlertTriangle, Save } from 'lucide-react'

export default async function NewBlanketPoPage(props: { searchParams: Promise<{ error?: string }> }) {
  const params = await props.searchParams
  const vendors = await listVendorsForPrPicker()

  // Default to current FY for the validity window (Apr 1 → Mar 31)
  const now = new Date()
  const fyStartYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
  const defaultFrom = `${fyStartYear}-04-01`
  const defaultTo = `${fyStartYear + 1}-03-31`

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/procurement/blanket-pos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> Blanket purchase orders
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New blanket PO</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Locks an annual qty + rate with a vendor. Release POs draw down against this cap.
        </p>
      </div>

      {params.error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-3 text-sm text-rose-800 flex items-center gap-2">
            <AlertTriangle className="size-4" /> {params.error}
          </CardContent>
        </Card>
      )}

      <form action={createBlanketPoForm} className="space-y-5">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vendor_id">Vendor *</Label>
                <select
                  id="vendor_id"
                  name="vendor_id"
                  required
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm bg-background"
                >
                  <option value="">— Select vendor —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" name="unit" defaultValue="nos" className="mt-1" placeholder="e.g. nos, kg, mtr, tons" />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Item description *</Label>
              <Input
                id="description"
                name="description"
                required
                className="mt-1"
                placeholder="e.g. OPC 53 Grade Cement bag · 50kg"
              />
            </div>

            <div>
              <Label htmlFor="hsn_code">HSN / SAC code</Label>
              <Input id="hsn_code" name="hsn_code" className="mt-1 max-w-[180px] font-mono" placeholder="e.g. 25232990" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Capacity + Rate</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="qty_cap">Annual qty cap *</Label>
                <Input id="qty_cap" name="qty_cap" type="number" min={1} step="0.001" required className="mt-1 tabular-nums" />
              </div>
              <div>
                <Label htmlFor="rate">Rate per unit (₹) *</Label>
                <Input id="rate" name="rate" type="number" min={0} step="0.01" required className="mt-1 tabular-nums" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Value cap is auto-computed (qty_cap × rate) and tracked alongside qty drawdown.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Validity</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="valid_from">Valid from *</Label>
                <Input id="valid_from" name="valid_from" type="date" defaultValue={defaultFrom} required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="valid_to">Valid to *</Label>
                <Input id="valid_to" name="valid_to" type="date" defaultValue={defaultTo} required className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Terms</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="payment_terms_days">Payment terms (days)</Label>
                <Input id="payment_terms_days" name="payment_terms_days" type="number" min={0} className="mt-1 tabular-nums" />
              </div>
              <div>
                <Label htmlFor="delivery_terms">Delivery terms</Label>
                <Input id="delivery_terms" name="delivery_terms" className="mt-1" placeholder="e.g. Within 7 days of release" />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Link href="/procurement/blanket-pos">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" className="gap-1.5"><Save className="size-4" /> Create blanket PO</Button>
        </div>
      </form>
    </div>
  )
}
