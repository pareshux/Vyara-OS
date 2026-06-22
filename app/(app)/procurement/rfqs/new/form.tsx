'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Plus, Trash2, Send } from 'lucide-react'
import { createRfq, type RfqLineInput } from '@/lib/actions/rfqs'

interface Props {
  approvedPrs: Array<{ id: string; pr_number: string; project_name: string | null; estimated_value: number; line_count: number }>
  vendors: Array<{ id: string; name: string; code: string; gstin: string | null; payment_terms_days: number | null; msme_status: string | null }>
  projects: Array<{ id: string; name: string }>
  prefilledLines: Array<{ pr_id: string; pr_number: string; line_id: string; description: string; hsn_code: string | null; unit: string; quantity: number; specifications: string | null; product_id: string | null }>
  initialPrIds: string[]
}

type LineDraft = {
  key: string
  source_pr_line_id: string | null
  product_id: string | null
  description: string
  hsn_code: string
  unit: string
  quantity: string
  specifications: string
}

function newLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    source_pr_line_id: null,
    product_id: null,
    description: '',
    hsn_code: '',
    unit: 'nos',
    quantity: '',
    specifications: '',
  }
}

const UNITS = ['nos', 'kgs', 'mtr', 'rmt', 'sqft', 'sqm', 'ltr', 'set', 'box', 'roll']

