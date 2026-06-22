/**
 * /procurement/job-work/new — New job-work challan form.
 */
import Link from 'next/link'
import { createJobWorkChallanForm, listJobWorkersForPicker } from '@/lib/actions/job-work'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ChevronLeft, AlertTriangle, Save, Wrench } from 'lucide-react'

const PROCESS_OPTIONS = [
  'machining',
  'cutting',
  'coating',
  'galvanising',
  'powder_coating',
  'assembly',
  'welding',
  'polishing',
  'heat_treatment',
  'plating',
  'other',
]

export default async function NewJobWorkPage(props: { searchParams: Promise<{ error?: string }> }) {
  const params = await props.searchParams
  const jobWorkers = await listJobWorkersForPicker()

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/procurement/job-work" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> Job work
        </Link>
        <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2"><Wrench className="size-6" /> New job-work challan</h1>
      </div>

      {params.error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-3 text-sm text-rose-800 flex items-center gap-2">
            <AlertTriangle className="size-4" /> {params.error}
          </CardContent>
        </Card>
      )}

      <form action={createJobWorkChallanForm} className="space-y-5">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label htmlFor="job_worker_id">Job worker *</Label>
              <select
                id="job_worker_id"
                name="job_worker_id"
                required
                className="mt-1 w-full px-3 py-2 border rounded-md text-sm bg-background"
              >
                <option value="">— Select vendor (with GSTIN if registered) —</option>
                {jobWorkers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.gstin ? ` · ${v.gstin}` : ''}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-muted-foreground mt-1">
                GSTIN snapshot taken at challan time so ITC-04 stays correct even if vendor details change later.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="description">Material description *</Label>
                <Input id="description" name="description" required className="mt-1" placeholder="e.g. MS Plate 10mm × 1m × 2m" />
              </div>
              <div>
                <Label htmlFor="process_nature">Process nature *</Label>
                <select
                  id="process_nature"
                  name="process_nature"
                  required
                  className="mt-1 w-full px-3 py-2 border rounded-md text-sm bg-background"
                >
                  <option value="">— Select process —</option>
                  {PROCESS_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="qty_sent">Qty sent *</Label>
                <Input id="qty_sent" name="qty_sent" type="number" min={0.001} step="0.001" required className="mt-1 tabular-nums" />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" name="unit" defaultValue="nos" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="rate">Rate (₹/unit, nominal)</Label>
                <Input id="rate" name="rate" type="number" min={0} step="0.01" className="mt-1 tabular-nums" placeholder="for ITC-04 valuation" />
              </div>
              <div>
                <Label htmlFor="hsn_code">HSN code</Label>
                <Input id="hsn_code" name="hsn_code" className="mt-1 font-mono" placeholder="e.g. 7308" />
              </div>
            </div>

            <div>
              <Label htmlFor="expected_return_date">Expected return date</Label>
              <Input id="expected_return_date" name="expected_return_date" type="date" className="mt-1 max-w-[200px]" />
              <div className="text-[10px] text-muted-foreground mt-1">
                For inputs, GST law expects return within 1 year (3 years for capital goods). Beyond this, deemed-supply rules apply.
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} className="mt-1" placeholder="e.g. Drawing #DWG-2026-014; finish per spec sheet" />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Link href="/procurement/job-work">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" className="gap-1.5"><Save className="size-4" /> Issue challan</Button>
        </div>
      </form>
    </div>
  )
}
