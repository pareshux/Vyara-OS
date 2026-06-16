'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { importOpeningStockCSV } from '@/lib/actions/stock'

export function ImportStockForm() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function handleFile(f: File | null) {
    if (!f) return
    f.text().then(setText)
  }

  function handleSubmit() {
    setErr(null); setResult(null)
    if (!text.trim()) { setErr('Paste or upload CSV first'); return }
    startTransition(async () => {
      const res = await importOpeningStockCSV(text)
      if ('error' in res) { setErr(res.error); toast.error(res.error); return }
      const msg = `${res.imported} imported · ${res.skipped} skipped${res.errors.length ? ` · ${res.errors.length} errors` : ''}`
      setResult(msg)
      toast.success(msg)
      if (res.errors.length > 0) setErr(res.errors.join('\n'))
      if (res.imported > 0) router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Upload .csv file</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">…or paste CSV text</label>
        <Textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'warehouse_code,sku_code,quantity,min_level,max_level,remark\nSURAT-PLANT-1,INTLK-300-GRY,4500,500,,Opening balance from physical count'}
          className="font-mono text-xs"
        />
      </div>

      {result && <p className="text-xs text-emerald-700">{result}</p>}
      {err && <pre className="text-xs text-destructive whitespace-pre-wrap">{err}</pre>}

      <div className="flex gap-2 justify-end">
        <Button onClick={handleSubmit} disabled={busy}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
      </div>
    </div>
  )
}
