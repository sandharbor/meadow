/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, type ComponentRef } from 'react'
import type { TestSourceChange } from '../../../../e2e/src/artifacts/testSourceChanges.ts'

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
  </dialog>
}
