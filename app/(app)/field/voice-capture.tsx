'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, CheckCircle2, X, Loader2 } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionInstance = {
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: any) => void) | null
  onerror: ((ev: any) => void) | null
  onend: ((ev: any) => void) | null
  continuous: boolean
  interimResults: boolean
  lang: string
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type State =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'permission_denied' }
  | { kind: 'recording'; interim: string; final: string }
  | { kind: 'reviewing'; transcript: string }
  | { kind: 'extracting'; transcript: string }

export function VoiceCapture({
  language = 'en-IN',
  onTranscript,
}: {
  language?: string
  onTranscript: (transcript: string) => Promise<void>
}) {
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })

  useEffect(() => {
    const Recog = getSpeechRecognition()
    if (!Recog) {
      setState({ kind: 'unsupported' })
      return
    }
  }, [])

  function start() {
    const Recog = getSpeechRecognition()
    if (!Recog) { setState({ kind: 'unsupported' }); return }

    const recog = new Recog()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = language

    let finalSoFar = ''
    let interimSoFar = ''

    recog.onresult = (ev: { results: { isFinal: boolean; [k: number]: { transcript: string } }[]; resultIndex: number }) => {
      interimSoFar = ''
      // Iterate over all results from the last final transcript
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) finalSoFar += text + ' '
        else interimSoFar += text
      }
      setState({ kind: 'recording', interim: interimSoFar.trim(), final: finalSoFar.trim() })
    }

    recog.onerror = (ev: { error?: string }) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setState({ kind: 'permission_denied' })
      } else {
        // Bubble to reviewing with whatever we got
        const t = (finalSoFar + ' ' + interimSoFar).trim()
        setState(t.length > 0 ? { kind: 'reviewing', transcript: t } : { kind: 'idle' })
      }
    }

    recog.onend = () => {
      const t = (finalSoFar + ' ' + interimSoFar).trim()
      // Only auto-finalise to reviewing if the user didn't trigger stop themselves.
      // The stop button below also calls stop(); we rely on the state machine.
      setState((curr) => curr.kind === 'recording'
        ? (t.length > 0 ? { kind: 'reviewing', transcript: t } : { kind: 'idle' })
        : curr,
      )
    }

    recogRef.current = recog
    setState({ kind: 'recording', interim: '', final: '' })
    try { recog.start() } catch { /* already started */ }
  }

  function stopAndReview() {
    if (state.kind !== 'recording') return
    const t = (state.final + ' ' + state.interim).trim()
    try { recogRef.current?.stop() } catch {/* */}
    setState(t.length > 0 ? { kind: 'reviewing', transcript: t } : { kind: 'idle' })
  }

  function cancel() {
    try { recogRef.current?.abort() } catch {/* */}
    setState({ kind: 'idle' })
  }

  async function confirm() {
    if (state.kind !== 'reviewing') return
    setState({ kind: 'extracting', transcript: state.transcript })
    await onTranscript(state.transcript)
    setState({ kind: 'idle' })
  }

  if (state.kind === 'unsupported') {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Voice input isn't supported in this browser. Use Chrome, Safari, or Edge for the speak-to-fill feature.
      </div>
    )
  }

  if (state.kind === 'idle') {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={start}
        className="h-10 w-full justify-center text-sm"
      >
        <Mic className="size-4 mr-2 text-primary" />
        Speak the summary
      </Button>
    )
  }

  if (state.kind === 'permission_denied') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        Microphone access denied. Enable it in your browser settings to use voice input.
      </div>
    )
  }

  if (state.kind === 'recording') {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 px-3 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
          </span>
          <span className="text-xs font-medium text-emerald-800">Listening…</span>
          <span className="text-[10px] text-emerald-700/80 ml-auto">tap stop when done</span>
        </div>
        <div className="min-h-[3rem] text-sm">
          <span>{state.final}</span>
          <span className="text-muted-foreground italic">{state.interim ? ' ' + state.interim : ''}</span>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={cancel}>
            <X className="size-3.5 mr-1" /> Cancel
          </Button>
          <Button type="button" size="sm" onClick={stopAndReview}>
            <MicOff className="size-3.5 mr-1" /> Stop
          </Button>
        </div>
      </div>
    )
  }

  if (state.kind === 'reviewing') {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2.5 flex flex-col gap-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Transcript</p>
        <p className="text-sm whitespace-pre-wrap">{state.transcript}</p>
        <div className="flex gap-2 justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => { setState({ kind: 'idle' }); start() }}>
            <Mic className="size-3.5 mr-1" /> Redo
          </Button>
          <Button type="button" size="sm" onClick={confirm}>
            <CheckCircle2 className="size-3.5 mr-1" /> Use this
          </Button>
        </div>
      </div>
    )
  }

  // extracting
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-primary" />
      Reading your note and filling the form…
    </div>
  )
}
