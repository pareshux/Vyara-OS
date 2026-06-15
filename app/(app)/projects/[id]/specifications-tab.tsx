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
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { PlusCircle, Package } from 'lucide-react'
import { createSpecification } from '@/lib/actions/specifications'

const schema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  finish: z.string().optional(),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Product {
  id: string
  sku_code: string
  name: string
  unit: string
  category: string | null
}

interface Specification {
  id: string
  finish: string | null
  quantity: number | null
  unit: string | null
  is_confirmed: boolean
  product: { name: string; sku_code: string } | null
}

interface SpecificationsTabProps {
  projectId: string
  specs: Specification[]
  products: Product[]
}

export function SpecificationsTab({ projectId, specs, products }: SpecificationsTabProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const productId = watch('product_id')
  const selectedProduct = products.find((p) => p.id === productId)

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createSpecification({
        project_id: projectId,
        product_id: values.product_id,
        finish: values.finish,
        quantity: values.quantity ? parseFloat(values.quantity) : undefined,
        unit: values.unit || selectedProduct?.unit,
        notes: values.notes,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Specification added')
      reset()
      setDialogOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {specs.length} {specs.length === 1 ? 'specification' : 'specifications'}
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" />
          Add Specification
        </Button>
      </div>

      {specs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <Package className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No specifications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Record which products have been specified for this project.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
            Add specification
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Product</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">Finish</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground tabular-nums">Qty</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Unit</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {specs.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.product?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {s.product?.sku_code}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {s.finish ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {s.quantity != null
                      ? s.quantity.toLocaleString('en-IN')
                      : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {s.unit ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        s.is_confirmed
                          ? 'border-0 bg-green-50 text-green-700'
                          : 'border-0 bg-amber-50 text-amber-700'
                      }
                    >
                      {s.is_confirmed ? 'Confirmed' : 'Pending'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Specification</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label>Product *</Label>
              <Select onValueChange={(v) => { setValue('product_id', v); setValue('unit', products.find(p => p.id === v)?.unit ?? '') }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select product…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground ml-1 font-mono text-xs">{p.sku_code}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.product_id && (
                <p className="text-xs text-destructive">{errors.product_id.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spec_finish">Finish</Label>
              <Input id="spec_finish" {...register('finish')} placeholder="Natural, Polished, Tumbled…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="spec_qty">Quantity</Label>
                <Input
                  id="spec_qty"
                  {...register('quantity')}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  className="tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="spec_unit">Unit</Label>
                <Input
                  id="spec_unit"
                  {...register('unit')}
                  placeholder={selectedProduct?.unit ?? 'sqft'}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spec_notes">Notes</Label>
              <Textarea
                id="spec_notes"
                {...register('notes')}
                placeholder="Any relevant notes about this specification…"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Adding…' : 'Add specification'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
