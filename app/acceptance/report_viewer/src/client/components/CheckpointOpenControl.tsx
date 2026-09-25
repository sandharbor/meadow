/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, useState } from 'react'

type ServiceTarget = 'local' | 'hosted'

/** What Dev Tools reports for one checkpoint (GET /api/checkpoints/:runId/:scenario). */
interface CheckpointOption {
  index: number
  message: string
  openable: boolean
  unavailableReason?: string
  hostedAvailable: boolean
  hostedUnavailableReason?: string
  /** Where in the app the checkpoint was taken; the fork opens there. */
  placeDescription?: string
}

const TARGET_LABELS: Record<ServiceTarget, string> = { local: 'Local', hosted: 'Hosted Development' }

let devToolsUrl: Promise<string> | undefined
function resolveDevToolsUrl(): Promise<string> {
  devToolsUrl ??= fetch('/api/dev-tools').then(response => response.json()).then((data: { url: string }) => data.url)
  return devToolsUrl
}

/**
 * Fork the scenario at a checkpoint: Dev Tools restores the saved state and
 * launches the app. Open always uses Local; the arrow offers Hosted
 * Development, disabled with its reason when it could not work. This mirrors
 * the Dev Tools split button.
 */
export function CheckpointOpenControl({ runId, scenario, index }: { runId: string; scenario: string; index: number }) {
  const [option, setOption] = useState<CheckpointOption | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [status, setStatus] = useState<{ tone: 'busy' | 'done' | 'error'; text: string } | null>(null)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setOption(null); setUnavailable(null); setStatus(null)
    resolveDevToolsUrl()
      .then(url => fetch(`${url}/api/checkpoints/${encodeURIComponent(runId)}/${encodeURIComponent(scenario)}`))
      .then(async response => {
        const data = await response.json() as { checkpoints?: CheckpointOption[]; error?: string }
        if (cancelled) return
        const found = data.checkpoints?.find(candidate => candidate.index === index)
        if (found) setOption(found)
        else setUnavailable(data.error ?? 'This run recorded no restorable checkpoint here.')
      })
      .catch(() => { if (!cancelled) setUnavailable('Dev Tools is not running. Start it with /dev (scripts/dev-and-packet.sh).') })
    return () => { cancelled = true }
  }, [runId, scenario, index])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => { if (!container.current?.contains(event.target as globalThis.Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const open = async (serviceTarget: ServiceTarget) => {
    setMenuOpen(false)
    setStatus({ tone: 'busy', text: 'Opening in Dev Tools…' })
    try {
      const url = await resolveDevToolsUrl()
      const response = await fetch(`${url}/api/saved-states/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: { kind: 'checkpoint', runId, scenario, checkpoint: index }, serviceTarget, launch: 'app' }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error ?? `Dev Tools could not open this checkpoint (${response.status})`)
      setStatus({ tone: 'done', text: `Opened in Dev Tools with ${TARGET_LABELS[serviceTarget]}` })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
    }
  }

  const targets: Record<ServiceTarget, { available: boolean; reason?: string }> = option
    ? {
        local: { available: option.openable, reason: option.unavailableReason },
        hosted: { available: option.hostedAvailable, reason: option.unavailableReason ?? option.hostedUnavailableReason },
      }
    : { local: { available: false, reason: unavailable ?? undefined }, hosted: { available: false, reason: unavailable ?? undefined } }
  const busy = status?.tone === 'busy'

  return (
    <div ref={container} className="relative flex items-center gap-2" data-testid="checkpoint-open-control">
      {option?.placeDescription && (
        <span data-testid="checkpoint-place" className="text-[11px] text-neutral-500">at {option.placeDescription}</span>
      )}
      <div className="flex">
        <button
          type="button"
          aria-label={`Open checkpoint ${index} in Dev Tools with Local`}
          title={targets.local.available ? undefined : targets.local.reason}
          disabled={busy || !targets.local.available}
          onClick={() => void open('local')}
          className="rounded-l bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:bg-neutral-300"
        >
          Open in Dev Tools
        </button>
        <button
          type="button"
          aria-label={`More ways to open checkpoint ${index}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={busy || !option}
          onClick={() => setMenuOpen(value => !value)}
          className="rounded-r border-l border-brand-400 bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:bg-neutral-300"
        >
          ▾ Local
        </button>
      </div>
      {menuOpen && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-72 rounded border border-neutral-200 bg-white py-1 shadow-lg">
          {(['local', 'hosted'] as const).map(target => (
            <button
              key={target}
              type="button"
              role="menuitem"
              disabled={!targets[target].available}
              onClick={() => void open(target)}
              className="block w-full px-3 py-1.5 text-left text-xs text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-white"
            >
              <span className="font-medium">{TARGET_LABELS[target]}</span>
              {target === 'local' && <span className="ml-1 text-neutral-500">(default)</span>}
              {!targets[target].available && targets[target].reason && <span className="mt-0.5 block text-neutral-500">{targets[target].reason}</span>}
            </button>
          ))}
        </div>
      )}
      {(status || (!option && unavailable)) && (
        <span role="status" className={`text-[11px] ${status?.tone === 'error' ? 'text-red-700' : status?.tone === 'done' ? 'text-emerald-700' : 'text-neutral-500'}`}>
          {status?.text ?? unavailable}
        </span>
      )}
    </div>
  )
}
