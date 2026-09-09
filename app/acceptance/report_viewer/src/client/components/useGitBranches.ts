/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { useEffect, useState } from 'react'
import type { BranchRevision } from '../../server/gitBranches'
export type { BranchRevision }
interface Branches { branches: string[]; defaultBranch: string; revisions: BranchRevision[]; heads: (string | null)[]; inferredTiming: boolean }
const empty: Branches = { branches: [], defaultBranch: '', revisions: [], heads: [], inferredTiming: false }

export function useGitBranches(API: string) {
  const [selection, setSelection] = useState({ API, branch: '' })
  const branch = selection.API === API ? selection.branch : ''
  const [result, setResult] = useState<{ key: string; data: Branches; error: string }>({ key: '', data: empty, error: '' })
  const key = `${API}?branch=${encodeURIComponent(branch)}`
  useEffect(() => {
    const controller = new window.AbortController()
    fetch(`${API}/git-branches${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`, { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as Branches })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, data: empty, error: String(error) }) })
    return () => controller.abort()
  }, [API, branch, key])
  const data = result.key === key ? result.data : empty
  return { ...data, branch, error: result.key === key ? result.error : '', loading: result.key !== key,
    select: (value: string) => setSelection({ API, branch: value === data.defaultBranch ? '' : value }),
    revisionAt: (tickIndex: number) => data.heads.length ? data.revisions.find(revision => revision.commitHash === data.heads[tickIndex]) : data.revisions.at(-1),
    changedAt: (tickIndex: number) => Boolean(data.heads[tickIndex] && data.heads[tickIndex] !== data.heads[tickIndex - 1]),
  }
}
