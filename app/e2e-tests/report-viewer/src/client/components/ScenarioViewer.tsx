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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { highlight, languages } from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-yaml'
import 'prismjs/themes/prism.css'
import { marked } from 'marked'
import { formatTime, escapeHtml, diffHighlight, isBinary, videoTimeToReal, realTimeToVideo, computeHealthData, parseStateRepoAsFiles, computeStateRepoRecordDiffs } from '../helpers.ts'
import HealthGraph from './HealthGraph.tsx'

// --- Types ---

interface KeyFrame {
  docId: string
  filename: string
  timestamp?: string
}

interface Manifest {
  testName: string
  startTime?: string
  endTime?: string
  logs: LogEntry[]
  scenarioDocIds?: string[]
  keyFrames?: KeyFrame[]
}

interface LogEntry {
  timestamp?: string
  source: string
  level: string
  message: string
}

interface Snapshot {
  timestamp: string
  commitHash: string
  commitMessage: string
  changedFiles: string[]
}

interface SnapshotMessage {
  timestamp: string
  message: string
}

interface UncommittedEntry {
  timestamp: string
  message: string
  uncommittedFiles: { status: string; path: string }[]
}

interface ScenarioDoc {
  id: string
  name: string
  description: string
  isMeadowExtension?: boolean
}

interface StateRepoMeta {
  name: string
  displayName?: string
  pathPrefix?: string
  tableNameSuffixRegex?: string
  recordKeyMap?: Record<string, string[]>
  eventsLikeTables?: string[]
}

interface ProcessedTick {
  timestamp: string
  tickIndex: number
  isSnapshot: boolean
  snapshotMessage?: string
  fileCount: number
  uncommittedCount: number
  uncommittedFiles: { path: string; status: string }[]
  uncommittedFileContents?: Record<string, string>
  ignoredFiles?: string[]
  gitHeadSha?: string
  addedFiles: string[]
  removedFiles: string[]
  changedUncommitted: boolean
  changedGitHead: boolean
  s3KeyCount: number
  s3AddedKeys: string[]
  s3ModifiedKeys: string[]
  s3RemovedKeys: string[]
  s3Changed: boolean
  s3ObjectContents?: Record<string, string>
  stateRecordCount?: number
  stateAddedRecords?: string[]
  stateModifiedRecords?: string[]
  stateRemovedRecords?: string[]
  stateChanged?: boolean
  stateRecordContents?: Record<string, string>
}

type FileChangeLens = 'tick' | 'git'
type ChangeView = 'all' | 'custom'
type ChangeTone = 'added' | 'modified' | 'removed' | 'tick' | 'git' | 'uncommitted' | 'snapshot' | 'neutral' | 'state' | 's3'

interface FileDelta {
  added: string[]
  modified: string[]
  removed: string[]
}

interface SummaryItem {
  key: string
  text: string
  tone: ChangeTone
  strong?: boolean
  italic?: boolean
  fileModeMarkers?: FileChangeLens[]
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
}

interface FileTimelineItem {
  tickArrayIndex: number
  items: SummaryItem[]
  meta?: string
}

const FILE_CHANGE_LENSES: { key: FileChangeLens; label: string }[] = [
  { key: 'tick', label: 'Tick' },
  { key: 'git', label: 'Git' },
]

function normalizeGitStatus(status: string): 'new' | 'modified' | 'deleted' {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'new' || normalized === 'added' || normalized === 'untracked' || status.includes('?') || status.includes('A')) return 'new'
  if (normalized === 'deleted' || normalized === 'removed' || status.includes('D')) return 'deleted'
  return 'modified'
}

function applyStatus(map: Map<string, FileStatus>, path: string, status: FileStatus) {
  const rank: Record<FileStatus, number> = {
    committed: 0,
    'just-committed': 1,
    'uncommitted-modified': 2,
    'uncommitted-new': 3,
    removed: 4,
  }
  const current = map.get(path)
  if (!current || rank[status] > rank[current]) {
    map.set(path, status)
  }
}

function sortedUnion(...lists: string[][]): string[] {
  return [...new Set(lists.flat().filter(Boolean))].sort()
}

function activeLenses<T extends string>(view: ChangeView, selected: Set<T>, available: readonly { key: T; label: string }[]): T[] {
  if (view === 'all') return available.map((l) => l.key)
  return available.map((l) => l.key).filter((key) => selected.has(key))
}

