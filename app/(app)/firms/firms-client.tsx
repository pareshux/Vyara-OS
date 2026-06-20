'use client'

import Link from 'next/link'
import { Building2, Phone, MapPin, Hash, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ListFilter } from '@/components/app/list-filter'

export type FirmRow = {
  id: string
  name: string
  type_code: string
  type_label: string
  city: string | null
  state: string
  phone: string | null
  gstin: string | null
}

export type RelationshipTypeOption = {
  code: string
  label: string
}

interface Props {
  firms: FirmRow[]
  types: RelationshipTypeOption[]
  totalCount: number
}

export function FirmsClient({ firms, types, totalCount }: Props) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Firms</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {firms.length < totalCount
            ? `${firms.length} of ${totalCount} firms`
            : `${totalCount} ${totalCount === 1 ? 'firm' : 'firms'} across all relationship types`}
        </p>
      </div>

      <ListFilter
        searchPlaceholder="Search by name, city, phone, or GSTIN…"
        selects={[
          {
            key: 'type',
            label: 'Type',
            placeholder: 'All types',
            options: types.map((t) => ({ value: t.code, label: t.label })),
          },
        ]}
      />

      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Building2 className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No firms yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Firms are created from leads, projects, contacts, or the business-card scanner.
          </p>
        </div>
      ) : firms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Building2 className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No matches</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different type or clear the search.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">Type</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">City</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Phone</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">GSTIN</th>
                <th className="px-4 py-2.5 text-right w-10" />
              </tr>
            </thead>
            <tbody>
              {firms.map((f) => (
                <tr
                  key={f.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/${f.id}`}
                      className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5"
                    >
                      <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                      {f.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {f.type_label}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {f.city ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {f.city}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground tabular-nums md:table-cell">
                    {f.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" />
                        {f.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground font-mono text-xs tabular-nums lg:table-cell">
                    {f.gstin ? (
                      <span className="inline-flex items-center gap-1">
                        <Hash className="size-3" />
                        {f.gstin}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
