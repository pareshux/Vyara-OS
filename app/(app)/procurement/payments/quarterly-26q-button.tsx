'use client'

/**
 * Quarterly 26Q TDS return CSV export button.
 */
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download } from 'lucide-react'

function currentFy(): string {
  const d = new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  const startYear = m >= 4 ? y : y - 1
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}

function currentQuarter(): string {
  const m = new Date().getMonth() + 1
  if (m >= 4 && m <= 6) return 'Q1'
  if (m >= 7 && m <= 9) return 'Q2'
  if (m >= 10 && m <= 12) return 'Q3'
  return 'Q4'
}

export function Quarterly26QButton() {
  const thisYear = new Date().getFullYear()
  const fyOptions = [
    `${thisYear - 1}-${String(thisYear).slice(-2)}`,
    `${thisYear}-${String(thisYear + 1).slice(-2)}`,
  ]
  const [quarter, setQuarter] = useState(currentQuarter())
  const [fy, setFy] = useState(currentFy())
  const [open, setOpen] = useState(false)

  function download() {
    window.location.href = `/api/procurement/payments/export-26q?quarter=${quarter}&fy=${fy}`
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4" /> 26Q return
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-4 flex flex-col gap-3">
        <div className="text-sm font-medium">Quarterly 26Q TDS return</div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Source CSV for the quarterly 26Q filing. Submit via Income Tax e-filing portal.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">FY</Label>
            <Select value={fy} onValueChange={setFy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {fyOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Quarter</Label>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Q1">Q1 (Apr–Jun)</SelectItem>
                <SelectItem value="Q2">Q2 (Jul–Sep)</SelectItem>
                <SelectItem value="Q3">Q3 (Oct–Dec)</SelectItem>
                <SelectItem value="Q4">Q4 (Jan–Mar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={download} size="sm">
          <Download className="size-4" /> Download CSV
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
