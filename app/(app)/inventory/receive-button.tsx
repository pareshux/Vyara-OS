'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PackagePlus } from 'lucide-react'
import { recordReceipt, type ReceiptReason } from '@/lib/actions/stock'
import { createClient } from '@/lib/supabase/client'

interface Props {
  /** When given, restricts the receive flow to one warehouse (e.g. from /warehouses/[id]). */
  warehouseId?: string
  warehouseCode?: string
  /** When given, restricts to a single product (e.g. inline receipt on a stock row). */
  productId?: string
  productSkuCode?: string
  productName?: string
  /** Visual variant: solid for top-level CTA, ghost inline */
  variant?: 'default' | 'ghost'
  label?: string
}

export function ReceiveButton({
  warehouseId,
  warehouseCode,
  productId,
  productSkuCode,
  productName,
  variant = 'default',
  label,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [warehouses, setWarehouses] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [products, setProducts] = useState<Array<{ id: string; sku_code: string; name: string; unit: string }>>([])
  const [pickedWarehouse, setPickedWarehouse] = useState<string>(warehouseId ?? '')
  const [pickedProduct, setPickedProduct] = useState<string>(productId ?? '')
  const [quantity, setQuantity] = useState<number>(0)
  const [reason, setReason] = useState<ReceiptReason>('production')
  const [remark, setRemark] = useState<string>('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    if (!warehouseId) {
      supabase
        .from('warehouse')
        .select('id, code, name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('code')
        .then(({ data }) => setWarehouses((data ?? []) as typeof warehouses))
    }
    if (!productId) {
      supabase
        .from('product')
        .select('id, sku_code, name, unit')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sku_code')
        .then(({ data }) => setProducts((data ?? []) as typeof products))
    }
  }, [open, warehouseId, productId])

  const productLabel = useMemo(() => {
    if (productSkuCode && productName) return `${productSkuCode} — ${productName}`
    const p = products.find((x) => x.id === pickedProduct)
    return p ? `${p.sku_code} — ${p.name}` : null
  }, [productSkuCode, productName, products, pickedProduct])

  function submit() {
    setErr(null)
    if (!pickedWarehouse) { setErr('Pick a warehouse'); return }
    if (!pickedProduct) { setErr('Pick a product'); return }
    if (quantity <= 0) { setErr('Quantity must be greater than zero'); return }
    startTransition(async () => {
      const res = await recordReceipt({
        warehouse_id: pickedWarehouse,
        product_id: pickedProduct,
        quantity,
        reason_code: reason,
        remark: remark.trim() || undefined,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success('Stock received')
        setOpen(false)
        setQuantity(0)
        setRemark('')
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)} className={variant === 'ghost' ? 'h-7 px-2' : ''}>
        <PackagePlus className={variant === 'ghost' ? 'size-3 mr-1' : 'size-4 mr-1.5'} />
        {label ?? 'Receive'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Receive stock {warehouseCode && <span className="font-mono text-sm text-muted-foreground">@ {warehouseCode}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {!warehouseId && (
              <div className="flex flex-col gap-1.5">
                <Label>Warehouse</Label>
                <Select value={pickedWarehouse} onValueChange={setPickedWarehouse}>
                  <SelectTrigger><SelectValue placeholder="Pick a warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        <span className="font-mono text-xs mr-1">{w.code}</span> — {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {productId ? (
              <p className="text-sm text-muted-foreground">
                Product: <span className="font-mono text-xs">{productSkuCode}</span> — {productName}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Product</Label>
                <Select value={pickedProduct} onValueChange={setPickedProduct}>
                  <SelectTrigger><SelectValue placeholder="Pick a product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-mono text-xs mr-1">{p.sku_code}</span> — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  min={0}
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Reason</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as ReceiptReason)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production (plant output)</SelectItem>
                    <SelectItem value="purchase">Purchase (vendor delivery)</SelectItem>
                    <SelectItem value="transfer_in_external">Transfer from another tenant / external</SelectItem>
                    <SelectItem value="return_from_customer">Return from customer</SelectItem>
                    <SelectItem value="opening_balance">Opening balance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="remark">Remark (optional)</Label>
              <Textarea id="remark" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Batch #, vehicle, GRN ref, etc." />
            </div>

            {productLabel && quantity > 0 && (
              <p className="text-xs text-muted-foreground">
                Recording: <span className="tabular-nums font-medium text-foreground">+{quantity.toLocaleString('en-IN')}</span> of {productLabel}
              </p>
            )}

            {err && <p className="text-xs text-destructive">{err}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Receive'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
