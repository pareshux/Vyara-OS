'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { scheduleDispatch, createTransporter } from '@/lib/actions/dispatches'
import { createClient } from '@/lib/supabase/client'
import { Plus, Truck } from 'lucide-react'

interface OrderLine {
  id: string
  product_name: string
  sku_code: string
  unit: string
  quantity: number
}
interface Props {
  orderId: string
  lines: OrderLine[]
}

interface Transporter {
  id: string
  name: string
}

export function ScheduleDispatchButton({ orderId, lines }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Truck className="size-4 mr-1.5" />
        Schedule dispatch
      </Button>
      <ScheduleDispatchSheet open={open} onOpenChange={setOpen} orderId={orderId} lines={lines} />
    </>
  )
}

function ScheduleDispatchSheet({
  open,
  onOpenChange,
  orderId,
  lines,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  orderId: string
  lines: OrderLine[]
}) {
  const router = useRouter()
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date()
    d.setHours(10, 0, 0, 0)
    return d.toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
  })
  const [transporters, setTransporters] = useState<Transporter[]>([])
  const [transporterId, setTransporterId] = useState<string>('')
  const [lrNumber, setLrNumber] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [lineQty, setLineQty] = useState<Record<string, number>>({})
  // Shipped-so-far across prior non-cancelled tranches, per sales_order_line.id
  const [priorShipped, setPriorShipped] = useState<Record<string, number>>({})
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [newTransporter, setNewTransporter] = useState<string>('')

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase
      .from('transporter')
      .select('id, name')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setTransporters((data ?? []) as Transporter[])
      })

    // Compute prior-shipped qty per line so we can default to "remaining" and
    // surface a hint. Excludes cancelled dispatches; dispatch_stage cancelled
    // is a system seed (tenant_id IS NULL).
    ;(async () => {
      const [{ data: cancelled }, { data: validDispatches }] = await Promise.all([
        supabase.from('dispatch_stage').select('id').is('tenant_id', null).eq('stage_key', 'cancelled').maybeSingle(),
        supabase.from('dispatch').select('id, current_stage_id').eq('sales_order_id', orderId).is('deleted_at', null),
      ])
      const cancelledId = cancelled?.id as string | undefined
      const dispatchIds = (validDispatches ?? [])
        .filter((d) => !cancelledId || d.current_stage_id !== cancelledId)
        .map((d) => d.id as string)

      const shippedMap: Record<string, number> = {}
      if (dispatchIds.length > 0) {
        const { data: priorLines } = await supabase
          .from('dispatch_line')
          .select('sales_order_line_id, quantity')
          .in('dispatch_id', dispatchIds)
        for (const r of priorLines ?? []) {
          const k = r.sales_order_line_id as string | null
          if (!k) continue
          shippedMap[k] = (shippedMap[k] ?? 0) + Number(r.quantity)
        }
      }
      setPriorShipped(shippedMap)

      // Default each line qty to remaining (ordered - shipped, floored at 0)
      const defaults: Record<string, number> = {}
      for (const l of lines) {
        defaults[l.id] = Math.max(0, l.quantity - (shippedMap[l.id] ?? 0))
      }
      setLineQty(defaults)
    })()
  }, [open, lines, orderId])

  function handleQtyChange(lineId: string, v: string) {
    const n = Number(v)
    setLineQty((prev) => ({ ...prev, [lineId]: isNaN(n) ? 0 : n }))
  }

  async function handleSubmit() {
    setErr(null)
    const payloadLines = lines
      .filter((l) => (lineQty[l.id] ?? 0) > 0)
      .map((l) => ({
        sales_order_line_id: l.id,
        product_name: l.product_name,
        sku_code: l.sku_code,
        unit: l.unit,
        quantity: lineQty[l.id] ?? 0,
      }))
    if (payloadLines.length === 0) {
      setErr('Pick at least one line item with quantity > 0')
      return
    }
    startTransition(async () => {
      const res = await scheduleDispatch({
        sales_order_id: orderId,
        scheduled_at: new Date(scheduledAt).toISOString(),
        transporter_id: transporterId || undefined,
        lr_number: lrNumber.trim() || undefined,
        vehicle_number: vehicleNumber.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payloadLines,
      })
      if ('error' in res) {
        setErr(res.error)
        toast.error(res.error)
      } else {
        toast.success(`Dispatch ${res.dispatch_number} scheduled`)
        onOpenChange(false)
        router.refresh()
      }
    })
  }

  async function handleCreateTransporter() {
    if (!newTransporter.trim()) return
    const res = await createTransporter({ name: newTransporter.trim() })
    if ('error' in res) {
      toast.error(res.error)
    } else {
      // Reload transporters and select the new one
      const supabase = createClient()
      const { data } = await supabase
        .from('transporter')
        .select('id, name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name')
      setTransporters((data ?? []) as Transporter[])
      setTransporterId(res.id)
      setNewTransporter('')
      toast.success('Transporter added')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Schedule dispatch</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 py-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched">Scheduled at</Label>
            <Input
              id="sched"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Transporter</Label>
            <div className="flex gap-2">
              <Select value={transporterId} onValueChange={setTransporterId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick (or add new)" />
                </SelectTrigger>
                <SelectContent>
                  {transporters.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Add new transporter"
                value={newTransporter}
                onChange={(e) => setNewTransporter(e.target.value)}
                className="text-xs"
              />
              <Button type="button" size="sm" variant="outline" onClick={handleCreateTransporter}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lr">LR #</Label>
              <Input id="lr" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="veh">Vehicle #</Label>
              <Input id="veh" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drv">Driver phone</Label>
            <Input id="drv" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Items to dispatch</Label>
            <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-64 overflow-auto">
              {lines.map((l) => {
                const shipped = priorShipped[l.id] ?? 0
                const remaining = Math.max(0, l.quantity - shipped)
                const fullyShipped = remaining === 0
                const hint =
                  shipped > 0
                    ? fullyShipped
                      ? `${shipped} ${l.unit} already shipped — fully delivered`
                      : `${shipped} of ${l.quantity} ${l.unit} shipped · ${remaining} remaining`
                    : `order qty ${l.quantity} ${l.unit}`
                return (
                  <div
                    key={l.id}
                    className={`px-3 py-2 flex items-center gap-3 text-sm ${fullyShipped ? 'opacity-60' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate">{l.product_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {l.sku_code} · {hint}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={remaining}
                      step="0.01"
                      disabled={fullyShipped}
                      className="w-20 tabular-nums"
                      value={lineQty[l.id] ?? 0}
                      onChange={(e) => handleQtyChange(l.id, e.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? 'Scheduling…' : 'Schedule'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
