/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function isBinary(content: string): boolean {
  if (!content) return false
  const sample = content.slice(0, 1024)
  let nonPrintable = 0
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c === 0) return true
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) nonPrintable++
  }
  return sample.length > 0 && nonPrintable / sample.length > 0.1
}

export function diffHighlight(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: string[] = []
  const max = Math.max(oldLines.length, newLines.length)
  let oi = 0, ni = 0

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push(escapeHtml(newLines[ni]))
      oi++; ni++
    } else if (ni < newLines.length && (oi >= oldLines.length || !oldLines.slice(oi).includes(newLines[ni]))) {
      result.push(`<span class="text-green-700 bg-green-50">+ ${escapeHtml(newLines[ni])}</span>`)
      ni++
    } else if (oi < oldLines.length && (ni >= newLines.length || !newLines.slice(ni).includes(oldLines[oi]))) {
      result.push(`<span class="text-red-700 bg-red-50">- ${escapeHtml(oldLines[oi])}</span>`)
      oi++
    } else {
      result.push(`<span class="text-red-700 bg-red-50">- ${escapeHtml(oldLines[oi])}</span>`)
      result.push(`<span class="text-green-700 bg-green-50">+ ${escapeHtml(newLines[ni])}</span>`)
      oi++; ni++
    }
    if (result.length > max * 3) break
  }

  return result.join('\n')
}

export function videoTimeToReal(startTime: number, videoSeconds: number): number {
  return startTime + videoSeconds * 1000
}

export function realTimeToVideo(startTime: number, realMs: number): number {
  return (realMs - startTime) / 1000
}

// --- Health graph types and computation ---

export interface HealthDataPoint {
  pct: number
  errorCount: number
  warnCount: number
  uncommittedTrackedFiles: number
  uncommittedTrackedFolders: number
  uncommittedUntrackedFiles: number
  uncommittedUntrackedFolders: number
}

export interface HealthSummary {
  points: HealthDataPoint[]
  hasUncommittedAtEnd: boolean
  hasAnyData: boolean
}

export function computeHealthData(
  snapshotTimestamps: string[],
  logs: { timestamp?: string; level: string }[],
  uncommittedEntries: { timestamp: string; uncommittedFiles: { status: string; path: string }[] }[],
  startTimeMs: number,
  durationMs: number
): HealthSummary {
  if (snapshotTimestamps.length === 0 || durationMs <= 0) {
    const hasUncommittedAtEnd = uncommittedEntries.length > 0 &&
      uncommittedEntries[uncommittedEntries.length - 1].uncommittedFiles.length > 0
    return { points: [], hasUncommittedAtEnd, hasAnyData: false }
  }

  const points: HealthDataPoint[] = []
  let prevTimeMs = startTimeMs

  for (let i = 0; i < snapshotTimestamps.length; i++) {
    const snapMs = new Date(snapshotTimestamps[i]).getTime()
    const pct = Math.min(100, Math.max(0, ((snapMs - startTimeMs) / durationMs) * 100))

    // Count errors and warnings between previous snapshot and this one
    let errorCount = 0
    let warnCount = 0
    for (const log of logs) {
      if (!log.timestamp) continue
      const logMs = new Date(log.timestamp).getTime()
      if (logMs > prevTimeMs && logMs <= snapMs) {
        if (log.level === 'ERROR') errorCount++
        else if (log.level === 'WARN') warnCount++
      }
    }

    // Find latest uncommitted entry at or before this snapshot
    let uncommittedTrackedFiles = 0
    let uncommittedTrackedFolders = 0
    let uncommittedUntrackedFiles = 0
    let uncommittedUntrackedFolders = 0
    for (const entry of uncommittedEntries) {
      const entryMs = new Date(entry.timestamp).getTime()
      if (entryMs <= snapMs) {
        uncommittedTrackedFiles = 0
        uncommittedTrackedFolders = 0
        uncommittedUntrackedFiles = 0
        uncommittedUntrackedFolders = 0
        for (const f of entry.uncommittedFiles) {
          const isFolder = f.path.endsWith('/')
          const isUntracked = f.status === '?'
          if (isUntracked) {
            if (isFolder) uncommittedUntrackedFolders++
            else uncommittedUntrackedFiles++
          } else {
            if (isFolder) uncommittedTrackedFolders++
            else uncommittedTrackedFiles++
          }
        }
      } else break
    }

    points.push({ pct, errorCount, warnCount, uncommittedTrackedFiles, uncommittedTrackedFolders, uncommittedUntrackedFiles, uncommittedUntrackedFolders })
    prevTimeMs = snapMs
  }

  const hasUncommittedAtEnd = uncommittedEntries.length > 0 &&
    uncommittedEntries[uncommittedEntries.length - 1].uncommittedFiles.length > 0

  const hasAnyData = points.some(p => p.errorCount > 0 || p.warnCount > 0 ||
    p.uncommittedTrackedFiles > 0 || p.uncommittedTrackedFolders > 0 ||
    p.uncommittedUntrackedFiles > 0 || p.uncommittedUntrackedFolders > 0)

  return { points, hasUncommittedAtEnd, hasAnyData }
}