function lensLabel(lens: FileChangeLens): string {
  return lens.charAt(0).toUpperCase() + lens.slice(1)
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function deltaSummaryItems(delta: FileDelta, keyPrefix: string, noun = 'file'): SummaryItem[] {
  const items: SummaryItem[] = []
  if (delta.added.length > 0) items.push({ key: `${keyPrefix}-added`, text: `+${countLabel(delta.added.length, noun)}`, tone: 'added', strong: true })
  if (delta.modified.length > 0) items.push({ key: `${keyPrefix}-modified`, text: `~${countLabel(delta.modified.length, noun)}`, tone: 'modified', strong: true })
  if (delta.removed.length > 0) items.push({ key: `${keyPrefix}-removed`, text: `-${countLabel(delta.removed.length, noun)}`, tone: 'removed', strong: true })
  return items
}

const SUMMARY_TONE_CLASSES: Record<ChangeTone, string> = {
  added: 'bg-blue-50 text-blue-700 border-blue-200',
  modified: 'bg-amber-50 text-amber-700 border-amber-200',
  removed: 'bg-red-50 text-red-700 border-red-200',
  tick: 'bg-purple-50 text-purple-700 border-purple-200',
  git: 'bg-brand-50 text-brand-700 border-brand-300',
  uncommitted: 'bg-amber-50 text-amber-800 border-amber-200',
  snapshot: 'bg-orange-50 text-orange-700 border-orange-200',
  neutral: 'bg-neutral-50 text-neutral-500 border-neutral-200',
  state: 'bg-amber-50 text-amber-700 border-amber-200',
  s3: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const FILE_MODE_MARKER_META: Record<FileChangeLens, { label: string; className: string }> = {
  tick: { label: 'T', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  git: { label: 'G', className: 'bg-brand-100 text-brand-700 border-brand-200' },
}

function SummaryChip({ item }: { item: SummaryItem }) {
  return (
    <span
      className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-1.5 py-0.5 inline-flex items-center gap-1 ${
        SUMMARY_TONE_CLASSES[item.tone]
      } ${item.strong ? 'font-bold' : 'font-medium'} ${item.italic ? 'italic' : ''} ${
        item.onClick ? 'cursor-pointer hover:brightness-95 transition-[filter]' : ''
      }`}
      onClick={item.onClick}
    >
      <span>{item.text}</span>
      {item.fileModeMarkers && item.fileModeMarkers.length > 0 && (
        <span className="inline-flex items-center gap-0.5">
          {item.fileModeMarkers.map((mode) => (
            <span
              key={mode}
              className={`rounded-full border px-1 text-[9px] leading-3 font-black ${FILE_MODE_MARKER_META[mode].className}`}
            >
              {FILE_MODE_MARKER_META[mode].label}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

function TickSummaryLine({
  tickNumber,
  items,
  isSnapshot = false,
  snapshotMessage,
  emptyText = 'no changes',
}: {
  tickNumber: number
  items: SummaryItem[]
  isSnapshot?: boolean
  snapshotMessage?: string
  emptyText?: string
}) {
  const visibleItems = items.length > 0
    ? items
    : [{ key: 'empty', text: emptyText, tone: 'neutral', italic: true } satisfies SummaryItem]
  const showSnapshotMarker = isSnapshot || Boolean(snapshotMessage)

  return (
    <span className="flex items-center gap-1.5 min-w-0 overflow-hidden text-[11px] font-normal">
      <span className="rounded-full border border-purple-200 bg-purple-50 px-1.5 py-0.5 font-bold text-purple-700 whitespace-nowrap">
        tick {tickNumber}
        {showSnapshotMarker && (
          <span className="ml-1 rounded-full border border-orange-200 bg-orange-100 px-1 text-[9px] leading-3 font-black text-orange-700 align-middle">
            S
          </span>
        )}
        :
      </span>
      {showSnapshotMarker && (
        <>
          {snapshotMessage && (
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-bold text-orange-700">
              {snapshotMessage}
            </span>
          )}
        </>
      )}
      <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
        {visibleItems.map((item) => <SummaryChip key={item.key} item={item} />)}
      </span>
    </span>
  )
}


// --- Component ---

export default function ScenarioViewer() {
  const { runId, testSlug } = useParams<{ runId: string; testSlug: string }>()
  const [searchParams] = useSearchParams()
  const API = `/api/${runId}/${testSlug}`
  const initialSpeed = Number(searchParams.get('speed')) || 100

  // Core state
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [stateSnapshots, setStateSnapshots] = useState<Snapshot[]>([])
  const [stateRepoMeta, setStateRepoMeta] = useState<StateRepoMeta | null>(null)
  const [s3Snapshots, setS3Snapshots] = useState<Snapshot[]>([])
  const [snapshotMessages, setSnapshotMessages] = useState<SnapshotMessage[]>([])
  const [uncommittedEntries, setUncommittedEntries] = useState<UncommittedEntry[]>([])
  const [scenarioDocs, setScenarioDocs] = useState<ScenarioDoc[]>([])

  // Index states
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState(-1)
  const [currentStateIndex, setCurrentStateIndex] = useState(-1)
  const [currentS3Index, setCurrentS3Index] = useState(-1)
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1)

  // UI state
  const [activeTab, setActiveTab] = useState<'files' | 'test-code' | 'state' | 's3'>('test-code')
  const [snapshotDropdownOpen, setSnapshotDropdownOpen] = useState(false)
  const [logFilter, setLogFilter] = useState<'all' | 'backend' | 'frontend'>('all')
  const [levelFilter, setLevelFilter] = useState<Set<string>>(() => new Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'LOG']))
  const [levelDropdownOpen, setLevelDropdownOpen] = useState(false)
  const [currentS3Key, setCurrentS3Key] = useState<string | null>(null)
  const [commitListOpen, setCommitListOpen] = useState(false)
  const [s3ListOpen, setS3ListOpen] = useState(false)
  const [stateListOpen, setStateListOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(initialSpeed)
  const [timeDisplay, setTimeDisplay] = useState('0:00 / 0:00')
  const [timelinePercent, setTimelinePercent] = useState(0)
  const [fileStatusFilter, setFileStatusFilter] = useState<Set<string>>(() => new Set(['added', 'removed', 'changed', 'unchanged', 'just-committed', 'uncommitted-new', 'uncommitted-modified', 'committed']))
  const [fileChangeView, setFileChangeView] = useState<ChangeView>('custom')
  const [fileChangeLenses, setFileChangeLenses] = useState<Set<FileChangeLens>>(() => new Set(['tick', 'git']))
  const [filePaneSelection, setFilePaneSelection] = useState<{ mode: FileChangeLens; filePath: string; nonce: number } | null>(null)
  const [currentTickIndex, setCurrentTickIndex] = useState(-1)
  const [ticks, setTicks] = useState<ProcessedTick[]>([])
  const [tickFileListing, setTickFileListing] = useState<Record<number, string[]>>({})
  const [s3KeyListing, setS3KeyListing] = useState<Record<number, string[]>>({})

  // Content state
  const [fileList, setFileList] = useState<string[]>([])
  const [stateTables, setStateTables] = useState<Record<string, string>>({})
  const [prevStateTables, setPrevStateTables] = useState<Record<string, string>>({})
  const [stateSnapshotDeltas, setStateSnapshotDeltas] = useState<Record<number, FileDelta>>({})
  const [currentStateRecordPath, setCurrentStateRecordPath] = useState<string | null>(null)
  const [stateDiffMode, setStateDiffMode] = useState(true)
  const [s3Objects, setS3Objects] = useState<Record<string, string>>({})
  const [prevS3Objects, setPrevS3Objects] = useState<Record<string, string>>({})
  const [s3DiffMode, setS3DiffMode] = useState(true)
  const [testSource, setTestSource] = useState('')
  const [highlightedLogIndex, setHighlightedLogIndex] = useState(-1)
  const [notes, setNotes] = useState<string | null>(null)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null)
  const [hoveredKeyFrame, setHoveredKeyFrame] = useState<{ docId: string; filename: string; x: number; y: number } | null>(null)

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const logEntriesRef = useRef<HTMLDivElement>(null)
  const testCodeRef = useRef<HTMLPreElement>(null)
  const autoFollowRef = useRef(true)
  const lastHighlightRef = useRef<string | null>(null)
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timelineBarRef = useRef<HTMLDivElement>(null)
  const levelDropdownRef = useRef<HTMLDivElement>(null)
  const explicitTickJumpRef = useRef<{ index: number; videoTime: number } | null>(null)
  const [timelineBarWidth, setTimelineBarWidth] = useState(0)

  // Caches
  const snapshotFileCacheRef = useRef(new Map<string, string[]>())
  const snapshotContentCacheRef = useRef(new Map<string, string>())
  const stateContentCacheRef = useRef(new Map<string, Record<string, string>>())
  const s3ContentCacheRef = useRef(new Map<string, Record<string, string>>())

  // Derived from stateRepoMeta — used for display and API URLs.
  const stateRepoName = stateRepoMeta?.name ?? null
  const stateDisplayName = stateRepoMeta?.displayName ?? 'Structured state'

  // Sync playback rate to video element when speed changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playSpeed / 100
    }
  }, [playSpeed])

  const startTime = manifest?.startTime ? new Date(manifest.startTime).getTime() : 0

  const toRealTime = useCallback((videoSeconds: number) => {
    return videoTimeToReal(startTime, videoSeconds)
  }, [startTime])

  const toVideoTime = useCallback((realMs: number) => {
    return realTimeToVideo(startTime, realMs)
  }, [startTime])

  // --- Data fetching ---

  const fetchFileList = useCallback(async (hash: string): Promise<string[]> => {
    const cache = snapshotFileCacheRef.current
    if (cache.has(hash)) return cache.get(hash)!
    const res = await fetch(`${API}/snapshot/${hash}`)
    const files: string[] = await res.json()
    cache.set(hash, files)
    return files
  }, [API])

  const fetchFileContent = useCallback(async (hash: string, filePath: string): Promise<string> => {
    const key = `${hash}:${filePath}`
    const cache = snapshotContentCacheRef.current
    if (cache.has(key)) return cache.get(key)!
    const res = await fetch(`${API}/snapshot/${hash}/file/${encodeURIComponent(filePath)}`)
    if (!res.ok) throw new Error(`File not found at ${hash}: ${filePath}`)
    const content = await res.text()
    cache.set(key, content)
    return content
  }, [API])

  const fetchStateData = useCallback(async (hash: string): Promise<Record<string, string>> => {
    if (!stateRepoName) return {}
    const cache = stateContentCacheRef.current
    const cacheKey = `${stateRepoName}:${hash}`
    if (cache.has(cacheKey)) return cache.get(cacheKey)!
    const res = await fetch(`${API}/state-snapshot/${stateRepoName}/${hash}`)
    const data: Record<string, string> = await res.json()
    cache.set(cacheKey, data)
    return data
  }, [API, stateRepoName])

  const fetchS3Data = useCallback(async (hash: string): Promise<Record<string, string>> => {
    const cache = s3ContentCacheRef.current
    if (cache.has(hash)) return cache.get(hash)!
    const res = await fetch(`${API}/minio-snapshot/${hash}`)
    const data: Record<string, string> = await res.json()
    cache.set(hash, data)
    return data
  }, [API])

  // --- Scenario docs ---

  useEffect(() => {
    fetch('/api/scenario-docs')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setScenarioDocs(d))
      .catch(() => {})
  }, [])

  const matchingDocs = useMemo(() => {
    const docIds = manifest?.scenarioDocIds || []
    if (docIds.length === 0) return []
    return scenarioDocs.filter((doc) => docIds.includes(doc.id))
  }, [scenarioDocs, manifest])

  const parseOptions = useMemo(() => ({
    recordKeyMap: stateRepoMeta?.recordKeyMap,
    eventsLikeTables: stateRepoMeta?.eventsLikeTables,
    tableNameSuffixRegex: stateRepoMeta?.tableNameSuffixRegex,
  }), [stateRepoMeta])

  const getSnapshotIndexAtOrBefore = useCallback((snapshotsToSearch: Snapshot[], realTime: number): number => {
    let snapshotIndex = -1
    for (let i = 0; i < snapshotsToSearch.length; i++) {
      if (new Date(snapshotsToSearch[i].timestamp).getTime() <= realTime) snapshotIndex = i
      else break
    }
    return snapshotIndex
  }, [])

  const getSnapshotMessageIndexAtOrBefore = useCallback((messages: SnapshotMessage[], realTime: number): number => {
    let messageIndex = -1
    for (let i = 0; i < messages.length; i++) {
      if (new Date(messages[i].timestamp).getTime() <= realTime) messageIndex = i
      else break
    }
    return messageIndex
  }, [])

  const timelineSnapshotMessages = useMemo(() => {
    const tickSnapshots = ticks
      .filter((tick) => tick.isSnapshot && tick.snapshotMessage)
      .map((tick) => ({
        timestamp: tick.timestamp,
        message: tick.snapshotMessage!,
      }))

    return tickSnapshots.length > 0 ? tickSnapshots : snapshotMessages
  }, [snapshotMessages, ticks])

  const getS3SnapshotIndexForTick = useCallback((tick: ProcessedTick, fallbackIndex: number): number => {
    if (!tick.s3Changed || s3Snapshots.length === 0) return fallbackIndex

    const changedKeys = sortedUnion(tick.s3AddedKeys || [], tick.s3ModifiedKeys || [], tick.s3RemovedKeys || [])
    if (changedKeys.length === 0) return fallbackIndex

    const changedSet = new Set(changedKeys)
    const tickTime = new Date(tick.timestamp).getTime()
    const matchingIndex = s3Snapshots.findIndex((snapshot) => (
      new Date(snapshot.timestamp).getTime() >= tickTime &&
      snapshot.changedFiles.some((filePath) => changedSet.has(filePath))
    ))

    return matchingIndex >= 0 ? matchingIndex : fallbackIndex
  }, [s3Snapshots])

  // --- Initialize ---

  useEffect(() => {
    let mounted = true

    async function init() {
      const [manifestRes, snapshotsRes, stateReposRes, s3Res, testSourceRes, uncommittedRes, notesRes] = await Promise.all([
        fetch(`${API}/manifest`),
        fetch(`${API}/snapshots`),
        fetch(`${API}/state-repos`),
        fetch(`${API}/minio-snapshots`),
        fetch(`${API}/test-source`),
        fetch(`${API}/uncommitted`),
        fetch(`/api/${runId}/notes`),
      ])

      if (!mounted) return

      const manifestData: Manifest = await manifestRes.json()
      const snapshotsData: Snapshot[] = await snapshotsRes.json()
      const stateRepos: StateRepoMeta[] = await stateReposRes.json()
      const s3Data: Snapshot[] = await s3Res.json()
      const testSourceData = await testSourceRes.json()
      const uncommittedData: UncommittedEntry[] = await uncommittedRes.json()
      const notesText = notesRes.ok ? await notesRes.text() : null

      // Pick the first extension state repo (if any) as the source for
      // the structured-state tab. Multi-repo support can come later.
      const firstRepo = stateRepos[0] ?? null
      let stateData: Snapshot[] = []
      if (firstRepo) {
        const r = await fetch(`${API}/state-snapshots/${firstRepo.name}`)
        stateData = await r.json()
      }

      setManifest(manifestData)
      setSnapshots(snapshotsData)
      setStateRepoMeta(firstRepo)
      setStateSnapshots(stateData)
      setS3Snapshots(s3Data)
      setTestSource(testSourceData.source || '')
      setUncommittedEntries(uncommittedData)
      setNotes(notesText)

      // Extract tick data from manifest
      const rawManifest = manifestData as unknown as Record<string, unknown>
      if (rawManifest.ticks) setTicks(rawManifest.ticks as ProcessedTick[])
      if (rawManifest.tickFileListing) setTickFileListing(rawManifest.tickFileListing as Record<number, string[]>)
      if (rawManifest.s3KeyListing) setS3KeyListing(rawManifest.s3KeyListing as Record<number, string[]>)

      // Build snapshot messages
      const seenMessages = new Set<string>()
      const msgs: SnapshotMessage[] = []
      for (const meta of [...stateData, ...s3Data]) {
        if (meta.commitMessage && !seenMessages.has(meta.commitMessage)) {
          seenMessages.add(meta.commitMessage)
          msgs.push({ timestamp: meta.timestamp, message: meta.commitMessage })
        }
      }
      msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      setSnapshotMessages(msgs)

      const hasTickData = rawManifest.ticks && (rawManifest.ticks as unknown[]).length > 0
      // When tick data is available, let video sync set the indices at the
      // right time. Before the first commit, the active commit index must stay
      // at -1 so the UI can show "no commit yet" instead of leaking commit 0.
      if (snapshotsData.length > 0 && !hasTickData) setCurrentSnapshotIndex(0)
      else setCurrentSnapshotIndex(-1)
      if (stateData.length > 0 && !hasTickData) setCurrentStateIndex(0)
      else setCurrentStateIndex(-1)
      if (s3Data.length > 0 && !hasTickData) setCurrentS3Index(0)
      else setCurrentS3Index(-1)
    }

    init().catch((err) => console.error('Failed to initialize:', err))
    return () => { mounted = false }
  }, [API, runId])

  // --- Update file display when snapshot index changes ---

  useEffect(() => {
    if (currentSnapshotIndex < 0 || snapshots.length === 0) {
      setFileList([])
      return
    }

    const snap = snapshots[currentSnapshotIndex]

    fetchFileList(snap.commitHash).then((files) => {
      setFileList(files)
    }).catch(() => setFileList([]))
  }, [currentSnapshotIndex, snapshots, fetchFileList])

  // --- Update state-repo display ---

  useEffect(() => {
    if (currentStateIndex < 0 || stateSnapshots.length === 0) {
      setStateTables({})
      setPrevStateTables({})
      return
    }

    const snap = stateSnapshots[currentStateIndex]
    fetchStateData(snap.commitHash)
      .then((tables) => setStateTables(tables))
      .catch(() => setStateTables({}))

    // Fetch previous snapshot for diffing
    if (currentStateIndex > 0) {
      const prevSnap = stateSnapshots[currentStateIndex - 1]
      fetchStateData(prevSnap.commitHash)
        .then((tables) => setPrevStateTables(tables))
        .catch(() => setPrevStateTables({}))
    } else {
      setPrevStateTables({})
    }
  }, [currentStateIndex, stateSnapshots, fetchStateData])

  useEffect(() => {
    let cancelled = false

    async function loadStateSnapshotDeltas() {
      if (!stateRepoName || stateSnapshots.length === 0) {
        setStateSnapshotDeltas({})
        return
      }

      const deltas = await Promise.all(stateSnapshots.map(async (snapshot, index) => {
        const currentTables = await fetchStateData(snapshot.commitHash)
        const currentParsed = parseStateRepoAsFiles(currentTables, parseOptions)
        const previousParsed = index > 0
          ? parseStateRepoAsFiles(await fetchStateData(stateSnapshots[index - 1].commitHash), parseOptions)
          : { paths: [], contents: {} }
        return [index, computeStateRepoRecordDiffs(
          currentParsed.paths,
          currentParsed.contents,
          previousParsed.paths,
          previousParsed.contents,
        )] as const
      }))

      if (!cancelled) setStateSnapshotDeltas(Object.fromEntries(deltas))
    }

    loadStateSnapshotDeltas().catch(() => {
      if (!cancelled) setStateSnapshotDeltas({})
    })

    return () => { cancelled = true }
  }, [fetchStateData, parseOptions, stateRepoName, stateSnapshots])

  // --- Update S3 display ---

  useEffect(() => {
    if (currentS3Index < 0 || s3Snapshots.length === 0) {
      setS3Objects({})
      setPrevS3Objects({})
      return
    }

    const snap = s3Snapshots[currentS3Index]
    fetchS3Data(snap.commitHash)
      .then((objects) => {
        setS3Objects(objects)
        setCurrentS3Key((prev) => (prev && prev in objects) ? prev : null)
      })
      .catch(() => setS3Objects({}))

    // Fetch previous snapshot for diffing
    if (currentS3Index > 0) {
      const prevSnap = s3Snapshots[currentS3Index - 1]
      fetchS3Data(prevSnap.commitHash)
        .then((objects) => setPrevS3Objects(objects))
        .catch(() => setPrevS3Objects({}))
    } else {
      setPrevS3Objects({})
    }
  }, [currentS3Index, s3Snapshots, fetchS3Data])

  useEffect(() => {
    setS3DiffMode(true)
  }, [currentS3Key, currentTickIndex])

  useEffect(() => {
    setStateDiffMode(true)
  }, [currentStateRecordPath, currentTickIndex])

  // --- Sync repo snapshot indices when tick changes ---
  // This ensures navigating to a tick (e.g. clicking in the tick list) updates
  // the snapshot-based data even when the video is paused and timeupdate won't fire.

  useEffect(() => {
    if (currentTickIndex < 0 || currentTickIndex >= ticks.length) return
    const tickTime = new Date(ticks[currentTickIndex].timestamp).getTime()

    // Sync MeadowHome file snapshot index
    if (snapshots.length > 0) {
      const fileIdx = getSnapshotIndexAtOrBefore(snapshots, tickTime)
      setCurrentSnapshotIndex((current) => current === fileIdx ? current : fileIdx)
    }

    // Sync state-repo snapshot index
    if (stateSnapshots.length > 0) {
      const dynIdx = getSnapshotIndexAtOrBefore(stateSnapshots, tickTime)
      if (dynIdx !== currentStateIndex) setCurrentStateIndex(dynIdx)
    }

    // Sync S3 snapshot index
    if (s3Snapshots.length > 0) {
      const tick = ticks[currentTickIndex]
      let s3Idx = getSnapshotIndexAtOrBefore(s3Snapshots, tickTime)
      s3Idx = getS3SnapshotIndexForTick(tick, s3Idx)
      if (s3Idx !== currentS3Index) setCurrentS3Index(s3Idx)
    }

    const messageIdx = getSnapshotMessageIndexAtOrBefore(timelineSnapshotMessages, tickTime)
    setCurrentMessageIndex((current) => current === messageIdx ? current : messageIdx)
  }, [currentTickIndex, ticks, snapshots, stateSnapshots, s3Snapshots, currentStateIndex, currentS3Index, timelineSnapshotMessages, getSnapshotIndexAtOrBefore, getS3SnapshotIndexForTick, getSnapshotMessageIndexAtOrBefore])

  // --- Video sync ---

  const syncToVideoTime = useCallback(() => {
    const video = videoRef.current
    if (!video || !manifest) return

    const explicitTickJump = explicitTickJumpRef.current
    if (explicitTickJump) {
      const delta = video.currentTime - explicitTickJump.videoTime
      if (delta < 0 && Math.abs(delta) < 0.35) return
      explicitTickJumpRef.current = null
    }

    const realTime = toRealTime(video.currentTime)
    let tickIdx = -1
    if (ticks.length > 0) {
      for (let i = 0; i < ticks.length; i++) {
        const tickTime = new Date(ticks[i].timestamp).getTime()
        if (tickTime <= realTime) tickIdx = i
        else break
      }
    }

    // Find matching file snapshot
    const snapIdx = getSnapshotIndexAtOrBefore(snapshots, realTime)
    if (snapIdx !== currentSnapshotIndex) {
      setCurrentSnapshotIndex(snapIdx)
    }

    // Find matching state-repo snapshot
    const stateIdx = getSnapshotIndexAtOrBefore(stateSnapshots, realTime)
    if (stateIdx !== currentStateIndex) {
      setCurrentStateIndex(stateIdx)
    }

    // Find matching S3 snapshot
    let s3Idx = getSnapshotIndexAtOrBefore(s3Snapshots, realTime)
    if (tickIdx >= 0) {
      s3Idx = getS3SnapshotIndexForTick(ticks[tickIdx], s3Idx)
    }
    if (s3Idx !== currentS3Index) {
      setCurrentS3Index(s3Idx)
    }

    // Update snapshot indicator
    const msgIdx = getSnapshotMessageIndexAtOrBefore(timelineSnapshotMessages, realTime)
    setCurrentMessageIndex(msgIdx)

    // Update tick index
    if (tickIdx >= 0 && tickIdx !== currentTickIndex) {
      setCurrentTickIndex(tickIdx)
    }

    // Highlight log
    if (manifest.logs.length > 0) {
      const filteredLogs = manifest.logs.filter(
        (l) => (logFilter === 'all' || l.source === logFilter) && levelFilter.has(l.level)
      )
      let closest = -1
      let closestDist = Infinity
      for (let i = 0; i < filteredLogs.length; i++) {
        const ts = filteredLogs[i].timestamp
        if (ts) {
          const dist = Math.abs(new Date(ts).getTime() - realTime)
          if (dist < closestDist) {
            closestDist = dist
            closest = i
          }
        }
      }
      setHighlightedLogIndex(closest)
    }
  }, [manifest, snapshots, stateSnapshots, s3Snapshots, timelineSnapshotMessages, ticks, toRealTime, logFilter, levelFilter, currentSnapshotIndex, currentStateIndex, currentS3Index, currentTickIndex, getSnapshotIndexAtOrBefore, getS3SnapshotIndexForTick, getSnapshotMessageIndexAtOrBefore])

  // Video timeupdate handler
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.duration) {
      setTimelinePercent((video.currentTime / video.duration) * 100)
      setTimeDisplay(`${formatTime(video.currentTime)} / ${formatTime(video.duration)}`)
    }

    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current)
    scrubTimerRef.current = setTimeout(() => syncToVideoTime(), 100)
  }, [syncToVideoTime])

  // --- Test code highlight ---

  useEffect(() => {
    if (!testCodeRef.current || !testSource) return
    const video = videoRef.current
    const nearEnd = video && video.duration && (video.duration - video.currentTime < 1)

    let searchText: string
    if (nearEnd) {
      searchText = '__END__'
    } else if (currentMessageIndex >= 0 && timelineSnapshotMessages[currentMessageIndex]) {
      searchText = timelineSnapshotMessages[currentMessageIndex].message
    } else {
      searchText = '__START__'
    }

    if (searchText === lastHighlightRef.current) return
    lastHighlightRef.current = searchText

    const lines = testCodeRef.current.querySelectorAll('.code-line')
    lines.forEach((l) => l.classList.remove('bg-orange-100'))

    if (searchText === '__START__') {
      for (const line of lines) {
        if (line.textContent?.includes('test(')) {
          line.classList.add('bg-orange-100')
          line.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return
        }
      }
    } else if (searchText === '__END__') {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].textContent?.trim().match(/^\}\);?$/)) {
          lines[i].classList.add('bg-orange-100')
          lines[i].scrollIntoView({ block: 'center', behavior: 'smooth' })
          return
        }
      }
    } else {
      for (const line of lines) {
        if (line.textContent?.includes(`"${searchText}"`)) {
          line.classList.add('bg-orange-100')
          line.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return
        }
      }
    }
  }, [currentMessageIndex, timelineSnapshotMessages, testSource])

  // --- Auto-scroll highlighted log ---

  useEffect(() => {
    if (!autoFollowRef.current || highlightedLogIndex < 0) return
    const el = logEntriesRef.current?.querySelector(`[data-idx="${highlightedLogIndex}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [highlightedLogIndex])

  // --- Tick helpers ---

  const hasTicks = ticks.length > 0
  const snapshotIndexByHash = useMemo(() => {
    const byHash = new Map<string, number>()
    snapshots.forEach((snap, index) => byHash.set(snap.commitHash, index))
    return byHash
  }, [snapshots])
  const getSnapshotIndexForGitHead = useCallback((gitHeadSha?: string): number => {
    if (!gitHeadSha) return -1
    return snapshotIndexByHash.get(gitHeadSha) ?? -1
  }, [snapshotIndexByHash])

  // Compute per-tick changes across all state types (Files, structured state, S3)
  const tickStateChanges = useMemo(() => {
    const changes: Record<number, { files: boolean; state: boolean; s3: boolean; snapshot: boolean; snapshotMessage?: string }> = {}
    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i]
      const tickTime = new Date(tick.timestamp).getTime()

      // Files changed?
      const filesChanged = tick.addedFiles.length > 0 || tick.removedFiles.length > 0 || tick.changedUncommitted || tick.changedGitHead

      // State changed? Prefer tick-level record data when the artifact
      // captured it; older artifacts fall back to state-repo commits.
      let stateChanged = false
      if (tick.stateRecordContents !== undefined) {
        stateChanged = Boolean(tick.stateChanged)
      } else if (stateSnapshots.length > 0) {
        const getStateIdx = (ts: number) => {
          let idx = -1
          for (let j = 0; j < stateSnapshots.length; j++) {
            if (new Date(stateSnapshots[j].timestamp).getTime() <= ts) idx = j
            else break
          }
          return idx
        }
        const currentStateIdxLocal = getStateIdx(tickTime)
        if (i === 0) {
          stateChanged = currentStateIdxLocal >= 0 && stateSnapshots[currentStateIdxLocal]?.changedFiles?.length > 0
        } else {
          const prevTickTime = new Date(ticks[i - 1].timestamp).getTime()
          const prevStateIdxLocal = getStateIdx(prevTickTime)
          stateChanged = currentStateIdxLocal !== prevStateIdxLocal && currentStateIdxLocal >= 0 && stateSnapshots[currentStateIdxLocal]?.changedFiles?.length > 0
        }
      }

      // S3 changed? Use tick-level data if available, fallback to snapshot-based
      let s3Changed = false
      if (tick.s3Changed !== undefined) {
        s3Changed = tick.s3Changed
      } else if (s3Snapshots.length > 0) {
        const getS3Idx = (ts: number) => {
          let idx = -1
          for (let j = 0; j < s3Snapshots.length; j++) {
            if (new Date(s3Snapshots[j].timestamp).getTime() <= ts) idx = j
            else break
          }
          return idx
        }
        const currentS3Idx = getS3Idx(tickTime)
        if (i === 0) {
          s3Changed = currentS3Idx >= 0
        } else {
          const prevTickTime = new Date(ticks[i - 1].timestamp).getTime()
          s3Changed = currentS3Idx !== getS3Idx(prevTickTime)
        }
      }

      changes[i] = {
        files: filesChanged,
        state: stateChanged,
        s3: s3Changed,
        snapshot: tick.isSnapshot,
        snapshotMessage: tick.snapshotMessage,
      }
    }
    return changes
  }, [ticks, stateSnapshots, s3Snapshots])

  const interestingTickIndices = useMemo(() =>
    ticks
      .filter((_, i) => {
        const c = tickStateChanges[i]
        return c && (c.files || c.state || c.s3 || c.snapshot)
      })
      .map(t => t.tickIndex),
    [ticks, tickStateChanges]
  )

  const getTickFilesAtIndex = useCallback((idx: number): string[] => {
    for (let i = idx; i >= 0; i--) {
      if (tickFileListing[i]) return tickFileListing[i]
    }
    return []
  }, [tickFileListing])

  const getTickWorkingFilesAtIndex = useCallback((idx: number): string[] => {
    if (idx < 0 || idx >= ticks.length) return []
    const deleted = new Set((ticks[idx].uncommittedFiles || [])
      .filter((f) => !f.path.endsWith('/') && normalizeGitStatus(f.status) === 'deleted')
      .map((f) => f.path))
    const tracked = getTickFilesAtIndex(idx).filter((filePath) => !deleted.has(filePath))
    const uncommitted = (ticks[idx].uncommittedFiles || [])
      .filter((f) => !f.path.endsWith('/') && normalizeGitStatus(f.status) !== 'deleted')
      .map((f) => f.path)
    return sortedUnion(tracked, uncommitted)
  }, [getTickFilesAtIndex, ticks])

  const getS3KeysAtIndex = useCallback((idx: number): string[] => {
    for (let i = idx; i >= 0; i--) {
      if (s3KeyListing[i]) return s3KeyListing[i]
    }
    return []
  }, [s3KeyListing])

  const getS3ObjectContentsAtIndex = useCallback((idx: number): Record<string, string> | null => {
    for (let i = idx; i >= 0; i--) {
      const contents = ticks[i]?.s3ObjectContents
      if (contents) return contents
    }
    return null
  }, [ticks])

  const getTickFileDelta = useCallback((idx: number): FileDelta => {
    if (idx < 0 || idx >= ticks.length) return { added: [], modified: [], removed: [] }

    const currentFiles = new Set(getTickWorkingFilesAtIndex(idx))
    const previousFiles = idx > 0 ? new Set(getTickWorkingFilesAtIndex(idx - 1)) : new Set<string>()
    const currentUncommitted = new Map((ticks[idx].uncommittedFiles || []).map((f) => [f.path, f.status]))
    const previousUncommitted = idx > 0
      ? new Map((ticks[idx - 1].uncommittedFiles || []).map((f) => [f.path, f.status]))
      : new Map<string, string>()
    const currentContents = ticks[idx].uncommittedFileContents || {}
    const previousContents = idx > 0 ? ticks[idx - 1].uncommittedFileContents || {} : {}

    const added: string[] = []
    const modified: string[] = []
    const removed: string[] = []

    for (const filePath of currentFiles) {
      if (!previousFiles.has(filePath)) {
        added.push(filePath)
        continue
      }

      const currentStatus = currentUncommitted.get(filePath)
      const previousStatus = previousUncommitted.get(filePath)
      const normalizedCurrent = currentStatus ? normalizeGitStatus(currentStatus) : null
      if (normalizedCurrent === 'deleted') {
        removed.push(filePath)
      } else if (currentContents[filePath] !== undefined && previousContents[filePath] !== undefined) {
        if (currentContents[filePath] !== previousContents[filePath]) modified.push(filePath)
      } else if (normalizedCurrent === 'modified' && currentStatus !== previousStatus) {
        modified.push(filePath)
      }
    }

    for (const filePath of previousFiles) {
      if (!currentFiles.has(filePath)) removed.push(filePath)
    }

    return {
      added: added.sort(),
      modified: modified.sort(),
      removed: sortedUnion(removed),
    }
  }, [getTickWorkingFilesAtIndex, ticks])

  const getGitUncommittedDelta = useCallback((idx: number): FileDelta => {
    if (idx < 0 || idx >= ticks.length) return { added: [], modified: [], removed: [] }
    const added: string[] = []
    const modified: string[] = []
    const removed: string[] = []

    for (const file of ticks[idx].uncommittedFiles || []) {
      if (file.path.endsWith('/')) continue
      const normalized = normalizeGitStatus(file.status)
      if (normalized === 'new') added.push(file.path)
      else if (normalized === 'deleted') removed.push(file.path)
      else modified.push(file.path)
    }

    return {
      added: added.sort(),
      modified: modified.sort(),
      removed: removed.sort(),
    }
  }, [ticks])

  // --- State-repo record-level parsing and diffs ---

  const stateParsed = useMemo(
    () => parseStateRepoAsFiles(stateTables, parseOptions), [stateTables, parseOptions]
  )
  const prevStateParsed = useMemo(
    () => parseStateRepoAsFiles(prevStateTables, parseOptions), [prevStateTables, parseOptions]
  )
  const stateDiffs = useMemo(
    () => computeStateRepoRecordDiffs(
      stateParsed.paths, stateParsed.contents,
      prevStateParsed.paths, prevStateParsed.contents,
    ),
    [stateParsed, prevStateParsed]
  )

  const hasTickStateData = useMemo(
    () => ticks.some((tick) => tick.stateRecordContents !== undefined),
    [ticks]
  )

  const getStateSnapshotIndexForTick = useCallback((idx: number): number => {
    if (idx < 0 || idx >= ticks.length) return -1
    const tickTime = new Date(ticks[idx].timestamp).getTime()
    return getSnapshotIndexAtOrBefore(stateSnapshots, tickTime)
  }, [getSnapshotIndexAtOrBefore, stateSnapshots, ticks])

  const getTickStateRecordContentsAtIndex = useCallback((idx: number): Record<string, string> | null => {
    for (let i = idx; i >= 0; i--) {
      const contents = ticks[i]?.stateRecordContents
      if (contents) return contents
    }
    return null
  }, [ticks])

  const getTickStateRecordDelta = useCallback((idx: number): FileDelta => {
    if (idx < 0 || idx >= ticks.length) return { added: [], modified: [], removed: [] }
    const tick = ticks[idx]
    return {
      added: [...(tick.stateAddedRecords || [])].sort(),
      modified: [...(tick.stateModifiedRecords || [])].sort(),
      removed: [...(tick.stateRemovedRecords || [])].sort(),
    }
  }, [ticks])

  const getStateSnapshotDeltaForTick = useCallback((idx: number): FileDelta => {
    const snapshotIndex = getStateSnapshotIndexForTick(idx)
    return snapshotIndex >= 0
      ? stateSnapshotDeltas[snapshotIndex] ?? { added: [], modified: [], removed: [] }
      : { added: [], modified: [], removed: [] }
  }, [getStateSnapshotIndexForTick, stateSnapshotDeltas])

  const getStateSummaryItems = useCallback((tickArrayIndex: number, keyPrefix = 'state'): SummaryItem[] => {
    if (hasTickStateData) {
      return deltaSummaryItems(getTickStateRecordDelta(tickArrayIndex), keyPrefix, 'record')
    }
    return deltaSummaryItems(getStateSnapshotDeltaForTick(tickArrayIndex), keyPrefix, 'record')
  }, [getStateSnapshotDeltaForTick, getTickStateRecordDelta, hasTickStateData])

  const getTickFileSummaryItems = useCallback((tickArrayIndex: number, keyPrefix = 'tick'): SummaryItem[] => (
    deltaSummaryItems(getTickFileDelta(tickArrayIndex), keyPrefix)
  ), [getTickFileDelta])

  const getGitSummaryItems = useCallback((tickArrayIndex: number): SummaryItem[] => {
    if (tickArrayIndex < 0 || tickArrayIndex >= ticks.length) return []
    const tick = ticks[tickArrayIndex]
    if (tick.changedGitHead) {
      const snapIndex = getSnapshotIndexForGitHead(tick.gitHeadSha)
      const snap = snapIndex >= 0 ? snapshots[snapIndex] : null
      return [{
        key: 'git-commit',
        text: snap ? `commit ${snap.commitHash.slice(0, 7)} — ${snap.commitMessage || '(no message)'}` : 'new commit',
        tone: 'git',
        strong: true,
      }]
    }
    if (tick.changedUncommitted) {
      if (tick.uncommittedCount === 0) {
        return [{ key: 'git-clean', text: 'working tree clean', tone: 'neutral', italic: true }]
      }
      return [
        {
          key: 'git-uncommitted',
          text: `${tick.uncommittedCount} uncommitted:`,
          tone: 'uncommitted',
          strong: true,
        },
        ...deltaSummaryItems(getGitUncommittedDelta(tickArrayIndex), 'git-uncommitted'),
      ]
    }
    return []
  }, [getGitUncommittedDelta, getSnapshotIndexForGitHead, snapshots, ticks])

  const getFileModeSummaryItems = useCallback((mode: FileChangeLens, tickArrayIndex: number, keyPrefix: string = mode): SummaryItem[] => {
    if (tickArrayIndex < 0 || tickArrayIndex >= ticks.length) return []
    if (mode === 'tick') {
      return getTickFileSummaryItems(tickArrayIndex, keyPrefix)
    }
    return getGitSummaryItems(tickArrayIndex)
  }, [getGitSummaryItems, getTickFileSummaryItems, ticks])

  const getFileModeOverviewItems = useCallback((tickArrayIndex: number, modes: FileChangeLens[]): SummaryItem[] => {
    if (tickArrayIndex < 0 || tickArrayIndex >= ticks.length) return []
    const items: SummaryItem[] = []
    for (const mode of modes) {
      if (mode === 'tick' && getTickFileSummaryItems(tickArrayIndex, `overview-tick-${tickArrayIndex}`).length > 0) {
        items.push({ key: `overview-tick-${tickArrayIndex}`, text: 'Tick', tone: 'tick', strong: true })
      }
      if (mode === 'git' && getGitSummaryItems(tickArrayIndex).length > 0) {
        items.push({ key: `overview-git-${tickArrayIndex}`, text: 'Git', tone: 'git', strong: true })
      }
    }
    return items
  }, [getGitSummaryItems, getTickFileSummaryItems, ticks])

  const getChangedFileModes = useCallback((tickArrayIndex: number): FileChangeLens[] => {
    if (tickArrayIndex < 0 || tickArrayIndex >= ticks.length) return []
    return FILE_CHANGE_LENSES
      .map(({ key }) => key)
      .filter((mode) => getFileModeSummaryItems(mode, tickArrayIndex, `main-files-${mode}-${tickArrayIndex}`).length > 0)
  }, [getFileModeSummaryItems, ticks])

  const getFileModeTimelineItems = useCallback((mode: FileChangeLens): FileTimelineItem[] => {
    return ticks.flatMap((tick, tickArrayIndex) => {
      const items = getFileModeSummaryItems(mode, tickArrayIndex, `${mode}-history-${tickArrayIndex}`)
      if (items.length === 0 && !tick.isSnapshot) return []
      return [{
        tickArrayIndex,
        items,
        meta: mode === 'git'
          ? `${getTickWorkingFilesAtIndex(tickArrayIndex).length} files`
          : new Date(tick.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }]
    })
  }, [getFileModeSummaryItems, getTickWorkingFilesAtIndex, ticks])

  const selectTickIndex = useCallback((tickArrayIndex: number) => {
    if (tickArrayIndex < 0 || tickArrayIndex >= ticks.length) return
    setCurrentTickIndex(tickArrayIndex)
    const tickTime = new Date(ticks[tickArrayIndex].timestamp).getTime()
    const video = videoRef.current
    const videoTime = Math.max(0, toVideoTime(tickTime))
    explicitTickJumpRef.current = { index: tickArrayIndex, videoTime }
    if (video) video.currentTime = videoTime
  }, [ticks, toVideoTime])

  const showFileInTickView = useCallback((filePath: string) => {
    setFileChangeView('custom')
    setFileChangeLenses((current) => {
      const next = new Set(current)
      next.add('tick')
      return next
    })
    setFilePaneSelection((current) => ({
      mode: 'tick',
      filePath,
      nonce: (current?.nonce ?? 0) + 1,
    }))
  }, [])

  const navigateTick = useCallback((direction: number) => {
    const video = videoRef.current
    if (!video || !video.duration || ticks.length === 0) return
    video.pause()

    const current = currentTickIndex
    if (direction > 0) {
      for (let i = current + 1; i < ticks.length; i++) {
        if (interestingTickIndices.includes(ticks[i].tickIndex) || i === ticks.length - 1) {
          selectTickIndex(i)
          return
        }
      }
    } else {
      for (let i = current - 1; i >= 0; i--) {
        if (interestingTickIndices.includes(ticks[i].tickIndex) || i === 0) {
          selectTickIndex(i)
          return
        }
      }
    }
  }, [ticks, currentTickIndex, interestingTickIndices, selectTickIndex])

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const navigateSnapshot = (direction: number) => {
      const video = videoRef.current
      if (!video || !video.duration) return

      const navPoints = [0]
      for (const snap of timelineSnapshotMessages) {
        const videoSec = toVideoTime(new Date(snap.timestamp).getTime())
        if (videoSec > 0 && videoSec < video.duration) {
          navPoints.push(videoSec)
        }
      }
      navPoints.push(video.duration)

      const current = video.currentTime
      const EPSILON = 0.05

      video.pause()
      if (direction > 0) {
        for (const pt of navPoints) {
          if (pt > current + EPSILON) { video.currentTime = pt; return }
        }
      } else {
        for (let i = navPoints.length - 1; i >= 0; i--) {
          if (navPoints[i] < current - EPSILON) { video.currentTime = navPoints[i]; return }
        }
      }
    }

    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        const video = videoRef.current
        if (video) {
          if (video.paused) video.play()
          else video.pause()
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        if (hasTicks) navigateTick(-1)
        else navigateSnapshot(-1)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        if (hasTicks) navigateTick(1)
        else navigateSnapshot(1)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [timelineSnapshotMessages, toVideoTime, hasTicks, navigateTick])

  // --- Close level dropdown on outside click ---

  useEffect(() => {
    if (!levelDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (levelDropdownRef.current && !levelDropdownRef.current.contains(e.target as HTMLElement)) {
        setLevelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [levelDropdownOpen])

  // --- ResizeObserver for timeline bar ---

  useEffect(() => {
    const el = timelineBarRef.current
    if (!el) return
    const measure = () => {
      setTimelineBarWidth(el.getBoundingClientRect().width)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [manifest])

  // --- Health data ---

  const healthData = useMemo(() => {
    if (!manifest?.startTime || !manifest?.endTime || timelineSnapshotMessages.length === 0) {
      return computeHealthData([], [], [], 0, 0)
    }
    const startMs = new Date(manifest.startTime).getTime()
    const endMs = new Date(manifest.endTime).getTime()
    return computeHealthData(
      timelineSnapshotMessages.map(s => s.timestamp),
      manifest.logs,
      uncommittedEntries,
      startMs,
      endMs - startMs
    )
  }, [manifest, timelineSnapshotMessages, uncommittedEntries])

  const handleHealthClick = useCallback((pct: number) => {
    const video = videoRef.current
    if (video && video.duration) {
      video.currentTime = (pct / 100) * video.duration
    }
  }, [])

  // --- Timeline markers ---

  const timelineMarkers = (() => {
    const video = videoRef.current
    if (!video?.duration) return null
    const markers: React.ReactNode[] = []

    // Colored dots for ticks with state changes
    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i]
      const changes = tickStateChanges[i]
      if (!changes || tick.isSnapshot) continue
      const types: { color: string; key: string }[] = []
      if (changes.files) types.push({ color: 'bg-brand-400', key: 'f' })
      if (changes.s3) types.push({ color: 'bg-emerald-400', key: 's' })
      if (changes.state) types.push({ color: 'bg-amber-400', key: 'd' })
      if (types.length === 0) continue
      const tickTime = new Date(tick.timestamp).getTime()
      const videoSec = toVideoTime(tickTime)
      const pct = (videoSec / video.duration) * 100
      if (pct >= 0 && pct <= 100) {
        // Tick line
        markers.push(
          <div
            key={`tickline-${tick.tickIndex}`}
            className="absolute bg-brand-500/30"
            style={{ left: `${pct}%`, top: 0, bottom: 0, width: '1px' }}
          />
        )
        // Fixed-position dots: bottom=files, middle=s3, top=state
        const dotSize = 6
        const slots = [
          { key: 'f', color: 'bg-brand-400', active: changes.files, bottom: 2 },
          { key: 'd', color: 'bg-amber-400', active: changes.state, bottom: 2 + dotSize + 1 },
          { key: 's', color: 'bg-emerald-400', active: changes.s3, bottom: 2 + (dotSize + 1) * 2 },
        ]
        for (const slot of slots) {
          if (!slot.active) continue
          markers.push(
            <div
              key={`tick-${tick.tickIndex}-${slot.key}`}
              className={`absolute rounded-full ${slot.color}`}
              style={{ left: `${pct}%`, bottom: `${slot.bottom}px`, width: `${dotSize}px`, height: `${dotSize}px`, transform: 'translateX(-50%)' }}
            />
          )
        }
      }
    }

    // Snapshot markers (larger, darker)
    for (let i = 0; i < timelineSnapshotMessages.length; i++) {
      const snapTime = new Date(timelineSnapshotMessages[i].timestamp).getTime()
      const videoSec = toVideoTime(snapTime)
      const pct = (videoSec / video.duration) * 100
      if (pct >= 0 && pct <= 100) {
        markers.push(
          <div
            key={`snap-${i}`}
            className="absolute top-0 w-0.5 h-full bg-orange-600/50"
            style={{ left: `${pct}%` }}
          />
        )
      }
    }

    return markers
  })()

  // --- Render helpers ---

  if (!manifest) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Loading scenario...
      </div>
    )
  }

  const filteredLogs = manifest.logs.filter(
    (l) => (logFilter === 'all' || l.source === logFilter) && levelFilter.has(l.level)
  )

  const headerTimeRange = (() => {
    if (!manifest.startTime || !manifest.endTime) return ''
    const s = new Date(manifest.startTime)
    const e = new Date(manifest.endTime)
    const dur = ((e.getTime() - s.getTime()) / 1000).toFixed(1)
    return `${s.toLocaleTimeString()} - ${e.toLocaleTimeString()} (${dur}s)`
  })()

  const currentTick = hasTicks && currentTickIndex >= 0 ? ticks[currentTickIndex] : null
  const currentTickSnapshotIndex = currentTick ? getSnapshotIndexForGitHead(currentTick.gitHeadSha) : -1
  const currentFileSnapshotIndex = currentTick ? currentTickSnapshotIndex : currentSnapshotIndex
  const currentSnap = currentFileSnapshotIndex >= 0 ? snapshots[currentFileSnapshotIndex] : null
  const activeFileModes = activeLenses(fileChangeView, fileChangeLenses, FILE_CHANGE_LENSES)

  return (
    <div className="h-full grid grid-cols-2" style={{ gridTemplateRows: '1fr' }}>
      {/* Left column */}
      <div className="flex flex-col overflow-hidden border-r border-neutral-200">
        {/* Video */}
        <div className="flex-shrink-0 p-2 bg-neutral-50 border-b border-neutral-200">
          <video
            ref={videoRef}
            preload="auto"
            className="w-full max-h-[450px] bg-black rounded"
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onSeeked={() => {
              autoFollowRef.current = true
              syncToVideoTime()
            }}
            onLoadedMetadata={() => {
              const video = videoRef.current
              if (!video) return
              video.playbackRate = playSpeed / 100
              if (video.duration) {
                setTimelinePercent((video.currentTime / video.duration) * 100)
                setTimeDisplay(`${formatTime(video.currentTime)} / ${formatTime(video.duration)}`)
              }
            }}
          >
            <source src={`${API}/video.webm`} type="video/webm" />
          </video>
          <div className="flex items-start gap-2 mt-1.5 text-xs">
            <button
              className="bg-neutral-100 border border-neutral-300 w-8 h-7 rounded cursor-pointer hover:bg-neutral-200 flex items-center justify-center"
              onClick={() => {
                const video = videoRef.current
                if (video) {
                  if (video.paused) video.play()
                  else video.pause()
                }
              }}
            >
              {playing ? (
                <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min="0"
                max="100"
                value={playSpeed}
                onChange={(e) => setPlaySpeed(Number(e.target.value))}
                className="w-20 accent-neutral-400"
              />
              <span className="text-neutral-500 min-w-[36px]">{playSpeed}%</span>
            </div>
            <div className="flex-1">
              <div
                ref={timelineBarRef}
                className="bg-neutral-200 rounded relative cursor-pointer" style={{ height: '24px' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pct = (e.clientX - rect.left) / rect.width
                  const video = videoRef.current
                  if (video) video.currentTime = pct * video.duration
                }}
              >
                {/* Progress layers (z-10, behind dots) */}
                <div
                  className="absolute inset-y-0 left-0 z-10 bg-blue-400/10 rounded transition-[width] duration-100"
                  style={{ width: `${timelinePercent}%` }}
                />
                <div
                  className="absolute bottom-0 left-0 z-10 bg-blue-500/40 rounded-b transition-[width] duration-100"
                  style={{ width: `${timelinePercent}%`, height: '20%' }}
                />
                <div
                  className="absolute top-0 bottom-0 z-10 bg-blue-500/70 transition-[left] duration-100"
                  style={{ left: `${timelinePercent}%`, width: '2px' }}
                />
                {/* Dots and snapshot markers (z-20, on top) */}
                <div className="absolute inset-0 z-20 pointer-events-none">
                  {timelineMarkers}
                </div>
              </div>
              {/* Keyframe thumbnails aligned to timeline */}
              {manifest?.keyFrames && manifest.keyFrames.length > 0 && (() => {
                const video = videoRef.current
                if (!video?.duration) return null
                // Group keyframes that are close together (within 2% of video duration)
                const withTime = manifest.keyFrames
                  .filter(kf => kf.timestamp)
                  .map(kf => ({ ...kf, ms: new Date(kf.timestamp!).getTime() }))
                  .sort((a, b) => a.ms - b.ms)
                if (withTime.length === 0) return null
                const groupThresholdMs = video.duration * 1000 * 0.02
                const groups: { ms: number; kfs: KeyFrame[] }[] = []
                for (const kf of withTime) {
                  const last = groups[groups.length - 1]
                  if (last && Math.abs(kf.ms - last.ms) < groupThresholdMs) {
                    last.kfs.push(kf)
                  } else {
                    groups.push({ ms: kf.ms, kfs: [kf] })
                  }
                }
                const maxStack = Math.max(...groups.map(g => g.kfs.length))
                const thumbH = 10
                const gap = 2
                const totalH = maxStack * thumbH + (maxStack - 1) * gap
                return (
                  <div className="relative mt-0.5" style={{ height: totalH }}>
                    {groups.map((group, gi) => {
                      const videoSec = toVideoTime(group.ms)
                      const pct = (videoSec / video.duration) * 100
                      if (pct < 0 || pct > 100) return null
                      const isHighlighted = hoveredDocId ? group.kfs.some(kf => kf.docId === hoveredDocId) : false
                      return (
                        <div
                          key={gi}
                          className="absolute bottom-0 flex flex-col-reverse items-center"
                          style={{ left: `${pct}%`, transform: 'translateX(-50%)', gap }}
                        >
                          {group.kfs.map((kf) => {
                            const highlighted = hoveredDocId === kf.docId
                            return (
                              <img
                                key={kf.filename}
                                src={`${API}/keyframe-file/${kf.filename}`}
                                className={`block cursor-pointer transition-all border ${
                                  highlighted ? 'ring-2 ring-brand-500 opacity-100 border-brand-500' :
                                  isHighlighted ? 'opacity-40 border-neutral-300' : 'opacity-100 hover:ring-1 hover:ring-brand-300 border-neutral-400'
                                }`}
                                style={{ height: thumbH, width: thumbH * 1.6, objectFit: 'cover', borderRadius: 2 }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setHoveredKeyFrame({ docId: kf.docId, filename: kf.filename, x: rect.left + rect.width / 2, y: rect.top })
                                }}
                                onMouseLeave={() => setHoveredKeyFrame(null)}
                                onClick={() => {
                                  if (video) video.currentTime = Math.max(0, videoSec)
                                }}
                              />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              {healthData.hasAnyData && timelineBarWidth > 0 && (
                <div className="mt-0.5">
                  <HealthGraph
                    data={healthData}
                    width={timelineBarWidth}
                    height={32}
                    showEndIndicator
                    onClick={handleHealthClick}
                    currentTimePct={timelinePercent}
                  />
                </div>
              )}
            </div>
            <span className="min-w-[80px] text-right text-neutral-500">{timeDisplay}</span>
          </div>
          {/* Keyframe hover popup — sized to match video player */}
          {hoveredKeyFrame && (() => {
            const doc = scenarioDocs.find(d => d.id === hoveredKeyFrame.docId)
            const videoEl = videoRef.current
            const videoRect = videoEl?.getBoundingClientRect()
            const popupWidth = videoRect ? videoRect.width * 0.85 : 320
            return (
              <div
                className="fixed z-50 pointer-events-none"
                style={{
                  left: videoRect ? videoRect.left + videoRect.width / 2 : hoveredKeyFrame.x,
                  top: hoveredKeyFrame.y - 8,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <div className="bg-white rounded-lg shadow-xl border border-neutral-200 overflow-hidden">
                  <img
                    src={`${API}/keyframe-file/${hoveredKeyFrame.filename}`}
                    className="block"
                    style={{ width: popupWidth, height: 'auto' }}
                  />
                  <div className="px-2 py-1 text-[11px] font-medium text-brand-700 bg-brand-50 border-t border-neutral-100">
                    {doc?.name || hoveredKeyFrame.docId}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Snapshot indicator with dropdown */}
        <div className="relative flex items-center gap-2 px-3 py-1.5 bg-neutral-50 border-b border-neutral-200 text-xs">
          <button
            className="flex items-center gap-1.5 cursor-pointer hover:bg-neutral-100 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors"
            onClick={() => setSnapshotDropdownOpen(prev => !prev)}
          >
            {hasTicks ? (currentTickIndex >= 0 ? (() => {
              const changes = tickStateChanges[currentTickIndex]
              const summaryItems: SummaryItem[] = []
              if (changes?.files) {
                const fileModeMarkers = getChangedFileModes(currentTickIndex)
                summaryItems.push({
                  key: 'top-files',
                  text: 'Files',
                  tone: 'git',
                  strong: true,
                  fileModeMarkers,
                  onClick: (e) => { e.stopPropagation(); setActiveTab('files') },
                })
              }
              if (changes?.state) {
                summaryItems.push({
                  key: 'top-state',
                  text: stateDisplayName,
                  tone: 'state',
                  strong: true,
                  onClick: (e) => { e.stopPropagation(); setActiveTab('state') },
                })
              }
              if (changes?.s3) {
                summaryItems.push({
                  key: 'top-s3',
                  text: 'S3',
                  tone: 's3',
                  strong: true,
                  onClick: (e) => { e.stopPropagation(); setActiveTab('s3') },
                })
              }
              return (
                <>
                  <TickSummaryLine
                    tickNumber={currentTickIndex + 1}
                    items={summaryItems}
                    isSnapshot={Boolean(changes?.snapshot)}
                    snapshotMessage={changes?.snapshot ? changes.snapshotMessage : undefined}
                    emptyText="no changes"
                  />
                  <span className="text-neutral-400">of {ticks.length}</span>
                </>
              )
            })() : (
              <span className="text-neutral-400">Tick: --</span>
            )) : (
              <>
                <span className="text-neutral-400">Snapshot:</span>
                <span className="text-brand-500 font-bold">
                  {currentMessageIndex >= 0 && timelineSnapshotMessages[currentMessageIndex]
                    ? timelineSnapshotMessages[currentMessageIndex].message
                    : '--'}
                </span>
              </>
            )}
            <svg className={`w-3 h-3 text-neutral-400 transition-transform ${snapshotDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {snapshotDropdownOpen && hasTicks && (
            <div className="absolute top-full left-0 right-0 z-20 bg-white border border-neutral-200 shadow-lg rounded-b overflow-hidden max-h-[300px] overflow-y-auto">
              {(() => {
                const items: React.ReactNode[] = []
                let i = 0
                while (i < ticks.length) {
                  const changes = tickStateChanges[i]
                  const hasChange = changes && (changes.files || changes.state || changes.s3 || changes.snapshot)
                  if (hasChange) {
                    const idx = i
                    const tick = ticks[i]
                    items.push(
                      <button
                        key={`tick-${tick.tickIndex}`}
                        data-tick-index={idx}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-brand-50 transition-colors cursor-pointer ${
                          idx === currentTickIndex ? 'bg-brand-50 text-brand-600' : 'text-neutral-700'
                        }`}
                        onClick={() => {
                          selectTickIndex(idx)
                          setSnapshotDropdownOpen(false)
                        }}
                      >
                        <span className="rounded-full border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 whitespace-nowrap">
                          tick {idx + 1}
                          {changes.snapshot && (
                            <span className="ml-1 rounded-full border border-orange-200 bg-orange-100 px-1 text-[9px] leading-3 font-black text-orange-700 align-middle">
                              S
                            </span>
                          )}
                          :
                        </span>
                        <span className="flex items-center gap-1">
                          {changes.files && (
                            <SummaryChip item={{
                              key: `dropdown-files-${idx}`,
                              text: 'Files',
                              tone: 'git',
                              strong: true,
                              fileModeMarkers: getChangedFileModes(idx),
                              onClick: (e) => { e.stopPropagation(); setActiveTab('files'); selectTickIndex(idx); setSnapshotDropdownOpen(false) },
                            }} />
                          )}
                          {changes.state && <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium cursor-pointer hover:bg-amber-200 transition-colors" onClick={(e) => { e.stopPropagation(); setActiveTab('state'); selectTickIndex(idx); setSnapshotDropdownOpen(false) }}>{stateDisplayName}</span>}
                          {changes.s3 && <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium cursor-pointer hover:bg-emerald-200 transition-colors" onClick={(e) => { e.stopPropagation(); setActiveTab('s3'); selectTickIndex(idx); setSnapshotDropdownOpen(false) }}>S3</span>}
                        </span>
                        {changes.snapshot ? (
                          <span className="flex min-w-0 items-center gap-1">
                            {changes.snapshotMessage && (
                              <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-orange-700 ${idx === currentTickIndex ? 'font-bold' : 'font-medium'}`}>
                                {changes.snapshotMessage}
                              </span>
                            )}
                          </span>
                        ) : null}
                      </button>
                    )
                    i++
                  } else {
                    const groupStart = i
                    while (i < ticks.length) {
                      const c = tickStateChanges[i]
                      if (c && (c.files || c.state || c.s3 || c.snapshot)) break
                      i++
                    }
                    const count = i - groupStart
                    items.push(
                      <div
                        key={`group-${groupStart}`}
                        className="w-full text-left px-3 py-1 text-neutral-400 text-[11px] italic"
                      >
                        {count === 1
                          ? `tick ${groupStart + 1}, no changes`
                          : `ticks ${groupStart + 1}–${groupStart + count}, no changes`}
                      </div>
                    )
                  }
                }
                return items
              })()}
            </div>
          )}
          {snapshotDropdownOpen && !hasTicks && timelineSnapshotMessages.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 bg-white border border-neutral-200 shadow-lg rounded-b overflow-hidden">
              {timelineSnapshotMessages.map((snap, i) => (
                <button
                  key={i}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-brand-50 transition-colors cursor-pointer ${
                    i === currentMessageIndex ? 'bg-brand-50 text-brand-600' : 'text-neutral-700'
                  }`}
                  onClick={() => {
                    const snapTime = new Date(snap.timestamp).getTime()
                    const video = videoRef.current
                    if (video) video.currentTime = Math.max(0, toVideoTime(snapTime))
                    setSnapshotDropdownOpen(false)
                  }}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    i === currentMessageIndex
                      ? 'bg-brand-500'
                      : i < currentMessageIndex
                      ? 'bg-brand-300'
                      : 'bg-neutral-300'
                  }`} />
                  <span className={i === currentMessageIndex ? 'font-bold' : ''}>{snap.message}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scenario doc chips */}
        {matchingDocs.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 border-b border-neutral-200">
            <span className="text-[11px] text-neutral-400">Docs:</span>
            {matchingDocs.map((doc) => {
              const hasKeyFrame = manifest?.keyFrames?.some(kf => kf.docId === doc.id)
              return (
                <Link
                  key={doc.id}
                  to={`/${runId}?doc=${doc.id}`}
                  title={doc.isMeadowExtension ? 'Meadow Extension scenario' : undefined}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                    hoveredDocId === doc.id
                      ? 'bg-brand-500 text-white'
                      : 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                  }`}
                  onMouseEnter={() => hasKeyFrame ? setHoveredDocId(doc.id) : undefined}
                  onMouseLeave={() => setHoveredDocId(null)}
                >
                  {doc.isMeadowExtension && <span className="mr-0.5" aria-hidden>☁</span>}
                  {doc.name}
                </Link>
              )
            })}
          </div>
        )}

        {/* Notes */}
        {notes && (() => {
          const lines = notes.split('\n')
          const isMultiLine = lines.length > 1
          const displayText = notesExpanded ? notes : lines[0]
          const html = marked.parse(displayText) as string
          return (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
              <div className="text-xs prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: html }} />
              {isMultiLine && (
                <button
                  className="text-[11px] text-amber-700 hover:text-amber-900 font-medium cursor-pointer mt-1"
                  onClick={() => setNotesExpanded(!notesExpanded)}
                >
                  {notesExpanded ? 'Less' : 'More'}
                </button>
              )}
            </div>
          )
        })()}

        {/* Logs */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="bg-neutral-100 px-3 py-1.5 text-xs font-bold border-b border-neutral-200 flex items-center gap-2">
            <span>Logs</span>
            {headerTimeRange && (
              <span className="text-neutral-400 font-normal ml-auto">{headerTimeRange}</span>
            )}
            <div className="flex gap-1 ml-2">
              {(['all', 'backend', 'frontend'] as const).map((f) => (
                <button
                  key={f}
                  className={`border border-neutral-300 px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                    logFilter === f ? 'bg-neutral-300 text-neutral-800' : 'bg-transparent text-neutral-500'
                  }`}
                  onClick={() => setLogFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div ref={levelDropdownRef} className="relative ml-1">
              <button
                className="border border-neutral-300 px-2 py-0.5 rounded text-[11px] cursor-pointer bg-transparent text-neutral-500 flex items-center gap-1"
                onClick={() => setLevelDropdownOpen(prev => !prev)}
              >
                Levels
                {levelFilter.size < 5 && (
                  <span className="text-brand-500 font-normal">({levelFilter.size})</span>
                )}
                <svg className={`w-2.5 h-2.5 transition-transform ${levelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {levelDropdownOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded shadow-lg z-20 py-1 min-w-[120px]">
                  {([
                    { value: 'ERROR', label: 'Error', color: 'text-red-600' },
                    { value: 'WARN', label: 'Warning', color: 'text-yellow-600' },
                    { value: 'INFO', label: 'Info', color: '' },
                    { value: 'DEBUG', label: 'Debug', color: 'text-neutral-400' },
                    { value: 'LOG', label: 'Log', color: 'text-blue-500' },
                  ] as const).map(({ value, label, color }) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 px-3 py-1 hover:bg-neutral-50 cursor-pointer text-[11px]"
                    >
                      <input
                        type="checkbox"
                        checked={levelFilter.has(value)}
                        onChange={() => {
                          setLevelFilter(prev => {
                            const next = new Set(prev)
                            if (next.has(value)) next.delete(value)
                            else next.add(value)
                            return next
                          })
                        }}
                        className="accent-brand-500"
                      />
                      <span className={color}>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div
            ref={logEntriesRef}
            className="flex-1 overflow-y-auto text-xs leading-relaxed"
            onWheel={() => { autoFollowRef.current = false }}
            onClick={() => { autoFollowRef.current = false }}
          >
            {filteredLogs.map((log, i) => {
              const timeStr = log.timestamp
                ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : ''
              return (
                <div
                  key={i}
                  data-idx={i}
                  className={`flex gap-2 px-3 py-0.5 cursor-pointer whitespace-nowrap hover:bg-neutral-100 ${
                    i === highlightedLogIndex ? 'bg-blue-100' : ''
                  }`}
                  onClick={() => {
                    if (log.timestamp) {
                      const logTime = new Date(log.timestamp).getTime()
                      const video = videoRef.current
                      if (video) video.currentTime = Math.max(0, toVideoTime(logTime))
                    }
                  }}
                >
                  <span className="text-neutral-400 min-w-[72px]">{timeStr}</span>
                  <span className={`min-w-[60px] font-bold ${
                    log.source === 'backend' ? 'text-green-700' : 'text-blue-600'
                  }`}>
                    {log.source}
                  </span>
                  <span className={`min-w-[36px] ${
                    log.level === 'ERROR' ? 'text-red-600' :
                    log.level === 'WARN' ? 'text-yellow-600' : ''
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-neutral-600 overflow-hidden text-ellipsis">{log.message}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex bg-neutral-100 border-b border-neutral-200">
          {(['test-code', 'files', 'state', 's3'] as const).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-1.5 text-xs font-bold cursor-pointer border-b-2 ${
                activeTab === tab
                  ? 'text-brand-500 border-brand-500'
                  : 'text-neutral-500 border-transparent hover:text-neutral-700'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'files' ? 'Files' :
               tab === 'test-code' ? 'Test Code' :
               tab === 'state' ? stateDisplayName : 'S3 Objects'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Files tab */}
          {activeTab === 'files' && (
            <>
              <ChangeModePicker<FileChangeLens>
                view={fileChangeView}
                selected={fileChangeLenses}
                options={FILE_CHANGE_LENSES}
                onViewChange={setFileChangeView}
                onSelectedChange={setFileChangeLenses}
                showAllButton={false}
              />
              {activeFileModes.length > 1 && (
                <div
                  className="bg-neutral-100 px-3 py-1.5 text-xs border-b border-neutral-200 flex items-center gap-2 cursor-pointer hover:bg-neutral-200/50"
                  onClick={() => setCommitListOpen(!commitListOpen)}
                >
                  <span className="font-bold">MeadowHome Files</span>
                  {!commitListOpen && hasTicks && currentTickIndex >= 0 && (
                    <TickSummaryLine
                      tickNumber={currentTickIndex + 1}
                      items={getFileModeOverviewItems(currentTickIndex, activeFileModes)}
                      isSnapshot={Boolean(ticks[currentTickIndex]?.isSnapshot)}
                      snapshotMessage={ticks[currentTickIndex]?.isSnapshot ? ticks[currentTickIndex].snapshotMessage : undefined}
                      emptyText="no changes"
                    />
                  )}
                  {!commitListOpen && (!hasTicks || currentTickIndex < 0) && (
                    <span className="text-neutral-400 italic text-[11px]">no tick data</span>
                  )}
                  <svg className={`w-3 h-3 ml-auto flex-shrink-0 text-neutral-400 transition-transform ${commitListOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              )}
              {activeFileModes.length > 1 && commitListOpen && (
                <div className="max-h-[240px] overflow-y-auto border-b border-neutral-200">
                  {(() => {
                    const overviewItems = ticks.flatMap((tick, tickArrayIndex) => {
                      const items = getFileModeOverviewItems(tickArrayIndex, activeFileModes)
                      if (items.length === 0 && !tick.isSnapshot) return []
                      return [{ tick, tickArrayIndex, items }]
                    })
                    if (overviewItems.length === 0) {
                      return <div className="p-3 text-center text-neutral-400 text-xs">No selected-mode file changes.</div>
                    }
                    return overviewItems.map(({ tick, tickArrayIndex, items }) => {
                      const time = new Date(tick.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      return (
                        <button
                          key={`file-overview-${tick.tickIndex}`}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-100 ${
                            tickArrayIndex === currentTickIndex ? 'bg-purple-50' : ''
                          }`}
                          onClick={() => {
                            selectTickIndex(tickArrayIndex)
                            setCommitListOpen(false)
                          }}
                        >
                          <TickSummaryLine
                            tickNumber={tickArrayIndex + 1}
                            items={items}
                            isSnapshot={tick.isSnapshot}
                            snapshotMessage={tick.isSnapshot ? tick.snapshotMessage : undefined}
                          />
                          <span className="ml-auto text-neutral-400 text-[11px] whitespace-nowrap">{time}</span>
                        </button>
                      )
                    })
                  })()}
                </div>
              )}
              {/* Per-mode file browsers */}
              {(() => {
                const isTickMode = hasTicks && currentTickIndex >= 0
                const tick = isTickMode ? ticks[currentTickIndex] : null
                const ignoredSet = new Set(tick?.ignoredFiles || [])

                const buildFileMode = (mode: FileChangeLens) => {
                  const trackedFiles = isTickMode ? getTickFilesAtIndex(currentTickIndex) : fileList
                  const allFiles = isTickMode ? getTickWorkingFilesAtIndex(currentTickIndex) : fileList
                  const removedSet = new Set<string>()
                  const fileStatuses = new Map<string, FileStatus>()
                  const changedFiles = new Set<string>()

                  if (!isTickMode || !tick) {
                    const changedSet = new Set(currentSnap?.changedFiles || [])
                    for (const f of allFiles) {
                      fileStatuses.set(f, mode === 'git' && changedSet.has(f) ? 'just-committed' : 'committed')
                      if (changedSet.has(f)) changedFiles.add(f)
                    }
                    return {
                      files: allFiles,
                      changedFiles: [...changedFiles],
                      addedFiles: [],
                      removedFiles: [],
                      fileStatuses,
                      emptyText: mode === 'git' ? 'No commits captured yet' : 'No tick data captured',
                    }
                  }

                  const tickUncommittedPaths = new Map<string, string>()
                  for (const f of tick.uncommittedFiles || []) {
                    tickUncommittedPaths.set(f.path, f.status)
                  }

                  if (mode === 'tick') {
                    const delta = getTickFileDelta(currentTickIndex)
                    for (const f of allFiles) {
                      applyStatus(fileStatuses, f, 'committed')
                    }
                    for (const f of delta.removed) {
                      removedSet.add(f)
                      applyStatus(fileStatuses, f, 'removed')
                      changedFiles.add(f)
                    }
                    for (const f of delta.added) {
                      applyStatus(fileStatuses, f, 'uncommitted-new')
                      changedFiles.add(f)
                    }
                    for (const f of delta.modified) {
                      applyStatus(fileStatuses, f, 'uncommitted-modified')
                      changedFiles.add(f)
                    }
                  }

                  if (mode === 'git') {
                    const commitChangedThisTick = Boolean(
                      tick.changedGitHead &&
                      currentSnap &&
                      tick.gitHeadSha === currentSnap.commitHash
                    )
                    for (const f of trackedFiles) {
                      applyStatus(fileStatuses, f, 'committed')
                    }
                    if (commitChangedThisTick) {
                      for (const f of currentSnap?.changedFiles || []) {
                        applyStatus(fileStatuses, f, 'just-committed')
                        changedFiles.add(f)
                      }
                    }
                    for (const f of tick.uncommittedFiles || []) {
                      const normalized = normalizeGitStatus(f.status)
                      if (normalized === 'deleted') removedSet.add(f.path)
                      applyStatus(
                        fileStatuses,
                        f.path,
                        normalized === 'new' ? 'uncommitted-new' : normalized === 'deleted' ? 'removed' : 'uncommitted-modified',
                      )
                      changedFiles.add(f.path)
                    }
                  }

                  const displayFiles = sortedUnion(allFiles, [...removedSet])
                  return {
                    files: displayFiles,
                    changedFiles: [...changedFiles],
                    addedFiles: mode === 'tick' ? tick.addedFiles : [...displayFiles].filter((f) => fileStatuses.get(f) === 'uncommitted-new'),
                    removedFiles: [...removedSet],
                    fileStatuses,
                    emptyText: `No ${lensLabel(mode).toLowerCase()} file changes at this point`,
                  }
                }

                if (activeFileModes.length === 0) {
                  return <div className="p-10 text-center text-neutral-400 text-sm">Select a change mode.</div>
                }

                return (
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {activeFileModes.map((mode) => {
                      const pane = buildFileMode(mode)
                      const tickDelta = currentTickIndex >= 0 ? getTickFileDelta(currentTickIndex) : { added: [], modified: [], removed: [] }
                      return (
                        <React.Fragment key={mode}>
                          <MeadowFileModePane
                            title={`${lensLabel(mode)} file view`}
                            mode={mode}
                            files={pane.files}
                            changedFiles={pane.changedFiles}
                            addedFiles={pane.addedFiles}
                            removedFiles={pane.removedFiles}
                            fileStatuses={pane.fileStatuses}
                            ignoredSet={isTickMode ? ignoredSet : undefined}
                            emptyText={pane.emptyText}
                            currentSummaryItems={currentTickIndex >= 0 ? getFileModeSummaryItems(mode, currentTickIndex, `${mode}-current`) : []}
                            timelineItems={getFileModeTimelineItems(mode)}
                            timelineEmptyText={`No ${lensLabel(mode).toLowerCase()} file changes.`}
                            onSelectTimelineTick={selectTickIndex}
                            statusFilter={fileStatusFilter}
                            onStatusFilterChange={setFileStatusFilter}
                            selectedFileRequest={filePaneSelection}
                            tickChangedFiles={mode === 'git' ? sortedUnion(tickDelta.added, tickDelta.modified, tickDelta.removed) : []}
                            onTickChangedFileClick={mode === 'git' ? showFileInTickView : undefined}
                            API={API}
                            currentTickIndex={currentTickIndex}
                            ticks={ticks}
                            currentSnapshotIndex={currentFileSnapshotIndex}
                            snapshots={snapshots}
                            fetchFileContent={fetchFileContent}
                          />
                        </React.Fragment>
                      )
                    })}
                  </div>
                )
              })()}
            </>
          )}

          {/* Test Code tab */}
          {activeTab === 'test-code' && (
            <pre
              ref={testCodeRef}
              className="flex-1 min-h-0 overflow-auto m-0 text-xs leading-relaxed"
            >
              {testSource ? (
                highlight(testSource, languages.typescript, 'typescript')
                  .split('\n')
                  .map((lineHtml, i) => (
                    <div key={i} className="code-line px-3 font-mono" dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }} />
                  ))
              ) : (
                <div className="p-10 text-center text-neutral-400">No test source code captured.</div>
              )}
            </pre>
          )}

          {/* Structured-state tab */}
          {activeTab === 'state' && (
            <>
              <div
                className="bg-neutral-100 px-3 py-1.5 text-xs border-b border-neutral-200 flex items-center gap-2 cursor-pointer hover:bg-neutral-200/50"
                onClick={() => setStateListOpen(!stateListOpen)}
              >
                <span className="font-bold">{stateDisplayName} Tables</span>
                {!stateListOpen && (() => {
                  const currentTick = hasTicks && currentTickIndex >= 0 ? ticks[currentTickIndex] : null
                  const changes = currentTickIndex >= 0 ? tickStateChanges[currentTickIndex] : null
                  const summaryItems: SummaryItem[] = []
                  if (currentTick) {
                    if (changes?.state) {
                      const diffItems = getStateSummaryItems(currentTickIndex, 'state-record')
                      summaryItems.push(...(
                        diffItems.length > 0
                          ? diffItems
                          : [{ key: 'state-changed', text: `${stateDisplayName} changed`, tone: 'state', strong: true } satisfies SummaryItem]
                      ))
                    }
                  }
                  return (
                    <span className="flex items-center gap-1.5 text-[11px] font-normal overflow-hidden">
                      {currentTick ? (
                        <TickSummaryLine
                          tickNumber={currentTickIndex + 1}
                          items={summaryItems}
                          isSnapshot={currentTick.isSnapshot}
                          snapshotMessage={currentTick.isSnapshot ? currentTick.snapshotMessage : undefined}
                          emptyText="no changes"
                        />
                      ) : stateSnapshots.length > 0 ? (
                        <span className="text-amber-600 overflow-hidden text-ellipsis whitespace-nowrap">
                          snapshot {currentStateIndex + 1}/{stateSnapshots.length}
                        </span>
                      ) : (
                        <span className="text-neutral-400 italic">no snapshots</span>
                      )}
                    </span>
                  )
                })()}
                <svg className={`w-3 h-3 ml-auto flex-shrink-0 text-neutral-400 transition-transform ${stateListOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {stateListOpen && hasTicks && (
                <div className="max-h-[300px] overflow-y-auto border-b border-neutral-200">
                  {(() => {
                    const items: React.ReactNode[] = []
                    let i = 0
                    while (i < ticks.length) {
                      const changes = tickStateChanges[i]
                      const hasStateChange = changes?.state || ticks[i].isSnapshot
                      if (hasStateChange) {
                        const idx = i
                        const tick = ticks[i]
                        const time = new Date(tick.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        items.push(
                          <div
                            key={`state-tick-${tick.tickIndex}`}
                            className={`flex gap-2 px-3 py-1 text-[11px] cursor-pointer hover:bg-neutral-100 ${
                              idx === currentTickIndex ? 'bg-amber-50' : ''
                            }`}
                            onClick={() => {
                              selectTickIndex(idx)
                              setStateListOpen(false)
                            }}
                          >
                            <span className="rounded-full border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 whitespace-nowrap">
                              tick {idx + 1}
                              {tick.isSnapshot && (
                                <span className="ml-1 rounded-full border border-orange-200 bg-orange-100 px-1 text-[9px] leading-3 font-black text-orange-700 align-middle">
                                  S
                                </span>
                              )}
                              :
                            </span>
                            <span className="flex flex-1 min-w-0 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-neutral-600">
                              {tick.isSnapshot && tick.snapshotMessage && (
                                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700">
                                  {tick.snapshotMessage}
                                </span>
                              )}
                              {changes?.state && (() => {
                                const delta = hasTickStateData
                                  ? getTickStateRecordDelta(idx)
                                  : getStateSnapshotDeltaForTick(idx)
                                return (
                                  <span className="flex items-center gap-1">
                                    {delta.added.length > 0 && <span className="text-blue-500">+{delta.added.length} added</span>}
                                    {delta.modified.length > 0 && <span className="text-amber-500">~{delta.modified.length} modified</span>}
                                    {delta.removed.length > 0 && <span className="text-red-500">-{delta.removed.length} removed</span>}
                                    {delta.added.length === 0 && delta.modified.length === 0 && delta.removed.length === 0 && (
                                      <span className="text-amber-600 font-medium">{stateDisplayName} changed</span>
                                    )}
                                  </span>
                                )
                              })()}
                              {tick.isSnapshot && !changes?.state && (
                                <span className="text-neutral-400 italic">no changes</span>
                              )}
                            </span>
                            <span className="text-neutral-400 whitespace-nowrap">{time}</span>
                          </div>
                        )
                        i++
                      } else {
                        const groupStart = i
                        while (i < ticks.length) {
                          const c = tickStateChanges[i]
                          if (c?.state || ticks[i].isSnapshot) break
                          i++
                        }
                        const count = i - groupStart
                        items.push(
                          <div
                            key={`state-group-${groupStart}`}
                            className="w-full text-left px-3 py-1 text-neutral-400 text-[11px] italic"
                          >
                            {count === 1
                              ? `tick ${groupStart + 1}, no ${stateDisplayName} changes`
                              : `ticks ${groupStart + 1}\u2013${groupStart + count}, no ${stateDisplayName} changes`}
                          </div>
                        )
                      }
                    }
                    return items
                  })()}
                </div>
              )}
              {(() => {
                const tickStateContents = currentTickIndex >= 0
                  ? getTickStateRecordContentsAtIndex(currentTickIndex)
                  : null
                const previousTickStateContents = currentTickIndex > 0
                  ? getTickStateRecordContentsAtIndex(currentTickIndex - 1)
                  : null
                const tickStateDelta = currentTickIndex >= 0
                  ? getTickStateRecordDelta(currentTickIndex)
                  : { added: [], modified: [], removed: [] }
                const useTickState = hasTickStateData && tickStateContents !== null
                const paths = useTickState
                  ? Object.keys(tickStateContents).sort()
                  : stateParsed.paths
                const contents = useTickState
                  ? tickStateContents
                  : stateParsed.contents
                const prevContents = useTickState
                  ? (previousTickStateContents ?? {})
                  : prevStateParsed.contents
                const { added, removed, modified } = useTickState
                  ? tickStateDelta
                  : stateDiffs
                const stateFileStatuses = new Map<string, FileStatus>()
                const addedSet = new Set(added)
                const modifiedSet = new Set(modified)

                for (const p of paths) {
                  if (addedSet.has(p)) stateFileStatuses.set(p, 'uncommitted-new')
                  else if (modifiedSet.has(p)) stateFileStatuses.set(p, 'uncommitted-modified')
                  else stateFileStatuses.set(p, 'committed')
                }
                for (const p of removed) {
                  stateFileStatuses.set(p, 'removed')
                }

                const selectedStatus = currentStateRecordPath
                  ? stateFileStatuses.get(currentStateRecordPath)
                  : undefined
                const selectedContent = currentStateRecordPath ? contents[currentStateRecordPath] : undefined
                const selectedPrevContent = currentStateRecordPath ? prevContents[currentStateRecordPath] : undefined
                const contentView = buildResourceContentView({
                  selectedPath: currentStateRecordPath,
                  status: selectedStatus,
                  currentContent: selectedContent,
                  previousContent: selectedPrevContent,
                  noun: 'record',
                  selectMessage: 'Select a record to view its contents',
                  notFoundMessage: 'Record not found at this tick',
                  language: 'yaml',
                })

                return (
                  <ResourceChangePane
                    title={`Tick ${stateDisplayName} view`}
                    files={sortedUnion(paths, removed)}
                    changedFiles={sortedUnion(added, removed, modified)}
                    selectedFile={currentStateRecordPath}
                    onSelectFile={setCurrentStateRecordPath}
                    addedFiles={added}
                    removedFiles={removed}
                    fileStatuses={stateFileStatuses}
                    emptyText={`No ${stateDisplayName} records at this tick`}
                    filteredEmptyText="No records match the active filters"
                    statusFilter={fileStatusFilter}
                    onStatusFilterChange={setFileStatusFilter}
                    contentView={contentView}
                    diffMode={stateDiffMode}
                    onDiffModeChange={setStateDiffMode}
                  />
                )
              })()}
            </>
          )}

          {/* S3 tab */}
          {activeTab === 's3' && (
            <>
              <div
                className="bg-neutral-100 px-3 py-1.5 text-xs border-b border-neutral-200 flex items-center gap-2 cursor-pointer hover:bg-neutral-200/50"
                onClick={() => setS3ListOpen(!s3ListOpen)}
              >
                <span className="font-bold">S3 Objects</span>
                {!s3ListOpen && (() => {
                  const currentTick = hasTicks && currentTickIndex >= 0 ? ticks[currentTickIndex] : null
                  const summaryItems: SummaryItem[] = []
                  if (currentTick) {
                    if (currentTick.s3Changed) {
                      summaryItems.push(...deltaSummaryItems({
                        added: currentTick.s3AddedKeys || [],
                        modified: currentTick.s3ModifiedKeys || [],
                        removed: currentTick.s3RemovedKeys || [],
                      }, 's3-object', 'object'))
                    }
                  }
                  return (
                    <span className="flex items-center gap-1.5 text-[11px] font-normal overflow-hidden">
                      {currentTick ? (
                        <TickSummaryLine
                          tickNumber={currentTickIndex + 1}
                          items={summaryItems}
                          isSnapshot={currentTick.isSnapshot}
                          snapshotMessage={currentTick.isSnapshot ? currentTick.snapshotMessage : undefined}
                          emptyText="no changes"
                        />
                      ) : (
                        <span className="text-neutral-400 italic">no tick data</span>
                      )}
                    </span>
                  )
                })()}
                <svg className={`w-3 h-3 ml-auto flex-shrink-0 text-neutral-400 transition-transform ${s3ListOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {s3ListOpen && hasTicks && (
                <div className="max-h-[300px] overflow-y-auto border-b border-neutral-200">
                  {(() => {
                    const items: React.ReactNode[] = []
                    let i = 0
                    while (i < ticks.length) {
                      const tick = ticks[i]
                      const hasS3Change = tick.s3Changed || tick.isSnapshot
                      if (hasS3Change) {
                        const idx = i
                        const time = new Date(tick.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        items.push(
                          <div
                            key={`s3-tick-${tick.tickIndex}`}
                            className={`flex gap-2 px-3 py-1 text-[11px] cursor-pointer hover:bg-neutral-100 ${
                              idx === currentTickIndex ? 'bg-emerald-50' : ''
                            }`}
                            onClick={() => {
                              selectTickIndex(idx)
                              setS3ListOpen(false)
                            }}
                          >
                            <span className="rounded-full border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 whitespace-nowrap">
                              tick {idx + 1}
                              {tick.isSnapshot && (
                                <span className="ml-1 rounded-full border border-orange-200 bg-orange-100 px-1 text-[9px] leading-3 font-black text-orange-700 align-middle">
                                  S
                                </span>
                              )}
                              :
                            </span>
                            <span className="flex flex-1 min-w-0 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-neutral-600">
                              {tick.isSnapshot && tick.snapshotMessage && (
                                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700">
                                  {tick.snapshotMessage}
                                </span>
                              )}
                              {tick.s3Changed && (
                                <span className="flex items-center gap-1">
                                  {tick.s3AddedKeys?.length > 0 && <span className="text-blue-500">+{tick.s3AddedKeys.length} added</span>}
                                  {tick.s3ModifiedKeys?.length > 0 && <span className="text-amber-500">~{tick.s3ModifiedKeys.length} modified</span>}
                                  {tick.s3RemovedKeys?.length > 0 && <span className="text-red-500">-{tick.s3RemovedKeys.length} removed</span>}
                                </span>
                              )}
                              {tick.isSnapshot && !tick.s3Changed && (
                                <span className="text-neutral-400 italic">no changes</span>
                              )}
                            </span>
                            <span className="text-neutral-400 whitespace-nowrap">{tick.s3KeyCount ?? 0} objects</span>
                            <span className="text-neutral-400 whitespace-nowrap">{time}</span>
                          </div>
                        )
                        i++
                      } else {
                        const groupStart = i
                        while (i < ticks.length && !(ticks[i].s3Changed || ticks[i].isSnapshot)) {
                          i++
                        }
                        const count = i - groupStart
                        items.push(
                          <div
                            key={`s3-group-${groupStart}`}
                            className="w-full text-left px-3 py-1 text-neutral-400 text-[11px] italic"
                          >
                            {count === 1
                              ? `tick ${groupStart + 1}, no S3 changes`
                              : `ticks ${groupStart + 1}\u2013${groupStart + count}, no S3 changes`}
                          </div>
                        )
                      }
                    }
                    return items
                  })()}
                </div>
              )}
              {(() => {
                const isTickMode = hasTicks && currentTickIndex >= 0
                const tick = isTickMode ? ticks[currentTickIndex] : null

                if (isTickMode && tick) {
                  // Tick-based S3 display — same file tree approach as MeadowHome files
                  const allKeys = getS3KeysAtIndex(currentTickIndex)
                  const s3RemovedSet = new Set(tick.s3RemovedKeys || [])
                  const currentS3Objects = getS3ObjectContentsAtIndex(currentTickIndex) ?? s3Objects
                  const previousS3Objects = getS3ObjectContentsAtIndex(currentTickIndex - 1) ?? prevS3Objects

                  // Prefer tick-captured modified keys when present; fall back to
                  // snapshot content comparison for older artifacts.
                  const s3ModifiedSet = new Set<string>(tick.s3ModifiedKeys || [])
                  for (const key of allKeys) {
                    if (key in previousS3Objects && key in currentS3Objects && previousS3Objects[key] !== currentS3Objects[key]) {
                      s3ModifiedSet.add(key)
                    }
                  }

                  // Build file status map
                  const s3FileStatuses = new Map<string, FileStatus>()
                  const addedSet = new Set(tick.s3AddedKeys || [])
                  for (const key of allKeys) {
                    if (addedSet.has(key)) {
                      s3FileStatuses.set(key, 'uncommitted-new')
                    } else if (s3ModifiedSet.has(key)) {
                      s3FileStatuses.set(key, 'uncommitted-modified')
                    } else {
                      s3FileStatuses.set(key, 'committed')
                    }
                  }
                  for (const key of s3RemovedSet) {
                    s3FileStatuses.set(key, 'removed')
                  }

                  const selectedStatus = currentS3Key ? s3FileStatuses.get(currentS3Key) : undefined
                  const currentContent = currentS3Key ? currentS3Objects[currentS3Key] : undefined
                  const previousContent = currentS3Key ? previousS3Objects[currentS3Key] : undefined
                  const contentView = buildResourceContentView({
                    selectedPath: currentS3Key,
                    status: selectedStatus,
                    currentContent,
                    previousContent,
                    noun: 'object',
                    selectMessage: 'Select an object to view its contents',
                    notFoundMessage: 'Object not found at this tick',
                    binary: currentContent !== undefined && isBinary(currentContent),
                  })

                  return (
                    <ResourceChangePane
                      title="Tick S3 view"
                      files={sortedUnion(allKeys, [...s3RemovedSet])}
                      changedFiles={sortedUnion(tick.s3AddedKeys || [], tick.s3ModifiedKeys || [], tick.s3RemovedKeys || [])}
                      selectedFile={currentS3Key}
                      onSelectFile={setCurrentS3Key}
                      addedFiles={tick.s3AddedKeys}
                      removedFiles={tick.s3RemovedKeys}
                      fileStatuses={s3FileStatuses}
                      emptyText="No S3 objects at this tick"
                      filteredEmptyText="No objects match the active filters"
                      statusFilter={fileStatusFilter}
                      onStatusFilterChange={setFileStatusFilter}
                      contentView={contentView}
                      diffMode={s3DiffMode}
                      onDiffModeChange={setS3DiffMode}
                    />
                  )
                }

                // Snapshot-based fallback (no tick data)
                return (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-[0_0_40%] overflow-y-auto border-b border-neutral-200 py-1 text-xs">
                      {Object.keys(s3Objects).length === 0 ? (
                        <div className="p-10 text-center text-neutral-400">No S3 snapshots</div>
                      ) : (
                        Object.keys(s3Objects).sort().map((key) => (
                          <div
                            key={key}
                            className={`px-3 py-0.5 cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis hover:bg-neutral-100 ${
                              currentS3Key === key ? 'bg-neutral-200 text-neutral-900' : ''
                            } ${isBinary(s3Objects[key]) ? 'text-neutral-400' : ''}`}
                            onClick={() => setCurrentS3Key(key)}
                          >
                            {key}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                      {!currentS3Key || !(currentS3Key in s3Objects) ? (
                        <div className="p-10 text-center text-neutral-400 text-sm">Select an object to view its contents</div>
                      ) : isBinary(s3Objects[currentS3Key]) ? (
                        <div className="p-10 text-center text-neutral-400 text-sm">Sorry, this is a binary file.</div>
                      ) : !s3Objects[currentS3Key] ? (
                        <div className="p-10 text-center text-neutral-400 text-sm">(empty)</div>
                      ) : (
                        <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700">
                          {s3Objects[currentS3Key]}
                        </pre>
                      )}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      </div>

      {/* Keyboard help */}
      <div className="fixed bottom-2 right-2 text-[11px] text-neutral-400">
        <kbd className="bg-neutral-100 px-1 py-0.5 rounded border border-neutral-300 text-[10px]">Space</kbd> play/pause{' '}
        <kbd className="bg-neutral-100 px-1 py-0.5 rounded border border-neutral-300 text-[10px]">&larr;</kbd>
        <kbd className="bg-neutral-100 px-1 py-0.5 rounded border border-neutral-300 text-[10px]">&rarr;</kbd> prev/next
      </div>
    </div>
  )
}

// --- File Tree sub-component ---

interface ChangeModePickerProps<T extends string> {
  view: ChangeView
  selected: Set<T>
  options: readonly { key: T; label: string }[]
  onViewChange: (view: ChangeView) => void
  onSelectedChange: (selected: Set<T>) => void
  showAllButton?: boolean
}

function ChangeModePicker<T extends string>({
  view,
  selected,
  options,
  onViewChange,
  onSelectedChange,
  showAllButton = true,
}: ChangeModePickerProps<T>) {
  const toggle = (key: T) => {
    onViewChange('custom')
    if (view === 'all') {
      onSelectedChange(new Set([key]))
      return
    }
    const next = new Set(selected)
    if (next.has(key) && next.size > 1) next.delete(key)
    else next.add(key)
    onSelectedChange(next)
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-white text-[10px]">
      {showAllButton && (
        <button
          className={`px-1.5 py-0.5 rounded font-medium border transition-colors ${
            view === 'all'
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-neutral-100 text-neutral-500 border-neutral-200'
          }`}
          onClick={() => {
            onViewChange('all')
            onSelectedChange(new Set(options.map((o) => o.key)))
          }}
        >
          All
        </button>
      )}
      {options.map((option) => {
        const active = view === 'all' || selected.has(option.key)
        const explicitlySelected = view === 'custom' && selected.has(option.key)
        return (
          <button
            key={option.key}
            className={`px-1.5 py-0.5 rounded font-medium border transition-colors ${
              explicitlySelected
                ? 'bg-brand-50 text-brand-700 border-brand-400'
                : active
                ? 'bg-white text-neutral-700 border-neutral-300'
                : 'bg-neutral-100 text-neutral-400 border-neutral-200 line-through'
            }`}
            onClick={() => toggle(option.key)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

interface ResourceContentNote {
  text: string
  className: string
}

interface ResourceContentView {
  message?: string
  fullHtml?: string
  diffHtml?: string | null
  note?: ResourceContentNote | null
}

function resourceMessage(message: string): ResourceContentView {
  return { message }
}

function resourcePreHtml(content: string, language?: 'yaml'): string {
  const html = language === 'yaml'
    ? highlight(content, languages.yaml, 'yaml')
    : escapeHtml(content)
  return `<pre class="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700">${html}</pre>`
}

function resourceDiffHtml(previousContent: string, currentContent: string): string {
  return `<pre class="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700">${diffHighlight(previousContent, currentContent)}</pre>`
}

function buildResourceContentView({
  selectedPath,
  status,
  currentContent,
  previousContent,
  noun,
  selectMessage,
  notFoundMessage,
  language,
  binary = false,
  emptyMessage = '(empty)',
}: {
  selectedPath: string | null
  status?: FileStatus
  currentContent?: string
  previousContent?: string
  noun: string
  selectMessage: string
  notFoundMessage: string
  language?: 'yaml'
  binary?: boolean
  emptyMessage?: string
}): ResourceContentView {
  if (!selectedPath) return resourceMessage(selectMessage)
  if (binary) return resourceMessage('Sorry, this is a binary file.')

  const isRemoved = status === 'removed'
  if (currentContent === undefined && !isRemoved) return resourceMessage(notFoundMessage)

  const fullContent = isRemoved ? (previousContent ?? '') : (currentContent ?? '')
  if (!isRemoved && fullContent === '') return resourceMessage(emptyMessage)

  const hasDiff = previousContent !== undefined && (
    status === 'uncommitted-modified' ||
    status === 'removed' ||
    status === 'just-committed'
  )
  const note = status === 'uncommitted-new'
    ? { text: `new ${noun}`, className: 'text-blue-500' }
    : status === 'removed'
      ? { text: `removed ${noun}`, className: 'text-red-500' }
      : null

  return {
    fullHtml: resourcePreHtml(fullContent, language),
    diffHtml: hasDiff ? resourceDiffHtml(previousContent ?? '', isRemoved ? '' : fullContent) : null,
    note,
  }
}

function ResourceContentViewer({
  view,
  diffMode,
  onDiffModeChange,
}: {
  view: ResourceContentView
  diffMode: boolean
  onDiffModeChange: (diffMode: boolean) => void
}) {
  if (view.message) {
    return <div className="p-10 text-center text-neutral-400 text-sm">{view.message}</div>
  }

  const hasDiff = view.diffHtml != null
  const hasToolbar = hasDiff || view.note != null
  const contentHtml = diffMode && view.diffHtml ? view.diffHtml : (view.fullHtml ?? '')

  return (
    <>
      {hasToolbar && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50 text-[10px]">
          <button
            className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
              !hasDiff || !diffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
            }`}
            onClick={() => onDiffModeChange(false)}
          >
            Full
          </button>
          {hasDiff && (
            <button
              className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
                diffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
              }`}
              onClick={() => onDiffModeChange(true)}
            >
              Diff
            </button>
          )}
          {view.note && <span className={`${view.note.className} ml-1`}>{view.note.text}</span>}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto" dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </>
  )
}

interface ResourceChangePaneProps {
  title: string
  files: string[]
  changedFiles: string[]
  selectedFile: string | null
  onSelectFile: (file: string) => void
  addedFiles?: string[]
  removedFiles?: string[]
  fileStatuses: Map<string, FileStatus>
  ignoredSet?: Set<string>
  emptyText: string
  filteredEmptyText?: string
  statusFilter: Set<string>
  onStatusFilterChange: React.Dispatch<React.SetStateAction<Set<string>>>
  currentSummaryItems?: SummaryItem[]
  summaryEmptyText?: string
  timelineItems?: FileTimelineItem[]
  timelineEmptyText?: string
  onSelectTimelineTick?: (tickArrayIndex: number) => void
  currentTickIndex?: number
  ticks?: ProcessedTick[]
  tickChangedFiles?: string[]
  onTickChangedFileClick?: (filePath: string) => void
  contentView: ResourceContentView
  diffMode: boolean
  onDiffModeChange: (diffMode: boolean) => void
}

function ResourceChangePane({
  title,
  files,
  changedFiles,
  selectedFile,
  onSelectFile,
  addedFiles,
  removedFiles,
  fileStatuses,
  ignoredSet,
  emptyText,
  filteredEmptyText = 'No items match the active filters',
  statusFilter,
  onStatusFilterChange,
  currentSummaryItems,
  summaryEmptyText = 'no changes',
  timelineItems,
  timelineEmptyText = 'No changes.',
  onSelectTimelineTick,
  currentTickIndex = -1,
  ticks = [],
  tickChangedFiles,
  onTickChangedFileClick,
  contentView,
  diffMode,
  onDiffModeChange,
}: ResourceChangePaneProps) {
  const [timelineOpen, setTimelineOpen] = useState(false)
  const hasTimeline = Boolean(timelineItems && onSelectTimelineTick)
  const statusCounts: Record<FileStatus, number> = {
    'uncommitted-new': 0,
    'uncommitted-modified': 0,
    removed: 0,
    'just-committed': 0,
    committed: 0,
  }
  for (const status of fileStatuses.values()) {
    statusCounts[status]++
  }

  const statusCategories = [
    { key: 'uncommitted-new' as const, label: `+ ${statusCounts['uncommitted-new']} added`, color: 'text-blue-500', borderColor: 'border-blue-500', bgActive: 'bg-blue-50', count: statusCounts['uncommitted-new'] },
    { key: 'uncommitted-modified' as const, label: `~ ${statusCounts['uncommitted-modified']} modified`, color: 'text-amber-500', borderColor: 'border-amber-500', bgActive: 'bg-amber-50', count: statusCounts['uncommitted-modified'] },
    { key: 'removed' as const, label: `- ${statusCounts.removed} removed`, color: 'text-red-500', borderColor: 'border-red-500', bgActive: 'bg-red-50', count: statusCounts.removed },
    { key: 'just-committed' as const, label: `${statusCounts['just-committed']} committed`, color: 'text-green-600', borderColor: 'border-green-500', bgActive: 'bg-green-50', count: statusCounts['just-committed'] },
    { key: 'committed' as const, label: `${statusCounts.committed} unchanged`, color: 'text-neutral-500', borderColor: 'border-neutral-400', bgActive: 'bg-neutral-50', count: statusCounts.committed },
  ]
  const visibleFiles = files.filter((filePath) => {
    const status = fileStatuses.get(filePath)
    return status ? statusFilter.has(status) : statusFilter.has('committed')
  })
  const showStatusFilter = statusCategories.some((category) => category.count > 0 && category.key !== 'committed')

  return (
    <div className="min-h-[220px] flex-1 flex flex-col overflow-hidden border-b border-neutral-200 last:border-b-0">
      <div
        className={`px-3 py-1 border-b border-neutral-200 bg-white text-[10px] font-bold text-neutral-600 flex items-center gap-2 ${
          hasTimeline ? 'cursor-pointer hover:bg-neutral-50' : ''
        }`}
        onClick={() => {
          if (hasTimeline) setTimelineOpen(!timelineOpen)
        }}
      >
        <span className="whitespace-nowrap">{title}</span>
        {currentSummaryItems && (
          currentTickIndex >= 0 ? (
            <TickSummaryLine
              tickNumber={currentTickIndex + 1}
              items={currentSummaryItems}
              isSnapshot={Boolean(ticks[currentTickIndex]?.isSnapshot)}
              snapshotMessage={ticks[currentTickIndex]?.isSnapshot ? ticks[currentTickIndex].snapshotMessage : undefined}
              emptyText={summaryEmptyText}
            />
          ) : (
            <span className="text-neutral-400 italic text-[11px] font-normal">no tick data</span>
          )
        )}
        {hasTimeline && (
          <svg className={`w-3 h-3 ml-auto flex-shrink-0 text-neutral-400 transition-transform ${timelineOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      {hasTimeline && timelineOpen && (
        <div className="max-h-[180px] overflow-y-auto border-b border-neutral-200 bg-white">
          {timelineItems?.length === 0 ? (
            <div className="p-3 text-center text-neutral-400 text-xs">{timelineEmptyText}</div>
          ) : timelineItems?.map((item) => (
            <button
              key={`${title}-timeline-${item.tickArrayIndex}`}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-100 ${
                item.tickArrayIndex === currentTickIndex ? 'bg-purple-50' : ''
              }`}
              onClick={() => {
                onSelectTimelineTick?.(item.tickArrayIndex)
                setTimelineOpen(false)
              }}
            >
              <TickSummaryLine
                tickNumber={item.tickArrayIndex + 1}
                items={item.items}
                isSnapshot={Boolean(ticks[item.tickArrayIndex]?.isSnapshot)}
                snapshotMessage={ticks[item.tickArrayIndex]?.isSnapshot ? ticks[item.tickArrayIndex].snapshotMessage : undefined}
              />
              {item.meta && <span className="ml-auto text-neutral-400 text-[11px] whitespace-nowrap">{item.meta}</span>}
            </button>
          ))}
        </div>
      )}
      {showStatusFilter && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50">
          {statusCategories.filter((category) => category.count > 0).map((category) => (
            <button
              key={category.key}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer border transition-colors ${
                statusFilter.has(category.key)
                  ? `${category.bgActive} ${category.color} ${category.borderColor}`
                  : 'bg-neutral-100 text-neutral-400 border-neutral-200 line-through'
              }`}
              onClick={() => {
                onStatusFilterChange((prev) => {
                  const next = new Set(prev)
                  if (next.has(category.key)) next.delete(category.key)
                  else next.add(category.key)
                  return next
                })
              }}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-60 overflow-y-auto border-r border-neutral-200 py-1 text-xs flex-shrink-0">
          {files.length === 0 ? (
            <div className="p-10 text-center text-neutral-400">{emptyText}</div>
          ) : visibleFiles.length === 0 ? (
            <div className="p-10 text-center text-neutral-400">{filteredEmptyText}</div>
          ) : (
            <FileTree
              files={visibleFiles}
              changedFiles={changedFiles}
              currentFile={selectedFile}
              onSelectFile={onSelectFile}
              addedFiles={addedFiles}
              removedFiles={removedFiles}
              fileStatuses={fileStatuses}
              ignoredSet={ignoredSet}
              tickChangedFiles={tickChangedFiles}
              onTickChangedFileClick={onTickChangedFileClick}
            />
          )}
        </div>
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
          <ResourceContentViewer
            view={contentView}
            diffMode={diffMode}
            onDiffModeChange={onDiffModeChange}
          />
        </div>
      </div>
    </div>
  )
}

interface MeadowFileModePaneProps {
  title: string
  mode: FileChangeLens
  files: string[]
  changedFiles: string[]
  addedFiles?: string[]
  removedFiles?: string[]
  fileStatuses: Map<string, FileStatus>
  ignoredSet?: Set<string>
  emptyText: string
  currentSummaryItems: SummaryItem[]
  timelineItems: FileTimelineItem[]
  timelineEmptyText: string
  onSelectTimelineTick: (tickArrayIndex: number) => void
  statusFilter: Set<string>
  onStatusFilterChange: React.Dispatch<React.SetStateAction<Set<string>>>
  selectedFileRequest?: { mode: FileChangeLens; filePath: string; nonce: number } | null
  tickChangedFiles?: string[]
  onTickChangedFileClick?: (filePath: string) => void
  API: string
  currentTickIndex: number
  ticks: ProcessedTick[]
  currentSnapshotIndex: number
  snapshots: Snapshot[]
  fetchFileContent: (hash: string, filePath: string) => Promise<string>
}

function MeadowFileModePane({
  title,
  mode,
  files,
  changedFiles,
  addedFiles,
  removedFiles,
  fileStatuses,
  ignoredSet,
  emptyText,
  currentSummaryItems,
  timelineItems,
  timelineEmptyText,
  onSelectTimelineTick,
  statusFilter,
  onStatusFilterChange,
  selectedFileRequest,
  tickChangedFiles,
  onTickChangedFileClick,
  API,
  currentTickIndex,
  ticks,
  currentSnapshotIndex,
  snapshots,
  fetchFileContent,
}: MeadowFileModePaneProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [contentView, setContentView] = useState<ResourceContentView>(() => resourceMessage('Select a file to view its contents'))
  const [diffMode, setDiffMode] = useState(true)

  useEffect(() => {
    if (selectedFileRequest?.mode === mode) {
      setSelectedFile(selectedFileRequest.filePath)
    }
  }, [mode, selectedFileRequest])

  useEffect(() => {
    if (selectedFile && !files.includes(selectedFile)) {
      setSelectedFile(null)
    }
  }, [files, selectedFile])

  useEffect(() => {
    setDiffMode(true)
  }, [currentSnapshotIndex, currentTickIndex, mode, selectedFile])

  useEffect(() => {
    const loadTickFileContent = async (tickIndex: number, filePath: string): Promise<string | null> => {
      if (tickIndex < 0 || tickIndex >= ticks.length) return null
      const tick = ticks[tickIndex]
      const tickContent = tick.uncommittedFileContents?.[filePath]
      if (tickContent !== undefined) {
        return tickContent
      }
      if (tick.gitHeadSha) {
        try {
          return await fetchFileContent(tick.gitHeadSha, filePath)
        } catch {
          return null
        }
      }
      return null
    }

    const loadTickContent = async (filePath: string): Promise<boolean> => {
      const status = fileStatuses.get(filePath)
      if (mode === 'tick' && status === 'removed') {
        const prevContent = await loadTickFileContent(currentTickIndex - 1, filePath)
        if (prevContent === null) return false
        setContentView(buildResourceContentView({
          selectedPath: filePath,
          status,
          previousContent: prevContent,
          noun: 'file',
          selectMessage: 'Select a file to view its contents',
          notFoundMessage: 'File not found at this tick',
        }))
        return true
      }

      const tickContent = await loadTickFileContent(currentTickIndex, filePath)
      if (tickContent === null) return false

      if (mode === 'tick' && status === 'uncommitted-modified') {
        const prevContent = await loadTickFileContent(currentTickIndex - 1, filePath)
        setContentView(buildResourceContentView({
          selectedPath: filePath,
          status,
          currentContent: tickContent,
          previousContent: prevContent ?? '',
          noun: 'file',
          selectMessage: 'Select a file to view its contents',
          notFoundMessage: 'File not found at this tick',
        }))
        return true
      }

      setContentView(buildResourceContentView({
        selectedPath: filePath,
        status,
        currentContent: tickContent,
        noun: 'file',
        selectMessage: 'Select a file to view its contents',
        notFoundMessage: 'File not found at this tick',
      }))
      return true
    }

    const loadGitUncommittedContent = async (filePath: string): Promise<boolean> => {
      const status = fileStatuses.get(filePath)
      if (mode !== 'git' || (status !== 'uncommitted-new' && status !== 'uncommitted-modified' && status !== 'removed')) return false

      let content = ''
      if (status !== 'removed') {
        const capturedContent = ticks[currentTickIndex]?.uncommittedFileContents?.[filePath]
        if (capturedContent !== undefined) {
          content = capturedContent
        } else {
          try {
            const res = await fetch(`${API}/uncommitted-file/${encodeURIComponent(filePath)}`)
            if (!res.ok) return false
            content = await res.text()
          } catch {
            return false
          }
        }
      }

      let committedContent = ''
      if (currentSnapshotIndex >= 0 && snapshots[currentSnapshotIndex]) {
        try {
          committedContent = await fetchFileContent(snapshots[currentSnapshotIndex].commitHash, filePath)
        } catch {
          // New uncommitted files have no committed baseline.
        }
      }

      setContentView(buildResourceContentView({
        selectedPath: filePath,
        status,
        currentContent: status === 'removed' ? undefined : content,
        previousContent: committedContent,
        noun: 'file',
        selectMessage: 'Select a file to view its contents',
        notFoundMessage: 'File not found at this point',
      }))
      return true
    }

    const loadCapturedUncommittedContent = async (filePath: string): Promise<boolean> => {
      if (currentTickIndex < 0 || currentTickIndex >= ticks.length) return false
      const content = ticks[currentTickIndex].uncommittedFileContents?.[filePath]
      if (content === undefined) return false
      setContentView(buildResourceContentView({
        selectedPath: filePath,
        status: 'committed',
        currentContent: content,
        noun: 'file',
        selectMessage: 'Select a file to view its contents',
        notFoundMessage: 'File not found at this tick',
      }))
      return true
    }

    const loadFinalUncommittedContent = async (filePath: string): Promise<boolean> => {
      try {
        const res = await fetch(`${API}/uncommitted-file/${encodeURIComponent(filePath)}`)
        if (!res.ok) return false
        const content = await res.text()
        setContentView(buildResourceContentView({
          selectedPath: filePath,
          status: 'committed',
          currentContent: content,
          noun: 'file',
          selectMessage: 'Select a file to view its contents',
          notFoundMessage: 'File not found at this point',
        }))
        return true
      } catch {
        return false
      }
    }

    async function load() {
      if (!selectedFile) {
        setContentView(resourceMessage('Select a file to view its contents'))
        return
      }

      if (mode === 'tick') {
        if (await loadTickContent(selectedFile)) return
        setContentView(resourceMessage('File not found at this tick'))
        return
      }

      if (await loadGitUncommittedContent(selectedFile)) return

      if (currentSnapshotIndex >= 0 && snapshots[currentSnapshotIndex]) {
        try {
          const snap = snapshots[currentSnapshotIndex]
          const content = await fetchFileContent(snap.commitHash, selectedFile)
          const selectedStatus = fileStatuses.get(selectedFile)
          const shouldShowCommitDiff = mode === 'git' && selectedStatus === 'just-committed'
          if (shouldShowCommitDiff && currentSnapshotIndex > 0) {
            const prevSnap = snapshots[currentSnapshotIndex - 1]
            let prevContent = ''
            try {
              prevContent = await fetchFileContent(prevSnap.commitHash, selectedFile)
            } catch {
              // New file in this snapshot.
            }
            setContentView(buildResourceContentView({
              selectedPath: selectedFile,
              status: 'just-committed',
              currentContent: content,
              previousContent: prevContent,
              noun: 'file',
              selectMessage: 'Select a file to view its contents',
              notFoundMessage: 'File not found at this point',
            }))
          } else {
            setContentView(buildResourceContentView({
              selectedPath: selectedFile,
              status: 'committed',
              currentContent: content,
              noun: 'file',
              selectMessage: 'Select a file to view its contents',
              notFoundMessage: 'File not found at this point',
            }))
          }
          return
        } catch {
          if (await loadCapturedUncommittedContent(selectedFile)) return
          if (await loadFinalUncommittedContent(selectedFile)) return
        }
      } else if (await loadCapturedUncommittedContent(selectedFile) || await loadFinalUncommittedContent(selectedFile)) {
        return
      }

      setContentView(resourceMessage('File not found at this point'))
    }

    load()
  }, [API, currentSnapshotIndex, currentTickIndex, fetchFileContent, fileStatuses, mode, selectedFile, snapshots, ticks])

  return (
    <ResourceChangePane
      title={title}
      files={files}
      changedFiles={changedFiles}
      selectedFile={selectedFile}
      onSelectFile={setSelectedFile}
      addedFiles={addedFiles}
      removedFiles={removedFiles}
      fileStatuses={fileStatuses}
      ignoredSet={ignoredSet}
      emptyText={emptyText}
      filteredEmptyText="No files match the active filters"
      statusFilter={statusFilter}
      onStatusFilterChange={onStatusFilterChange}
      currentSummaryItems={currentSummaryItems}
      timelineItems={timelineItems}
      timelineEmptyText={timelineEmptyText}
      onSelectTimelineTick={onSelectTimelineTick}
      currentTickIndex={currentTickIndex}
      ticks={ticks}
      tickChangedFiles={tickChangedFiles}
      onTickChangedFileClick={onTickChangedFileClick}
      contentView={contentView}
      diffMode={diffMode}
      onDiffModeChange={setDiffMode}
    />
  )
}

// File status for the tree: committed, uncommitted-new, uncommitted-modified, just-committed, removed
type FileStatus = 'committed' | 'uncommitted-new' | 'uncommitted-modified' | 'just-committed' | 'removed'

interface FileTreeProps {
  files: string[]
  changedFiles: string[]
  currentFile: string | null
  onSelectFile: (file: string) => void
  addedFiles?: string[]
  removedFiles?: string[]
  fileStatuses?: Map<string, FileStatus>
  ignoredSet?: Set<string>
  tickChangedFiles?: string[]
  onTickChangedFileClick?: (filePath: string) => void
}

interface TreeNode {
  [key: string]: TreeNode | null
}

function FileTree({ files, changedFiles, currentFile, onSelectFile, addedFiles, removedFiles, fileStatuses, ignoredSet, tickChangedFiles, onTickChangedFileClick }: FileTreeProps) {
  const tree: TreeNode = {}
  for (const filePath of files) {
    const parts = filePath.split('/')
    let node: TreeNode = tree
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {}
      node = node[parts[i]] as TreeNode
    }
    node[parts[parts.length - 1]] = null
  }

  const changedSet = new Set(changedFiles)
  const addedSet = addedFiles ? new Set(addedFiles) : undefined
  const removedSet = removedFiles ? new Set(removedFiles) : undefined
  const tickChangedSet = tickChangedFiles ? new Set(tickChangedFiles) : undefined

  return <TreeNodeView node={tree} prefix="" depth={0} changedSet={changedSet} addedSet={addedSet} removedSet={removedSet} fileStatuses={fileStatuses} ignoredSet={ignoredSet} tickChangedSet={tickChangedSet} onTickChangedFileClick={onTickChangedFileClick} currentFile={currentFile} onSelectFile={onSelectFile} />
}

interface TreeNodeViewProps {
  node: TreeNode
  prefix: string
  depth: number
  changedSet: Set<string>
  addedSet?: Set<string>
  removedSet?: Set<string>
  fileStatuses?: Map<string, FileStatus>
  ignoredSet?: Set<string>
  tickChangedSet?: Set<string>
  onTickChangedFileClick?: (filePath: string) => void
  currentFile: string | null
  onSelectFile: (file: string) => void
}

function TreeNodeView({ node, prefix, depth, changedSet, addedSet, removedSet, fileStatuses, ignoredSet, tickChangedSet, onTickChangedFileClick, currentFile, onSelectFile }: TreeNodeViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const entries = Object.keys(node).sort((a, b) => {
    const aIsDir = node[a] !== null
    const bIsDir = node[b] !== null
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
    return a.localeCompare(b)
  })

  return (
    <>
      {entries.map((key) => {
        const fullPath = prefix ? `${prefix}/${key}` : key
        const isDir = node[key] !== null

        if (isDir) {
          const isCollapsed = collapsed[key] || false
          return (
            <div key={fullPath}>
              <div
                className="py-0.5 cursor-pointer text-neutral-500 font-bold whitespace-nowrap"
                style={{ paddingLeft: `${12 + depth * 12}px` }}
                onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}
              >
                <span className="text-[10px] mr-1">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                {key}
              </div>
              {!isCollapsed && (
                <TreeNodeView
                  node={node[key] as TreeNode}
                  prefix={fullPath}
                  depth={depth + 1}
                  changedSet={changedSet}
                  addedSet={addedSet}
                  removedSet={removedSet}
                  fileStatuses={fileStatuses}
                  ignoredSet={ignoredSet}
                  tickChangedSet={tickChangedSet}
                  onTickChangedFileClick={onTickChangedFileClick}
                  currentFile={currentFile}
                  onSelectFile={onSelectFile}
                />
              )}
            </div>
          )
        } else {
          const status = fileStatuses?.get(fullPath)
          const isChanged = changedSet.has(fullPath)
          const isAdded = addedSet?.has(fullPath) ?? false
          const isRemoved = removedSet?.has(fullPath) ?? false
          const isSelected = currentFile === fullPath
          const isIgnored = ignoredSet?.has(fullPath) ?? false
          const changedInTick = tickChangedSet?.has(fullPath) ?? false
          const tickMarker = changedInTick && onTickChangedFileClick ? (
            <span
              className="ml-1 rounded-full border border-purple-200 bg-purple-50 px-1 text-[9px] leading-3 font-black text-purple-700 align-middle"
              title="Changed in this tick. Open in Tick view."
              onClick={(event) => {
                event.stopPropagation()
                onTickChangedFileClick(fullPath)
              }}
            >
              T
            </span>
          ) : null

          // When we have fileStatuses (tick mode), use rich status display
          if (status) {
            const statusConfig = {
              'just-committed': { icon: '\u2713', color: 'text-green-600', label: 'committed' },
              'uncommitted-new': { icon: '+', color: 'text-blue-500', label: 'new' },
              'uncommitted-modified': { icon: '~', color: 'text-amber-500', label: 'modified' },
              'removed': { icon: '\u2212', color: 'text-red-500', label: 'removed' },
              'committed': { icon: null, color: '', label: 'unchanged' },
            }[status]
            // Gitignored files (e.g. app/secret_app_config.yaml, app/resources.local.yaml)
            // exist on disk but are intentionally not tracked. Render them
            // greyed out via a lighter text color + reduced opacity, and
            // expose data-file-ignored="true" so e2e specs can assert the
            // visual contract without depending on exact CSS classes.
            const ignoredClass = isIgnored ? 'text-neutral-400 opacity-60 italic' : ''
            const title = isIgnored ? `${statusConfig.label} (gitignored)` : statusConfig.label
            return (
              <div
                key={fullPath}
                data-file-path={fullPath}
                data-file-status={status}
                {...(isIgnored && { 'data-file-ignored': 'true' })}
                className={`py-0.5 cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis hover:bg-neutral-100 ${
                  isSelected ? 'bg-neutral-200 text-neutral-900' : ''
                } ${status === 'removed' ? 'line-through opacity-70' : ''} ${isIgnored ? ignoredClass : statusConfig.color}`}
                style={{ paddingLeft: `${12 + depth * 12}px` }}
                title={title}
                onClick={() => onSelectFile(fullPath)}
              >
                {statusConfig.icon && !isIgnored && <span className={`${statusConfig.color} mr-1`}>{statusConfig.icon}</span>}
                {key}
                {tickMarker}
              </div>
            )
          }

          // Fallback: snapshot mode or no statuses
          return (
            <div
              key={fullPath}
              className={`py-0.5 cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis hover:bg-neutral-100 ${
                isSelected ? 'bg-neutral-200 text-neutral-900' : ''
              } ${isAdded ? 'text-green-600' : isRemoved ? 'text-red-500 line-through opacity-70' : isChanged ? 'text-yellow-600' : ''}`}
              style={{ paddingLeft: `${12 + depth * 12}px` }}
              onClick={() => onSelectFile(fullPath)}
            >
              {isAdded ? <span className="text-green-600 mr-1">+</span>
                : isRemoved ? <span className="text-red-500 mr-1">&minus;</span>
                : isChanged ? <span className="text-yellow-600 mr-1">&bull;</span>
                : null}
              {key}
              {tickMarker}
            </div>
          )
        }
      })}
    </>
  )
}
