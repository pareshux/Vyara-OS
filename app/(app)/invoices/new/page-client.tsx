'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { NewInvoiceForm, type InvoiceAIPrefill } from './form'
import { CaptureInvoiceButton } from './capture-invoice-button'
import type { InvoiceDefaults } from '@/lib/actions/invoices'
import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'

interface Props {
  projects: { id: string; name: string }[]
  firms: { id: string; name: string }[]
  orders: { id: string; order_number: string; value: number; project_id: string; buyer_firm_id: string | null }[]
  initialDefaults: InvoiceDefaults
  tenantId: string | null
  photoEntryEnabled: boolean
}

export function InvoiceNewPageClient({
  projects,
  firms,
  orders,
  initialDefaults,
  tenantId,
  photoEntryEnabled,
}: Props) {
  const [prefill, setPrefill] = useState<InvoiceAIPrefill | null>(null)

  function handlePrefill(p: InvoiceAIPrefill) {
    setPrefill(p)
  }

  return (
    <div className="flex flex-col gap-4">
      {photoEntryEnabled && tenantId && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Have a photo or PDF of the invoice? Skip the typing.
          </p>
          <CaptureInvoiceButton tenantId={tenantId} onPrefill={handlePrefill} />
        </div>
      )}

      {prefill && (
        <div className="rounded-md bg-primary/5 border border-primary/30 px-3 py-2 text-xs text-foreground flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary shrink-0" />
          <span>
            Form pre-filled from AI extraction. Verify each field below before saving.
          </span>
          {prefill.avg_confidence != null && (
            <Badge variant="outline" className="ml-auto border-0 text-[10px] uppercase">
              ~{Math.round(prefill.avg_confidence * 100)}% confidence
            </Badge>
          )}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <NewInvoiceForm
            // Force remount on new prefill so initial-state effects re-run cleanly
            key={prefill?.extraction_id ?? 'manual'}
            projects={projects}
            firms={firms}
            orders={orders}
            initialDefaults={initialDefaults}
            aiPrefill={prefill}
          />
        </CardContent>
      </Card>
    </div>
  )
}
