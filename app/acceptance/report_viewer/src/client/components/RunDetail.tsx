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

import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  DEFAULT_PLAYBACK_SPEED_PERCENT,
  HealthSummary,
  MAX_PLAYBACK_SPEED_PERCENT,
  MIN_PLAYBACK_SPEED_PERCENT,
  normalizePlaybackSpeedPercent,
  setMediaPlaybackSpeed,
} from '../helpers.ts'
import HealthGraph from './HealthGraph.tsx'
import { categorizeScenarios, SectionHeader, StatusBadge } from './scenarioCategories.tsx'
import { isBundleMode, BUNDLE_MODE_OPTIONS, type BundleMode } from '../../bundleModes.ts'
import {
  EXECUTION_SURFACE_OPTIONS,
  isExecutionSurface,
  type ExecutionSurface,
} from '../../../../e2e/src/run/executionSurface.ts'

type ViewTab = 'thumbs' | 'list' | 'videos' | 'timing'

interface ConceptView {
  id: string
  name: string
  description: string
  isContribution?: boolean
}

interface BundleDoc {
  id: string
  name: string
  description: string
}

interface AppAreaView {
  id: string
  name: string
  description: string
  parentId?: string
}

interface KeyFrame {
  docId: string
  filename: string
}

interface Scenario {
  slug: string
  testName: string
  testBasename?: string
  status: string
  duration: number | null
  bundleMode: BundleMode | null
  executionSurface: ExecutionSurface
  conceptIds: string[]
  bundleDocIds: string[]
  appAreaDocIds: string[]
  failureReason?: string
  keyFrames: KeyFrame[]
  hasIssues: boolean
}

interface RunData {
  runId: string
  scenarios: Scenario[]
  targetedConceptIds?: string[]
  targetedAppAreaIds?: string[]
  highlightedTestBasenames?: string[]
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<RunData | null>(null)
  const [healthMap, setHealthMap] = useState<Record<string, HealthSummary>>({})
  const [docs, setDocs] = useState<ConceptView[]>([])
  const [bundleDocs, setBundleDocs] = useState<BundleDoc[]>([])
  const [appAreas, setAppAreas] = useState<AppAreaView[]>([])
  const [notes, setNotes] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ViewTab>('thumbs')
  const [mediaSize, setMediaSize] = useState<0 | 1 | 2 | 3>(0)
  const [playSpeed, setPlaySpeed] = useState(DEFAULT_PLAYBACK_SPEED_PERCENT)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  const selectedAreaIds = searchParams.getAll('area')
  const selectedAreas = appAreas.filter((d) => selectedAreaIds.includes(d.id))
  const selectedDocIds = searchParams.getAll('doc')
  const selectedDocs = docs.filter((d) => selectedDocIds.includes(d.id))
  const selectedBundleIds = searchParams.getAll('bundle')
  const selectedBundles = bundleDocs.filter((d) => selectedBundleIds.includes(d.id))
  const selectedBundleModes = searchParams.getAll('mode').filter(isBundleMode)
  const surfaceParam = searchParams.get('surface')
  const selectedExecutionSurface = isExecutionSurface(surfaceParam) ? surfaceParam : null

  // Track which acceptance concept IDs appear in this run's data.
  const presentDocIds = new Set(
    (data?.scenarios ?? []).flatMap((s) => s.conceptIds)
  )
  const presentAreaIds = new Set(
    (data?.scenarios ?? []).flatMap((s) => s.appAreaDocIds)
  )
  const isPartialRun = docs.length > 0 && presentDocIds.size < docs.length
  const isPartialAreaRun = appAreas.length > 0 && presentAreaIds.size < appAreas.length
  const targetedDocIds = new Set(data?.targetedConceptIds ?? [])
  const targetedAreaIds = new Set(data?.targetedAppAreaIds ?? [])
  const highlightedBasenames = new Set(data?.highlightedTestBasenames ?? [])
  const highlightedDocIds = new Set(
    (data?.scenarios ?? [])
      .filter((s) => s.testBasename && highlightedBasenames.has(s.testBasename))
      .flatMap((s) => s.conceptIds)
  )

