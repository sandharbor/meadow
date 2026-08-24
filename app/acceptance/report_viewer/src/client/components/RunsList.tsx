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

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { categorizeScenarios, StatusBadge } from './scenarioCategories.tsx'

interface RunScenario {
  slug: string
  status: string
  hasIssues: boolean
}

interface Run {
  runId: string
  scenarioCount: number
  status: string
  scenarios: RunScenario[]
  createdAt: string | null
  notes?: string
  totalDurationSeconds: number | null
}

export default function RunsList() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [archiveMode, setArchiveMode] = useState(false)
  const [archiving, setArchiving] = useState<string | null>(null)

  const fetchRuns = async (mounted = true) => {
    try {
      const res = await fetch('/api/runs')
      if (res.ok && mounted) {
        setRuns(await res.json())
      }
    } catch {
      // ignore
    } finally {
      if (mounted) setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    fetchRuns(mounted)
    const interval = setInterval(() => fetchRuns(mounted), 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const handleArchive = async (runId: string) => {
    setArchiving(runId)
    try {
      const res = await fetch(`/api/runs/${runId}/archive`, { method: 'POST' })
      if (res.ok) {
        await fetchRuns()
      }
    } catch {
      // ignore
    } finally {
      setArchiving(null)
    }
  }

  const handleArchiveAndBelow = async (runId: string) => {
    setArchiving(runId)
    try {
      const res = await fetch(`/api/runs/${runId}/archive-and-below`, { method: 'POST' })
      if (res.ok) {
        setArchiveMode(false)
        await fetchRuns()
      }
    } catch {
      // ignore
    } finally {
      setArchiving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Loading runs...
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        No test runs found in ~/meadow-e2e-artifacts/current/
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-neutral-800">Test Runs</h2>
        <button
          onClick={() => setArchiveMode(!archiveMode)}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            archiveMode
              ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200'
              : 'bg-neutral-100 border-neutral-200 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          {archiveMode ? 'Cancel' : 'Archive…'}
        </button>
      </div>
      <div className="space-y-2">
        {runs.map((run) => {
          const sections = categorizeScenarios(
            run.scenarios,
            (s) => s.status === 'failed',
            (s) => s.hasIssues,
          )
          return (
            <div key={run.runId} className="flex items-center gap-2">
              <Link
                to={`/${run.runId}`}
                className="flex-1 block bg-white border border-neutral-200 rounded-lg px-4 py-3 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={run.status} hasIssues={run.scenarios.some((s) => s.hasIssues)} />
                    <span className="font-mono text-sm font-medium text-neutral-800">
                      {run.runId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    {run.createdAt && <span>{timeAgo(run.createdAt)}</span>}
                    <span className="flex items-center gap-2">
                      {sections.map(({ key, color, items }) => (
                        <span key={key} className={`font-medium ${color}`}>
                          {items.length}
                        </span>
                      ))}
                    </span>
                    {run.totalDurationSeconds != null && (
                      <span className="text-neutral-400">{run.totalDurationSeconds}s</span>
                    )}
                  </div>
                </div>
                {run.notes && (
                  <p className="mt-1 text-xs text-neutral-500 truncate">{run.notes}</p>
                )}
              </Link>
              {archiveMode && (
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleArchive(run.runId)}
                    disabled={archiving !== null}
                    className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50"
                  >
                    {archiving === run.runId ? 'Archiving…' : 'Archive this'}
                  </button>
                  <button
                    onClick={() => handleArchiveAndBelow(run.runId)}
                    disabled={archiving !== null}
                    className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50"
                  >
                    {archiving === run.runId ? 'Archiving…' : 'Archive this & below'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-end gap-3 mt-2 text-[10px] text-neutral-400">
        <span className="text-red-700">Failing</span>
        <span className="text-yellow-700">Issues</span>
        <span className="text-green-700">Passing</span>
      </div>
    </div>
  )
}

function timeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}
