'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

function currentQuarter(): { fy: number; quarter: 1 | 2 | 3 | 4 } {
  const now = new Date()
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  const fy = m >= 4 ? y : y - 1
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4
  return { fy, quarter: q as 1 | 2 | 3 | 4 }
}

export function QuarterlyItc04Button() {
  const [open, setOpen] = useState(false)
  const current = currentQuarter()
  const [fy, setFy] = useState(current.fy)
  const [q, setQ] = useState<1 | 2 | 3 | 4>(current.quarter)

  function download() {
    const url = `/api/procurement/job-work/export-itc04?fy=${fy}&q=${q}`
    window.location.href = url
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileDown className="size-4" /> ITC-04
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export ITC-04 quarterly return</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Includes all job-work challans + receipts for the selected quarter. Upload the CSV to the GSTN portal.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fy" className="text-xs">FY start year</Label>
              <Input
                id="fy"
                type="number"
                value={fy}
                onChange={(e) => setFy(parseInt(e.target.value, 10) || current.fy)}
                className="mt-1 tabular-nums"
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">FY {fy}-{String(fy + 1).slice(-2)}</div>
            </div>
            <div>
              <Label className="text-xs">Quarter</Label>
              <div className="flex gap-1 mt-1">
                {([1, 2, 3, 4] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQ(n)}
                    className={`flex-1 py-2 text-xs rounded border ${
                      q === n ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                    }`}
                  >
                    Q{n}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {q === 1 && 'Apr–Jun'}{q === 2 && 'Jul–Sep'}{q === 3 && 'Oct–Dec'}{q === 4 && 'Jan–Mar'}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={download} className="gap-1.5"><FileDown className="size-3.5" /> Download CSV</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
