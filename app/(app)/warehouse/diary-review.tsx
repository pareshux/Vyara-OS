'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { AISuggestionCard, type SuggestionStatus } from '@/components/ai/ai-suggestion-card'
import { AISuggestionRow } from '@/components/ai/ai-suggestion-row'
import {
  acceptDispatchDiaryRow,
  rejectDispatchDiaryRow,
  type ResolvedDiaryEntry,
} from '@/lib/actions/dispatch-diary'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, AlertCircle } from 'lucide-react'

interface Transporter {
  id: string
  name: string
}

interface RowState {
  status: SuggestionStatus
  sales_order_id: string | null
  product_id: string | null
  product_name: string
  sku_code: string
  unit: string
  quantity: number
  vehicle_number: string
  lr_number: string
  transporter_id: string | null
  driver_phone: string
  scheduled_at: string // datetime-local string
  notes: string
  error: string | null
  busy: boolean
  // After accept: the dispatch number — used to render the success badge.
  dispatch_number: string | null
}

const UNIT_OPTIONS = ['sqft', 'sqm', 'nos', 'rft', 'running metre'] as const
const NONE_SENTINEL = '__none__'

function todayPlusNineAM(): string {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

function parseScheduledAt(raw: string | null): string {
  if (!raw) return todayPlusNineAM()
  // Try YYYY-MM-DD or DD/MM/YYYY or DD MMM
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[0]}T09:00`
  const dmyMatch = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const month = dmyMatch[2].padStart(2, '0')
    const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3]
    return `${year}-${month}-${day}T09:00`
  }
  return todayPlusNineAM()
}

export function DiaryReview({
  tenantId: _tenantId,
  previewUrl,
  uploadPath: _uploadPath,
  extractionId,
  pageQuality,
  entries,
  warnings,
  usage,
  latencyMs,
  onClose,
}: {
  tenantId: string
  previewUrl: string
  uploadPath: string
  extractionId: string
  pageQuality: 'clear' | 'partial' | 'unreadable'
  entries: ResolvedDiaryEntry[]
  warnings: string[]
  usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number }
  latencyMs: number
  onClose: () => void
}) {
  void _tenantId
  void _uploadPath
  const router = useRouter()
  const [transporters, setTransporters] = useState<Transporter[]>([])
  const [rowStates, setRowStates] = useState<RowState[]>(() =>
    entries.map((e) => initRowState(e))
  )

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('transporter')
      .select('id, name')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setTransporters((data ?? []) as Transporter[]))
  }, [])

  function updateRow(i: number, patch: Partial<RowState>) {
    setRowStates((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const accepted = rowStates.filter((r) => r.status === 'accepted' || r.status === 'edited').length
  const rejected = rowStates.filter((r) => r.status === 'rejected').length
  const pending = rowStates.filter((r) => r.status === 'pending').length

  return (
    <div className="grid md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4 p-4 md:p-6">
      {/* Photo column — sticky on desktop */}
      <div className="flex flex-col gap-3 md:sticky md:top-0 md:self-start">
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          <img
            src={previewUrl}
            alt="Uploaded diary page"
            className="w-full h-auto max-h-[70vh] object-contain"
          />
        </div>

        <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground tabular-nums flex flex-wrap gap-x-3 gap-y-1">
          <span>
            page:{' '}
            <span className={
              pageQuality === 'clear' ? 'text-emerald-700' :
              pageQuality === 'partial' ? 'text-amber-700' :
              'text-destructive'
            }>{pageQuality}</span>
          </span>
          <span>{(latencyMs / 1000).toFixed(1)}s</span>
          <span>in {usage.input_tokens.toLocaleString('en-IN')} tok</span>
          <span>out {usage.output_tokens.toLocaleString('en-IN')} tok</span>
        </div>

        {warnings.length > 0 && (
          <div className="text-xs text-amber-700 italic flex flex-col gap-0.5">
            {warnings.map((w, i) => (
              <div key={i}>· {w}</div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2">
          <span>
            {entries.length} entries
            {accepted > 0 && <span className="text-emerald-700"> · {accepted} accepted</span>}
            {rejected > 0 && <span className="text-muted-foreground"> · {rejected} rejected</span>}
            {pending > 0 && <span> · {pending} pending</span>}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      {/* Cards column */}
      <div className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No dispatch entries detected on this page.
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link href="/orders">Open an order and schedule manually</Link>
              </Button>
            </div>
          </div>
        ) : (
          entries.map((entry, i) => (
            <DiaryEntryCard
              key={i}
              entry={entry}
              state={rowStates[i]}
              extractionId={extractionId}
              transporters={transporters}
              onChange={(patch) => updateRow(i, patch)}
              onAccepted={() => router.refresh()}
            />
          ))
        )}
      </div>
    </div>
  )
}

function initRowState(entry: ResolvedDiaryEntry): RowState {
  const order = entry.order_candidates[0] ?? null
  const sku = entry.sku_candidates[0] ?? null
  return {
    status: 'pending',
    sales_order_id: order?.id ?? null,
    product_id: sku?.id ?? null,
    product_name: sku?.name ?? entry.sku_raw ?? '',
    sku_code: sku?.sku_code ?? '',
    unit: sku?.unit ?? entry.unit ?? 'sqft',
    quantity: typeof entry.quantity === 'number' ? entry.quantity : 0,
    vehicle_number: entry.vehicle_number ?? '',
    lr_number: entry.lr_number ?? '',
    transporter_id: null,
    driver_phone: entry.driver_phone ?? '',
    scheduled_at: parseScheduledAt(entry.scheduled_at_raw),
    notes: entry.notes ?? '',
    error: null,
    busy: false,
    dispatch_number: null,
  }
}

function DiaryEntryCard({
  entry,
  state,
  extractionId,
  transporters,
  onChange,
  onAccepted,
}: {
  entry: ResolvedDiaryEntry
  state: RowState
  extractionId: string
  transporters: Transporter[]
  onChange: (patch: Partial<RowState>) => void
  onAccepted: () => void
}) {
  const [isPending, startTransition] = useTransition()

  const blockingError = (() => {
    if (!state.sales_order_id) return 'Order not matched — pick an order to continue.'
    if (!state.product_id) return 'SKU not matched — pick a product to continue.'
    if (!state.quantity || state.quantity <= 0) return 'Quantity must be greater than zero.'
    return null
  })()

  function accept() {
    if (blockingError) {
      onChange({ error: blockingError })
      return
    }
    onChange({ busy: true, error: null })
    startTransition(async () => {
      const result = await acceptDispatchDiaryRow({
        extraction_id: extractionId,
        row_index: entry.row_index,
        original_values: {
          order_number_raw: entry.order_number_raw,
          sku_raw: entry.sku_raw,
          quantity: entry.quantity,
          unit: entry.unit,
          vehicle_number: entry.vehicle_number,
          lr_number: entry.lr_number,
          transporter_name: entry.transporter_name,
          driver_phone: entry.driver_phone,
          scheduled_at_raw: entry.scheduled_at_raw,
          notes: entry.notes,
        },
        avg_confidence: entry.avg_confidence,
        sales_order_id: state.sales_order_id!,
        product_id: state.product_id!,
        product_name: state.product_name,
        sku_code: state.sku_code,
        unit: state.unit,
        quantity: state.quantity,
        vehicle_number: state.vehicle_number.trim() || null,
        lr_number: state.lr_number.trim() || null,
        transporter_id: state.transporter_id,
        driver_phone: state.driver_phone.trim() || null,
        scheduled_at: new Date(state.scheduled_at).toISOString(),
        notes: state.notes.trim() || null,
      })
      if (!result.ok) {
        onChange({ busy: false, error: result.error })
        toast.error(result.error)
        return
      }
      const wasEdit = state.status === 'pending' && hasEdits(entry, state)
      onChange({
        busy: false,
        error: null,
        status: wasEdit ? 'edited' : 'accepted',
        dispatch_number: result.dispatch_number,
      })
      toast.success(`Dispatch ${result.dispatch_number} created`)
      onAccepted()
    })
  }

  function reject() {
    onChange({ busy: true, error: null })
    startTransition(async () => {
      const result = await rejectDispatchDiaryRow({
        extraction_id: extractionId,
        row_index: entry.row_index,
        original_values: { sku_raw: entry.sku_raw, order_number_raw: entry.order_number_raw },
        avg_confidence: entry.avg_confidence,
      })
      onChange({ busy: false, status: result.ok ? 'rejected' : 'pending' })
      if (!result.ok) toast.error(result.error)
    })
  }

  const orderSubtitle = state.dispatch_number
    ? `Created ${state.dispatch_number}`
    : entry.order_number_raw ?? '—'

  return (
    <AISuggestionCard
      title={`Entry ${entry.row_index}`}
      subtitle={orderSubtitle}
      status={state.status}
      avgConfidence={entry.avg_confidence}
      error={state.status === 'pending' ? state.error ?? blockingError : null}
      busy={state.busy || isPending}
      onAccept={accept}
      onReject={reject}
      acceptLabel="Create dispatch"
    >
      {/* Order matcher */}
      <AISuggestionRow
        label="Order"
        confidence={entry.order_confidence}
        rawText={entry.order_number_raw}
        hint={
          state.sales_order_id && entry.order_candidates[0]?.id === state.sales_order_id ? (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px] uppercase">
              <CheckCircle2 className="size-3 mr-0.5" /> AI matched
            </Badge>
          ) : !state.sales_order_id ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px] uppercase">
              <AlertCircle className="size-3 mr-0.5" /> Not found
            </Badge>
          ) : null
        }
      >
        <Select
          value={state.sales_order_id ?? NONE_SENTINEL}
          onValueChange={(v) =>
            onChange({ sales_order_id: v === NONE_SENTINEL ? null : v, error: null })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick an order…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_SENTINEL}>
              <span className="text-muted-foreground">— not matched —</span>
            </SelectItem>
            {entry.order_candidates.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span className="font-mono text-xs mr-1.5">{o.order_number}</span>
                <span className="text-foreground">{o.project_name ?? o.buyer_name ?? '—'}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({Math.round(o.score * 100)}% · {o.match_kind.replace('_', ' ')})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </AISuggestionRow>

      {/* SKU + qty + unit on one row */}
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        <AISuggestionRow
          label="SKU"
          confidence={entry.sku_confidence}
          rawText={entry.sku_raw}
          hint={
            state.product_id && entry.sku_candidates[0]?.id === state.product_id ? (
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px] uppercase">
                <CheckCircle2 className="size-3 mr-0.5" /> AI matched
              </Badge>
            ) : !state.product_id ? (
              <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px] uppercase">
                <AlertCircle className="size-3 mr-0.5" /> Not found
              </Badge>
            ) : null
          }
        >
          <Select
            value={state.product_id ?? NONE_SENTINEL}
            onValueChange={(v) => {
              if (v === NONE_SENTINEL) {
                onChange({ product_id: null, error: null })
                return
              }
              const pick = entry.sku_candidates.find((c) => c.id === v)
              if (pick) {
                onChange({
                  product_id: pick.id,
                  product_name: pick.name,
                  sku_code: pick.sku_code,
                  unit: pick.unit,
                  error: null,
                })
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick SKU…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_SENTINEL}>
                <span className="text-muted-foreground">— not matched —</span>
              </SelectItem>
              {entry.sku_candidates.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="font-mono text-xs mr-1.5">{s.sku_code}</span>
                  <span className="text-foreground">{s.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({Math.round(s.score * 100)}%)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AISuggestionRow>

        <AISuggestionRow label="Qty" confidence={entry.quantity_confidence}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={state.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value), error: null })}
            className="tabular-nums"
          />
        </AISuggestionRow>

        <AISuggestionRow label="Unit">
          <Select
            value={state.unit}
            onValueChange={(v) => onChange({ unit: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AISuggestionRow>
      </div>

      {/* Logistics row */}
      <div className="grid grid-cols-2 gap-2">
        <AISuggestionRow label="Vehicle" rawText={entry.vehicle_number}>
          <Input
            value={state.vehicle_number}
            onChange={(e) => onChange({ vehicle_number: e.target.value })}
            placeholder="GJ-05-AB-1234"
          />
        </AISuggestionRow>

        <AISuggestionRow label="LR #" rawText={entry.lr_number}>
          <Input
            value={state.lr_number}
            onChange={(e) => onChange({ lr_number: e.target.value })}
          />
        </AISuggestionRow>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <AISuggestionRow label="Transporter" rawText={entry.transporter_name}>
          <Select
            value={state.transporter_id ?? NONE_SENTINEL}
            onValueChange={(v) =>
              onChange({ transporter_id: v === NONE_SENTINEL ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={entry.transporter_name ?? 'Pick…'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_SENTINEL}>
                <span className="text-muted-foreground">— none —</span>
              </SelectItem>
              {transporters.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AISuggestionRow>

        <AISuggestionRow label="Scheduled">
          <Input
            type="datetime-local"
            value={state.scheduled_at}
            onChange={(e) => onChange({ scheduled_at: e.target.value })}
          />
        </AISuggestionRow>
      </div>

      <AISuggestionRow label="Notes" rawText={entry.notes}>
        <Textarea
          value={state.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={2}
        />
      </AISuggestionRow>
    </AISuggestionCard>
  )
}

function hasEdits(entry: ResolvedDiaryEntry, state: RowState): boolean {
  if (typeof entry.quantity === 'number' && entry.quantity !== state.quantity) return true
  if (entry.vehicle_number && entry.vehicle_number !== state.vehicle_number) return true
  if (entry.lr_number && entry.lr_number !== state.lr_number) return true
  if (entry.driver_phone && entry.driver_phone !== state.driver_phone) return true
  if (entry.notes && entry.notes !== state.notes) return true
  return false
}
