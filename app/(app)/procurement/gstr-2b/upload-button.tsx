'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload } from 'lucide-react'

export function Gstr2bUploadButton() {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    if (!file) { setErr('Pick a CSV file'); return }
    if (!/^\d{4}-\d{2}$/.test(period)) { setErr('Period must be YYYY-MM'); return }

    const fd = new FormData()
    fd.set('period', period)
    fd.set('file', file)

    startTransition(async () => {
      try {
        const res = await fetch('/api/procurement/gstr-2b/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) {
          setErr(json.error ?? 'Upload failed')
          if (json.details) console.warn('Parse errors:', json.details)
          return
        }
        toast.success(`${json.inserted} entries · ${json.matched_after_recon} matched · ${json.bills_updated} bills updated`)
        if (json.parse_errors?.length) {
          toast.warning(`${json.parse_errors.length} rows skipped (see console)`)
          console.warn('GSTR-2B parse warnings:', json.parse_errors)
        }
        setOpen(false)
        setFile(null)
        router.push(`/procurement/gstr-2b?period=${period}`)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Upload failed')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Upload className="size-4" /> Upload 2B
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload GSTR-2B for period</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Download from gst.gov.in &gt; Returns &gt; GSTR-2B as CSV. Required columns:
            GSTIN, invoice no., date, total. Optional: name, type, taxable, IGST, CGST, SGST, cess, ITC available.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Period (YYYY-MM)</Label>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-04" className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">CSV file</Label>
              <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <div className="text-[11px] text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(1)} KB</div>}
            </div>
            {err && <div className="text-xs text-rose-700">{err}</div>}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !file}>
              <Upload className="size-4" /> Upload + reconcile
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