// --- State-repo record helpers ---
// Generic over any extension-contributed state repo (a YAML-per-table
// snapshot tree). The repo's _meta.json declares how to label records;
// none of this code knows what the records mean.

import YAML from 'yaml'

export interface StateRepoParseOptions {
  /**
   * Per-table-suffix primary key fields used to label records when no
   * special-case rules apply. The suffix is whatever remains after
   * stripping `tableNameSuffixRegex` from a table name.
   */
  recordKeyMap?: Record<string, string[]>
  /**
   * Tables whose records should be sorted by `recordedAt` and labeled by
   * the portion of `pk` before the first '#' (sequenced 001-TYPE).
   */
  eventsLikeTables?: string[]
  /**
   * Regex that strips a per-worker prefix from table names so they
   * match `recordKeyMap` and `eventsLikeTables` keys. Optional — when
   * absent, the table name itself is used as the suffix.
   */
  tableNameSuffixRegex?: string
}

export interface StateRepoFilesResult {
  paths: string[]
  contents: Record<string, string>
}

export function parseStateRepoAsFiles(
  tables: Record<string, string>,
  options: StateRepoParseOptions = {},
): StateRepoFilesResult {
  const paths: string[] = []
  const contents: Record<string, string> = {}

  const suffixRegex = options.tableNameSuffixRegex
    ? new RegExp(options.tableNameSuffixRegex)
    : null
  const eventsLike = new Set(options.eventsLikeTables ?? [])
  const keyMap = options.recordKeyMap ?? {}

  for (const [tableName, yamlStr] of Object.entries(tables)) {
    const trimmed = yamlStr?.trim() || ''
    if (!trimmed || trimmed === '[]') continue

    let records: Record<string, unknown>[]
    try {
      records = YAML.parse(trimmed)
    } catch {
      continue
    }
    if (!Array.isArray(records) || records.length === 0) continue

    const suffix = suffixRegex ? tableName.replace(suffixRegex, '') : tableName

    if (eventsLike.has(suffix)) {
      // Sort by recordedAt, then name them 001-TYPE where TYPE is the
      // portion of pk before the '#' (e.g. PURCHASE#uuid → PURCHASE).
      const sorted = [...records].sort((a, b) => {
        const ta = String(a.recordedAt ?? '')
        const tb = String(b.recordedAt ?? '')
        return ta.localeCompare(tb)
      })
      for (let i = 0; i < sorted.length; i++) {
        const record = sorted[i]
        const pk = String(record.pk ?? '')
        const label = pk.includes('#') ? pk.split('#')[0] : pk
        const seq = String(i + 1).padStart(3, '0')
        const fileName = `${seq}-${label}`
        const path = `${tableName}/${fileName}`
        paths.push(path)
        contents[path] = YAML.stringify(record)
      }
    } else {
      const keyFields = keyMap[suffix] || Object.keys(records[0]).slice(0, 1)

      for (const record of records) {
        const keyParts = keyFields.map(k => `${k}=${record[k] ?? '?'}`)
        const fileName = keyParts.join('__')
        const path = `${tableName}/${fileName}`
        paths.push(path)
        contents[path] = YAML.stringify(record)
      }
    }
  }

  paths.sort()
  return { paths, contents }
}

export interface StateRepoRecordDiffs {
  added: string[]
  removed: string[]
  modified: string[]
}

export function computeStateRepoRecordDiffs(
  currentPaths: string[],
  currentContents: Record<string, string>,
  prevPaths: string[],
  prevContents: Record<string, string>,
): StateRepoRecordDiffs {
  const prevSet = new Set(prevPaths)
  const currentSet = new Set(currentPaths)

  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []

  for (const p of currentPaths) {
    if (!prevSet.has(p)) {
      added.push(p)
    } else if (currentContents[p] !== prevContents[p]) {
      modified.push(p)
    }
  }
  for (const p of prevPaths) {
    if (!currentSet.has(p)) {
      removed.push(p)
    }
  }

  return { added, removed, modified }
}