  const setFilters = (next: { areaIds?: string[]; docIds?: string[]; bundleIds?: string[]; bundleModes?: BundleMode[]; executionSurface?: ExecutionSurface | null }) => {
    const areaIds = next.areaIds ?? selectedAreaIds
    const docIds = next.docIds ?? selectedDocIds
    const bundleIds = next.bundleIds ?? selectedBundleIds
    const bundleModes = next.bundleModes ?? selectedBundleModes
    const executionSurface = next.executionSurface === undefined
      ? selectedExecutionSurface
      : next.executionSurface
    setSearchParams([
      ...(executionSurface ? [['surface', executionSurface] as [string, string]] : []),
      ...bundleModes.map((mode): [string, string] => ['mode', mode]),
      ...areaIds.map((id): [string, string] => ['area', id]),
      ...docIds.map((id): [string, string] => ['doc', id]),
      ...bundleIds.map((id): [string, string] => ['bundle', id]),
    ])
  }

  const setVideoRef = useCallback((slug: string, el: HTMLVideoElement | null) => {
    if (el) {
      setMediaPlaybackSpeed(el, playSpeed)
      videoRefs.current.set(slug, el)
    } else {
      videoRefs.current.delete(slug)
    }
  }, [playSpeed])

  const playAll = useCallback(() => {
    videoRefs.current.forEach((video) => {
      setMediaPlaybackSpeed(video, playSpeed)
      video.currentTime = 0
      video.play()
    })
  }, [playSpeed])

  // Sync playback rate to all mounted videos when speed changes
  useEffect(() => {
    videoRefs.current.forEach((video) => {
      setMediaPlaybackSpeed(video, playSpeed)
    })
  }, [playSpeed])

