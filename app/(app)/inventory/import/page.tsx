import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ImportStockForm } from './form'

export const dynamic = 'force-dynamic'

export default async function ImportStockPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-lg font-semibold">Import opening stock</h1>
      <p className="text-sm text-muted-foreground">
        Each row creates a <span className="font-mono">receipt</span> movement for the matching warehouse + SKU.
        Re-imports are safe — rows where stock already exists (available &gt; 0) are skipped.
      </p>

      <Card>
        <CardContent className="pt-4">
          <ImportStockForm />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="pt-3 flex flex-col gap-2 text-sm">
          <p className="font-medium">Expected columns (header row required):</p>
          <pre className="overflow-x-auto font-mono text-xs bg-muted/40 rounded px-2 py-2">
{`warehouse_code,sku_code,quantity,min_level,max_level,remark`}
          </pre>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Required:</span> warehouse_code (must match a warehouse you've created),
            sku_code (must match a product), quantity (positive number). <span className="font-medium">Optional:</span>
            min_level, max_level (for low-stock alerts), remark.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
