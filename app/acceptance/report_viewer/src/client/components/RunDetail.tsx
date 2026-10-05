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

import { Fragment, useState, useEffect, useRef, useCallback, useId, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams, useNavigate, useSearchParams, createSearchParams } from 'react-router-dom'
import {
  DEFAULT_PLAYBACK_SPEED_PERCENT,
  HealthSummary,
  MAX_PLAYBACK_SPEED_PERCENT,
  MIN_PLAYBACK_SPEED_PERCENT,
  normalizePlaybackSpeedPercent,
  setMediaPlaybackSpeed,
  scenarioDisplayName,
} from '../helpers.ts'
import HealthGraph from './HealthGraph.tsx'
import ConceptExplorer from './ConceptExplorer.tsx'
import { useScenarioReviews, ScenarioReviewMenu, ReviewLog } from './ScenarioReview.tsx'
import { findReview } from '../../scenarioReviews.js'
import { CopyReferenceButton } from './CopyReferenceButton.tsx'
import { ScenarioFilterPill, type ScenarioFilterAction } from './ScenarioFilterPill.tsx'
import { categorizeScenarios, SectionHeader, StatusBadge } from './scenarioCategories.tsx'
import { isBundleMode, BUNDLE_MODE_OPTIONS, type BundleMode } from '../../bundleModes.ts'
import {
  EXECUTION_SURFACE_OPTIONS,
  isExecutionSurface,
  executionSurfacesFor,
  type ExecutionSurface,
} from '../../../../e2e/src/run/executionSurface.ts'

const VIEW_TABS = ['thumbs', 'list', 'videos', 'details', 'timing'] as const
type ViewTab = typeof VIEW_TABS[number]
type FilterGroup = 'surface' | 'bundle' | 'mode' | 'area'

interface FilterValues {
  areaIds: string[]
  docIds: string[]
  bundleIds: string[]
  bundleModes: BundleMode[]
  executionSurfaces: ExecutionSurface[]
}

const EMPTY_FILTERS: FilterValues = { areaIds: [], docIds: [], bundleIds: [], bundleModes: [], executionSurfaces: [] }

interface ConceptView {
  searchFacet: boolean
  parentId?: string
  kind?: string
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
  scenarioId?: string
  slug: string
  testName: string
  description?: string
  testBasename?: string
  status: string
  duration: number | null
  bundleMode: BundleMode | null
  executionSurface: ExecutionSurface
  executionSurfaces?: ExecutionSurface[]
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

function FilterOptions<T extends { id: string }>({ preferenceId, options, availableIds, selectedIds, allOption, section, children }: {
  preferenceId: string
  options: readonly T[]
  availableIds: ReadonlySet<string>
  selectedIds: readonly string[]
  allOption: ReactNode
  section?: (option: T) => string | undefined
  children: (option: T, available: boolean) => ReactNode
}) {
  const storageKey = `e2e-report-viewer.filter-expanded.${preferenceId}`
  const [expanded, setExpanded] = useState(() => {
    try { return window.localStorage.getItem(storageKey) === 'true' }
    catch { return false }
  })
  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    try { window.localStorage.setItem(storageKey, String(next)) }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }
  const optionsId = useId()
  // Keep selected options reachable even when another filter rules them out.
  const visible = options.filter(option => availableIds.has(option.id) || selectedIds.includes(option.id))
  const unavailable = options.filter(option => !availableIds.has(option.id) && !selectedIds.includes(option.id))
  const hiddenLabel = `${visible.length > 0 ? 'and ' : ''}${unavailable.length} hidden`
  const renderOptions = (choices: readonly T[]) => choices.map((option, index) => {
    const heading = section?.(option)
    const startsSection = heading && (index === 0 || heading !== section?.(choices[index - 1]))
    return <Fragment key={option.id}>
      {startsSection && <span className="text-xs text-neutral-400 font-medium mr-1">{heading}:</span>}
      {children(option, availableIds.has(option.id))}
    </Fragment>
  })

  return <>
    <div className="filter-all" data-constrained={visible.length <= 1}>
      {allOption}
    </div>
    <div className="filter-choices">
      {renderOptions(visible)}
      {unavailable.length > 0 && (
        <button
          type="button"
          className="inline-grid px-2 py-1 text-left text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:underline cursor-pointer"
          aria-expanded={expanded}
          aria-controls={optionsId}
          onClick={toggleExpanded}
        >
          {/* Reserve the collapsed label's width so the link stays in place when rows wrap. */}
          <span className="invisible col-start-1 row-start-1" aria-hidden="true">{hiddenLabel}</span>
          <span className="col-start-1 row-start-1">{expanded ? 'hide' : hiddenLabel}</span>
        </button>
      )}
      <span id={optionsId} className="contents">
        {expanded && renderOptions(unavailable)}
      </span>
    </div>
  </>
}

