/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, useState, type ComponentRef } from 'react'
import type { TestSourceChange } from '../../../../e2e/src/artifacts/testSourceChanges.ts'
import type { SourceChangeStatus } from '../../../../../shared_code/shared_dev/sourceChangesTypes.js'
import { resolveDevToolsUrl } from '../devTools.ts'

function descriptionText(value: string) {
  return value.split(/(`[^`]+`)/g).map((part, index) => part.startsWith('`')
    ? <code key={index} className="rounded bg-neutral-100 px-1">{part.slice(1, -1)}</code> : part)
}

export function TestSourceChangeModal({ change, onClose }: { change: TestSourceChange; onClose: () => void }) {
  const dialogRef = useRef<ComponentRef<'dialog'>>(null)
  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  const definition = change.definition
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Checking Dev Tools…')
  const [failed, setFailed] = useState(false)
  const endpoint = definition ? `/api/source-changes/${encodeURIComponent(definition.sourceGraph)}/${encodeURIComponent(change.id)}` : null

  useEffect(() => {
    if (!endpoint || !definition) return
    let cancelled = false
    const check = async () => {
      try {
        const url = await resolveDevToolsUrl()
        const response = await fetch(`${url}${endpoint}`)
        const data = await response.json() as { change?: SourceChangeStatus; error?: string }
        if (cancelled) return
        const matches = JSON.stringify(data.change?.operations) === JSON.stringify(definition.operations)
        const canApply = response.ok && matches && data.change?.state === 'available'
        setAvailable(canApply)
        setStatus(canApply ? 'Applies to the saved state currently open in Dev Tools.'
          : data.error ?? (!matches ? 'This change differs from the current checkout.'
            : data.change?.state === 'applied' ? 'Already applied to the open saved state.' : data.change?.reason ?? 'This change cannot be applied to the open saved state.'))
      } catch {
        if (!cancelled) { setAvailable(false); setStatus('Dev Tools is not running.'); }
      }
    }
    void check()
    window.addEventListener('focus', check)
    return () => { cancelled = true; window.removeEventListener('focus', check) }
  }, [endpoint, definition])

  const apply = async () => {
    if (!endpoint || !definition) return
    setBusy(true); setFailed(false); setStatus('Applying to dev…')
    try {
      const url = await resolveDevToolsUrl()
      const response = await fetch(`${url}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: definition.operations }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not apply this source change.')
      setAvailable(false); setStatus('Applied to the open Dev Tools saved state.')
    } catch (error) {
      setFailed(true); setStatus(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  return <dialog ref={dialogRef} onClose={event => {
    // Strict Mode can reopen the dialog before the cleanup's close event arrives.
    if (!event.currentTarget.open) onClose()
  }} aria-labelledby="source-change-title"
    className="m-auto max-h-[85vh] w-[calc(100%-3rem)] max-w-3xl overflow-auto rounded-xl border border-neutral-300 bg-white p-0 text-neutral-800 shadow-2xl backdrop:bg-black/50"
    onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close() }}>
    <header className="flex items-start justify-between gap-4 border-b border-neutral-200 bg-neutral-50 px-5 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Source change</p>
        <h2 id="source-change-title" className="mt-1 text-lg font-semibold">{definition?.label ?? change.id}</h2>
        <p className="mt-1 text-xs text-neutral-500">{change.origin === 'run' ? 'Captured with this run' : 'Current checkout · not captured with this run'}</p>
      </div>
      <button type="button" autoFocus aria-label="Close source change" onClick={() => dialogRef.current?.close()}
        className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm font-medium hover:bg-neutral-100">Close</button>
    </header>
    {definition ? <div className="space-y-5 p-5 text-sm">
      <dl className="space-y-4">
        <div><dt className="font-semibold">Action</dt><dd className="mt-1 whitespace-pre-line leading-relaxed">{descriptionText(definition.action)}</dd></div>
        <div><dt className="font-semibold">Check</dt><dd className="mt-1 whitespace-pre-line leading-relaxed">{descriptionText(definition.check)}</dd></div>
        <div><dt className="font-semibold">Source graph</dt><dd className="mt-1 font-mono text-xs">{definition.sourceGraph}</dd></div>
      </dl>
      <section aria-labelledby="source-change-operations">
        <h3 id="source-change-operations" className="font-semibold">Files &amp; operations</h3>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed">{JSON.stringify(definition.operations, null, 2)}</pre>
      </section>
    </div> : <p className="p-5 text-sm text-neutral-600">This source change&apos;s definition is unavailable{change.origin === 'run' ? ' in the run artifacts' : ' in the current checkout'}.</p>}
    {definition && <footer className="flex items-center gap-3 border-t border-neutral-200 px-5 py-4">
      <button type="button" disabled={!available || busy} onClick={() => void apply()}
        className="shrink-0 cursor-pointer rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-300">
        {busy ? 'Applying…' : 'Apply to dev'}
      </button>
      <p role={failed ? 'alert' : 'status'} className={`text-xs ${failed ? 'text-red-700' : 'text-neutral-600'}`}>{status}</p>
    </footer>}
  </dialog>
}
