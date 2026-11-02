/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import type { ReactNode } from 'react'

type DocumentReference = { id: string; name: string }

/** Two sibling controls: filtering never opens documentation, and reading never changes filters. */
export function DocumentFilterPill({ document, selected, available = true, tone = 'sky', highlight = '', title, onFilter, onOpen, children }: {
  document?: DocumentReference
  selected: boolean
  available?: boolean
  tone?: 'sky' | 'brand' | 'emerald' | 'violet' | 'neutral'
  highlight?: string
  title?: string
  onFilter: () => void
  onOpen: (document: DocumentReference) => void
  children: ReactNode
}) {
  const selectedTone = { sky: 'bg-sky-500 text-white', brand: 'bg-brand-500 text-white', emerald: 'bg-emerald-500 text-white',
    violet: 'bg-violet-500 text-white', neutral: 'bg-neutral-800 text-white' }[tone]
  return <DocumentPillFrame document={document} selected={selected} onOpen={onOpen} className={`text-xs font-medium ${selected ? selectedTone : available ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-50 text-neutral-400'}${highlight}${selected && !available ? ' opacity-60' : ''}`}>
    <button type="button" title={title ?? (available ? undefined : 'No matching scenarios with the current filters.')}
      aria-pressed={selected} onClick={onFilter}
      className={`min-w-0 cursor-pointer px-3 py-1 text-left transition-colors hover:bg-black/5 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 ${document ? 'rounded-l-full' : 'rounded-full'}`}>
      {children}
    </button>
  </DocumentPillFrame>
}

/** Shared shell for filter buttons and filter-navigation links. The arrow has a 24px hit target. */
export function DocumentPillFrame({ document, onOpen, selected, highlighted, className = '', children }: {
  document?: DocumentReference
  onOpen: (document: DocumentReference) => void
  selected?: boolean
  highlighted?: boolean
  className?: string
  children: ReactNode
}) {
  return <span data-document-filter={document?.id} data-selected={selected} data-highlighted={highlighted} className={`document-filter-pill inline-flex max-w-full items-stretch rounded-full ${className}`}>
    {children}
    {document && <button type="button" aria-label={`Read ${document.name}`} title={`Read ${document.name}`}
      onClick={event => { event.stopPropagation(); onOpen(document) }} className="document-filter-open flex w-6 shrink-0 cursor-pointer items-center justify-center rounded-r-full border-l border-black/5 text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.8"><path d="M3 9L9 3M4.5 3H9v4.5" /></svg>
    </button>}
  </span>
}