function ScenarioPreviewVideo({ src, poster, name, onRef }: {
  src: string
  poster?: string
  name: string
  onRef: (video: HTMLVideoElement | null) => void
}) {
  const [unavailable, setUnavailable] = useState(false)
  return unavailable ? (
    <div className="aspect-video flex items-center justify-center rounded bg-neutral-100 text-xs text-neutral-400">
      No video available.
    </div>
  ) : (
    <video
      ref={onRef}
      src={src}
      poster={poster}
      aria-label={`Video for ${name}`}
      controls
      playsInline
      preload="metadata"
      muted
      onError={() => setUnavailable(true)}
      className="w-full aspect-video rounded bg-neutral-900"
    />
  )
}

function ScenarioMetadataGroup({ label, accent, options, availableIds, selectedIds, onChoose }: {
  label: string
  accent: string
  options: { id: string; name: string }[]
  availableIds: ReadonlySet<string>
  selectedIds: readonly string[]
  onChoose: (id: string, action: ScenarioFilterAction) => void
}) {
  if (options.length === 0) return null
  return (
    <div className={`scenario-metadata-group ${accent} flex min-w-0 flex-wrap items-center gap-1`}>
      <dt className="text-neutral-400">{label}:</dt>
      <dd className="contents">
        {options.map(option => {
          const selected = selectedIds.includes(option.id)
          const hidden = !availableIds.has(option.id) && !selected
          return (
            <ScenarioFilterPill
              key={option.id}
              name={option.name}
              selected={selected}
              hidden={hidden}
              onChoose={action => onChoose(option.id, action)}
            />
          )
        })}
      </dd>
    </div>
  )
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<RunData | null>(null)
  const reviews = useScenarioReviews()
  const reviewMode = searchParams.get('review')
  const reviewSort = searchParams.get('reviewSort') ?? 'added-desc'
  const setReviewMode = (mode: string) => {
    const next = createSearchParams(searchParams)
    if (mode) next.set('review', mode); else next.delete('review')
    setSearchParams(next)
  }
  const [healthMap, setHealthMap] = useState<Record<string, HealthSummary>>({})
  const [docs, setDocs] = useState<ConceptView[]>([])
  const [conceptCatalog, setConceptCatalog] = useState<ConceptView[]>([])
  const [conceptsExpanded, setConceptsExpanded] = useState(false)
  const [conceptSidebarWidth, setConceptSidebarWidth] = useState(0)
  const conceptsPanelId = useId()
  const [bundleDocs, setBundleDocs] = useState<BundleDoc[]>([])
  const [appAreas, setAppAreas] = useState<AppAreaView[]>([])
  const [loading, setLoading] = useState(true)
  const viewParam = searchParams.get('view')
  const activeTab = VIEW_TABS.find(tab => tab === viewParam) ?? 'thumbs'
  const setActiveTab = (tab: ViewTab) => {
    const next = createSearchParams(searchParams)
    next.set('view', tab)
    setSearchParams(next)
  }
  const [mediaSize, setMediaSize] = useState<0 | 1 | 2 | 3>(0)
  const [playSpeed, setPlaySpeed] = useState(DEFAULT_PLAYBACK_SPEED_PERCENT)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  const selectedAreaIds = searchParams.getAll('area')
  const selectedAreas = appAreas.filter((d) => selectedAreaIds.includes(d.id))
  const selectedDocIds = searchParams.getAll('doc')
  const selectedDocs = [...docs, ...conceptCatalog.filter(concept => !docs.some(doc => doc.id === concept.id))]
    .filter((d) => selectedDocIds.includes(d.id))
  const selectedBundleIds = searchParams.getAll('bundle')
  const selectedBundles = bundleDocs.filter((d) => selectedBundleIds.includes(d.id))
  const selectedBundleModes = searchParams.getAll('mode').filter(isBundleMode)
  const selectedExecutionSurfaces = searchParams.getAll('surface').filter(isExecutionSurface)

  const scenarioConceptIds = (scenario: Scenario) => new Set([
    ...scenario.conceptIds,
    ...scenario.appAreaDocIds.flatMap(id => {
      const ids: string[] = []
      let area = appAreas.find(area => area.id === id)
      while (area && !ids.includes(area.id)) {
        ids.push(area.id)
        area = appAreas.find(parent => parent.id === area?.parentId)
      }
      return ids
    }),
  ])

  // Track which acceptance concept IDs appear in this run's data.
  const presentDocIds = new Set(
    (data?.scenarios ?? []).flatMap((s) => [...scenarioConceptIds(s)])
  )
  const presentAreaIds = new Set(
    (data?.scenarios ?? []).flatMap((s) => s.appAreaDocIds)
  )
  const facetDocs = docs.filter(doc => doc.searchFacet)
  const detailedDocs = [...docs.filter(doc => !doc.searchFacet), ...selectedDocs.filter(concept => !docs.some(doc => doc.id === concept.id))]
  const selectedDetailedDocIds = selectedDocs.filter(doc => !doc.searchFacet).map(doc => doc.id)
  const isPartialRun = facetDocs.some(doc => !presentDocIds.has(doc.id))
  const isPartialAreaRun = appAreas.length > 0 && presentAreaIds.size < appAreas.length
  const targetedDocIds = new Set(data?.targetedConceptIds ?? [])
  const targetedAreaIds = new Set(data?.targetedAppAreaIds ?? [])
  const highlightedBasenames = new Set(data?.highlightedTestBasenames ?? [])
  const highlightedDocIds = new Set(
    (data?.scenarios ?? [])
      .filter((s) => s.testBasename && highlightedBasenames.has(s.testBasename))
      .flatMap((s) => s.conceptIds)
  )

  const setFilters = (next: Partial<FilterValues>) => {
    const areaIds = next.areaIds ?? selectedAreaIds
    const docIds = next.docIds ?? selectedDocIds
    const bundleIds = next.bundleIds ?? selectedBundleIds
    const bundleModes = next.bundleModes ?? selectedBundleModes
    const executionSurfaces = next.executionSurfaces ?? selectedExecutionSurfaces
    setSearchParams([
      ['view', activeTab],
      ...executionSurfaces.map((surface): [string, string] => ['surface', surface]),
      ...bundleModes.map((mode): [string, string] => ['mode', mode]),
      ...areaIds.map((id): [string, string] => ['area', id]),
      ...docIds.map((id): [string, string] => ['doc', id]),
      ...bundleIds.map((id): [string, string] => ['bundle', id]),
    ])
  }

  const chooseMetadataFilter = (next: Partial<FilterValues>, action: ScenarioFilterAction) => {
    const current = action === 'restart' ? EMPTY_FILTERS : {
      areaIds: selectedAreaIds, docIds: selectedDocIds, bundleIds: selectedBundleIds,
      bundleModes: selectedBundleModes, executionSurfaces: selectedExecutionSurfaces,
    }
    setFilters({
      areaIds: [...new Set([...current.areaIds, ...next.areaIds ?? []])],
      docIds: [...new Set([...current.docIds, ...next.docIds ?? []])],
      bundleIds: [...new Set([...current.bundleIds, ...next.bundleIds ?? []])],
      bundleModes: [...new Set([...current.bundleModes, ...next.bundleModes ?? []])],
      executionSurfaces: [...new Set([...current.executionSurfaces, ...next.executionSurfaces ?? []])],
    })
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
      void video.play().catch(() => {})
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
    fetch('/api/concepts?all=true')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setConceptCatalog(d))
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
        const [runRes, healthRes] = await Promise.all([
          fetch(`/api/runs/${runId}`),
          fetch(`/api/runs/${runId}/health`),
        ])
        if (mounted) {
          if (runRes.ok) setData(await runRes.json())
          if (healthRes.ok) setHealthMap(await healthRes.json())
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
  const sortedScenarios = [...data.scenarios].sort((a, b) => {
    if (reviewMode === 'incomplete' || reviewMode === 'completed') {
      const field = reviewSort.startsWith('completed') ? 'completedAt' : 'addedAt'
      const difference = (findReview(reviews.data, a)?.[field] ?? '').localeCompare(findReview(reviews.data, b)?.[field] ?? '')
      if (difference) return reviewSort.endsWith('asc') ? difference : -difference
    }
    return b.slug.localeCompare(a.slug)
  })

  const matchesFilters = (scenario: Scenario, except?: FilterGroup) =>
    (except === 'surface' || selectedExecutionSurfaces.length === 0 || selectedExecutionSurfaces.some(surface => executionSurfacesFor(scenario).includes(surface)))
    && (except === 'bundle' || selectedBundles.length === 0 || selectedBundles.some(bundle => scenario.bundleDocIds.includes(bundle.id)))
    && (except === 'mode' || selectedBundleModes.length === 0 || !!scenario.bundleMode && selectedBundleModes.includes(scenario.bundleMode))
    && (except === 'area' || selectedAreas.length === 0 || selectedAreas.some(area => scenario.appAreaDocIds.includes(area.id)))
    && (selectedDocIds.length === 0 || selectedDocIds.some(id => scenarioConceptIds(scenario).has(id)))

  const matchesReview = (scenario: Scenario) => !reviewMode || reviewMode === 'logs'
    || findReview(reviews.data, scenario)?.status === (reviewMode === 'incomplete' ? 'TOREVIEW' : 'REVIEWED')
  const filteredScenarios = sortedScenarios.filter(scenario => matchesFilters(scenario) && matchesReview(scenario))

  // The primary rows keep alternatives to their own selection available.
  const surfaceMatches = sortedScenarios.filter(scenario => matchesFilters(scenario, 'surface'))
  const bundleMatches = sortedScenarios.filter(scenario => matchesFilters(scenario, 'bundle'))
  const modeMatches = sortedScenarios.filter(scenario => matchesFilters(scenario, 'mode'))
  const areaMatches = sortedScenarios.filter(scenario => matchesFilters(scenario, 'area'))
  const availableSurfaceIds = new Set(surfaceMatches.flatMap(executionSurfacesFor))
  const availableBundleIds = new Set(bundleMatches.flatMap(s => s.bundleDocIds))
  const availableModeIds = new Set(modeMatches.flatMap(s => s.bundleMode ? [s.bundleMode] : []))
  const availableAreaIds = new Set(areaMatches.flatMap(s => s.appAreaDocIds))
  // Tags show what co-occurs in the displayed scenarios, including selected tags.
  const availableDocIds = new Set(filteredScenarios.flatMap(s => [...scenarioConceptIds(s)]))
  const visibleFacetDocIds = new Set([
    ...facetDocs,
    ...(conceptsExpanded ? detailedDocs : []),
  ].filter(doc => availableDocIds.has(doc.id)).map(doc => doc.id))
  const rootAreas = appAreas.filter(area => !area.parentId || area.id === 'bundles')
  const bundleAreas = appAreas.filter(area => area.parentId === 'bundle' && area.id !== 'bundles')
  const visibleAreaIds = new Set([...rootAreas, ...bundleAreas].filter(area => availableAreaIds.has(area.id)).map(area => area.id))

  const sections = categorizeScenarios(
    filteredScenarios,
    (s) => s.status === 'failed',
    (s) => s.hasIssues,
    (s) => !!(s.testBasename && highlightedBasenames.has(s.testBasename)),
    (s) => s.status === 'skipped',
  ).filter(section => section.items.length > 0 || section.key === 'passing')

  const mediaSizeClass = ['h-32', 'h-64', 'h-96', 'h-[512px]'][mediaSize]
  const detailVideoWidth = ['20rem', '28rem', '36rem', '44rem'][mediaSize]
  const hasBrowserScenarios = filteredScenarios.some(scenario => executionSurfacesFor(scenario).some(surface => surface !== 'cli'))
  // Card max-width matches video width (height × 16/9) so names don't stretch cards
  const cardMaxWidthClass = ['max-w-[228px]', 'max-w-[456px]', 'max-w-[684px]', 'max-w-[912px]'][mediaSize]
  const displayedTab: ViewTab = !hasBrowserScenarios && filteredScenarios.length > 0 && (activeTab === 'thumbs' || activeTab === 'videos')
    ? 'list'
    : activeTab
  const availableTabs: readonly ViewTab[] = !hasBrowserScenarios && filteredScenarios.length > 0
    ? ['list', 'details', 'timing']
    : VIEW_TABS

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
    <div className="mx-auto px-6 py-3 max-w-[90vw]" style={conceptSidebarWidth ? { marginRight: conceptSidebarWidth, maxWidth: 'none' } : undefined}>
      {(reviews.data.reviews.length > 0 || reviewMode) && <section aria-label="To review" className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-violet-50 px-3 py-2 text-xs">
        <span className="font-semibold text-neutral-600">To review:</span>
        {(['', 'incomplete', 'completed', 'logs'] as const).map(mode => <button key={mode} aria-pressed={(reviewMode ?? '') === mode}
          className={`cursor-pointer rounded px-2 py-1 ${(reviewMode ?? '') === mode ? 'bg-violet-100 text-violet-800' : 'text-neutral-600 hover:bg-violet-100'}`}
          onClick={() => setReviewMode(mode)}>{mode === '' ? 'All' : mode === 'incomplete' ? `Incomplete (${data.scenarios.filter(scenario => findReview(reviews.data, scenario)?.status === 'TOREVIEW').length})` : mode === 'completed' ? 'Completed' : 'Logs'}</button>)}
        {(reviewMode === 'incomplete' || reviewMode === 'completed') && <label className="ml-auto">Sort <select aria-label="Review sort" value={reviewSort} onChange={event => {
          const next = createSearchParams(searchParams); next.set('reviewSort', event.target.value); setSearchParams(next)
        }} className="ml-1 rounded border bg-white px-1 py-1">
          <option value="added-desc">Added — newest first</option><option value="added-asc">Added — oldest first</option>
          <option value="completed-desc">Completed — newest first</option><option value="completed-asc">Completed — oldest first</option>
        </select></label>}
      </section>}
      {reviews.error && <p role="alert" className="text-xs text-red-700">{reviews.error}</p>}
      {/* Execution surface filter */}
      <div className="filter-section filter-interface mb-1 w-full rounded-md px-3 py-1.5">
        <div className="filter-row" role="group" aria-label="Interface">
          <span className="filter-label text-xs text-neutral-400 font-medium">Interface:</span>
          <FilterOptions preferenceId="interface" options={EXECUTION_SURFACE_OPTIONS} availableIds={availableSurfaceIds} selectedIds={selectedExecutionSurfaces}
            allOption={
              <button
                className="filter-default text-neutral-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                aria-pressed={selectedExecutionSurfaces.length === 0}
                onClick={() => setFilters({ executionSurfaces: [] })}
              >
                All
              </button>
            }>
            {(surface, available) => {
              const isSelected = selectedExecutionSurfaces.includes(surface.id)
              return (
                <button
                  key={surface.id}
                  title={available ? undefined : 'No matching scenarios with the current filters.'}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-neutral-800 text-white'
                      : available ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
                  }${isSelected && !available ? ' opacity-60' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => setFilters({ executionSurfaces: isSelected ? selectedExecutionSurfaces.filter(id => id !== surface.id) : [...selectedExecutionSurfaces, surface.id] })}
                >
                  {surface.label}
                </button>
              )
            }}
          </FilterOptions>
        </div>
      </div>

      {/* App area filter chips */}
      {appAreas.length > 0 && (() => {
        const renderAreaPill = (area: AppAreaView, available: boolean) => {
          const isSelected = selectedAreaIds.includes(area.id)
          const hasData = presentAreaIds.has(area.id)
          const isTargeted = targetedAreaIds.has(area.id)
          const highlight = isSelected || !available ? ''
            : isTargeted ? ' ring-2 ring-purple-400 bg-purple-50'
            : isPartialAreaRun && hasData ? ' ring-1 ring-blue-300 bg-blue-50'
            : ''
          return (
            <button
              key={area.id}
              title={available ? undefined : 'No matching scenarios with the current filters.'}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-sky-500 text-white'
                  : available ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
              }${highlight}${isSelected && !available ? ' opacity-60' : ''}`}
              aria-pressed={isSelected}
              onClick={() => {
                const nextAreas = isSelected
                  ? selectedAreaIds.filter((id) => id !== area.id)
                  : [...selectedAreaIds, area.id]
                setFilters({ areaIds: nextAreas })
              }}
            >
              {area.parentId === 'bundle' ? area.name.replace(/^Bundle /, '') : area.name}
            </button>
          )
        }

        return (
          <div className="filter-section filter-areas mb-1 w-full rounded-md px-3 py-1.5">
            <div className="filter-row" role="group" aria-label="Areas">
              <span className="filter-label text-xs text-neutral-400 font-medium">Areas:</span>
              <FilterOptions preferenceId="areas" options={[...rootAreas, ...bundleAreas]} availableIds={availableAreaIds} selectedIds={selectedAreaIds}
                section={area => area.parentId === 'bundle' && area.id !== 'bundles' ? 'Bundle' : undefined}
                allOption={
                  <button
                    className="filter-default text-neutral-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                    aria-pressed={selectedAreaIds.length === 0}
                    onClick={() => setFilters({ areaIds: [] })}
                  >
                    All
                  </button>
                }>
                {renderAreaPill}
              </FilterOptions>
            </div>
          </div>
        )
      })()}

      {/* Bundle filter chips */}
      {bundleDocs.length > 0 && (
        <div className="filter-section filter-bundles mb-1 w-full rounded-md px-3 py-1.5">
          <div className="filter-row" role="group" aria-label="Bundles">
            <span className="filter-label text-xs text-neutral-400 font-medium">Bundles:</span>
            <FilterOptions preferenceId="bundles" options={bundleDocs} availableIds={availableBundleIds} selectedIds={selectedBundleIds}
              allOption={
                <button
                  className="filter-default text-neutral-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                  aria-pressed={selectedBundleIds.length === 0}
                  onClick={() => setFilters({ bundleIds: [] })}
                >
                  All
                </button>
              }>
              {(bundle, available) => {
                const isSelected = selectedBundleIds.includes(bundle.id)
                return (
                  <button
                    key={bundle.id}
                    title={available ? bundle.description : 'No matching scenarios with the current filters.'}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-500 text-white'
                        : available ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
                    }${isSelected && !available ? ' opacity-60' : ''}`}
                    aria-pressed={isSelected}
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
              }}
            </FilterOptions>
            {selectedBundles.length === 1 && (
              <p className="col-start-3 text-xs text-neutral-500">{selectedBundles[0].description}</p>
            )}
          </div>
        </div>
      )}

      {/* Bundle-origin mode filter */}
      <div className="filter-section filter-starts-with mb-1 w-full rounded-md px-3 py-1.5">
        <div className="filter-row" role="group" aria-label="Starts with">
          <span className="filter-label text-xs text-neutral-400 font-medium">Starts with:</span>
          <FilterOptions preferenceId="starts-with" options={BUNDLE_MODE_OPTIONS} availableIds={availableModeIds} selectedIds={selectedBundleModes}
            allOption={
              <button
                className="filter-default text-neutral-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                aria-pressed={selectedBundleModes.length === 0}
                onClick={() => setFilters({ bundleModes: [] })}
              >
                All
              </button>
            }>
            {(mode, available) => {
              const isSelected = selectedBundleModes.includes(mode.id)
              return (
                <button
                  key={mode.id}
                  title={available ? undefined : 'No matching scenarios with the current filters.'}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-violet-500 text-white'
                      : available ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
                  }${isSelected && !available ? ' opacity-60' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => setFilters({
                    bundleModes: isSelected
                      ? selectedBundleModes.filter((selected) => selected !== mode.id)
                      : [...selectedBundleModes, mode.id],
                  })}
                >
                  {mode.label}
                </button>
              )
            }}
          </FilterOptions>
        </div>
      </div>

      {/* Concept filter chips — two rows: core, then contributions. */}
      {docs.length > 0 && (() => {
        const baseDocs = facetDocs.filter((d) => !d.isContribution)
        const extensionDocs = facetDocs.filter((d) => d.isContribution)
        const extensionDocIds = extensionDocs.map((d) => d.id)
        const selectedBaseDocIds = selectedDocs.filter(doc => doc.searchFacet && !doc.isContribution).map(doc => doc.id)
        const selectedExtensionDocIds = selectedDocs.filter(doc => doc.searchFacet && doc.isContribution).map(doc => doc.id)

        const renderDocPill = (doc: ConceptView, available: boolean) => {
          const isSelected = selectedDocIds.includes(doc.id)
          const hasData = presentDocIds.has(doc.id)
          const isTargeted = targetedDocIds.has(doc.id)
          const isHighlightedDoc = highlightedDocIds.has(doc.id)
          const highlight = isSelected || !available ? ''
            : isHighlightedDoc ? ' ring-2 ring-amber-500 bg-amber-100'
            : isTargeted ? ' ring-2 ring-purple-400 bg-purple-50'
            : isPartialRun && hasData ? ' ring-1 ring-blue-300 bg-blue-50'
            : ''
          return (
            <button
              key={doc.id}
              title={!available ? 'No matching scenarios with the current filters.' : doc.isContribution ? 'Contributed Meadow concept' : undefined}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-brand-500 text-white'
                  : available ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
              }${highlight}${isSelected && !available ? ' opacity-60' : ''}`}
              aria-pressed={isSelected}
              onClick={() => {
                const nextDocs = isSelected
                  ? selectedDocIds.filter((id) => id !== doc.id)
                  : [...selectedDocIds, doc.id]
                setFilters({ docIds: nextDocs })
              }}
            >
              {doc.name}
            </button>
          )
        }

        return (
          <div className="mb-3">
            {/* Base row */}
            <div className="filter-section filter-tags mb-1 w-full rounded-md px-3 py-1.5 filter-row" role="group" aria-label="Concept filters">
              <span className="filter-label text-xs text-neutral-400 font-medium">Tags:</span>
              <FilterOptions preferenceId="tags" options={baseDocs} availableIds={availableDocIds} selectedIds={selectedDocIds}
                allOption={
                  <button
                    className="filter-default text-neutral-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                    aria-pressed={selectedBaseDocIds.length === 0}
                    onClick={() => setFilters({ docIds: [...selectedExtensionDocIds, ...selectedDetailedDocIds] })}
                  >
                    All
                  </button>
                }>
                {renderDocPill}
              </FilterOptions>
            </div>

            {/* Contribution row — hidden when no scenario in this run uses one. */}
            {extensionDocs.length > 0 && extensionDocIds.some((id) => presentDocIds.has(id)) && (
              <div className="filter-section filter-contributed-tags mb-1 w-full rounded-md px-3 py-1.5 filter-row" role="group" aria-label="Contributed concept filters">
                <span className="filter-label text-xs text-neutral-400 font-medium">meadow-extension:</span>
                <FilterOptions preferenceId="contributed-tags" options={extensionDocs} availableIds={availableDocIds} selectedIds={selectedDocIds}
                  allOption={
                    <button
                      className="filter-default text-neutral-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                      title="Clear contributed tag selections"
                      aria-pressed={selectedExtensionDocIds.length === 0}
                      onClick={() => setFilters({ docIds: [...selectedBaseDocIds, ...selectedDetailedDocIds] })}
                    >
                      All
                    </button>
                  }>
                  {renderDocPill}
                </FilterOptions>
              </div>
            )}

            {detailedDocs.length > 0 && <div className="filter-section mb-1 w-full rounded-md px-3 py-1.5">
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-medium text-neutral-600"
                aria-expanded={conceptsExpanded}
                aria-controls={conceptsPanelId}
                onClick={() => setConceptsExpanded(expanded => !expanded)}
              >
                <span aria-hidden="true">{conceptsExpanded ? '▾' : '▸'}</span>
                Concepts
                {selectedDetailedDocIds.length > 0 && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-brand-700">{selectedDetailedDocIds.length} selected</span>}
              </button>
              <div id={conceptsPanelId} hidden={!conceptsExpanded} className={conceptsExpanded ? 'filter-row mt-2' : 'hidden'} role="group" aria-label="Detailed concept filters">
                <span className="filter-label text-xs text-neutral-400 font-medium">Concepts:</span>
                <FilterOptions preferenceId="concepts" options={detailedDocs} availableIds={availableDocIds} selectedIds={selectedDocIds}
                  allOption={<button
                    className="filter-default text-neutral-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
                    aria-pressed={selectedDetailedDocIds.length === 0}
                    onClick={() => setFilters({ docIds: [...selectedBaseDocIds, ...selectedExtensionDocIds] })}
                  >All</button>}>
                  {renderDocPill}
                </FilterOptions>
              </div>
            </div>}

            <ConceptExplorer concept={selectedDocs.length === 1 ? selectedDocs[0] : null} selectedConceptIds={selectedDocIds}
              onSelectConcept={(id, add) => {
                const next = createSearchParams(searchParams)
                next.delete('doc')
                const ids = add ? [...new Set([...selectedDocIds, id])] : [id]
                ids.forEach(conceptId => next.append('doc', conceptId))
                setSearchParams(next)
              }} onSidebarWidth={setConceptSidebarWidth} />
          </div>
        )
      })()}

      {reviewMode === 'logs' ? <ReviewLog data={reviews.data} /> : <>
      {/* Tab bar */}
      <div className="flex flex-wrap items-center bg-neutral-100 border-b border-neutral-200 mb-4">
        <div className="flex">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              aria-pressed={displayedTab === tab}
              className={`px-4 py-1.5 text-xs font-bold cursor-pointer border-b-2 ${
                displayedTab === tab
                  ? 'text-brand-500 border-brand-500'
                  : 'text-neutral-500 border-transparent hover:text-neutral-700'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'thumbs' ? 'Thumbs' : tab === 'list' ? 'List' : tab === 'details' ? 'Details' : tab === 'videos' ? 'Videos' : 'Timing'}
            </button>
          ))}
        </div>
        {(displayedTab === 'thumbs' || displayedTab === 'videos' || (displayedTab === 'details' && hasBrowserScenarios)) && (
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

      {(displayedTab === 'videos' || displayedTab === 'details') && hasBrowserScenarios && (
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
      )}

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
                            {scenarioDisplayName(scenario.testName)}
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
                                alt={`${scenarioDisplayName(scenario.testName)} - ${docId}`}
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
                                {scenarioDisplayName(scenario.testName)}
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
                          title={scenarioDisplayName(scenario.testName)}
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
                                {scenarioDisplayName(scenario.testName)}
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

      {/* Details tab */}
      {displayedTab === 'details' && (
        <div className="space-y-6" style={{ '--detail-video-width': detailVideoWidth } as CSSProperties}>
          {sections.map(({ key, label, color, items: scenarios }) => (
            <div key={key}>
              <SectionHeader label={label} count={scenarios.length} color={color} />
              {scenarios.length === 0 ? (
                <p className="text-xs text-neutral-400 italic ml-1">None</p>
              ) : (
                <div className="space-y-3">
                  {scenarios.map(scenario => {
                    const name = scenarioDisplayName(scenario.testName)
                    return (
                      <article
                        key={scenario.slug}
                        aria-label={name}
                        className={`scenario-details-row grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 ${executionSurfacesFor(scenario).some(surface => surface !== 'cli') ? 'has-video' : ''}`}
                      >
                        {executionSurfacesFor(scenario).some(surface => surface !== 'cli') && (
                          <div className="scenario-details-preview">
                            <ScenarioPreviewVideo
                              key={`${runId}/${scenario.slug}`}
                              src={`/api/${runId}/${scenario.slug}/video.webm`}
                              poster={getKeyFrameUrl(scenario) ?? undefined}
                              name={name}
                              onRef={video => setVideoRef(scenario.slug, video)}
                            />
                          </div>
                        )}
                        <div className="min-w-0 text-sm">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2">
                              <StatusBadge status={scenario.status} hasIssues={scenario.hasIssues} />
                              {executionSurfacesFor(scenario).every(surface => surface === 'cli') && <span className="text-xs text-neutral-500">CLI</span>}
                              <Link to={`/${runId}/${scenario.slug}`} className="font-medium text-neutral-800 hover:text-brand-600 hover:underline">
                                {name}
                              </Link>
                              <CopyReferenceButton text={`E2E scenario ${scenario.slug}`} label="Copy scenario reference" />
                            </div>
                            <ScenarioReviewMenu runId={runId!} scenario={scenario} reviews={reviews.data} update={reviews.update} />
                            <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                              {scenario.duration == null ? '—' : `${scenario.duration.toFixed(1)}s`}
                            </span>
                          </div>
                          {findReview(reviews.data, scenario)?.note && <p className="mb-2 whitespace-pre-wrap break-words text-xs text-violet-800">Review note: {findReview(reviews.data, scenario)?.note}</p>}
                          {scenario.failureReason && <p className="mb-2 break-words text-xs text-red-600">{scenario.failureReason}</p>}
                          {scenario.description ? (
                            <p className="whitespace-pre-line break-words leading-relaxed text-neutral-700">{scenario.description}</p>
                          ) : (
                            <p className="italic text-neutral-400">No description captured in this run.</p>
                          )}
                          <dl aria-label="Scenario metadata" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
                            <ScenarioMetadataGroup label="Interface" accent="filter-interface"
                              options={EXECUTION_SURFACE_OPTIONS.filter(surface => executionSurfacesFor(scenario).includes(surface.id)).map(surface => ({ id: surface.id, name: surface.label }))}
                              availableIds={availableSurfaceIds} selectedIds={selectedExecutionSurfaces}
                              onChoose={(id, action) => { if (isExecutionSurface(id)) chooseMetadataFilter({ executionSurfaces: [id] }, action) }} />
                            <ScenarioMetadataGroup label="Areas" accent="filter-areas"
                              options={appAreas.filter(area => scenario.appAreaDocIds.includes(area.id)).map(area => ({ id: area.id, name: area.parentId === 'bundle' ? area.name.replace(/^Bundle /, '') : area.name }))}
                              availableIds={visibleAreaIds} selectedIds={selectedAreaIds}
                              onChoose={(id, action) => chooseMetadataFilter({ areaIds: [id] }, action)} />
                            <ScenarioMetadataGroup label="Bundles" accent="filter-bundles"
                              options={bundleDocs.filter(bundle => scenario.bundleDocIds.includes(bundle.id))}
                              availableIds={availableBundleIds} selectedIds={selectedBundleIds}
                              onChoose={(id, action) => chooseMetadataFilter({ bundleIds: [id] }, action)} />
                            <ScenarioMetadataGroup label="Starts with" accent="filter-starts-with"
                              options={BUNDLE_MODE_OPTIONS.filter(mode => mode.id === scenario.bundleMode).map(mode => ({ id: mode.id, name: mode.label }))}
                              availableIds={availableModeIds} selectedIds={selectedBundleModes}
                              onChoose={(id, action) => { if (isBundleMode(id)) chooseMetadataFilter({ bundleModes: [id] }, action) }} />
                            <ScenarioMetadataGroup label="Tags" accent="filter-tags"
                              options={docs.filter(doc => !doc.isContribution && scenario.conceptIds.includes(doc.id))}
                              availableIds={visibleFacetDocIds} selectedIds={selectedDocIds}
                              onChoose={(id, action) => chooseMetadataFilter({ docIds: [id] }, action)} />
                            <ScenarioMetadataGroup label="meadow-extension" accent="filter-contributed-tags"
                              options={docs.filter(doc => doc.isContribution && scenario.conceptIds.includes(doc.id))}
                              availableIds={visibleFacetDocIds} selectedIds={selectedDocIds}
                              onChoose={(id, action) => chooseMetadataFilter({ docIds: [id] }, action)} />
                          </dl>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
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
                        {scenarioDisplayName(scenario.testName)}
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
      </>}
    </div>
  )
}
