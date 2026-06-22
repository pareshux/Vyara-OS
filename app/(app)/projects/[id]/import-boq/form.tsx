'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, ClipboardPaste, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createQuotation } from '@/lib/actions/quotations'
import { getActivePriceForLine } from '@/lib/actions/price-lists'

interface Product {
  id: string
  name: string
  sku_code: string
  unit: string
  base_price: number | null
}

interface BOQRow {
  // Customer's side (from their BOQ)
  customerDescription: string
  customerQty: string
  customerUnit: string
  // Our catalog mapping
  productId: string
  unitPrice: string
  priceSource: string | null   // e.g. "DEFAULT_2026 · ₹291.67"
}

function emptyRow(): BOQRow {
  return { customerDescription: '', customerQty: '', customerUnit: '', productId: '', unitPrice: '', priceSource: null }
}

function formatINR(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseExcelPaste(text: string): BOQRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Try tab-separated first, then comma-separated
      const parts = line.includes('\t') ? line.split('\t') : line.split(',')
      const desc = parts[0]?.trim() ?? ''
      const qty = parts[1]?.trim().replace(/[^0-9.]/g, '') ?? ''
      const unit = parts[2]?.trim() ?? ''
      return { customerDescription: desc, customerQty: qty, customerUnit: unit, productId: '', unitPrice: '', priceSource: null }
    })
    .filter((r) => r.customerDescription)
}

