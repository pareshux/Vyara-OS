'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PlusCircle, FileText, Trash2, Plus, Upload, ExternalLink } from 'lucide-react'
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

interface Contact {
  id: string
  full_name: string
  role_title: string | null
  firm: { name: string } | null
}

interface QuotesTabProps {
  projectId?: string
  leadId?: string
  quotes: Quote[]
  products: Product[]
  contacts?: Contact[]
  userRole?: string
}

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
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function QuotesTab({ projectId, leadId, quotes, products, contacts = [], userRole }: QuotesTabProps) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Mark Sent dialog state
  const [markSentQuote, setMarkSentQuote] = useState<{ id: string; number: string } | null>(null)
  const [sentToContactId, setSentToContactId] = useState<string>('')

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

  const [priceSources, setPriceSources] = useState<Record<number, { listCode: string; listPrice: number; entryId: string } | null>>({})

  async function resolveActivePrice(index: number, productId: string, qty: number) {
    if (!productId || !(qty > 0) || !projectId) return
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
    return sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0)
  }, 0)

  function onSubmit(values: QuoteFormValues) {
    startTransition(async () => {
      const result = await createQuotation({
        ...(projectId ? { project_id: projectId } : {}),
        ...(leadId ? { lead_id: leadId } : {}),
        notes: values.notes,
        valid_until: values.valid_until || undefined,
        lines: values.lines.map((l, i) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          description: l.description || undefined,
          price_list_entry_id: priceSources[i] && Math.abs(Number(l.unit_price) - priceSources[i]!.listPrice) < 0.005
            ? priceSources[i]!.entryId
            : null,
        })),
      })

      if ('error' in result) { toast.error(result.error); return }
      toast.success(`Quote ${result.quotation_number} created`)
      reset({ lines: [{ product_id: '', quantity: '1', unit_price: '', description: '' }] })
      setPriceSources({})
      setSheetOpen(false)
      router.refresh()
    })
  }

  function confirmMarkSent() {
    if (!markSentQuote) return
    startTransition(async () => {
      const result = await updateQuotationStatus(markSentQuote.id, 'sent', {
        sent_to_contact_id: sentToContactId || undefined,
      })
      if ('error' in result) { toast.error(result.error); return }
      toast.success('Quote marked as Sent')
      setMarkSentQuote(null)
      setSentToContactId('')
      router.refresh()
    })
  }

  function handleStatusChange(quoteId: string, status: 'won' | 'lost') {
    startTransition(async () => {
      const result = await updateQuotationStatus(quoteId, status)
      if ('error' in result) { toast.error(result.error); return }
      toast.success(`Quote marked as ${STATUS_STYLES[status === 'won' ? 'accepted' : 'rejected']?.label ?? status}`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {quotes.length} {quotes.length === 1 ? 'quotation' : 'quotations'}
        </p>
        <div className="flex items-center gap-2">
          {projectId && (
            <Link href={`/projects/${projectId}/import-boq`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Upload className="size-3.5" />
                Import BOQ
              </Button>
            </Link>
          )}
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <PlusCircle className="size-4 mr-1.5" />
            Create Quote
          </Button>
        </div>
      </div>

      {leadId && !projectId && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/40 px-3 py-2">
          Quotes created here are linked to this lead. Prices must be entered manually — price list lookup activates once the lead converts to a project.
        </p>
      )}

      {/* Table */}
      {quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <FileText className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No quotations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {leadId && !projectId ? 'Create the first quote for this lead.' : 'Create the first quote for this project.'}
          </p>
          <Button size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
            Create quote
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Quote #</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Valid until</th>
                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Created</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground tabular-nums">Value</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const statusStyle = STATUS_STYLES[q.status] ?? STATUS_STYLES.draft
                const isExpiringSoon = q.valid_until && q.status === 'sent' &&
                  new Date(q.valid_until).getTime() - Date.now() < 7 * 86_400_000
                const canSend = (q.status === 'draft' || q.status === 'revised') && !isSalesEngineer
                const canMarkWon = q.status === 'sent'
                const canMarkLost = q.status !== 'rejected' && q.status !== 'accepted' && q.status !== 'expired'

                return (
                  <tr key={q.id} className="border-b border-border last:border-0 hover:bg-muted/30 group">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-mono text-sm font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        {q.quotation_number}
                        <ExternalLink className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {q.lines.length} {q.lines.length === 1 ? 'item' : 'items'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className="border-0 text-xs"
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                      >
                        {statusStyle.label}
                      </Badge>
                      {q.sent_at && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Sent {timeAgo(q.sent_at)}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      {q.valid_until ? (
                        <span className={`text-sm tabular-nums ${isExpiringSoon ? 'text-amber-700 font-medium' : 'text-muted-foreground'}`}>
                          {new Date(q.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {isExpiringSoon && <span className="ml-1 text-xs">· Soon</span>}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground lg:table-cell">
                      {timeAgo(q.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {q.total != null ? formatINR(q.total) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <a href={`/quotes/${q.id}/boq`} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="text-xs h-7 px-2">BOQ</Button>
                        </a>
                        {canSend && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            disabled={isPending}
                            onClick={() => { setMarkSentQuote({ id: q.id, number: q.quotation_number }); setSentToContactId('') }}
                          >
                            Mark Sent
                          </Button>
                        )}
                        {canMarkWon && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
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
                            className="text-xs h-7 px-2 text-muted-foreground"
                            disabled={isPending}
                            onClick={() => handleStatusChange(q.id, 'lost')}
                          >
                            Lost
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark Sent dialog */}
      <Dialog open={!!markSentQuote} onOpenChange={(open) => { if (!open) setMarkSentQuote(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Sent</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Quote <span className="font-mono font-medium text-foreground">{markSentQuote?.number}</span> will be marked as sent.
            </p>
            {contacts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Sent to (optional)</Label>
                <Select value={sentToContactId} onValueChange={setSentToContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact…" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex flex-col">
                          <span>{c.full_name}</span>
                          {(c.firm || c.role_title) && (
                            <span className="text-xs text-muted-foreground">
                              {[c.role_title, c.firm?.name].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkSentQuote(null)}>Cancel</Button>
            <Button onClick={confirmMarkSent} disabled={isPending}>
              {isPending ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="q_valid_until">Valid until</Label>
                <Input id="q_valid_until" type="date" {...register('valid_until')} />
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
                    <div key={field.id} className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-2.5">
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
                                  setPriceSources((s) => ({ ...s, [index]: null }))
                                  const qty = Number(linesWatch?.[index]?.quantity) || 1
                                  void resolveActivePrice(index, v, qty).then(() => {
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
                                      <span className="font-mono text-xs text-muted-foreground ml-1">{p.sku_code}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {errors.lines?.[index]?.product_id && (
                            <p className="text-xs text-destructive">{errors.lines[index]?.product_id?.message}</p>
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
                                const pid = linesWatch?.[index]?.product_id
                                const qty = Number(linesWatch?.[index]?.quantity) || 0
                                if (pid && qty > 0) void resolveActivePrice(index, pid, qty)
                              },
                            })}
                            type="number" min="1" step="1" placeholder="1"
                            className="h-8 text-xs tabular-nums"
                          />
                          {errors.lines?.[index]?.quantity && (
                            <p className="text-xs text-destructive">{errors.lines[index]?.quantity?.message}</p>
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground">Unit price (₹) *</Label>
                          <Input
                            {...register(`lines.${index}.unit_price`)}
                            type="number" min="0" step="0.01" placeholder="0.00"
                            className="h-8 text-xs tabular-nums"
                          />
                          {errors.lines?.[index]?.unit_price && (
                            <p className="text-xs text-destructive">{errors.lines[index]?.unit_price?.message}</p>
                          )}
                          {priceSources[index] && (() => {
                            const src = priceSources[index]!
                            const entered = Number(linesWatch?.[index]?.unit_price) || 0
                            const delta = entered - src.listPrice
                            const deltaPct = src.listPrice > 0 ? (delta / src.listPrice) * 100 : 0
                            const isMatch = Math.abs(delta) < 0.005
                            return (
                              <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1.5 flex-wrap">
                                <span>From <span className="font-mono text-foreground">{src.listCode}</span> · ₹{src.listPrice.toLocaleString('en-IN')}</span>
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

            {runningTotal > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground font-medium">Quote total</span>
                <span className="tabular-nums font-semibold text-foreground">{formatINR(runningTotal)}</span>
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
