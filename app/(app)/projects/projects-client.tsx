'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FolderKanban, PlusCircle } from 'lucide-react'
import { CreateProjectSheet } from './create-project-sheet'

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
  owner: { full_name: string } | null
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
}

export function ProjectsClient({
  projects,
  firms,
  users,
  currentUserId,
  stageCounts,
}: ProjectsClientProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </p>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" />
          New Project
        </Button>
      </div>

      {stageCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stageCounts.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: `${s.color}20`, color: s.color }}
            >
              <span
                className="size-1.5 rounded-full inline-block"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
              <span className="tabular-nums font-semibold">{s.count}</span>
            </span>
          ))}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <FolderKanban className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first project to start tracking specifications.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
            Create project
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
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
