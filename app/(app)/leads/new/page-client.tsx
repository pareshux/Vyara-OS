'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'
import { NewLeadForm, type LeadAIPrefill } from './form'
import { CaptureBusinessCardButton } from './capture-business-card-button'

interface Props {
  sources: { id: string; code: string; label: string }[]
  owners: { id: string; full_name: string; role: string }[]
  firms: { id: string; name: string; type: string }[]
  contacts: { id: string; full_name: string; firm_id: string | null }[]
  defaultOwnerId: string
  tenantId: string | null
  businessCardEnabled: boolean
}

export function NewLeadPageClient({
  sources, owners, firms, contacts, defaultOwnerId, tenantId, businessCardEnabled,
}: Props) {
  const [prefill, setPrefill] = useState<LeadAIPrefill | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {businessCardEnabled && tenantId && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Have a business card? Snap a photo to skip the typing.
          </p>
          <CaptureBusinessCardButton tenantId={tenantId} onPrefill={setPrefill} />
        </div>
      )}

      {prefill && (
        <div className="rounded-md bg-primary/5 border border-primary/30 px-3 py-2 text-xs text-foreground flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary shrink-0" />
          <span>
            Form pre-filled from business card. Verify each field below before saving.
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
          <NewLeadForm
            key={prefill?.extraction_id ?? 'manual'}
            sources={sources}
            owners={owners}
            firms={firms}
            contacts={contacts}
            defaultOwnerId={defaultOwnerId}
            aiPrefill={prefill}
          />
        </CardContent>
      </Card>
    </div>
  )
}
