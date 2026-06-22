'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertCircle, CheckCircle2, ExternalLink, ArrowRight } from 'lucide-react'
import { finaliseCs } from '@/lib/actions/rfqs'
import Link from 'next/link'

interface Line {
  id: string
  line_no: number
  description: string
  unit: string
  quantity: number
  hsn_code: string | null
}
interface Vendor {
  id: string
  vendor_id: string
  vendor_name: string
  vendor_code: string
}
interface Response {
  rfq_line_id: string
  vendor_id: string
  rate: number
  discount_pct: number
  gst_rate_pct: number
  delivery_days: number | null
  notes: string | null
  taxable_value: number | null
  amount_total: number | null
  is_l1: boolean | null
  is_selected: boolean
  selection_reason: string | null
}

interface Props {
  rfqId: string
  rfqStatus: string
  lines: Line[]
  vendors: Vendor[]
  responses: Response[]
  l1ByLine: Record<string, string | null>   // lineId → L1 vendorId
  initialSelections: Record<string, string>  // lineId → selected vendorId
  canCreatePo: boolean
  linkedPoId: string | null
  linkedPoNumber: string | null
}

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function CsForm({
  rfqId, rfqStatus, lines, vendors, responses, l1ByLine, initialSelections,
  canCreatePo, linkedPoId, linkedPoNumber,
}: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [selections, setSelections] = useState<Record<string, string>>(initialSelections)
  const [reasons, setReasons] = useState<Record<string, string>>(() => {
    // Pre-populate any existing override reasons
    const out: Record<string, string> = {}
    for (const r of responses) {
      if (r.is_selected && r.selection_reason) out[r.rfq_line_id] = r.selection_reason
    }
    return out
  })
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isFinalised = rfqStatus === 'cs_finalised' || rfqStatus === 'po_raised'

  function getResponse(lineId: string, vendorId: string): Response | undefined {
    return responses.find((r) => r.rfq_line_id === lineId && r.vendor_id === vendorId)
  }

  function pickVendor(lineId: string, vendorId: string) {
    setSelections((prev) => ({ ...prev, [lineId]: vendorId }))
  }

  // Selected vendor counts — for the "single vendor PO" hint
  const selectedVendorCount = useMemo(() => new Set(Object.values(selections)).size, [selections])
  const allLinesSelected = lines.every((l) => selections[l.id])

  function attemptFinalise() {
    setErr(null)
    if (!allLinesSelected) {
      setErr('Pick a vendor for every line')
      return
    }
    // Validate reasons: any selection that isn't L1 needs a reason
    for (const line of lines) {
      const selected = selections[line.id]
      const l1 = l1ByLine[line.id]
      if (l1 && selected !== l1 && !(reasons[line.id]?.trim())) {
        setErr(`Line ${line.line_no}: override reason required when not picking L1`)
        return
      }
    }
    setConfirmOpen(true)
  }

  function doFinalise() {
    startTransition(async () => {
      const payload = lines.map((l) => ({
        rfq_line_id: l.id,
        vendor_id: selections[l.id],
        reason: reasons[l.id]?.trim() || undefined,
      }))
      const res = await finaliseCs({ rfq_id: rfqId, selections: payload })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      toast.success('CS finalised')
      setConfirmOpen(false)
      router.refresh()
    })
  }

  // PO creation: pick the dominant selected vendor (most-picked)
  function dominantVendor(): string | null {
    const votes = new Map<string, number>()
    for (const v of Object.values(selections)) {
      votes.set(v, (votes.get(v) ?? 0) + 1)
    }
    let best: string | null = null
    let max = 0
    for (const [v, n] of votes) {
      if (n > max) { best = v; max = n }
    }
    return best
  }

  return (
    <div className="flex flex-col gap-4">
      {linkedPoId && (
        <div className="rounded-md border border-sky-200 bg-sky-50/50 text-sky-900 px-3 py-2 text-xs inline-flex items-center gap-1.5">
          <ExternalLink className="size-3.5" />
          PO <Link href={`/procurement/orders/${linkedPoId}`} className="font-mono font-medium hover:underline">{linkedPoNumber}</Link> already raised from this CS.
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-muted/40 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-2 py-2 font-medium w-12">#</th>
                <th className="text-left px-2 py-2 font-medium min-w-[180px]">Item</th>
                {vendors.map((v) => (
                  <th key={v.id} className="text-center px-2 py-2 font-medium min-w-[140px]">
                    <div className="font-mono">{v.vendor_code}</div>
                    <div className="text-[10px] font-normal truncate">{v.vendor_name}</div>
                  </th>
                ))}
                <th className="text-left px-2 py-2 font-medium min-w-[160px]">Override reason</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const l1Vendor = l1ByLine[line.id]
                const selectedVendor = selections[line.id]
                return (
                  <tr key={line.id} className="border-t border-border align-top">
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{line.line_no}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{line.description}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {line.quantity} {line.unit}
                        {line.hsn_code && ` · HSN ${line.hsn_code}`}
                      </div>
                    </td>
                    {vendors.map((v) => {
                      const resp = getResponse(line.id, v.vendor_id)
                      const isL1 = l1Vendor === v.vendor_id
                      const isSelected = selectedVendor === v.vendor_id
                      const cellClass = !resp
                        ? 'opacity-50 bg-muted/20'
                        : isSelected
                          ? 'bg-emerald-50 border-emerald-300'
                          : isL1
                            ? 'bg-amber-50/50 border-amber-200'
                            : 'bg-card'
                      return (
                        <td
                          key={v.id}
                          className={`px-2 py-2 border ${cellClass} cursor-pointer hover:bg-muted/30`}
                          onClick={() => resp && !isFinalised && pickVendor(line.id, v.vendor_id)}
                        >
                          {resp ? (
                            <div className="text-center">
                              <div className="text-sm font-medium tabular-nums">
                                ₹{formatINR(resp.rate)}
                              </div>
                              <div className="text-[10px] text-muted-foreground tabular-nums">
                                = ₹{formatINR(resp.amount_total ?? 0)}
                                {resp.delivery_days != null && ` · ${resp.delivery_days}d`}
                              </div>
                              <div className="flex justify-center gap-1 mt-1">
                                {isL1 && <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[9px] px-1 py-0">L1</Badge>}
                                {isSelected && (
                                  <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[9px] px-1 py-0 inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="size-2.5" /> selected
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center text-muted-foreground text-[10px] italic">no quote</div>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2">
                      {selectedVendor && l1Vendor && selectedVendor !== l1Vendor ? (
                        <Input
                          value={reasons[line.id] ?? ''}
                          onChange={(e) => setReasons((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          placeholder="Required — why not L1?"
                          className="text-xs h-8"
                          disabled={isFinalised}
                        />
                      ) : selectedVendor === l1Vendor ? (
                        <span className="text-[10px] text-emerald-700">L1 picked — no override</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {err && (
        <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2 text-sm inline-flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {err}
        </div>
      )}

      {!isFinalised && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {allLinesSelected
                  ? selectedVendorCount === 1
                    ? <>✓ All lines picked from one vendor — PO will be straightforward</>
                    : <>✓ All lines picked — {selectedVendorCount} different vendors selected; PO will use the dominant vendor</>
                  : <>Pick a vendor on each line</>
                }
              </div>
              <Button onClick={attemptFinalise} disabled={busy || !allLinesSelected}>
                <CheckCircle2 className="size-4" /> Finalise CS
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* "Create PO from CS" CTA when finalised but no PO yet */}
      {canCreatePo && (() => {
        const vendorId = dominantVendor()
        if (!vendorId) return null
        return (
          <Card>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Create PO from this CS</div>
                <div className="text-xs text-muted-foreground">
                  Lines with selected rates pre-fill the PO form. RFQ flips to <span className="font-mono">po_raised</span> on save.
                </div>
              </div>
              <Link
                href={`/procurement/orders/new?from_rfq=${rfqId}&vendor=${vendorId}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 text-white px-3 py-2 text-sm font-medium hover:bg-sky-700 transition-colors whitespace-nowrap"
              >
                Create PO <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        )
      })()}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalise the Comparative Statement?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              This locks in vendor selection per line. RFQ status flips to <span className="font-mono">cs_finalised</span>.
              You&apos;ll be able to create the PO from here.
            </p>
            {selectedVendorCount > 1 && (
              <p className="text-amber-700">
                <strong>Note:</strong> {selectedVendorCount} different vendors were selected across lines. v1 creates the PO for the most-picked vendor; the others stay on file but don&apos;t get their own PO. Multi-PO from one CS lands in P4δ.
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={doFinalise} disabled={busy}>Confirm finalise</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
