'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Package, PlusCircle } from 'lucide-react'
import { createOrderFromQuote } from '@/lib/actions/orders'

export interface OrdersTabOrder {
  id: string
  order_number: string
  value: number
  expected_delivery_at: string | null
  stage: { id: string; label: string; color: string } | null
}

export interface OrdersTabQuote {
  id: string
  quotation_number: string
  status: string
  total: number | null
}

interface Props {
  projectId: string
  orders: OrdersTabOrder[]
  quotes: OrdersTabQuote[]
}

export function OrdersTab({ projectId: _projectId, orders, quotes }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [quoteId, setQuoteId] = useState<string>('')
  const [eta, setEta] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const eligibleQuotes = quotes.filter((q) => q.status === 'accepted' || q.status === 'sent' || q.status === 'draft')

  function handleCreate() {
    if (!quoteId) {
      setErr('Pick a quote to convert')
      return
    }
    setErr(null)
    startTransition(async () => {
      const result = await createOrderFromQuote({
        quote_id: quoteId,
        expected_delivery_at: eta || undefined,
        notes: notes.trim() || undefined,
      })
      if ('error' in result) {
        setErr(result.error)
      } else {
        toast.success(`Order ${result.order_number} created`)
        setOpen(false)
        setQuoteId('')
        setEta('')
        setNotes('')
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground tabular-nums">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </p>
        {eligibleQuotes.length > 0 && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <PlusCircle className="size-4 mr-1.5" />
            Create order
          </Button>
        )}
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="size-7 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {eligibleQuotes.length === 0
                ? 'Create a quote first, then convert it to an order.'
                : 'Convert a quote to a sales order to begin fulfilment.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Order #</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Value</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell">Expected</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/orders/${o.id}`} className="text-foreground hover:text-primary">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {o.stage ? (
                      <Badge
                        variant="outline"
                        className="border-0 text-xs"
                        style={{ backgroundColor: `${o.stage.color}20`, color: o.stage.color }}
                      >
                        {o.stage.label}
                      </Badge>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ₹{Number(o.value).toLocaleString('en-IN')}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground tabular-nums sm:table-cell">
                    {o.expected_delivery_at
                      ? new Date(o.expected_delivery_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create order from quote</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qid">Quote</Label>
              <Select value={quoteId} onValueChange={setQuoteId}>
                <SelectTrigger id="qid">
                  <SelectValue placeholder="Pick a quote" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleQuotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.quotation_number} — ₹{Number(q.total ?? 0).toLocaleString('en-IN')} ({q.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eta">Expected delivery (optional)</Label>
              <Input id="eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions for fulfilment"
              />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isPending}>
                {isPending ? 'Creating…' : 'Create order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
