'use client'

/**
 * NEFT bank-file CSV export button + date-range picker.
 *
 * Clicking opens a small popover with from/to dates (defaults: last
 * 30 days). Pressing Download triggers a navigation to the CSV
 * route which serves it as a download attachment.
 */
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function NeftExportButton() {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(isoDaysAgo(30))
  const [to, setTo] = useState(today)
  const [open, setOpen] = useState(false)

  function download() {
    const url = `/api/procurement/payments/export-neft?from=${from}&to=${to}`
    // Navigate — the route serves Content-Disposition: attachment so the
    // browser downloads rather than rendering.
    window.location.href = url
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4" /> Export NEFT batch
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-4 flex flex-col gap-3">
        <div className="text-sm font-medium">NEFT/RTGS bank file</div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Exports posted NEFT + RTGS payments in the date range as a generic-bank CSV.
          Per-bank dialects (HDFC, ICICI, SBI) land in P3γ.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <Button onClick={download} size="sm">
          <Download className="size-4" /> Download CSV
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
