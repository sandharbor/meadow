/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react'

export function CopyReferenceButton({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const [feedback, setFeedback] = useState<{ text: string; message: string } | null>(null)
  const message = feedback?.text === text ? feedback.message : null

  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(() => setFeedback(null), 1500)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setFeedback({ text, message: 'Copied' })
    } catch {
      setFeedback({ text, message: 'Copy failed' })
    }
  }

  return (
    <button type="button" aria-label={label} title={message ?? text} onClick={() => void copy()}
      className={`inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${className}`}>
      <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {message === 'Copied' ? <path d="m5 12 4 4L19 6" /> : message === 'Copy failed' ? <>
          <path d="M12 8v5m0 3h.01" />
          <circle cx="12" cy="12" r="9" />
        </> : <>
          <rect x="8" y="3" width="8" height="4" rx="1" />
          <path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        </>}
      </svg>
      <span className="sr-only" aria-live="polite">{message}</span>
    </button>
  )
}
