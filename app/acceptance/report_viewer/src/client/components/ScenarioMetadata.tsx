/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function ScenarioMetadata({ isMobile, indicators, children }: {
  isMobile: boolean
  indicators: { key: string; label: string; accent: string }[]
  children: (expanded: boolean) => ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const naturalWidthRef = useRef(0)
  const wrapping = isMobile && expanded

  useLayoutEffect(() => {
    const viewport = viewportRef.current!
    const row = rowRef.current!
    const measure = () => {
      // Keep the single-line width while the visible labels wrap.
      if (!wrapping) naturalWidthRef.current = row.scrollWidth
      setOverflows(naturalWidthRef.current > viewport.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(row)
    return () => observer.disconnect()
  }, [wrapping])

  return (
    <div role="region" aria-label="Scenario metadata" className="col-span-2 shrink-0 min-w-0 border-b border-neutral-200 bg-neutral-50 px-4 py-1.5">
      {isMobile && (overflows || expanded) && (
        <button
          type="button"
          aria-label={expanded ? 'Collapse scenario metadata' : 'Expand scenario metadata'}
          aria-expanded={expanded}
          aria-controls="scenario-metadata-labels"
          className="mb-1 flex min-h-7 w-full cursor-pointer items-center justify-between gap-3 rounded text-neutral-500 hover:bg-neutral-100"
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? <span className="text-[11px]">Show less</span> : (
            <span aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
              {indicators.map(indicator => (
                <span key={indicator.key} title={indicator.label} className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--filter-accent)] ${indicator.accent}`} />
              ))}
            </span>
          )}
          <svg aria-hidden="true" className={`h-4 w-4 shrink-0 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      <div ref={viewportRef} id="scenario-metadata-labels" className={wrapping ? '' : 'overflow-x-auto'}>
        <div ref={rowRef} className={`flex gap-x-4 gap-y-2 ${wrapping ? 'flex-wrap items-start' : 'w-max items-center whitespace-nowrap'}`}>
          {children(wrapping)}
        </div>
      </div>
    </div>
  )
}
