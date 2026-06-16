'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PlusCircle, FlaskConical, ChevronDown } from 'lucide-react'
import { createSampleRequest, updateSampleStatus, type SampleStatusUpdate } from '@/lib/actions/samples'

interface SamplesTabProps {
  projectId: string
  samples: Array<{
    id: string
    status: string
    quantity: number
    notes: string | null
    outcome_notes: string | null
    created_at: string
    dispatched_at: string | null
    delivered_at: string | null
    product: { name: string; sku_code: string } | null
    contact: { full_name: string } | null
  }>
  products: Array<{ id: string; name: string; sku_code: string; unit: string }>
}

// Schema CHECK: pending|dispatched|delivered|outcome_positive|outcome_negative|cancelled
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:          { bg: '#EFF6FF', text: '#1D4ED8', label: 'Pending' },
  dispatched:       { bg: '#FFFBEB', text: '#B45309', label: 'Dispatched' },
  delivered:        { bg: '#F0FDF4', text: '#15803D', label: 'Delivered' },
  outcome_positive: { bg: '#DCFCE7', text: '#15803D', label: 'Positive outcome' },
  outcome_negative: { bg: '#FEE2E2', text: '#B91C1C', label: 'Negative outcome' },
  cancelled:        { bg: '#F3F4F6', text: '#6B7280', label: 'Cancelled' },
}

const requestSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.string().min(1, 'Quantity is required').refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
    message: 'Enter a valid quantity',
  }),
  notes: z.string().optional(),
})

type RequestFormValues = z.infer<typeof requestSchema>

export function SamplesTab({ projectId, samples, products }: SamplesTabProps) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<RequestFormValues>({ resolver: zodResolver(requestSchema) })

  function onSubmit(values: RequestFormValues) {
    startTransition(async () => {
      const result = await createSampleRequest({
        project_id: projectId,
        product_id: values.product_id,
        quantity: Number(values.quantity),
        notes: values.notes,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Sample requested')
      reset()
      setSheetOpen(false)
      router.refresh()
    })
  }

  function handleStatusChange(sampleId: string, status: SampleStatusUpdate) {
    startTransition(async () => {
      const result = await updateSampleStatus(sampleId, status)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const label = STATUS_STYLES[status]?.label ?? status
      if (status === 'dispatched') {
        if (result.sampleConsumed) {
          toast.success(`Marked ${label} · sample stock consumed @ ${result.sampleWarehouseCode}`)
        } else if (result.sampleConsumeError) {
          toast.warning(`Marked ${label} · sample stock not consumed: ${result.sampleConsumeError}`)
        } else {
          toast.success(`Sample marked as ${label}`)
        }
      } else {
        toast.success(`Sample marked as ${label}`)
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {samples.length} {samples.length === 1 ? 'sample request' : 'sample requests'}
        </p>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" />
          Request Sample
        </Button>
      </div>

      {samples.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <FlaskConical className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No samples requested yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Request the first sample for this project.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
            Request sample
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground tabular-nums">Qty</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Requested</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Notes</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => {
                const statusStyle = STATUS_STYLES[s.status] ?? STATUS_STYLES.pending
                const isTerminal = s.status === 'outcome_positive' || s.status === 'outcome_negative' || s.status === 'cancelled'
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{s.product?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{s.product?.sku_code}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {s.quantity.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-0 text-xs"
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                      >
                        {statusStyle.label}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground tabular-nums md:table-cell">
                      {new Date(s.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {s.outcome_notes ?? s.notes ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isTerminal && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-1 text-xs">
                              Update
                              <ChevronDown className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {s.status === 'pending' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(s.id, 'dispatched')}>
                                Mark dispatched
                              </DropdownMenuItem>
                            )}
                            {(s.status === 'pending' || s.status === 'dispatched') && (
                              <DropdownMenuItem onClick={() => handleStatusChange(s.id, 'delivered')}>
                                Mark delivered
                              </DropdownMenuItem>
                            )}
                            {s.status === 'delivered' && (
                              <>
                                <DropdownMenuItem onClick={() => handleStatusChange(s.id, 'outcome_positive')}>
                                  Outcome: positive
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(s.id, 'outcome_negative')}>
                                  Outcome: negative
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem onClick={() => handleStatusChange(s.id, 'cancelled')}>
                              Cancel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Request Sample Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Request Sample</SheetTitle>
          </SheetHeader>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4 px-4 pb-4 flex-1 overflow-y-auto"
          >
            <div className="flex flex-col gap-1.5">
              <Label>Product *</Label>
              <Select onValueChange={(v) => setValue('product_id', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select product…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{' '}
                      <span className="text-muted-foreground ml-1 font-mono text-xs">
                        {p.sku_code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.product_id && (
                <p className="text-xs text-destructive">{errors.product_id.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sample_qty">Quantity *</Label>
              <Input
                id="sample_qty"
                {...register('quantity')}
                type="number"
                min="1"
                step="1"
                placeholder="1"
                className="tabular-nums"
              />
              {errors.quantity && (
                <p className="text-xs text-destructive">{errors.quantity.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sample_notes">Notes</Label>
              <Textarea
                id="sample_notes"
                {...register('notes')}
                placeholder="Finish, color, size, or special instructions…"
                rows={3}
              />
            </div>

            <SheetFooter className="px-0 pb-0">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Requesting…' : 'Request sample'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