  useEffect(() => {
    fetch('/api/concepts')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setDocs([...d].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
    fetch('/api/bundle-docs')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setBundleDocs(d))
      .catch(() => {})
    fetch('/api/app-areas')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setAppAreas(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      try {
        const [runRes, healthRes, notesRes] = await Promise.all([
          fetch(`/api/runs/${runId}`),
          fetch(`/api/runs/${runId}/health`),
          fetch(`/api/${runId}/notes`),
        ])
        if (mounted) {
          if (runRes.ok) setData(await runRes.json())
          if (healthRes.ok) setHealthMap(await healthRes.json())
          setNotes(notesRes.ok ? await notesRes.text() : null)
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [runId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Loading scenarios...
      </div>
    )
  }

  if (!data || data.scenarios.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        No scenarios found for run {runId}
      </div>
    )
  }

  // Sort scenarios by slug descending (higher t-numbers = newer scenarios first)
  const sortedScenarios = [...data.scenarios].sort((a, b) => b.slug.localeCompare(a.slug))

  const surfaceFiltered = selectedExecutionSurface
    ? sortedScenarios.filter((s) => s.executionSurface === selectedExecutionSurface)
    : sortedScenarios

  const modeFiltered = selectedBundleModes.length > 0
    ? surfaceFiltered.filter((s) => s.bundleMode && selectedBundleModes.includes(s.bundleMode))
    : surfaceFiltered

  const areaFiltered = selectedAreas.length > 0
    ? modeFiltered.filter((s) =>
        selectedAreas.some((area) => s.appAreaDocIds.includes(area.id))
      )
    : modeFiltered

  const docFiltered = selectedDocs.length > 0
    ? areaFiltered.filter((s) =>
        selectedDocs.some((doc) => s.conceptIds.includes(doc.id))
      )
    : areaFiltered

  const filteredScenarios = selectedBundles.length > 0
    ? docFiltered.filter((s) =>
        selectedBundles.some((bundle) => s.bundleDocIds.includes(bundle.id))
      )
    : docFiltered

  const sections = categorizeScenarios(
    filteredScenarios,
    (s) => s.status === 'failed',
    (s) => s.hasIssues,
    (s) => !!(s.testBasename && highlightedBasenames.has(s.testBasename)),
  )

  const mediaSizeClass = ['h-32', 'h-64', 'h-96', 'h-[512px]'][mediaSize]
  // Card max-width matches video width (height × 16/9) so names don't stretch cards
  const cardMaxWidthClass = ['max-w-[228px]', 'max-w-[456px]', 'max-w-[684px]', 'max-w-[912px]'][mediaSize]
  const displayedTab: ViewTab = selectedExecutionSurface === 'cli' && (activeTab === 'thumbs' || activeTab === 'videos')
    ? 'list'
    : activeTab
  const availableTabs: ViewTab[] = selectedExecutionSurface === 'cli'
    ? ['list', 'timing']
    : ['thumbs', 'list', 'videos', 'timing']

  function getKeyFrameUrl(scenario: Scenario): string | null {
    if (!scenario.keyFrames || scenario.keyFrames.length === 0) return null
    if (selectedDocIds.length === 1) {
      const match = scenario.keyFrames.find((kf) => kf.docId === selectedDocIds[0])
      if (match) return `/api/${runId}/${scenario.slug}/keyframe-file/${match.filename}`
      return null
    }
    // All/multiple docs: show first key frame
    const first = scenario.keyFrames[0]
    return `/api/${runId}/${scenario.slug}/keyframe-file/${first.filename}`
  }

  function getKeyFrameUrls(scenario: Scenario): { docId: string; url: string }[] {
    if (!scenario.keyFrames || scenario.keyFrames.length === 0) return []
    if (selectedDocIds.length === 1) {
      const matches = scenario.keyFrames.filter((kf) => kf.docId === selectedDocIds[0])
      return matches.map((kf) => ({ docId: kf.docId, url: `/api/${runId}/${scenario.slug}/keyframe-file/${kf.filename}` }))
    }
    return scenario.keyFrames.map((kf) => ({
      docId: kf.docId,
      url: `/api/${runId}/${scenario.slug}/keyframe-file/${kf.filename}`,
    }))
  }

  return (
    <div className="mx-auto p-6 max-w-[90vw]">
      <h2 className="text-lg font-bold text-neutral-800 mb-1">
        Scenarios in {runId}
      </h2>
      {notes && (
        <p className="text-sm text-neutral-500 mb-4">{notes}</p>
      )}
      {!notes && <div className="mb-3" />}

      {/* Execution surface is the primary division within a run. */}
      <div className="mb-5 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Interface">
          <span className="mr-1 text-sm font-bold text-neutral-700">Interface</span>
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
              selectedExecutionSurface === null
                ? 'bg-neutral-800 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
            aria-pressed={selectedExecutionSurface === null}
            onClick={() => setFilters({ executionSurface: null })}
          >
            All ({data.scenarios.length})
          </button>
          {EXECUTION_SURFACE_OPTIONS.map((surface) => {
            const isSelected = selectedExecutionSurface === surface.id
            const count = data.scenarios.filter(
              (scenario) => scenario.executionSurface === surface.id
            ).length
            return (
              <button
                key={surface.id}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                aria-pressed={isSelected}
                onClick={() => setFilters({ executionSurface: surface.id })}
              >
                {surface.label} ({count})
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Browser scenarios include visual artifacts. CLI scenarios capture commands and structured output.
        </p>
      </div>

      {/* Bundle-origin mode filter */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-neutral-400 font-medium mr-1">Starts with:</span>
          <button
            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
              selectedBundleModes.length === 0
                ? 'bg-violet-500 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
            onClick={() => setFilters({ bundleModes: [] })}
          >
            All
          </button>
          {BUNDLE_MODE_OPTIONS.map((mode) => {
            const isSelected = selectedBundleModes.includes(mode.id)
            const count = data.scenarios.filter((scenario) => scenario.bundleMode === mode.id).length
            return (
              <button
                key={mode.id}
                className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-violet-500 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                aria-pressed={isSelected}
                onClick={() => setFilters({
                  bundleModes: isSelected
                    ? selectedBundleModes.filter((selected) => selected !== mode.id)
                    : [...selectedBundleModes, mode.id],
                })}
              >
                {mode.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* App area filter chips */}
      {appAreas.length > 0 && (() => {
        const rootAreas = appAreas.filter((d) => !d.parentId)
        const bundleAreas = appAreas.filter((d) => d.parentId === 'bundle')

        const renderAreaPill = (area: AppAreaView) => {
          const isSelected = selectedAreaIds.includes(area.id)
          const hasData = presentAreaIds.has(area.id)
          const isTargeted = targetedAreaIds.has(area.id)
          const highlight = isSelected ? ''
            : isTargeted ? ' ring-2 ring-purple-400 bg-purple-50'
            : isPartialAreaRun && hasData ? ' ring-1 ring-blue-300 bg-blue-50'
            : ''
          return (
            <button
              key={area.id}
              title={area.description}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-sky-500 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }${highlight}`}
              onClick={() => {
                const nextAreas = isSelected
                  ? selectedAreaIds.filter((id) => id !== area.id)
                  : [...selectedAreaIds, area.id]
                setFilters({ areaIds: nextAreas })
              }}
            >
              {area.name}
            </button>
          )
        }

        return (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-neutral-400 font-medium mr-1">Areas:</span>
              <button
                className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  selectedAreaIds.length === 0
                    ? 'bg-sky-500 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                onClick={() => setFilters({ areaIds: [] })}
              >
                All
              </button>
              {rootAreas.map(renderAreaPill)}
              {bundleAreas.length > 0 && (
                <span className="text-xs text-neutral-400 font-medium mr-1">Bundle:</span>
              )}
              {bundleAreas.map(renderAreaPill)}
            </div>
            {selectedAreas.length === 1 && (
              <p className="mt-2 text-xs text-neutral-500">{selectedAreas[0].description}</p>
            )}
          </div>
        )
      })()}

      {/* Concept filter chips — two rows: core, then contributions. */}
      {docs.length > 0 && (() => {
        const baseDocs = docs.filter((d) => !d.isContribution)
        const extensionDocs = docs.filter((d) => d.isContribution)
        const extensionDocIds = extensionDocs.map((d) => d.id)
        const allExtensionSelected = extensionDocIds.length > 0 && extensionDocIds.every((id) => selectedDocIds.includes(id))

        const renderDocPill = (doc: ConceptView) => {
          const isSelected = selectedDocIds.includes(doc.id)
          const hasData = presentDocIds.has(doc.id)
          const isTargeted = targetedDocIds.has(doc.id)
          const isHighlightedDoc = highlightedDocIds.has(doc.id)
          const highlight = isSelected ? ''
            : isHighlightedDoc ? ' ring-2 ring-amber-500 bg-amber-100'
            : isTargeted ? ' ring-2 ring-purple-400 bg-purple-50'
            : isPartialRun && hasData ? ' ring-1 ring-blue-300 bg-blue-50'
            : ''
          return (
            <button
              key={doc.id}
              title={doc.isContribution ? 'Contributed Meadow concept' : undefined}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-brand-500 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }${highlight}`}
              onClick={() => {
                const nextDocs = isSelected
                  ? selectedDocIds.filter((id) => id !== doc.id)
                  : [...selectedDocIds, doc.id]
                setFilters({ docIds: nextDocs })
              }}
            >
              {doc.isContribution && <span className="mr-1" aria-hidden>☁</span>}
              {doc.name}
            </button>
          )
        }

        return (
          <div className="mb-3">
            {/* Base row */}
            <div className="flex flex-wrap gap-1.5">
              <button
                className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  selectedDocIds.length === 0
                    ? 'bg-brand-500 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                onClick={() => setFilters({ docIds: [] })}
              >
                All
              </button>
              {baseDocs.map(renderDocPill)}
            </div>

            {/* Contribution row — hidden when no scenario in this run uses one. */}
            {extensionDocs.length > 0 && extensionDocIds.some((id) => presentDocIds.has(id)) && (
              <div className="flex flex-wrap gap-1.5 items-center mt-1.5">
                <span className="text-xs text-neutral-400 font-medium mr-1">meadow-extension:</span>
                <button
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    allExtensionSelected
                      ? 'bg-brand-500 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                  title="Select all contributed concepts"
                  onClick={() => setFilters({ docIds: extensionDocIds })}
                >
                  All
                </button>
                {extensionDocs.map(renderDocPill)}
              </div>
            )}

            {selectedDocs.length === 1 && (
              <p className="mt-2 text-xs text-neutral-500">{selectedDocs[0].description}</p>
            )}
          </div>
        )
      })()}

      {/* Bundle filter chips */}
      {bundleDocs.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-neutral-400 font-medium mr-1">Bundles:</span>
            {bundleDocs.map((bundle) => {
              const isSelected = selectedBundleIds.includes(bundle.id)
              return (
                <button
                  key={bundle.id}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-500 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                  onClick={() => {
                    const nextBundles = isSelected
                      ? selectedBundleIds.filter((id) => id !== bundle.id)
                      : [...selectedBundleIds, bundle.id]
                    setFilters({ bundleIds: nextBundles })
                  }}
                >
                  {bundle.name}
                </button>
              )
            })}
          </div>
          {selectedBundles.length === 1 && (
            <p className="mt-2 text-xs text-neutral-500">{selectedBundles[0].description}</p>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center bg-neutral-100 border-b border-neutral-200 mb-4">
        <div className="flex">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              className={`px-4 py-1.5 text-xs font-bold cursor-pointer border-b-2 ${
                displayedTab === tab
                  ? 'text-brand-500 border-brand-500'
                  : 'text-neutral-500 border-transparent hover:text-neutral-700'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'thumbs' ? 'Thumbs' : tab === 'list' ? 'List' : tab === 'videos' ? 'Videos' : 'Timing'}
            </button>
          ))}
        </div>
        {(displayedTab === 'thumbs' || displayedTab === 'videos') && (
          <div className="ml-auto flex items-center gap-0.5 pr-2">
            {([0, 1, 2, 3] as const).map((size) => (
              <button
                key={size}
                onClick={() => setMediaSize(size)}
                className={`cursor-pointer rounded px-1 py-0.5 transition-colors ${
                  mediaSize === size
                    ? 'bg-brand-500 text-white'
                    : 'text-neutral-400 hover:text-neutral-600'
                }`}
                title={['Small', 'Medium', 'Medium-Large', 'Large'][size]}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect
                    x={8 - (size + 1) * 2}
                    y={8 - (size + 1) * 1.5}
                    width={(size + 1) * 4}
                    height={(size + 1) * 3}
                    rx="1"
                    fill="currentColor"
                  />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thumbs tab */}
      {displayedTab === 'thumbs' && (
        <div className="space-y-6">
          {sections.map(({ key, label, color, items: scenarios }) => (
            <div key={key}>
              <SectionHeader label={label} count={scenarios.length} color={color} />
              {scenarios.length === 0 ? (
                <p className="text-xs text-neutral-400 italic ml-1">None</p>
              ) : (
                <div className="space-y-3">
                  {scenarios.map((scenario) => {
                    const keyFrameUrls = getKeyFrameUrls(scenario)
                    return (
                      <Link
                        key={scenario.slug}
                        to={`/${runId}/${scenario.slug}`}
                        className="block bg-white border border-neutral-200 rounded-lg overflow-hidden hover:border-brand-300 hover:bg-brand-50 transition-colors p-3"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <StatusBadge status={scenario.status} hasIssues={scenario.hasIssues} />
                          <span className="text-sm font-medium text-neutral-800 truncate">
                            {scenario.testName}
                          </span>
                        </div>
                        {scenario.failureReason && (
                          <p className="text-xs text-red-600 mb-2 truncate" title={scenario.failureReason}>
                            {scenario.failureReason}
                          </p>
                        )}
                        {keyFrameUrls.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {keyFrameUrls.map(({ docId, url }) => (
                              <img
                                key={url}
                                src={url}
                                alt={`${scenario.testName} - ${docId}`}
                                className={`${mediaSizeClass} aspect-video object-cover bg-neutral-100 rounded`}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className={`${mediaSizeClass} aspect-video bg-neutral-100 rounded flex items-center justify-center text-neutral-400 text-xs`}>
                            No thumbnail
                          </div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* List tab */}
      {displayedTab === 'list' && (
        <div className="space-y-6">
          {sections.map(({ key, label, color, items: scenarios }) => (
            <div key={key}>
              <SectionHeader label={label} count={scenarios.length} color={color} />
              {scenarios.length === 0 ? (
                <p className="text-xs text-neutral-400 italic ml-1">None</p>
              ) : (
                <div className="space-y-2">
                  {scenarios.map((scenario) => {
                    const health = healthMap[scenario.slug]
                    return (
                      <Link
                        key={scenario.slug}
                        to={`/${runId}/${scenario.slug}`}
                        className="block bg-white border border-neutral-200 rounded-lg px-4 py-3 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <StatusBadge status={scenario.status} hasIssues={scenario.hasIssues} />
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-neutral-800">
                                {scenario.testName}
                              </span>
                              {scenario.failureReason && (
                                <p className="text-xs text-red-600 truncate" title={scenario.failureReason}>
                                  {scenario.failureReason}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {health && (health.hasAnyData || health.hasUncommittedAtEnd) && (
                              <div className="flex items-center gap-1.5">
                                {health.hasAnyData && (
                                  <HealthGraph data={health} width={80} height={16} mini />
                                )}
                                {health.hasUncommittedAtEnd && (
                                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Uncommitted files at end" />
                                )}
                              </div>
                            )}
                            {scenario.duration != null && (
                              <span className="text-xs text-neutral-500">
                                {scenario.duration.toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Videos tab */}
      {displayedTab === 'videos' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={playAll}
              className="px-4 py-1.5 text-xs font-bold bg-brand-500 text-white rounded hover:bg-brand-600 transition-colors cursor-pointer"
            >
              Play All
            </button>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={MIN_PLAYBACK_SPEED_PERCENT}
                max={MAX_PLAYBACK_SPEED_PERCENT}
                step="1"
                value={playSpeed}
                aria-label="Playback speed"
                onChange={(e) => setPlaySpeed(normalizePlaybackSpeedPercent(e.target.value))}
                className="w-28 accent-brand-500"
              />
              <span className="text-xs text-neutral-500 min-w-[36px]">{playSpeed}%</span>
            </div>
          </div>
          <div className="space-y-6">
            {sections.map(({ key, label, color, items: scenarios }) => (
              <div key={key}>
                <SectionHeader label={label} count={scenarios.length} color={color} />
                {scenarios.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic ml-1">None</p>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {scenarios.map((scenario) => {
                      const health = healthMap[scenario.slug]
                      const keyFrameUrl = getKeyFrameUrl(scenario)
                      return (
                        <div
                          key={scenario.slug}
                          onClick={() => navigate(`/${runId}/${scenario.slug}${playSpeed !== 100 ? `?speed=${playSpeed}` : ''}`)}
                          title={scenario.testName}
                          className={`${cardMaxWidthClass} bg-white border border-neutral-200 rounded-lg overflow-hidden hover:border-brand-300 hover:bg-brand-50 transition-colors cursor-pointer`}
                        >
                          <video
                            ref={(el) => setVideoRef(scenario.slug, el)}
                            src={`/api/${runId}/${scenario.slug}/video.webm`}
                            poster={keyFrameUrl ?? undefined}
                            preload="metadata"
                            muted
                            className={`${mediaSizeClass} aspect-video bg-neutral-900`}
                          />
                          <div className="px-3 py-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <StatusBadge status={scenario.status} hasIssues={scenario.hasIssues} />
                              <span className="text-sm font-medium text-neutral-800 truncate">
                                {scenario.testName}
                              </span>
                            </div>
                            {scenario.failureReason && (
                              <p className="text-xs text-red-600 truncate mt-0.5" title={scenario.failureReason}>
                                {scenario.failureReason}
                              </p>
                            )}
                            {health && health.hasAnyData && (
                              <div className="mt-1.5">
                                <HealthGraph data={health} width={200} height={16} mini />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timing tab */}
      {displayedTab === 'timing' && (() => {
        const timed = filteredScenarios
          .filter((s) => s.duration != null)
          .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
        return (
          <div className="space-y-2">
            {timed.map((scenario) => (
              <Link
                key={scenario.slug}
                to={`/${runId}/${scenario.slug}`}
                className="block bg-white border border-neutral-200 rounded-lg px-4 py-3 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={scenario.status} hasIssues={scenario.hasIssues} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-neutral-800">
                        {scenario.testName}
                      </span>
                      {scenario.failureReason && (
                        <p className="text-xs text-red-600 truncate" title={scenario.failureReason}>
                          {scenario.failureReason}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-neutral-400">
                    {scenario.duration?.toFixed(1)}s
                  </span>
                </div>
              </Link>
            ))}
            {timed.length === 0 && (
              <p className="text-xs text-neutral-400 italic">No timing data available</p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