export function ImportBOQForm({
  projectId,
  projectName,
  products,
}: {
  projectId: string
  projectName: string
  products: Product[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<BOQRow[]>([emptyRow()])
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [ref, setRef] = useState('')  // customer's BOQ reference

  function updateRow(index: number, patch: Partial<BOQRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function applyPaste() {
    if (!pasteText.trim()) return
    const parsed = parseExcelPaste(pasteText)
    if (parsed.length === 0) {
      toast.error('Could not parse any rows. Make sure each line has: Description [tab] Qty [tab] Unit')
      return
    }
    setRows(parsed)
    setShowPaste(false)
    setPasteText('')
    toast.success(`${parsed.length} rows imported from paste`)
  }

  async function handleProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    updateRow(index, { productId, unitPrice: '', priceSource: null, customerUnit: product.unit })

    // Try price list resolution
    const qty = Number(rows[index].customerQty) || 1
    const res = await getActivePriceForLine({ project_id: projectId, product_id: productId, qty })
    if (!('error' in res) && res.price) {
      updateRow(index, {
        productId,
        unitPrice: String(res.price.unit_price),
        priceSource: `${res.price.price_list_code} · ₹${res.price.unit_price.toLocaleString('en-IN')}`,
        customerUnit: product.unit,
      })
    } else if (product.base_price != null) {
      updateRow(index, {
        productId,
        unitPrice: String(product.base_price),
        priceSource: `base · ₹${product.base_price.toLocaleString('en-IN')}`,
        customerUnit: product.unit,
      })
    }
  }

  const mappedRows = rows.filter((r) => r.productId && Number(r.customerQty) > 0 && Number(r.unitPrice) >= 0)
  const unmappedCount = rows.filter((r) => !r.productId).length
  const subtotal = mappedRows.reduce((s, r) => s + Number(r.customerQty) * Number(r.unitPrice), 0)

  function handleSubmit() {
    if (mappedRows.length === 0) {
      toast.error('Map at least one row to a catalog product before generating the quote.')
      return
    }

    startTransition(async () => {
      const result = await createQuotation({
        project_id: projectId,
        notes: [ref ? `Customer BOQ ref: ${ref}` : '', notes].filter(Boolean).join('\n') || undefined,
        valid_until: validUntil || undefined,
        lines: mappedRows.map((r) => ({
          product_id: r.productId,
          quantity: Number(r.customerQty),
          unit_price: Number(r.unitPrice),
          description: r.customerDescription || undefined,
        })),
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success(`Quote ${result.quotation_number} created from BOQ`)
      router.push(`/projects/${projectId}?tab=quotes`)
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <div className="h-4 w-px bg-border" />
            <div>
              <p className="text-xs text-muted-foreground">Import BOQ</p>
              <p className="text-sm font-semibold text-foreground leading-tight">{projectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unmappedCount > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="size-3.5" />
                {unmappedCount} row{unmappedCount > 1 ? 's' : ''} not mapped
              </p>
            )}
            <Button onClick={handleSubmit} disabled={isPending || mappedRows.length === 0}>
              {isPending ? 'Creating…' : `Generate Quote (${mappedRows.length} line${mappedRows.length !== 1 ? 's' : ''})`}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col gap-6">

        {/* Quote settings */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground mb-3">Quote settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="boq_ref" className="text-xs text-muted-foreground">Customer BOQ reference</Label>
              <Input
                id="boq_ref"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="e.g. BOQ-2026-042"
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="boq_valid" className="text-xs text-muted-foreground">Quote valid until</Label>
              <Input
                id="boq_valid"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="boq_notes" className="text-xs text-muted-foreground">Notes</Label>
              <Input
                id="boq_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery terms, remarks…"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* Paste from Excel */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-foreground">BOQ line items</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enter rows manually, or paste directly from Excel/Google Sheets.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowPaste((v) => !v)}
            >
              <ClipboardPaste className="size-3.5" />
              {showPaste ? 'Cancel paste' : 'Paste from Excel'}
            </Button>
          </div>

          {showPaste && (
            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Copy rows from Excel/Google Sheets (select Description, Qty, Unit columns) and paste below.
                Each row should be: <span className="font-mono bg-muted px-1 rounded">Description [Tab] Qty [Tab] Unit</span>
              </p>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Cobble Paver 60mm Grey\t12000\tsqft\nKerb Stone 150mm\t4000\trft"}
                rows={5}
                className="font-mono text-xs"
              />
              <Button size="sm" className="self-start" onClick={applyPaste}>
                Import {pasteText.split('\n').filter(Boolean).length} rows
              </Button>
            </div>
          )}

          {/* Column headers */}
          <div className="grid gap-2 mb-2 px-1" style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr 1fr auto' }}>
            <p className="text-xs font-medium text-muted-foreground">Customer description</p>
            <p className="text-xs font-medium text-muted-foreground">Qty</p>
            <p className="text-xs font-medium text-muted-foreground">Unit</p>
            <p className="text-xs font-medium text-muted-foreground">→ Catalog product</p>
            <p className="text-xs font-medium text-muted-foreground">Rate (₹)</p>
            <p className="text-xs font-medium text-muted-foreground text-right">Line total</p>
            <span />
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => {
              const qty = Number(row.customerQty) || 0
              const price = Number(row.unitPrice) || 0
              const lineTotal = qty * price
              const isMapped = !!row.productId

              return (
                <div
                  key={index}
                  className={`grid gap-2 items-center rounded-lg border px-3 py-2.5 transition-colors ${
                    isMapped ? 'border-border bg-card' : 'border-dashed border-border bg-muted/20'
                  }`}
                  style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr 1fr auto' }}
                >
                  {/* Customer description */}
                  <Input
                    value={row.customerDescription}
                    onChange={(e) => updateRow(index, { customerDescription: e.target.value })}
                    placeholder="e.g. Cobble Paver 60mm Grey"
                    className="h-8 text-xs"
                  />

                  {/* Qty */}
                  <Input
                    value={row.customerQty}
                    onChange={(e) => updateRow(index, { customerQty: e.target.value })}
                    type="number"
                    min="0"
                    placeholder="0"
                    className="h-8 text-xs tabular-nums"
                  />

                  {/* Unit */}
                  <Input
                    value={row.customerUnit}
                    onChange={(e) => updateRow(index, { customerUnit: e.target.value })}
                    placeholder="sqft"
                    className="h-8 text-xs"
                  />

                  {/* Catalog product mapping */}
                  <div className="flex flex-col gap-0.5">
                    <Select value={row.productId} onValueChange={(v) => handleProductChange(index, v)}>
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="Map to product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span>{p.name}</span>
                            <span className="font-mono text-xs text-muted-foreground ml-1.5">{p.sku_code}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.priceSource && (
                      <p className="text-[10px] text-muted-foreground px-1 flex items-center gap-1">
                        <CheckCircle2 className="size-2.5 text-emerald-600 shrink-0" />
                        {row.priceSource}
                      </p>
                    )}
                  </div>

                  {/* Rate */}
                  <Input
                    value={row.unitPrice}
                    onChange={(e) => updateRow(index, { unitPrice: e.target.value, priceSource: null })}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="h-8 text-xs tabular-nums"
                  />

                  {/* Line total */}
                  <p className={`text-xs tabular-nums text-right font-medium ${lineTotal > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {lineTotal > 0 ? formatINR(lineTotal) : '—'}
                  </p>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(index)}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>

          <Button variant="ghost" size="sm" className="mt-3 gap-1.5 text-xs text-muted-foreground" onClick={addRow}>
            <Plus className="size-3.5" />
            Add row
          </Button>
        </div>

        {/* Summary */}
        {mappedRows.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {mappedRows.length} of {rows.length} rows mapped
                </p>
                {unmappedCount > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {unmappedCount} skipped
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Quote subtotal (excl. GST)</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{formatINR(subtotal)}</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
