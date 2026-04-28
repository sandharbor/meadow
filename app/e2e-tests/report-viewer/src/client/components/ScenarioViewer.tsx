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
  ignoredFiles?: string[]
  gitHeadSha?: string
  addedFiles: string[]
  removedFiles: string[]
  changedUncommitted: boolean
  changedGitHead: boolean
  s3KeyCount: number
  s3AddedKeys: string[]
  s3RemovedKeys: string[]
  s3Changed: boolean
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
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [currentS3Key, setCurrentS3Key] = useState<string | null>(null)
  const [commitListOpen, setCommitListOpen] = useState(false)
  const [s3ListOpen, setS3ListOpen] = useState(false)
  const [stateListOpen, setStateListOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(initialSpeed)
  const [timeDisplay, setTimeDisplay] = useState('0:00 / 0:00')
  const [timelinePercent, setTimelinePercent] = useState(0)
  const [fileStatusFilter, setFileStatusFilter] = useState<Set<string>>(() => new Set(['added', 'removed', 'changed', 'unchanged', 'just-committed', 'uncommitted-new', 'uncommitted-modified', 'committed']))
  const [currentTickIndex, setCurrentTickIndex] = useState(-1)
  const [ticks, setTicks] = useState<ProcessedTick[]>([])
  const [tickFileListing, setTickFileListing] = useState<Record<number, string[]>>({})
  const [s3KeyListing, setS3KeyListing] = useState<Record<number, string[]>>({})

  // Content state
  const [fileList, setFileList] = useState<string[]>([])
  const [fileContentHtml, setFileContentHtml] = useState<string>('<div class="p-10 text-center text-neutral-400 text-sm">Select a file to view its contents</div>')
  const [fileFullHtml, setFileFullHtml] = useState<string | null>(null)
  const [fileDiffHtml, setFileDiffHtml] = useState<string | null>(null)
  const [fileDiffMode, setFileDiffMode] = useState(true)
  const [stateTables, setStateTables] = useState<Record<string, string>>({})
  const [prevStateTables, setPrevStateTables] = useState<Record<string, string>>({})
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

      // When tick data is available, let video sync set the indices at the right time.
      // Only eagerly set indices when there's no tick data (snapshot-only fallback mode).
      const hasTickData = rawManifest.ticks && (rawManifest.ticks as unknown[]).length > 0
      if (snapshotsData.length > 0) setCurrentSnapshotIndex(0)
      if (stateData.length > 0 && !hasTickData) setCurrentStateIndex(0)
      if (s3Data.length > 0 && !hasTickData) setCurrentS3Index(0)
    }

    init().catch((err) => console.error('Failed to initialize:', err))
    return () => { mounted = false }
  }, [API, runId])

  // --- Update file display when snapshot index changes ---

  useEffect(() => {
    if (currentSnapshotIndex < 0 || snapshots.length === 0) return

    const snap = snapshots[currentSnapshotIndex]

    fetchFileList(snap.commitHash).then((files) => {
      setFileList(files)
    }).catch(() => setFileList([]))
  }, [currentSnapshotIndex, snapshots, fetchFileList])

  // --- Update file content when file or snapshot changes ---

  useEffect(() => {
    if (currentSnapshotIndex < 0 || !currentFile || snapshots.length === 0) {
      setFileContentHtml('<div class="p-10 text-center text-neutral-400 text-sm">Select a file to view its contents</div>')
      setFileFullHtml(null)
      setFileDiffHtml(null)
      return
    }

    const snap = snapshots[currentSnapshotIndex]

    const loadContent = async () => {
      try {
        const content = await fetchFileContent(snap.commitHash, currentFile)
        const fullHtml = `<pre class="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700">${escapeHtml(content)}</pre>`
        if (snap.changedFiles.includes(currentFile) && currentSnapshotIndex > 0) {
          const prevSnap = snapshots[currentSnapshotIndex - 1]
          let prevContent = ''
          try {
            prevContent = await fetchFileContent(prevSnap.commitHash, currentFile)
          } catch { /* new file */ }
          const diffHtml = `<pre class="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700">${diffHighlight(prevContent, content)}</pre>`
          setFileDiffHtml(diffHtml)
          setFileFullHtml(fullHtml)
          setFileContentHtml(fileDiffMode ? diffHtml : fullHtml)
        } else {
          setFileDiffHtml(null)
          setFileFullHtml(fullHtml)
          setFileContentHtml(fullHtml)
        }
      } catch {
        setFileContentHtml('<div class="p-10 text-center text-neutral-400 text-sm">File not found at this commit</div>')
        setFileFullHtml(null)
        setFileDiffHtml(null)
      }
    }

    loadContent()
  }, [currentSnapshotIndex, currentFile, snapshots, fetchFileContent, fileDiffMode])

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

  // --- Sync state-repo / S3 snapshot indices when tick changes ---
  // This ensures navigating to a tick (e.g. clicking in the tick list) updates
  // the snapshot-based data even when the video is paused and timeupdate won't fire.

  useEffect(() => {
    if (currentTickIndex < 0 || ticks.length === 0) return
    const tickTime = new Date(ticks[currentTickIndex].timestamp).getTime()

    // Sync state-repo snapshot index
    if (stateSnapshots.length > 0) {
      let dynIdx = -1
      for (let i = 0; i < stateSnapshots.length; i++) {
        if (new Date(stateSnapshots[i].timestamp).getTime() <= tickTime) dynIdx = i
        else break
      }
      if (dynIdx !== currentStateIndex) setCurrentStateIndex(dynIdx)
    }

    // Sync S3 snapshot index
    if (s3Snapshots.length > 0) {
      let s3Idx = -1
      for (let i = 0; i < s3Snapshots.length; i++) {
        if (new Date(s3Snapshots[i].timestamp).getTime() <= tickTime) s3Idx = i
        else break
      }
      if (s3Idx !== currentS3Index) setCurrentS3Index(s3Idx)
    }
  }, [currentTickIndex, ticks, stateSnapshots, s3Snapshots, currentStateIndex, currentS3Index])

  // --- Video sync ---

  const syncToVideoTime = useCallback(() => {
    const video = videoRef.current
    if (!video || !manifest) return

    const realTime = toRealTime(video.currentTime)

    // Find matching file snapshot
    let snapIdx = -1
    for (let i = 0; i < snapshots.length; i++) {
      const snapTime = new Date(snapshots[i].timestamp).getTime()
      if (snapTime <= realTime) snapIdx = i
      else break
    }
    if (snapIdx >= 0 && snapIdx !== currentSnapshotIndex) {
      setCurrentSnapshotIndex(snapIdx)
    }

    // Find matching state-repo snapshot
    let stateIdx = -1
    for (let i = 0; i < stateSnapshots.length; i++) {
      const snapTime = new Date(stateSnapshots[i].timestamp).getTime()
      if (snapTime <= realTime) stateIdx = i
      else break
    }
    if (stateIdx >= 0 && stateIdx !== currentStateIndex) {
      setCurrentStateIndex(stateIdx)
    }

    // Find matching S3 snapshot
    let s3Idx = -1
    for (let i = 0; i < s3Snapshots.length; i++) {
      const snapTime = new Date(s3Snapshots[i].timestamp).getTime()
      if (snapTime <= realTime) s3Idx = i
      else break
    }
    if (s3Idx >= 0 && s3Idx !== currentS3Index) {
      setCurrentS3Index(s3Idx)
    }

    // Update snapshot indicator
    let msgIdx = -1
    for (let i = 0; i < snapshotMessages.length; i++) {
      const snapTime = new Date(snapshotMessages[i].timestamp).getTime()
      if (snapTime <= realTime) msgIdx = i
      else break
    }
    setCurrentMessageIndex(msgIdx)

    // Update tick index
    if (ticks.length > 0) {
      let tickIdx = -1
      for (let i = 0; i < ticks.length; i++) {
        const tickTime = new Date(ticks[i].timestamp).getTime()
        if (tickTime <= realTime) tickIdx = i
        else break
      }
      if (tickIdx >= 0 && tickIdx !== currentTickIndex) {
        setCurrentTickIndex(tickIdx)
      }
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
  }, [manifest, snapshots, stateSnapshots, s3Snapshots, snapshotMessages, ticks, toRealTime, logFilter, levelFilter, currentSnapshotIndex, currentStateIndex, currentS3Index, currentTickIndex])

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
    } else if (currentMessageIndex >= 0 && snapshotMessages[currentMessageIndex]) {
      searchText = snapshotMessages[currentMessageIndex].message
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
  }, [currentMessageIndex, snapshotMessages, testSource])

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

  // Compute per-tick changes across all state types (Files, structured state, S3)
  const tickStateChanges = useMemo(() => {
    const changes: Record<number, { files: boolean; state: boolean; s3: boolean; snapshot: boolean; snapshotMessage?: string }> = {}
    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i]
      const tickTime = new Date(tick.timestamp).getTime()

      // Files changed?
      const filesChanged = tick.addedFiles.length > 0 || tick.removedFiles.length > 0 || tick.changedUncommitted || tick.changedGitHead

      // State repo changed? Check if its snapshot index differs from previous tick
      // AND the new snapshot actually has table file changes (not just timeline.jsonl)
      let stateChanged = false
      if (stateSnapshots.length > 0) {
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

  const getS3KeysAtIndex = useCallback((idx: number): string[] => {
    for (let i = idx; i >= 0; i--) {
      if (s3KeyListing[i]) return s3KeyListing[i]
    }
    return []
  }, [s3KeyListing])

  // --- State-repo record-level parsing and diffs ---

  const parseOptions = useMemo(() => ({
    recordKeyMap: stateRepoMeta?.recordKeyMap,
    eventsLikeTables: stateRepoMeta?.eventsLikeTables,
    tableNameSuffixRegex: stateRepoMeta?.tableNameSuffixRegex,
  }), [stateRepoMeta])

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

  const formatTickLabel = useCallback((tick: ProcessedTick): string => {
    if (tick.isSnapshot && tick.snapshotMessage) {
      return `[snapshot] ${tick.snapshotMessage}`
    }
    const parts: string[] = []
    if (tick.addedFiles.length > 0) parts.push(`+${tick.addedFiles.length} files`)
    if (tick.removedFiles.length > 0) parts.push(`-${tick.removedFiles.length} files`)
    if (tick.changedUncommitted) parts.push(`${tick.uncommittedCount} uncommitted`)
    if (tick.changedGitHead) parts.push('new commit')
    if (tick.s3AddedKeys?.length > 0) parts.push(`+${tick.s3AddedKeys.length} S3`)
    if (tick.s3RemovedKeys?.length > 0) parts.push(`-${tick.s3RemovedKeys.length} S3`)
    return parts.length > 0 ? parts.join(', ') : 'no changes'
  }, [])

  const navigateTick = useCallback((direction: number) => {
    const video = videoRef.current
    if (!video || !video.duration || ticks.length === 0) return
    video.pause()

    const current = currentTickIndex
    if (direction > 0) {
      for (let i = current + 1; i < ticks.length; i++) {
        if (interestingTickIndices.includes(ticks[i].tickIndex) || i === ticks.length - 1) {
          setCurrentTickIndex(i)
          const tickTime = new Date(ticks[i].timestamp).getTime()
          video.currentTime = Math.max(0, toVideoTime(tickTime))
          return
        }
      }
    } else {
      for (let i = current - 1; i >= 0; i--) {
        if (interestingTickIndices.includes(ticks[i].tickIndex) || i === 0) {
          setCurrentTickIndex(i)
          const tickTime = new Date(ticks[i].timestamp).getTime()
          video.currentTime = Math.max(0, toVideoTime(tickTime))
          return
        }
      }
    }
  }, [ticks, currentTickIndex, interestingTickIndices, toVideoTime])

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const navigateSnapshot = (direction: number) => {
      const video = videoRef.current
      if (!video || !video.duration) return

      const navPoints = [0]
      for (const snap of snapshotMessages) {
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
  }, [snapshotMessages, toVideoTime, hasTicks, navigateTick])

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
    if (!manifest?.startTime || !manifest?.endTime || snapshotMessages.length === 0) {
      return computeHealthData([], [], [], 0, 0)
    }
    const startMs = new Date(manifest.startTime).getTime()
    const endMs = new Date(manifest.endTime).getTime()
    return computeHealthData(
      snapshotMessages.map(s => s.timestamp),
      manifest.logs,
      uncommittedEntries,
      startMs,
      endMs - startMs
    )
  }, [manifest, snapshotMessages, uncommittedEntries])

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
    for (let i = 0; i < snapshotMessages.length; i++) {
      const snapTime = new Date(snapshotMessages[i].timestamp).getTime()
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

  const currentSnap = currentSnapshotIndex >= 0 ? snapshots[currentSnapshotIndex] : null

  // Find uncommitted files relevant to the current snapshot timestamp
  const currentUncommitted = (() => {
    if (uncommittedEntries.length === 0 || currentSnapshotIndex < 0 || snapshots.length === 0) return []
    const snapTime = new Date(snapshots[currentSnapshotIndex].timestamp).getTime()
    // Find the latest uncommitted entry at or before this snapshot time
    let best: UncommittedEntry | null = null
    for (const entry of uncommittedEntries) {
      const entryTime = new Date(entry.timestamp).getTime()
      if (entryTime <= snapTime) best = entry
      else break
    }
    return best?.uncommittedFiles ?? []
  })()

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
            onSeeked={() => { autoFollowRef.current = true }}
            onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = playSpeed / 100 }}
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
              const hasAnyChange = changes && (changes.files || changes.state || changes.s3 || changes.snapshot)
              return (
                <>
                  <span className="text-neutral-400">Tick {currentTickIndex + 1}/{ticks.length}:</span>
                  {(changes?.files || changes?.state || changes?.s3) && (
                    <span className="flex items-center gap-1">
                      {changes.files && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 font-medium cursor-pointer hover:bg-brand-200 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setActiveTab('files') }}
                        >Files</span>
                      )}
                      {changes.state && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium cursor-pointer hover:bg-amber-200 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setActiveTab('state') }}
                        >{stateDisplayName}</span>
                      )}
                      {changes.s3 && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium cursor-pointer hover:bg-emerald-200 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setActiveTab('s3') }}
                        >S3</span>
                      )}
                    </span>
                  )}
                  {changes?.snapshot && changes.snapshotMessage && (
                    <span className="text-orange-600 font-bold">[snapshot] {changes.snapshotMessage}</span>
                  )}
                  {!hasAnyChange && (
                    <span className="text-neutral-400 italic">no changes</span>
                  )}
                </>
              )
            })() : (
              <span className="text-neutral-400">Tick: --</span>
            )) : (
              <>
                <span className="text-neutral-400">Snapshot:</span>
                <span className="text-brand-500 font-bold">
                  {currentMessageIndex >= 0 ? snapshotMessages[currentMessageIndex].message : '--'}
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
                          setCurrentTickIndex(idx)
                          const tickTime = new Date(tick.timestamp).getTime()
                          const video = videoRef.current
                          if (video) video.currentTime = Math.max(0, toVideoTime(tickTime))
                          setSnapshotDropdownOpen(false)
                        }}
                      >
                        <span className="text-purple-400 min-w-[40px] text-[10px]">tick {idx + 1}</span>
                        <span className="flex items-center gap-1">
                          {changes.files && <span className="px-1 py-0.5 rounded bg-brand-100 text-brand-700 text-[10px] font-medium cursor-pointer hover:bg-brand-200 transition-colors" onClick={(e) => { e.stopPropagation(); setActiveTab('files'); setCurrentTickIndex(idx); const tickTime = new Date(tick.timestamp).getTime(); const video = videoRef.current; if (video) video.currentTime = Math.max(0, toVideoTime(tickTime)); setSnapshotDropdownOpen(false) }}>Files</span>}
                          {changes.state && <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium cursor-pointer hover:bg-amber-200 transition-colors" onClick={(e) => { e.stopPropagation(); setActiveTab('state'); setCurrentTickIndex(idx); const tickTime = new Date(tick.timestamp).getTime(); const video = videoRef.current; if (video) video.currentTime = Math.max(0, toVideoTime(tickTime)); setSnapshotDropdownOpen(false) }}>{stateDisplayName}</span>}
                          {changes.s3 && <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium cursor-pointer hover:bg-emerald-200 transition-colors" onClick={(e) => { e.stopPropagation(); setActiveTab('s3'); setCurrentTickIndex(idx); const tickTime = new Date(tick.timestamp).getTime(); const video = videoRef.current; if (video) video.currentTime = Math.max(0, toVideoTime(tickTime)); setSnapshotDropdownOpen(false) }}>S3</span>}
                        </span>
                        {changes.snapshot && changes.snapshotMessage ? (
                          <span className={`text-orange-600 ${idx === currentTickIndex ? 'font-bold' : ''}`}>
                            [snapshot] {changes.snapshotMessage}
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
          {snapshotDropdownOpen && !hasTicks && snapshotMessages.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 bg-white border border-neutral-200 shadow-lg rounded-b overflow-hidden">
              {snapshotMessages.map((snap, i) => (
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
              <div
                className="bg-neutral-100 px-3 py-1.5 text-xs border-b border-neutral-200 flex items-center gap-2 cursor-pointer hover:bg-neutral-200/50"
                onClick={() => setCommitListOpen(!commitListOpen)}
              >
                <span className="font-bold">MeadowHome Files</span>
                {!commitListOpen && (() => {
                  // Show current commit and tick in collapsed view
                  const currentCommit = currentSnapshotIndex >= 0 && snapshots[currentSnapshotIndex]
                    ? snapshots[currentSnapshotIndex]
                    : null
                  const currentTick = hasTicks && currentTickIndex >= 0 ? ticks[currentTickIndex] : null
                  return (
                    <span className="flex items-center gap-1.5 text-[11px] font-normal overflow-hidden">
                      {currentCommit ? (
                        <span className="text-brand-500 overflow-hidden text-ellipsis whitespace-nowrap">
                          {currentCommit.commitHash.slice(0, 7)} — {currentCommit.commitMessage || '(no message)'}
                        </span>
                      ) : (
                        <span className="text-neutral-400 italic">no commit yet</span>
                      )}
                      {currentTick && (
                        <>
                          <span className="text-neutral-300">/</span>
                          <span className="text-purple-500 overflow-hidden text-ellipsis whitespace-nowrap">
                            tick {currentTickIndex + 1}: {formatTickLabel(currentTick)}
                          </span>
                        </>
                      )}
                    </span>
                  )
                })()}
                <svg className={`w-3 h-3 ml-auto flex-shrink-0 text-neutral-400 transition-transform ${commitListOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {commitListOpen && (
                <div className="max-h-[300px] overflow-y-auto border-b border-neutral-200">
                  {(() => {
                    // Group ticks under their parent commit (or "before any commit")
                    // A tick belongs to the most recent commit at or before its timestamp.
                    interface TickItem { tickArrayIndex: number; tick: ProcessedTick }
                    interface CommitGroup {
                      commit: { hash: string; message: string; timestamp: string; snapshotIndex: number } | null
                      ticks: TickItem[]
                    }

                    const groups: CommitGroup[] = []

                    if (hasTicks) {
                      // Build sorted commit list
                      const commits = snapshots.map((s, i) => ({
                        hash: s.commitHash,
                        message: s.commitMessage,
                        timestamp: s.timestamp,
                        snapshotIndex: i,
                        timeMs: new Date(s.timestamp).getTime(),
                      })).sort((a, b) => a.timeMs - b.timeMs)

                      // Assign each interesting tick to a commit group
                      let currentGroup: CommitGroup = { commit: null, ticks: [] }
                      let commitIdx = 0

                      for (let i = 0; i < ticks.length; i++) {
                        const t = ticks[i]
                        const tickMs = new Date(t.timestamp).getTime()

                        // Check if any commits fall before this tick
                        while (commitIdx < commits.length && commits[commitIdx].timeMs <= tickMs) {
                          // Flush current group if it has ticks
                          if (currentGroup.ticks.length > 0 || currentGroup.commit !== null) {
                            groups.push(currentGroup)
                          }
                          currentGroup = { commit: commits[commitIdx], ticks: [] }
                          commitIdx++
                        }

                        const hasChange = t.addedFiles.length > 0 || t.removedFiles.length > 0 || t.changedUncommitted || t.changedGitHead || t.isSnapshot
                        if (hasChange) {
                          currentGroup.ticks.push({ tickArrayIndex: i, tick: t })
                        }
                      }

                      // Flush remaining commit groups
                      if (currentGroup.ticks.length > 0 || currentGroup.commit !== null) {
                        groups.push(currentGroup)
                      }
                      while (commitIdx < commits.length) {
                        groups.push({ commit: commits[commitIdx], ticks: [] })
                        commitIdx++
                      }
                    } else {
                      // No ticks — just show commits
                      for (let i = 0; i < snapshots.length; i++) {
                        groups.push({
                          commit: { hash: snapshots[i].commitHash, message: snapshots[i].commitMessage, timestamp: snapshots[i].timestamp, snapshotIndex: i },
                          ticks: [],
                        })
                      }
                    }

                    // Also count consecutive no-change ticks that were skipped
                    // by looking at gaps between interesting ticks within each group

                    return groups.map((group, gi) => (
                      <div key={gi}>
                        {/* Commit header (or "before any commit") */}
                        <div
                          className={`flex gap-2 px-3 py-1.5 text-[11px] ${
                            group.commit
                              ? 'cursor-pointer hover:bg-pink-50 bg-pink-50/50'
                              : 'bg-neutral-50 text-neutral-400 italic'
                          } ${group.commit && group.commit.snapshotIndex === currentSnapshotIndex ? 'ring-1 ring-inset ring-brand-300' : ''}`}
                          onClick={group.commit ? () => {
                            setCurrentSnapshotIndex(group.commit!.snapshotIndex)
                            const snapTime = new Date(group.commit!.timestamp).getTime()
                            const video = videoRef.current
                            if (video) video.currentTime = Math.max(0, toVideoTime(snapTime))
                            setCommitListOpen(false)
                          } : undefined}
                        >
                          {group.commit ? (
                            <>
                              <span className="text-brand-500 font-bold min-w-[52px]">commit</span>
                              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-neutral-700">
                                {group.commit.hash.slice(0, 7)} — {group.commit.message || '(no message)'}
                              </span>
                              <span className="text-neutral-400 whitespace-nowrap">
                                {new Date(group.commit.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </>
                          ) : (
                            <span>(before any commit)</span>
                          )}
                        </div>
                        {/* Ticks nested under this commit */}
                        {group.ticks.map((item) => {
                          const time = new Date(item.tick.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          return (
                            <div
                              key={`tick-${item.tick.tickIndex}`}
                              className={`flex gap-2 pl-8 pr-3 py-1 text-[11px] cursor-pointer hover:bg-neutral-100 ${
                                item.tickArrayIndex === currentTickIndex ? 'bg-purple-50' : ''
                              }`}
                              onClick={() => {
                                setCurrentTickIndex(item.tickArrayIndex)
                                const tickTime = new Date(item.tick.timestamp).getTime()
                                const video = videoRef.current
                                if (video) video.currentTime = Math.max(0, toVideoTime(tickTime))
                                setCommitListOpen(false)
                              }}
                            >
                              <span className="text-purple-400 min-w-[40px]">tick {item.tickArrayIndex + 1}</span>
                              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-neutral-600">
                                {formatTickLabel(item.tick)}
                              </span>
                              <span className="text-neutral-400 whitespace-nowrap">{item.tick.fileCount} files</span>
                              <span className="text-neutral-400 whitespace-nowrap">{time}</span>
                            </div>
                          )
                        })}
                      </div>
                    ))
                  })()}
                </div>
              )}
              {/* Uncommitted files warning */}
              {currentUncommitted.length > 0 && (() => {
                const trackedFiles = currentUncommitted.filter((f) => f.status !== '?' && !f.path.endsWith('/'))
                const trackedFolders = currentUncommitted.filter((f) => f.status !== '?' && f.path.endsWith('/'))
                const untrackedFiles = currentUncommitted.filter((f) => f.status === '?' && !f.path.endsWith('/'))
                const untrackedFolders = currentUncommitted.filter((f) => f.status === '?' && f.path.endsWith('/'))
                const parts: string[] = []
                if (untrackedFiles.length > 0) parts.push(`${untrackedFiles.length} untracked file${untrackedFiles.length > 1 ? 's' : ''}`)
                if (untrackedFolders.length > 0) parts.push(`${untrackedFolders.length} untracked folder${untrackedFolders.length > 1 ? 's' : ''}`)
                if (trackedFiles.length > 0) parts.push(`${trackedFiles.length} tracked file${trackedFiles.length > 1 ? 's' : ''}`)
                if (trackedFolders.length > 0) parts.push(`${trackedFolders.length} tracked folder${trackedFolders.length > 1 ? 's' : ''}`)
                return (
                <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-xs">
                  <div className="font-bold text-amber-700 mb-0.5">
                    Uncommitted in MeadowHome: {parts.join(', ')}
                  </div>
                  <div className="text-amber-600 text-[10px] mb-1">Content shown is from final state, not necessarily this snapshot point.</div>
                  {currentUncommitted.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-amber-100 rounded px-1 -mx-1"
                      onClick={async () => {
                        setFileDiffHtml(null)
                        setFileFullHtml(null)
                        try {
                          const res = await fetch(`${API}/uncommitted-file/${encodeURIComponent(f.path)}`)
                          if (res.ok) {
                            const content = await res.text()
                            setFileContentHtml(`<pre class="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700">${escapeHtml(content)}</pre>`)
                          } else {
                            setFileContentHtml('<div class="p-10 text-center text-neutral-400 text-sm">File not found</div>')
                          }
                        } catch {
                          setFileContentHtml('<div class="p-10 text-center text-neutral-400 text-sm">Failed to load file</div>')
                        }
                        setCurrentFile(null)
                      }}
                    >
                      <span className="font-mono text-amber-800 text-[10px] min-w-[16px]">{f.status}</span>
                      <span className="text-amber-700">{f.path}</span>
                    </div>
                  ))}
                </div>
                )
              })()}
              {/* File status filter bar + file browser */}
              {(() => {
                const isTickMode = hasTicks && currentTickIndex >= 0
                const tick = isTickMode ? ticks[currentTickIndex] : null
                const prevTick = isTickMode && currentTickIndex > 0 ? ticks[currentTickIndex - 1] : null
                const allFiles = isTickMode ? getTickFilesAtIndex(currentTickIndex) : fileList
                const removedSet = new Set(tick?.removedFiles || [])
                const ignoredSet = new Set(tick?.ignoredFiles || [])
                const changedSet = new Set(isTickMode ? [] : (currentSnap?.changedFiles || []))

                // Build file status map for tick mode
                const fileStatuses = new Map<string, FileStatus>()
                if (isTickMode && tick) {
                  const uncommittedPaths = new Map<string, string>()
                  for (const f of tick.uncommittedFiles || []) {
                    uncommittedPaths.set(f.path, f.status)
                  }

                  // Determine which files were just committed:
                  // Files that were uncommitted in the previous tick but are no longer uncommitted
                  const prevUncommittedPaths = new Set<string>()
                  if (prevTick) {
                    for (const f of prevTick.uncommittedFiles || []) {
                      prevUncommittedPaths.add(f.path)
                    }
                  }

                  for (const f of allFiles) {
                    const uncommittedStatus = uncommittedPaths.get(f)
                    if (uncommittedStatus === 'new') {
                      fileStatuses.set(f, 'uncommitted-new')
                    } else if (uncommittedStatus === 'modified' || uncommittedStatus === 'deleted') {
                      fileStatuses.set(f, 'uncommitted-modified')
                    } else if (prevUncommittedPaths.has(f) && !uncommittedPaths.has(f)) {
                      // Was uncommitted in previous tick, now committed
                      fileStatuses.set(f, 'just-committed')
                    } else {
                      fileStatuses.set(f, 'committed')
                    }
                  }
                  for (const f of removedSet) {
                    fileStatuses.set(f, 'removed')
                  }
                }

                // Compute counts by status
                const statusCounts = { 'just-committed': 0, 'uncommitted-new': 0, 'uncommitted-modified': 0, 'committed': 0, 'removed': 0 }
                for (const s of fileStatuses.values()) {
                  statusCounts[s]++
                }

                // Filter categories for tick mode
                const categories = isTickMode
                  ? [
                      { key: 'just-committed', label: `\u2713 ${statusCounts['just-committed']} committed`, color: 'text-green-600', borderColor: 'border-green-500', bgActive: 'bg-green-50', count: statusCounts['just-committed'] },
                      { key: 'uncommitted-new', label: `+ ${statusCounts['uncommitted-new']} new`, color: 'text-blue-500', borderColor: 'border-blue-500', bgActive: 'bg-blue-50', count: statusCounts['uncommitted-new'] },
                      { key: 'uncommitted-modified', label: `~ ${statusCounts['uncommitted-modified']} modified`, color: 'text-amber-500', borderColor: 'border-amber-500', bgActive: 'bg-amber-50', count: statusCounts['uncommitted-modified'] },
                      { key: 'removed', label: `${statusCounts['removed']} removed`, color: 'text-red-500', borderColor: 'border-red-500', bgActive: 'bg-red-50', count: statusCounts['removed'] },
                      { key: 'committed', label: `${statusCounts['committed']} unchanged`, color: 'text-neutral-500', borderColor: 'border-neutral-400', bgActive: 'bg-neutral-50', count: statusCounts['committed'] },
                    ]
                  : [
                      { key: 'changed', label: `${changedSet.size} changed`, color: 'text-yellow-600', borderColor: 'border-yellow-500', bgActive: 'bg-yellow-50', count: changedSet.size },
                      { key: 'committed', label: `${allFiles.length - changedSet.size} unchanged`, color: 'text-neutral-500', borderColor: 'border-neutral-400', bgActive: 'bg-neutral-50', count: allFiles.length - changedSet.size },
                    ]

                // Filter files based on active filters
                const visibleFiles = allFiles.filter(f => {
                  if (isTickMode) {
                    const status = fileStatuses.get(f)
                    return status ? fileStatusFilter.has(status) : fileStatusFilter.has('committed')
                  }
                  if (changedSet.has(f)) return fileStatusFilter.has('changed')
                  return fileStatusFilter.has('committed')
                })
                const visibleRemoved = fileStatusFilter.has('removed') ? [...removedSet] : []

                const toggleFilter = (key: string) => {
                  setFileStatusFilter(prev => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }

                return (
                  <>
                    {categories.some(c => c.count > 0 && c.key !== 'committed') && (
                      <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50">
                        {categories.filter(c => c.count > 0).map(c => (
                          <button
                            key={c.key}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer border transition-colors ${
                              fileStatusFilter.has(c.key)
                                ? `${c.bgActive} ${c.color} ${c.borderColor}`
                                : 'bg-neutral-100 text-neutral-400 border-neutral-200 line-through'
                            }`}
                            onClick={() => toggleFilter(c.key)}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-1 min-h-0 overflow-hidden">
                      <div className="w-60 overflow-y-auto border-r border-neutral-200 py-1 text-xs flex-shrink-0">
                        {allFiles.length === 0 ? (
                          <div className="p-10 text-center text-neutral-400">{isTickMode ? 'No files at this tick' : 'No snapshots captured'}</div>
                        ) : (
                          <FileTree
                            files={[...visibleFiles, ...visibleRemoved]}
                            changedFiles={[...(currentSnap?.changedFiles || []), ...(tick?.addedFiles || []), ...(tick?.removedFiles || [])]}
                            currentFile={currentFile}
                            onSelectFile={setCurrentFile}
                            addedFiles={tick?.addedFiles}
                            removedFiles={tick?.removedFiles}
                            fileStatuses={isTickMode ? fileStatuses : undefined}
                            ignoredSet={isTickMode ? ignoredSet : undefined}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
                        {(fileDiffHtml != null) && (
                          <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50 text-[10px]">
                            <button
                              className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
                                !fileDiffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                              }`}
                              onClick={() => { setFileDiffMode(false); if (fileFullHtml) setFileContentHtml(fileFullHtml) }}
                            >
                              Full
                            </button>
                            <button
                              className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
                                fileDiffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                              }`}
                              onClick={() => { setFileDiffMode(true); if (fileDiffHtml) setFileContentHtml(fileDiffHtml) }}
                            >
                              Diff
                            </button>
                          </div>
                        )}
                        <div className="flex-1 min-h-0 overflow-auto" dangerouslySetInnerHTML={{ __html: fileContentHtml }} />
                      </div>
                    </div>
                  </>
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
                  const tableCount = Object.keys(stateTables).length
                  const nonEmptyCount = Object.values(stateTables).filter(v => v.trim() !== '[]' && v.trim() !== '').length
                  return (
                    <span className="flex items-center gap-1.5 text-[11px] font-normal overflow-hidden">
                      {currentTick ? (
                        <span className="text-amber-600 overflow-hidden text-ellipsis whitespace-nowrap">
                          tick {currentTickIndex + 1}: {tableCount} tables, {nonEmptyCount} with data
                          {changes?.state && <span className="ml-1 text-amber-700 font-medium">(changed)</span>}
                        </span>
                      ) : stateSnapshots.length > 0 ? (
                        <span className="text-amber-600 overflow-hidden text-ellipsis whitespace-nowrap">
                          snapshot {currentStateIndex + 1}/{stateSnapshots.length}: {tableCount} tables, {nonEmptyCount} with data
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
                      const hasStateChange = changes?.state || (ticks[i].isSnapshot && ticks[i].snapshotMessage)
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
                              setCurrentTickIndex(idx)
                              const tickTime = new Date(tick.timestamp).getTime()
                              const video = videoRef.current
                              if (video) video.currentTime = Math.max(0, toVideoTime(tickTime))
                              setStateListOpen(false)
                            }}
                          >
                            <span className="text-purple-400 min-w-[40px]">tick {idx + 1}</span>
                            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-neutral-600">
                              {changes?.state ? (
                                <span className="flex items-center gap-1">
                                  {stateDiffs.added.length > 0 && <span className="text-blue-500">+{stateDiffs.added.length} added</span>}
                                  {stateDiffs.modified.length > 0 && <span className="text-amber-500">~{stateDiffs.modified.length} modified</span>}
                                  {stateDiffs.removed.length > 0 && <span className="text-red-500">-{stateDiffs.removed.length} removed</span>}
                                  {stateDiffs.added.length === 0 && stateDiffs.modified.length === 0 && stateDiffs.removed.length === 0 && (
                                    <span className="text-amber-600 font-medium">{stateDisplayName} changed</span>
                                  )}
                                </span>
                              ) : tick.isSnapshot && tick.snapshotMessage ? (
                                <span className="text-orange-600">[snapshot] {tick.snapshotMessage}</span>
                              ) : null}
                            </span>
                            <span className="text-neutral-400 whitespace-nowrap">{time}</span>
                          </div>
                        )
                        i++
                      } else {
                        const groupStart = i
                        while (i < ticks.length) {
                          const c = tickStateChanges[i]
                          if (c?.state || (ticks[i].isSnapshot && ticks[i].snapshotMessage)) break
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
                const { paths, contents } = stateParsed
                const { added, removed, modified } = stateDiffs
                const prevContents = prevStateParsed.contents

                // Build file status map
                const stateFileStatuses = new Map<string, FileStatus>()
                const addedSet = new Set(added)
                const removedSet = new Set(removed)
                const modifiedSet = new Set(modified)
                for (const p of paths) {
                  if (addedSet.has(p)) stateFileStatuses.set(p, 'uncommitted-new')
                  else if (modifiedSet.has(p)) stateFileStatuses.set(p, 'uncommitted-modified')
                  else stateFileStatuses.set(p, 'committed')
                }
                for (const p of removed) {
                  stateFileStatuses.set(p, 'removed')
                }

                const statusCounts = { 'uncommitted-new': 0, 'uncommitted-modified': 0, 'committed': 0, 'removed': 0 }
                for (const s of stateFileStatuses.values()) {
                  if (s in statusCounts) statusCounts[s as keyof typeof statusCounts]++
                }

                const categories = [
                  { key: 'uncommitted-new', label: `+ ${statusCounts['uncommitted-new']} added`, color: 'text-blue-500', borderColor: 'border-blue-500', bgActive: 'bg-blue-50', count: statusCounts['uncommitted-new'] },
                  { key: 'uncommitted-modified', label: `~ ${statusCounts['uncommitted-modified']} modified`, color: 'text-amber-500', borderColor: 'border-amber-500', bgActive: 'bg-amber-50', count: statusCounts['uncommitted-modified'] },
                  { key: 'removed', label: `${statusCounts['removed']} removed`, color: 'text-red-500', borderColor: 'border-red-500', bgActive: 'bg-red-50', count: statusCounts['removed'] },
                  { key: 'committed', label: `${statusCounts['committed']} unchanged`, color: 'text-neutral-500', borderColor: 'border-neutral-400', bgActive: 'bg-neutral-50', count: statusCounts['committed'] },
                ]

                const allDisplayPaths = [...paths, ...removed]
                const visiblePaths = allDisplayPaths.filter(p => {
                  const status = stateFileStatuses.get(p)
                  return status ? fileStatusFilter.has(status) : fileStatusFilter.has('committed')
                })

                const selectedContent = currentStateRecordPath ? contents[currentStateRecordPath] : null
                const selectedPrevContent = currentStateRecordPath ? prevContents[currentStateRecordPath] : null
                const isModified = currentStateRecordPath ? modifiedSet.has(currentStateRecordPath) : false
                const isAdded = currentStateRecordPath ? addedSet.has(currentStateRecordPath) : false
                const isRemoved = currentStateRecordPath ? removedSet.has(currentStateRecordPath) : false

                return (
                  <>
                    {categories.some(c => c.count > 0 && c.key !== 'committed') && (
                      <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50">
                        {categories.filter(c => c.count > 0).map(c => (
                          <button
                            key={c.key}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer border transition-colors ${
                              fileStatusFilter.has(c.key)
                                ? `${c.bgActive} ${c.color} ${c.borderColor}`
                                : 'bg-neutral-100 text-neutral-400 border-neutral-200 line-through'
                            }`}
                            onClick={() => {
                              setFileStatusFilter(prev => {
                                const next = new Set(prev)
                                if (next.has(c.key)) next.delete(c.key)
                                else next.add(c.key)
                                return next
                              })
                            }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-1 min-h-0 overflow-hidden">
                      <div className="w-60 overflow-y-auto border-r border-neutral-200 py-1 text-xs flex-shrink-0">
                        {allDisplayPaths.length === 0 ? (
                          <div className="p-10 text-center text-neutral-400">No {stateDisplayName} records at this tick</div>
                        ) : (
                          <FileTree
                            files={visiblePaths}
                            changedFiles={[...added, ...removed, ...modified]}
                            currentFile={currentStateRecordPath}
                            onSelectFile={setCurrentStateRecordPath}
                            addedFiles={added}
                            removedFiles={removed}
                            fileStatuses={stateFileStatuses}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-h-0 min-w-0 overflow-auto">
                        {!currentStateRecordPath ? (
                          <div className="p-10 text-center text-neutral-400 text-sm">Select a record to view its contents</div>
                        ) : isRemoved && selectedPrevContent ? (
                          <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-red-600 bg-red-50" dangerouslySetInnerHTML={{ __html: highlight(selectedPrevContent, languages.yaml, 'yaml') }} />
                        ) : !selectedContent ? (
                          <div className="p-10 text-center text-neutral-400 text-sm">(empty)</div>
                        ) : (
                          <div className="flex flex-col flex-1 min-h-0">
                            {(isModified || isAdded) && (
                              <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50 text-[10px]">
                                <button
                                  className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
                                    !stateDiffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                                  }`}
                                  onClick={() => setStateDiffMode(false)}
                                >
                                  Full
                                </button>
                                {isModified && selectedPrevContent && (
                                  <button
                                    className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
                                      stateDiffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                                    }`}
                                    onClick={() => setStateDiffMode(true)}
                                  >
                                    Diff
                                  </button>
                                )}
                                {isAdded && <span className="text-blue-500 ml-1">new record</span>}
                              </div>
                            )}
                            {stateDiffMode && isModified && selectedPrevContent ? (
                              <pre
                                className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700 flex-1 overflow-auto"
                                dangerouslySetInnerHTML={{ __html: diffHighlight(selectedPrevContent, selectedContent) }}
                              />
                            ) : (
                              <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700 flex-1 overflow-auto" dangerouslySetInnerHTML={{ __html: highlight(selectedContent, languages.yaml, 'yaml') }} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
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
                  return (
                    <span className="flex items-center gap-1.5 text-[11px] font-normal overflow-hidden">
                      {currentTick ? (
                        <span className="text-emerald-600 overflow-hidden text-ellipsis whitespace-nowrap">
                          tick {currentTickIndex + 1}: {currentTick.s3KeyCount ?? 0} objects
                          {(currentTick.s3AddedKeys?.length > 0 || currentTick.s3RemovedKeys?.length > 0) && (
                            <> ({currentTick.s3AddedKeys?.length > 0 && `+${currentTick.s3AddedKeys.length}`}{currentTick.s3AddedKeys?.length > 0 && currentTick.s3RemovedKeys?.length > 0 && ', '}{currentTick.s3RemovedKeys?.length > 0 && `-${currentTick.s3RemovedKeys.length}`})</>
                          )}
                        </span>
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
                      const hasS3Change = tick.s3Changed || (tick.isSnapshot && tick.snapshotMessage)
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
                              setCurrentTickIndex(idx)
                              const tickTime = new Date(tick.timestamp).getTime()
                              const video = videoRef.current
                              if (video) video.currentTime = Math.max(0, toVideoTime(tickTime))
                              setS3ListOpen(false)
                            }}
                          >
                            <span className="text-purple-400 min-w-[40px]">tick {idx + 1}</span>
                            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-neutral-600">
                              {tick.s3Changed ? (
                                <span className="flex items-center gap-1">
                                  {tick.s3AddedKeys?.length > 0 && <span className="text-blue-500">+{tick.s3AddedKeys.length} added</span>}
                                  {tick.s3RemovedKeys?.length > 0 && <span className="text-red-500">-{tick.s3RemovedKeys.length} removed</span>}
                                </span>
                              ) : tick.isSnapshot && tick.snapshotMessage ? (
                                <span className="text-orange-600">[snapshot] {tick.snapshotMessage}</span>
                              ) : null}
                            </span>
                            <span className="text-neutral-400 whitespace-nowrap">{tick.s3KeyCount ?? 0} objects</span>
                            <span className="text-neutral-400 whitespace-nowrap">{time}</span>
                          </div>
                        )
                        i++
                      } else {
                        const groupStart = i
                        while (i < ticks.length && !ticks[i].s3Changed && !(ticks[i].isSnapshot && ticks[i].snapshotMessage)) {
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

                  // Detect modified keys (exist in both current and previous snapshot with different content)
                  const s3ModifiedSet = new Set<string>()
                  for (const key of allKeys) {
                    if (key in prevS3Objects && key in s3Objects && prevS3Objects[key] !== s3Objects[key]) {
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

                  // Compute counts
                  const s3StatusCounts = { 'uncommitted-new': 0, 'uncommitted-modified': 0, 'committed': 0, 'removed': 0 }
                  for (const s of s3FileStatuses.values()) {
                    if (s in s3StatusCounts) s3StatusCounts[s as keyof typeof s3StatusCounts]++
                  }

                  const s3Categories = [
                    { key: 'uncommitted-new', label: `+ ${s3StatusCounts['uncommitted-new']} added`, color: 'text-blue-500', borderColor: 'border-blue-500', bgActive: 'bg-blue-50', count: s3StatusCounts['uncommitted-new'] },
                    { key: 'uncommitted-modified', label: `~ ${s3StatusCounts['uncommitted-modified']} modified`, color: 'text-amber-500', borderColor: 'border-amber-500', bgActive: 'bg-amber-50', count: s3StatusCounts['uncommitted-modified'] },
                    { key: 'removed', label: `${s3StatusCounts['removed']} removed`, color: 'text-red-500', borderColor: 'border-red-500', bgActive: 'bg-red-50', count: s3StatusCounts['removed'] },
                    { key: 'committed', label: `${s3StatusCounts['committed']} unchanged`, color: 'text-neutral-500', borderColor: 'border-neutral-400', bgActive: 'bg-neutral-50', count: s3StatusCounts['committed'] },
                  ]

                  const visibleKeys = allKeys.filter(k => {
                    const status = s3FileStatuses.get(k)
                    return status ? fileStatusFilter.has(status) : fileStatusFilter.has('committed')
                  })
                  const visibleRemoved = fileStatusFilter.has('removed') ? [...s3RemovedSet] : []

                  return (
                    <>
                      {s3Categories.some(c => c.count > 0 && c.key !== 'committed') && (
                        <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50">
                          {s3Categories.filter(c => c.count > 0).map(c => (
                            <button
                              key={c.key}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer border transition-colors ${
                                fileStatusFilter.has(c.key)
                                  ? `${c.bgActive} ${c.color} ${c.borderColor}`
                                  : 'bg-neutral-100 text-neutral-400 border-neutral-200 line-through'
                              }`}
                              onClick={() => {
                                setFileStatusFilter(prev => {
                                  const next = new Set(prev)
                                  if (next.has(c.key)) next.delete(c.key)
                                  else next.add(c.key)
                                  return next
                                })
                              }}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-1 min-h-0 overflow-hidden">
                        <div className="w-60 overflow-y-auto border-r border-neutral-200 py-1 text-xs flex-shrink-0">
                          {allKeys.length === 0 && s3RemovedSet.size === 0 ? (
                            <div className="p-10 text-center text-neutral-400">No S3 objects at this tick</div>
                          ) : (
                            <FileTree
                              files={[...visibleKeys, ...visibleRemoved]}
                              changedFiles={[...(tick.s3AddedKeys || []), ...(tick.s3RemovedKeys || [])]}
                              currentFile={currentS3Key}
                              onSelectFile={setCurrentS3Key}
                              addedFiles={tick.s3AddedKeys}
                              removedFiles={tick.s3RemovedKeys}
                              fileStatuses={s3FileStatuses}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
                          {(() => {
                            if (!currentS3Key || !(currentS3Key in s3Objects)) {
                              return <div className="p-10 text-center text-neutral-400 text-sm">Select an object to view its contents</div>
                            }
                            if (isBinary(s3Objects[currentS3Key])) {
                              return <div className="p-10 text-center text-neutral-400 text-sm">Sorry, this is a binary file.</div>
                            }
                            if (!s3Objects[currentS3Key]) {
                              return <div className="p-10 text-center text-neutral-400 text-sm">(empty)</div>
                            }
                            const isS3Modified = s3ModifiedSet.has(currentS3Key)
                            const isS3Added = addedSet.has(currentS3Key)
                            const s3PrevContent = prevS3Objects[currentS3Key]
                            const hasDiff = isS3Modified && s3PrevContent != null
                            return (
                              <>
                                {(hasDiff || isS3Added) && (
                                  <div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-200 bg-neutral-50 text-[10px]">
                                    <button
                                      className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
                                        !s3DiffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                                      }`}
                                      onClick={() => setS3DiffMode(false)}
                                    >
                                      Full
                                    </button>
                                    {hasDiff && (
                                      <button
                                        className={`px-1.5 py-0.5 rounded font-medium cursor-pointer border transition-colors ${
                                          s3DiffMode ? 'bg-white text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                                        }`}
                                        onClick={() => setS3DiffMode(true)}
                                      >
                                        Diff
                                      </button>
                                    )}
                                    {isS3Added && <span className="text-blue-500 ml-1">new object</span>}
                                  </div>
                                )}
                                {s3DiffMode && hasDiff ? (
                                  <pre
                                    className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700 flex-1 overflow-auto"
                                    dangerouslySetInnerHTML={{ __html: diffHighlight(s3PrevContent, s3Objects[currentS3Key]) }}
                                  />
                                ) : (
                                  <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-700 flex-1 overflow-auto">
                                    {s3Objects[currentS3Key]}
                                  </pre>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </>
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
}

interface TreeNode {
  [key: string]: TreeNode | null
}

function FileTree({ files, changedFiles, currentFile, onSelectFile, addedFiles, removedFiles, fileStatuses, ignoredSet }: FileTreeProps) {
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

  return <TreeNodeView node={tree} prefix="" depth={0} changedSet={changedSet} addedSet={addedSet} removedSet={removedSet} fileStatuses={fileStatuses} ignoredSet={ignoredSet} currentFile={currentFile} onSelectFile={onSelectFile} />
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
  currentFile: string | null
  onSelectFile: (file: string) => void
}

function TreeNodeView({ node, prefix, depth, changedSet, addedSet, removedSet, fileStatuses, ignoredSet, currentFile, onSelectFile }: TreeNodeViewProps) {
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

          // When we have fileStatuses (tick mode), use rich status display
          if (status) {
            const statusConfig = {
              'just-committed': { icon: '\u2713', color: 'text-green-600', label: 'committed' },
              'uncommitted-new': { icon: '+', color: 'text-blue-500', label: 'new (uncommitted)' },
              'uncommitted-modified': { icon: '~', color: 'text-amber-500', label: 'modified (uncommitted)' },
              'removed': { icon: '\u2212', color: 'text-red-500', label: 'removed' },
              'committed': { icon: null, color: '', label: 'committed' },
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
            </div>
          )
        }
      })}
    </>
  )
}
