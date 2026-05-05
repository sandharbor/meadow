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
import { HealthSummary } from '../helpers.ts'
import HealthGraph from './HealthGraph.tsx'
import { categorizeScenarios, SectionHeader, StatusBadge } from './scenarioCategories.tsx'

interface ScenarioDoc {
  id: string
  name: string
  description: string
  isMeadowExtension?: boolean
}

interface SiteDoc {
  id: string
  name: string
  description: string
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
  scenarioDocIds: string[]
  siteDocIds: string[]
  failureReason?: string
  keyFrames: KeyFrame[]
  hasIssues: boolean
}

interface RunData {
  runId: string
  scenarios: Scenario[]
  targetedScenarioIds?: string[]
  highlightedTestBasenames?: string[]
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<RunData | null>(null)
  const [healthMap, setHealthMap] = useState<Record<string, HealthSummary>>({})
  const [docs, setDocs] = useState<ScenarioDoc[]>([])
  const [siteDocs, setSiteDocs] = useState<SiteDoc[]>([])
  const [notes, setNotes] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'thumbs' | 'list' | 'videos' | 'timing'>('thumbs')
  const [mediaSize, setMediaSize] = useState<0 | 1 | 2 | 3>(0)
  const [playSpeed, setPlaySpeed] = useState(100)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  const selectedDocIds = searchParams.getAll('doc')
  const selectedDocs = docs.filter((d) => selectedDocIds.includes(d.id))
  const selectedSiteIds = searchParams.getAll('site')
  const selectedSites = siteDocs.filter((d) => selectedSiteIds.includes(d.id))

  // Track which scenario doc IDs appear in this run's data
  const presentDocIds = new Set(
    (data?.scenarios ?? []).flatMap((s) => s.scenarioDocIds)
  )
  const isPartialRun = docs.length > 0 && presentDocIds.size < docs.length
  const targetedDocIds = new Set(data?.targetedScenarioIds ?? [])
  const highlightedBasenames = new Set(data?.highlightedTestBasenames ?? [])
  const highlightedDocIds = new Set(
    (data?.scenarios ?? [])
      .filter((s) => s.testBasename && highlightedBasenames.has(s.testBasename))
      .flatMap((s) => s.scenarioDocIds)
  )

  const setVideoRef = useCallback((slug: string, el: HTMLVideoElement | null) => {
    if (el) {
      el.playbackRate = playSpeed / 100
      videoRefs.current.set(slug, el)
    } else {
      videoRefs.current.delete(slug)
    }
  }, [playSpeed])

  const playAll = useCallback(() => {
    const rate = playSpeed / 100
    videoRefs.current.forEach((video) => {
      video.playbackRate = rate
      video.currentTime = 0
      video.play()
    })
  }, [playSpeed])

  // Sync playback rate to all mounted videos when speed changes
  useEffect(() => {
    const rate = playSpeed / 100
    videoRefs.current.forEach((video) => {
      video.playbackRate = rate
    })
  }, [playSpeed])

  useEffect(() => {
    fetch('/api/scenario-docs')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setDocs([...d].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
    fetch('/api/site-docs')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setSiteDocs(d))
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

  const docFiltered = selectedDocs.length > 0
    ? sortedScenarios.filter((s) =>
        selectedDocs.some((doc) => s.scenarioDocIds.includes(doc.id))
      )
    : sortedScenarios

  const filteredScenarios = selectedSites.length > 0
    ? docFiltered.filter((s) =>
        selectedSites.some((site) => s.siteDocIds.includes(site.id))
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

      {/* Doc filter chips — two rows: base, then meadow-extension */}
      {docs.length > 0 && (() => {
        const baseDocs = docs.filter((d) => !d.isMeadowExtension)
        const extensionDocs = docs.filter((d) => d.isMeadowExtension)
        const extensionDocIds = extensionDocs.map((d) => d.id)
        const allExtensionSelected = extensionDocIds.length > 0 && extensionDocIds.every((id) => selectedDocIds.includes(id))

        const renderDocPill = (doc: ScenarioDoc) => {
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
              title={doc.isMeadowExtension ? 'Meadow Extension scenario' : undefined}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-brand-500 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }${highlight}`}
              onClick={() => {
                const nextDocs = isSelected
                  ? selectedDocIds.filter((id) => id !== doc.id)
                  : [...selectedDocIds, doc.id]
                setSearchParams([
                  ...nextDocs.map((id): [string, string] => ['doc', id]),
                  ...selectedSiteIds.map((id): [string, string] => ['site', id]),
                ])
              }}
            >
              {doc.isMeadowExtension && <span className="mr-1" aria-hidden>☁</span>}
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
                onClick={() => setSearchParams(selectedSiteIds.map((id): [string, string] => ['site', id]))}
              >
                All
              </button>
              {baseDocs.map(renderDocPill)}
            </div>

            {/* Meadow-extension row — hidden when no scenario in this run uses an extension doc. */}
            {extensionDocs.length > 0 && extensionDocIds.some((id) => presentDocIds.has(id)) && (
              <div className="flex flex-wrap gap-1.5 items-center mt-1.5">
                <span className="text-xs text-neutral-400 font-medium mr-1">meadow-extension:</span>
                <button
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    allExtensionSelected
                      ? 'bg-brand-500 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                  title="Select all Meadow Extension scenarios"
                  onClick={() => {
                    setSearchParams([
                      ...extensionDocIds.map((id): [string, string] => ['doc', id]),
                      ...selectedSiteIds.map((id): [string, string] => ['site', id]),
                    ])
                  }}
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

      {/* Site filter chips */}
      {siteDocs.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-neutral-400 font-medium mr-1">Sites:</span>
            {siteDocs.map((site) => {
              const isSelected = selectedSiteIds.includes(site.id)
              return (
                <button
                  key={site.id}
                  className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-500 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                  onClick={() => {
                    const nextSites = isSelected
                      ? selectedSiteIds.filter((id) => id !== site.id)
                      : [...selectedSiteIds, site.id]
                    const nextParams = [
                      ...selectedDocIds.map((id): [string, string] => ['doc', id]),
                      ...nextSites.map((id): [string, string] => ['site', id]),
                    ]
                    setSearchParams(nextParams)
                  }}
                >
                  {site.name}
                </button>
              )
            })}
          </div>
          {selectedSites.length === 1 && (
            <p className="mt-2 text-xs text-neutral-500">{selectedSites[0].description}</p>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center bg-neutral-100 border-b border-neutral-200 mb-4">
        <div className="flex">
          {(['thumbs', 'list', 'videos', 'timing'] as const).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-1.5 text-xs font-bold cursor-pointer border-b-2 ${
                activeTab === tab
                  ? 'text-brand-500 border-brand-500'
                  : 'text-neutral-500 border-transparent hover:text-neutral-700'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'thumbs' ? 'Thumbs' : tab === 'list' ? 'List' : tab === 'videos' ? 'Videos' : 'Timing'}
            </button>
          ))}
        </div>
        {(activeTab === 'thumbs' || activeTab === 'videos') && (
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
      {activeTab === 'thumbs' && (
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
                                key={docId}
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
      {activeTab === 'list' && (
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
      {activeTab === 'videos' && (
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
                min="0"
                max="100"
                value={playSpeed}
                onChange={(e) => setPlaySpeed(Number(e.target.value))}
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
      {activeTab === 'timing' && (() => {
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
