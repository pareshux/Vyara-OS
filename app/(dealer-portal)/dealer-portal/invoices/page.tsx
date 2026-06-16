import { Card, CardContent } from '@/components/ui/card'
import { FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function DealerInvoicesPlaceholder() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <h1 className="text-lg font-semibold">My invoices</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Coming in Step 5</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Full invoice list with status, due dates, and outstanding amounts.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
