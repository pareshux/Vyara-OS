'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'
import {
  PlusCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
} from 'lucide-react'
import { createQuotation, updateQuotationStatus } from '@/lib/actions/quotations'
import { getActivePriceForLine } from '@/lib/actions/price-lists'

interface QuoteLine {
  id: string
  quantity: number
  unit_price: number
  line_total: number
  notes: string | null
  product: { name: string; sku_code: string } | null
}

interface Quote {
  id: string
  quotation_number: string
  status: string
  total: number | null
  valid_until: string | null
  notes: string | null
  sent_at: string | null
  created_at: string
  lines: QuoteLine[]
}

interface Product {
  id: string
  name: string
  sku_code: string
  unit: string
  base_price: number | null
}

interface QuotesTabProps {
  projectId: string
  quotes: Quote[]
  products: Product[]
  userRole?: string
}

// Status map covers both UI labels and DB enum values (schema:
// draft|sent|revised|accepted|rejected|expired). 'accepted' renders as Won.
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: '#F3F4F6', text: '#6B7280', label: 'Draft' },
  sent:     { bg: '#FFFBEB', text: '#B45309', label: 'Sent' },
  revised:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Revised' },
  accepted: { bg: '#F0FDF4', text: '#15803D', label: 'Won' },
  rejected: { bg: '#FFF1F2', text: '#BE123C', label: 'Lost' },
  expired:  { bg: '#F3F4F6', text: '#6B7280', label: 'Expired' },
}

const lineSchema = z.object({
  product_id: z.string().min(1, 'Product required'),
  quantity: z.string().min(1, 'Required').refine((v) => !isNaN(Number(v)) && Number(v) > 0, { message: 'Enter a valid quantity' }),
  unit_price: z.string().min(1, 'Required').refine((v) => !isNaN(Number(v)) && Number(v) >= 0, { message: 'Enter a valid price' }),
  description: z.string().optional(),
})

const quoteSchema = z.object({
  notes: z.string().optional(),
  valid_until: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'Add at least one line item'),
})

type QuoteFormValues = z.infer<typeof quoteSchema>

