'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle } from 'lucide-react'

interface Lead {
  id: string
  lead_number: string
  title: string
  estimated_value: number | null
  owner_name: string | null
  source_label: string | null
  stage_id: string
  last_activity_at: string
}

interface Stage {
  id: string
  label: string
  color: string
  is_won: boolean
  is_lost: boolean
}

export function LeadKanban({ leads, stages }: { leads: Lead[]; stages: Stage[] }) {
  const grouped: Record<string, Lead[]> = {}
  for (const s of stages) grouped[s.id] = []
  for (const l of leads) {
    if (grouped[l.stage_id]) grouped[l.stage_id].push(l)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-6 md:px-6">
      {stages.map((stage) => {
        const cards = grouped[stage.id] ?? []
        const subtotal = cards.reduce((s, c) => s + Number(c.estimated_value ?? 0), 0)
        return (
          <div key={stage.id} className="flex-shrink-0 w-[270px] flex flex-col gap-2">
            <div
              className="rounded-md px-3 py-2 text-xs uppercase font-medium tracking-wide flex items-center justify-between"
              style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
            >
              <span className="flex items-center gap-1.5">
                {stage.is_won && <CheckCircle2 className="size-3" />}
                {stage.is_lost && <XCircle className="size-3" />}
                {stage.label}
              </span>
              <span className="tabular-nums">{cards.length}</span>
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums text-right">
              ₹{subtotal.toLocaleString('en-IN')}
            </div>

            <div className="flex flex-col gap-2 min-h-[200px]">
              {cards.length === 0 && (
                <div className="text-xs text-muted-foreground italic text-center py-6">
                  —
                </div>
              )}
              {cards.map((lead) => {
                const daysSince = Math.floor(
                  (Date.now() - new Date(lead.last_activity_at).getTime()) / 86_400_000
                )
                return (
                  <Link key={lead.id} href={`/leads/${lead.id}`}>
                    <Card size="sm" className="hover:bg-muted/30 transition-colors cursor-pointer">
                      <CardContent className="pt-3 pb-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">{lead.lead_number}</span>
                          {lead.estimated_value != null && (
                            <span className="text-xs font-semibold text-primary tabular-nums">
                              ₹{Math.round(Number(lead.estimated_value) / 100000) >= 100
                                ? `${(Number(lead.estimated_value) / 10_000_000).toFixed(1)}Cr`
                                : `${(Number(lead.estimated_value) / 100_000).toFixed(1)}L`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2 min-h-[2.4em]">{lead.title}</p>
                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <span>{lead.owner_name ?? '—'}</span>
                          {lead.source_label && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 uppercase">
                              {lead.source_label}
                            </Badge>
                          )}
                        </div>
                        {!stage.is_won && !stage.is_lost && (
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            {daysSince === 0 ? 'today' : daysSince === 1 ? '1d ago' : `${daysSince}d ago`}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
