'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FolderKanban, PlusCircle } from 'lucide-react'
import { CreateProjectSheet } from './create-project-sheet'
import { ScannableStatusDot } from '@/components/projects/scannable-progress-header'
import { ListFilter } from '@/components/app/list-filter'
import type { Health } from '@/lib/read-models/project-progress'

interface PipelineStage {
  id: string
  label: string
  color: string
}

interface Project {
  id: string
  name: string
  segment: string
  city: string | null
  estimated_value: number | null
  current_stage: PipelineStage | null
  owner: { id: string; full_name: string } | null
  health: Health
  health_reason: string
}

interface Firm {
  id: string
  name: string
}

interface UserProfile {
  id: string
  full_name: string
}

interface ProjectsClientProps {
  projects: Project[]
  firms: Firm[]
  users: UserProfile[]
  currentUserId: string
  stageCounts: { label: string; color: string; count: number }[]
  stageOptions: { id: string; label: string; color: string }[]
  ownerOptions: { id: string; label: string }[]
  segmentOptions: { value: string; label: string }[]
  totalCount: number
  filteredCount: number
}

export function ProjectsClient({
  projects,
  firms,
  users,
  currentUserId,
  stageCounts,
  stageOptions,
  ownerOptions,
  segmentOptions,
  totalCount,
  filteredCount,
}: ProjectsClientProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {filteredCount < totalCount
              ? `${filteredCount} of ${totalCount} projects`
              : `${totalCount} ${totalCount === 1 ? 'project' : 'projects'}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" />
          New Project
        </Button>
      </div>

      {/* Stage distribution (full-set counts, display-only) */}
      {stageCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stageCounts.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: `${s.color}20`, color: s.color }}
            >
              <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="tabular-nums font-semibold">{s.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <ListFilter
        searchPlaceholder="Search by name or city…"
        selects={[
          {
            key: 'stage',
            label: 'Stage',
            placeholder: 'All stages',
            options: stageOptions.map((s) => ({ value: s.id, label: s.label, color: s.color })),
          },
          {
            key: 'owner',
            label: 'Owner',
            placeholder: 'All owners',
            options: ownerOptions.map((o) => ({ value: o.id, label: o.label })),
          },
          {
            key: 'segment',
            label: 'Segment',
            placeholder: 'All segments',
            options: segmentOptions,
          },
        ]}
      />

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <FolderKanban className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            {filteredCount < totalCount ? 'No projects match the filters' : 'No projects yet'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filteredCount < totalCount
              ? 'Try clearing some filters.'
              : 'Create your first project to start tracking specifications.'}
          </p>
          {filteredCount >= totalCount && (
            <Button size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
              Create project
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-px"></th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Stage</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">Segment</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Owner</th>
                <th className="hidden px-4 py-2.5 text-right font-medium text-muted-foreground lg:table-cell">Est. Value</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground xl:table-cell">City</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="px-3 py-3 w-px">
                    <ScannableStatusDot health={p.health} label={p.health_reason} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {p.current_stage ? (
                      <Badge
                        variant="outline"
                        className="border-0 text-xs"
                        style={{
                          backgroundColor: `${p.current_stage.color}20`,
                          color: p.current_stage.color,
                        }}
                      >
                        {p.current_stage.label}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 capitalize text-muted-foreground sm:table-cell">
                    {p.segment}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {p.owner?.full_name ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">
                    {p.estimated_value != null
                      ? `₹${p.estimated_value.toLocaleString('en-IN')}`
                      : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                    {p.city ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateProjectSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        firms={firms}
        users={users}
        currentUserId={currentUserId}
      />
    </>
  )
}