export function NewRfqForm({ approvedPrs, vendors, projects, prefilledLines, initialPrIds }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const [projectId, setProjectId] = useState<string>('')
  const [costCenter, setCostCenter] = useState<string>('')
  const [responseDeadline, setResponseDeadline] = useState<string>('')
  const [requiredBy, setRequiredBy] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [selectedPrIds, setSelectedPrIds] = useState<string[]>(initialPrIds)
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set())

  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (prefilledLines.length > 0) {
      return prefilledLines.map((l) => ({
        key: Math.random().toString(36).slice(2),
        source_pr_line_id: l.line_id,
        product_id: l.product_id,
        description: l.description,
        hsn_code: l.hsn_code ?? '',
        unit: l.unit,
        quantity: String(l.quantity),
        specifications: l.specifications ?? '',
      }))
    }
    return [newLine()]
  })

  function togglePr(prId: string) {
    setSelectedPrIds((prev) => prev.includes(prId) ? prev.filter((x) => x !== prId) : [...prev, prId])
    // Note: in a richer flow we'd refetch lines server-side. For v1 the
    // checkboxes are visual state; the line table is what's sent.
  }

  function toggleVendor(vendorId: string) {
    setSelectedVendors((prev) => {
      const next = new Set(prev)
      if (next.has(vendorId)) next.delete(vendorId)
      else next.add(vendorId)
      return next
    })
  }

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }
  function removeLine(key: string) {
    setLines((prev) => prev.length === 1 ? prev : prev.filter((l) => l.key !== key))
  }

  async function save(send: boolean) {
    setErr(null)
    if (selectedVendors.size < 2) {
      setErr('Invite at least 2 vendors')
      return
    }
    const linePayload: RfqLineInput[] = []
    for (const l of lines) {
      const q = Number(l.quantity) || 0
      if (q === 0 && !l.description.trim()) continue
      if (!l.description.trim()) { setErr('Each line needs a description'); return }
      if (q <= 0) { setErr(`${l.description}: quantity > 0 required`); return }
      linePayload.push({
        source_pr_line_id: l.source_pr_line_id,
        product_id: l.product_id,
        description: l.description.trim(),
        hsn_code: l.hsn_code.trim() || null,
        unit: l.unit || 'nos',
        quantity: q,
        specifications: l.specifications.trim() || undefined,
      })
    }
    if (linePayload.length === 0) {
      setErr('At least one line is required')
      return
    }

    startTransition(async () => {
      const res = await createRfq({
        project_id: projectId || null,
        cost_center: costCenter.trim() || undefined,
        source_pr_ids: selectedPrIds.length > 0 ? selectedPrIds : undefined,
        response_deadline: responseDeadline || null,
        required_by_date: requiredBy || null,
        notes: notes.trim() || undefined,
        lines: linePayload,
        vendors: Array.from(selectedVendors).map((id) => ({ vendor_id: id })),
        send_immediately: send,
      })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      toast.success(send ? `${res.rfq_number} sent to ${selectedVendors.size} vendors` : `${res.rfq_number} saved as draft`)
      router.push(`/procurement/rfqs/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId || '__none__'} onValueChange={(v) => setProjectId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cost center</Label>
            <Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Response deadline</Label>
            <Input type="date" value={responseDeadline} onChange={(e) => setResponseDeadline(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Required by</Label>
            <Input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Source PRs (multi-select for consolidation) */}
      {approvedPrs.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="text-sm font-medium">Source PRs (optional consolidation)</div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Tick approved PRs to track lineage. Lines below are what actually gets sent — edit freely.
            </p>
            <div className="flex flex-col gap-1.5">
              {approvedPrs.map((pr) => (
                <label
                  key={pr.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/30"
                >
                  <input type="checkbox" checked={selectedPrIds.includes(pr.id)} onChange={() => togglePr(pr.id)} className="size-4" />
                  <span className="font-mono text-xs">{pr.pr_number}</span>
                  <span className="text-xs flex-1">{pr.project_name ?? '—'} · {pr.line_count} line{pr.line_count === 1 ? '' : 's'}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">₹{Math.round(pr.estimated_value).toLocaleString('en-IN')}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invited vendors */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Invite vendors</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {selectedVendors.size} selected (min 2)
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-1.5">
            {vendors.map((v) => (
              <label
                key={v.id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/30"
              >
                <input type="checkbox" checked={selectedVendors.has(v.id)} onChange={() => toggleVendor(v.id)} className="size-4" />
                <span className="font-mono text-xs">{v.code}</span>
                <span className="text-xs flex-1 truncate">{v.name}</span>
                {v.msme_status && v.msme_status !== 'not_msme' && (
                  <span className="text-[10px] text-amber-700">MSME</span>
                )}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Items to quote</div>
            <Button size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, newLine()])}>
              <Plus className="size-3.5" /> Add line
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => (
              <div key={l.key} className="rounded-md border border-border p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    Line {idx + 1}{l.source_pr_line_id && <span className="ml-2 text-[10px] text-violet-700">from PR</span>}
                  </div>
                  {lines.length > 1 && (
                    <button type="button" className="text-muted-foreground hover:text-rose-600" onClick={() => removeLine(l.key)}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-12 gap-2">
                  <div className="md:col-span-7 flex flex-col gap-1">
                    <Label className="text-xs">Description *</Label>
                    <Input value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                  </div>
                  <div className="md:col-span-2 flex flex-col gap-1">
                    <Label className="text-xs">HSN/SAC</Label>
                    <Input value={l.hsn_code} onChange={(e) => updateLine(idx, { hsn_code: e.target.value })} className="font-mono" />
                  </div>
                  <div className="md:col-span-1 flex flex-col gap-1">
                    <Label className="text-xs">Unit</Label>
                    <Select value={l.unit} onValueChange={(v) => updateLine(idx, { unit: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2 flex flex-col gap-1">
                    <Label className="text-xs">Qty *</Label>
                    <Input type="number" step="0.001" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} className="tabular-nums" />
                  </div>
                  <div className="md:col-span-12 flex flex-col gap-1">
                    <Label className="text-xs">Specifications (optional)</Label>
                    <Input value={l.specifications} onChange={(e) => updateLine(idx, { specifications: e.target.value })} placeholder="Brand / grade / drawing ref" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <Label className="text-xs">Notes (visible to invited vendors as context)</Label>
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
        <Button disabled={busy} onClick={() => save(true)}>
          <Send className="size-4" /> Send RFQ
        </Button>
      </div>
    </div>
  )
}
