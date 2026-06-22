/**
 * <ProjectGates> — Phase 5b. Renders the gate state for the project's
 * current stage as chips, and offers an upload affordance for any
 * document-type gate that's not yet satisfied.
 *
 * Server component. Calls evaluateGatesForProject (Phase 5a helper).
 * The upload affordance is the existing <AttachmentUploadButton>
 * client component with metadata tagging — when a file lands with
 * metadata.type_key = '<gate.required>', the helper sees it as
 * satisfying the gate.
 *
 * Hidden cleanly when the project has no gates configured.
 */

import { createClient } from '@/lib/supabase/server'
import { evaluateGatesForProject } from '@/lib/gates'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AttachmentUploadButton } from '@/components/attachment/upload-button'
import { CheckCircle2, AlertCircle, FileText } from 'lucide-react'

const DOC_TYPE_LABELS: Record<string, string> = {
  drawing_approval_pack: 'Customer-approved drawing pack',
  acceptance_certificate: 'Acceptance certificate',
  retention_release_letter: 'Retention release letter',
}

function labelFor(typeKey: string): string {
  return DOC_TYPE_LABELS[typeKey] ?? typeKey.replace(/_/g, ' ')
}

export async function ProjectGates({ projectId, tenantId }: { projectId: string; tenantId: string }) {
  const supabase = await createClient()
  const r = await evaluateGatesForProject(supabase, projectId)
  if (!r.ok || r.data.length === 0) return null

  const gates = r.data
  const allSatisfied = gates.every((g) => g.satisfied)

  return (
    <Card className={allSatisfied ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stage gates
          </h3>
          {allSatisfied ? (
            <Badge variant="outline" className="text-emerald-700 border-emerald-400 text-xs">
              <CheckCircle2 className="size-3 mr-1" />
              All gates satisfied
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 border-amber-400 text-xs">
              <AlertCircle className="size-3 mr-1" />
              {gates.filter((g) => !g.satisfied).length} pending
            </Badge>
          )}
        </div>

        <ul className="flex flex-col gap-2.5">
          {gates.map((g) => (
            <li key={g.id} className="flex items-start gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {g.satisfied ? (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{g.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.kind === 'document' ? `Requires: ${labelFor(g.required)}` : `Requires field: ${g.required}`}
                    {g.is_hard && <span className="ml-1 text-destructive">· hard gate</span>}
                  </p>
                </div>
              </div>

              {/* Upload affordance only for unsatisfied document gates */}
              {!g.satisfied && g.kind === 'document' && (
                <AttachmentUploadButton
                  tenantId={tenantId}
                  entityType="project"
                  entityId={projectId}
                  kind="document"
                  label={`Upload ${labelFor(g.required)}`}
                  size="sm"
                  variant="outline"
                  metadata={{ type_key: g.required, gate_id: g.id }}
                />
              )}

              {g.satisfied && (
                <Badge variant="secondary" className="text-emerald-700 bg-emerald-100 text-xs">
                  <FileText className="size-3 mr-1" />
                  On file
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