function formatINR(amount: number) {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function QuotesTab({ projectId, quotes, products, userRole }: QuotesTabProps) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const isSalesEngineer = userRole === 'sales_engineer'

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: { lines: [{ product_id: '', quantity: '1', unit_price: '', description: '' }] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const linesWatch = watch('lines')

  // Per-line price source { listCode, listPrice, entryId } — set when the
  // server returns a price from the active list; cleared when product changes.
  const [priceSources, setPriceSources] = useState<Record<number, { listCode: string; listPrice: number; entryId: string } | null>>({})

  async function resolveActivePrice(index: number, productId: string, qty: number) {
    if (!productId || !(qty > 0)) return
    const res = await getActivePriceForLine({ project_id: projectId, product_id: productId, qty })
    if ('error' in res) return
    if (res.price) {
      setPriceSources((s) => ({ ...s, [index]: { listCode: res.price!.price_list_code, listPrice: res.price!.unit_price, entryId: res.price!.entry_id } }))
      setValue(`lines.${index}.unit_price`, String(res.price.unit_price))
    } else {
      setPriceSources((s) => ({ ...s, [index]: null }))
    }
  }

  const runningTotal = (linesWatch ?? []).reduce((sum, line) => {
    const qty = Number(line.quantity) || 0
    const price = Number(line.unit_price) || 0
    return sum + qty * price
  }, 0)

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSubmit(values: QuoteFormValues) {
    startTransition(async () => {
      const result = await createQuotation({
        project_id: projectId,
        notes: values.notes,
        valid_until: values.valid_until || undefined,
        lines: values.lines.map((l, i) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          description: l.description || undefined,
          // Only attach the entry id if the user hasn't deviated from the list price
          price_list_entry_id: priceSources[i] && Math.abs(Number(l.unit_price) - priceSources[i]!.listPrice) < 0.005
            ? priceSources[i]!.entryId
            : null,
        })),
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success(`Quote ${result.quotation_number} created`)
      reset({ lines: [{ product_id: '', quantity: '1', unit_price: '', description: '' }] })
      setSheetOpen(false)
      router.refresh()
    })
  }

  function handleStatusChange(quoteId: string, status: 'sent' | 'won' | 'lost') {
    startTransition(async () => {
      const result = await updateQuotationStatus(quoteId, status)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const label = STATUS_STYLES[status]?.label ?? status
      toast.success(`Quote marked as ${label}`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {quotes.length} {quotes.length === 1 ? 'quotation' : 'quotations'}
        </p>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" />
          Create Quote
        </Button>
      </div>

      {quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <FileText className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No quotations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the first quote for this project.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
            Create quote
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {quotes.map((q) => {
            const isExpanded = expandedIds.has(q.id)
            const statusStyle = STATUS_STYLES[q.status] ?? STATUS_STYLES.draft
            const canSend = q.status === 'draft' || q.status === 'revised'
            const canMarkWon = q.status === 'sent' || q.status === 'draft'
            const canMarkLost = q.status !== 'rejected' && q.status !== 'accepted' && q.status !== 'expired'

            return (
              <Card key={q.id} size="sm">
                <CardContent className="pt-3 flex flex-col gap-0">
                  {/* Quote header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {q.quotation_number}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-0 text-xs"
                          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                        >
                          {statusStyle.label}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {q.total != null && (
                          <span className="tabular-nums font-medium text-foreground">
                            {formatINR(q.total)}
                          </span>
                        )}
                        {q.valid_until && (
                          <span>
                            Valid till{' '}
                            {new Date(q.valid_until).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </span>
                        )}
                        {q.sent_at && (
                          <span>
                            Sent{' '}
                            {new Date(q.sent_at).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short',
                            })}
                          </span>
                        )}
                        {!q.sent_at && (
                          <span>
                            Created{' '}
                            {new Date(q.created_at).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {canSend && !isSalesEngineer && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={isPending}
                          onClick={() => handleStatusChange(q.id, 'sent')}
                        >
                          Mark Sent
                        </Button>
                      )}
                      {canMarkWon && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-green-700 border-green-200 hover:bg-green-50"
                          disabled={isPending}
                          onClick={() => handleStatusChange(q.id, 'won')}
                        >
                          Won
                        </Button>
                      )}
                      {canMarkLost && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          disabled={isPending}
                          onClick={() => handleStatusChange(q.id, 'lost')}
                        >
                          Lost
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => toggleExpand(q.id)}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Line items */}
                  {isExpanded && q.lines.length > 0 && (
                    <>
                      <Separator className="my-3" />
                      <div className="overflow-hidden rounded-lg border border-border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                              <th className="px-3 py-2 text-right font-medium text-muted-foreground tabular-nums">Qty</th>
                              {!isSalesEngineer && (
                                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground tabular-nums sm:table-cell">Unit price</th>
                              )}
                              <th className="px-3 py-2 text-right font-medium text-muted-foreground tabular-nums">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {q.lines.map((line) => (
                              <tr
                                key={line.id}
                                className="border-b border-border last:border-0"
                              >
                                <td className="px-3 py-2">
                                  <div className="font-medium text-foreground">
                                    {line.product?.name ?? line.notes ?? '—'}
                                  </div>
                                  {line.product?.sku_code && (
                                    <div className="font-mono text-muted-foreground text-xs">
                                      {line.product.sku_code}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                  {line.quantity.toLocaleString('en-IN')}
                                </td>
                                {!isSalesEngineer && (
                                  <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                                    {formatINR(line.unit_price)}
                                  </td>
                                )}
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                                  {formatINR(line.line_total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {q.total != null && (
                            <tfoot>
                              <tr className="border-t border-border bg-muted/30">
                                <td
                                  colSpan={isSalesEngineer ? 2 : 3}
                                  className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                                >
                                  Total
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                                  {formatINR(q.total)}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {q.notes && (
                        <p className="mt-2 text-xs text-muted-foreground italic">{q.notes}</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Quote Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex flex-col w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Create Quotation</SheetTitle>
          </SheetHeader>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4 px-4 pb-4 flex-1 overflow-y-auto"
          >
            {/* Header fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="q_valid_until">Valid until</Label>
                <Input
                  id="q_valid_until"
                  type="date"
                  {...register('valid_until')}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="q_notes">Notes</Label>
                <Textarea
                  id="q_notes"
                  {...register('notes')}
                  placeholder="Terms, delivery, remarks…"
                  rows={2}
                />
              </div>
            </div>

            <Separator />

            {/* Line items */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Line items</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => append({ product_id: '', quantity: '1', unit_price: '', description: '' })}
                >
                  <Plus className="size-3.5 mr-1" />
                  Add line
                </Button>
              </div>

              {errors.lines && typeof errors.lines.message === 'string' && (
                <p className="text-xs text-destructive">{errors.lines.message}</p>
              )}

              <div className="flex flex-col gap-3">
                {fields.map((field, index) => {
                  const lineQty = Number(linesWatch?.[index]?.quantity) || 0
                  const linePrice = Number(linesWatch?.[index]?.unit_price) || 0
                  const lineTotal = lineQty * linePrice

                  return (
                    <div
                      key={field.id}
                      className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground">Product *</Label>
                          <Controller
                            control={control}
                            name={`lines.${index}.product_id`}
                            render={({ field: f }) => (
                              <Select
                                value={f.value}
                                onValueChange={(v) => {
                                  f.onChange(v)
                                  // Clear stale source then resolve from the active price list
                                  setPriceSources((s) => ({ ...s, [index]: null }))
                                  const qty = Number(linesWatch?.[index]?.quantity) || 1
                                  void resolveActivePrice(index, v, qty).then(() => {
                                    // Fallback: if no list match, use product.base_price
                                    if (!priceSources[index]) {
                                      const product = products.find((p) => p.id === v)
                                      const current = Number(linesWatch?.[index]?.unit_price) || 0
                                      if (product?.base_price != null && current === 0) {
                                        setValue(`lines.${index}.unit_price`, String(product.base_price))
                                      }
                                    }
                                  })
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs w-full">
                                  <SelectValue placeholder="Select product…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}{' '}
                                      <span className="font-mono text-xs text-muted-foreground ml-1">
                                        {p.sku_code}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {errors.lines?.[index]?.product_id && (
                            <p className="text-xs text-destructive">
                              {errors.lines[index]?.product_id?.message}
                            </p>
                          )}
                        </div>

                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-5 text-muted-foreground shrink-0"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground">Qty *</Label>
                          <Input
                            {...register(`lines.${index}.quantity`, {
                              onBlur: () => {
                                // Re-resolve in case tiered pricing changes at this qty
                                const pid = linesWatch?.[index]?.product_id
                                const qty = Number(linesWatch?.[index]?.quantity) || 0
                                if (pid && qty > 0) void resolveActivePrice(index, pid, qty)
                              },
                            })}
                            type="number"
                            min="1"
                            step="1"
                            placeholder="1"
                            className="h-8 text-xs tabular-nums"
                          />
                          {errors.lines?.[index]?.quantity && (
                            <p className="text-xs text-destructive">
                              {errors.lines[index]?.quantity?.message}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground">Unit price (₹) *</Label>
                          <Input
                            {...register(`lines.${index}.unit_price`)}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="h-8 text-xs tabular-nums"
                          />
                          {errors.lines?.[index]?.unit_price && (
                            <p className="text-xs text-destructive">
                              {errors.lines[index]?.unit_price?.message}
                            </p>
                          )}
                          {priceSources[index] && (() => {
                            const src = priceSources[index]!
                            const entered = Number(linesWatch?.[index]?.unit_price) || 0
                            const delta = entered - src.listPrice
                            const deltaPct = src.listPrice > 0 ? (delta / src.listPrice) * 100 : 0
                            const isMatch = Math.abs(delta) < 0.005
                            return (
                              <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1.5 flex-wrap">
                                <span>
                                  From <span className="font-mono text-foreground">{src.listCode}</span> · ₹{src.listPrice.toLocaleString('en-IN')}
                                </span>
                                {!isMatch && (
                                  <span className={delta > 0 ? 'text-emerald-700' : 'text-destructive'}>
                                    · vs list {delta > 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                                  </span>
                                )}
                              </p>
                            )
                          })()}
                        </div>
                      </div>

                      {lineTotal > 0 && (
                        <p className="text-xs text-right text-muted-foreground tabular-nums">
                          Line total: <span className="font-medium text-foreground">{formatINR(lineTotal)}</span>
                        </p>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                        <Input
                          {...register(`lines.${index}.description`)}
                          placeholder="Finish, specification…"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Running total */}
            {runningTotal > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground font-medium">Quote total</span>
                <span className="tabular-nums font-semibold text-foreground">
                  {formatINR(runningTotal)}
                </span>
              </div>
            )}

            <SheetFooter className="px-0 pb-0">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Creating…' : 'Create quotation'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
