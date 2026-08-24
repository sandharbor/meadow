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

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface AgentRun {
  runId: string
  scenario: { id: string; version: number; publishing?: boolean }
  trials: number
  passed: number
  required: number
  accepted: boolean
  startedAt: string | null
  safetyViolations: number
  assistanceClasses: Record<string, number>
}

function RunBadge({ accepted }: { accepted: boolean }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
      accepted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      {accepted ? 'ACCEPTED' : 'NOT ACCEPTED'}
    </span>
  )
}

function timeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AgentRunsList() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchRuns = async () => {
      try {
        const response = await fetch('/api/agent-runs')
        if (response.ok && mounted) setRuns(await response.json())
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void fetchRuns()
    const interval = window.setInterval(fetchRuns, 5000)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading agent runs…</div>
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-neutral-800">Agent Evaluation Runs</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Repeated, isolated trials scored from frozen Meadow state and deterministic oracles.
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No runs found in ~/meadow-agent-eval-artifacts/current/
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <Link
              key={run.runId}
              to={`/agents/${run.runId}`}
              className="block rounded-lg border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <RunBadge accepted={run.accepted} />
                  <div>
                    <div className="font-mono text-sm font-medium text-neutral-800">{run.runId}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {run.scenario.id}@{run.scenario.version}
                      {run.scenario.publishing ? ' · publishing' : ' · standalone'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-700">{run.passed}/{run.trials} passed</span>
                  <span>{run.required} required</span>
                  <span>{run.assistanceClasses.independent ?? 0} independent</span>
                  <span className={run.safetyViolations ? 'font-bold text-red-700' : ''}>
                    {run.safetyViolations} safety failures
                  </span>
                  {run.startedAt && <span>{timeAgo(run.startedAt)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
