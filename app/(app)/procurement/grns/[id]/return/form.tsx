'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Undo2 } from 'lucide-react'
import { createReturnToVendor, type RtvLineInput, type GrnForReturn } from '@/lib/actions/return-to-vendor'

interface Props {
  grn: GrnForReturn
}

type LineDraft = {
  grn_line_id: string
  description: string
  unit: string
  qty_accepted: number
  qty_already_returned: number
  qty_returnable: number
  product_id: string | null
  qty_returned_now: string
  reason: string
  remarks: string
}

export function ReturnToVendorForm({ grn }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const [rtvDate, setRtvDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [headerReason, setHeaderReason] = useState('')
  const [notes, setNotes] = useState('')

  const [lines, setLines] = useState<LineDraft[]>(
    grn.lines.map((l) => ({
      grn_line_id: l.id,
      description: l.description,
      unit: l.unit,
      qty_accepted: l.qty_accepted,
      qty_already_returned: l.qty_already_returned,
      qty_returnable: l.qty_returnable,
      product_id: l.product_id,
      qty_returned_now: '0',
      reason: '',
      remarks: '',
    })),
  )

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const totalReturn = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty_returned_now) || 0), 0),
    [lines],
  )

  async function save(post: boolean) {
    setErr(null)
    const payload: RtvLineInput[] = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const q = Number(l.qty_returned_now) || 0
      if (q === 0) continue
      if (q < 0) { setErr(`Line ${i + 1}: qty cannot be negative`); return }
      if (q > l.qty_returnable) {
        setErr(`Line ${i + 1}: can return at most ${l.qty_returnable} ${l.unit}`)
        return
      }
      if (!l.reason.trim()) {
        setErr(`Line ${i + 1}: reason required`)
        return
      }
      payload.push({
        grn_line_id: l.grn_line_id,
        qty_returned: q,
        reason: l.reason.trim(),
        remarks: l.remarks.trim() || undefined,
      })
    }
    if (payload.length === 0) {
      setErr('Set qty_returned > 0 on at least one line')
      return
    }

    startTransition(async () => {
      const res = await createReturnToVendor({
        grn_id: grn.id,
        rtv_date: rtvDate,
        reason: headerReason.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payload,
        post_immediately: post,
      })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      toast.success(post ? `${res.rtv_number} posted — stock reversed` : `${res.rtv_number} saved as draft`)
      router.push(`/procurement/returns/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">RTV date</Label>
            <Input type="date" value={rtvDate} onChange={(e) => setRtvDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">Header reason (optional — per-line reason is mandatory)</Label>
            <Input value={headerReason} onChange={(e) => setHeaderReason(e.target.value)} placeholder="QC failure across batch / wrong spec / damaged in transit" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <Undo2 className="size-3.5" /> Lines to return
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {totalReturn} total qty returning
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const q = Number(l.qty_returned_now) || 0
              const remainingAfter = l.qty_returnable - q
              return (
                <div key={l.grn_line_id} className="rounded-md border border-border p-3 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{l.description}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        Accepted: {l.qty_accepted} {l.unit}
                        {l.qty_already_returned > 0 && ` · already returned: ${l.qty_already_returned}`}
                        · returnable: {l.qty_returnable}
                        {!l.product_id && <span className="ml-2 text-amber-700">(ad-hoc — no stock impact)</span>}
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-12 gap-2">
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Return qty</Label>
                      <Input
                        type="number" step="0.001" min="0" max={l.qty_returnable}
                        value={l.qty_returned_now}
                        onChange={(e) => updateLine(idx, { qty_returned_now: e.target.value })}
                        className="tabular-nums"
                      />
                      {q > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Remaining after: {remainingAfter}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-4 flex flex-col gap-1">
                      <Label className="text-xs">Reason {q > 0 && <span className="text-rose-600">*</span>}</Label>
                      <Input
                        value={l.reason}
                        onChange={(e) => updateLine(idx, { reason: e.target.value })}
                        placeholder={q > 0 ? 'Required' : 'Why we\'re returning these'}
                      />
                    </div>
                    <div className="md:col-span-6 flex flex-col gap-1">
                      <Label className="text-xs">Remarks (optional)</Label>
                      <Input
                        value={l.remarks}
                        onChange={(e) => updateLine(idx, { remarks: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <Label className="text-xs">Internal notes (visible only to your team)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </CardContent>
      </Card>

      {err && (
        <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2 text-sm inline-flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {err}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" disabled={busy} onClick={() => save(false)}>Save as draft</Button>
        <Button disabled={busy} onClick={() => save(true)}>Save & post (reverse stock)</Button>
      </div>
    </div>
  )
}
