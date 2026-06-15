import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ImportInvoicesForm } from './form'

export const dynamic = 'force-dynamic'

export default async function ImportInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-lg font-semibold">Import invoices from CSV</h1>
      <p className="text-sm text-muted-foreground">
        Use this when bulk-importing from Tally exports or another billing
        system. Each row creates one invoice. Existing rows (matched by
        <span className="font-medium"> external_invoice_number</span>) are
        skipped — re-imports are safe.
      </p>

      <Card>
        <CardContent className="pt-4">
          <ImportInvoicesForm />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="pt-3 flex flex-col gap-2 text-sm">
          <p className="font-medium">Expected columns (header row required):</p>
          <pre className="overflow-x-auto font-mono text-xs bg-muted/40 rounded px-2 py-2">
{`external_invoice_number,invoice_date,due_date,subtotal,gst_pct,retention_pct,notes`}
          </pre>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Required:</span> external_invoice_number, invoice_date (YYYY-MM-DD),
            due_date (YYYY-MM-DD), subtotal. <span className="font-medium">Optional:</span> gst_pct (default 18),
            retention_pct (default 0), notes.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
