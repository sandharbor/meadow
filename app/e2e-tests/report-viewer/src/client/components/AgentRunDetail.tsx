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
import { Link, useParams } from 'react-router-dom'

interface TrialSummary {
  trialId: string
  passed: boolean
  assistanceClass: string
  terminationReason: string
  elapsedMs: number
  manifest: {
    safetyViolation?: boolean
    startedAt?: string
    profiles?: {
      manager?: { model?: string; reasoningEffort?: string }
      operator?: { model?: string; reasoningEffort?: string }
    }
  } | null
  metrics: {
    commandsAttempted?: number
    failedCommands?: number
    helpInvocations?: number
    retries?: number
    coachingTurns?: number
    rescueTurns?: number
  } | null
  oracle: { total: number; passed: number; failed: number; safetyFailed: number }
}

interface RunDetailData {
  summary: {
    runId: string
    scenario: { id: string; version: number; publishing?: boolean }
    trials: number
    passed: number
    required: number
    accepted: boolean
  }
  trials: TrialSummary[]
}

function ResultBadge({ passed }: { passed: boolean }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
      passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      {passed ? 'PASS' : 'FAIL'}
    </span>
  )
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  return `${(ms / 1000).toFixed(1)}s`
}

export default function AgentRunDetail() {
  const { runId } = useParams<{ runId: string }>()
  const [data, setData] = useState<RunDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch(`/api/agent-runs/${runId}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (mounted) setData(result)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [runId])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading trials…</div>
  }
  if (!data) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Agent run not found.</div>
  }

  const firstProfile = data.trials.find((trial) => trial.manifest?.profiles)?.manifest?.profiles
  const safetyFailures = data.trials.filter((trial) => trial.manifest?.safetyViolation).length
  const interventions = data.trials.reduce(
    (total, trial) => total + (trial.metrics?.coachingTurns ?? 0) + (trial.metrics?.rescueTurns ?? 0),
    0,
  )

  return (
    <main className="h-full overflow-auto bg-neutral-50 p-6">
      <div className="mx-auto max-w-6xl">
        <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ResultBadge passed={data.summary.accepted} />
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Acceptance run
                </span>
              </div>
              <h2 className="font-mono text-lg font-bold text-neutral-800">{data.summary.runId}</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {data.summary.scenario.id}@{data.summary.scenario.version}
                {data.summary.scenario.publishing ? ' · publishing profile' : ' · standalone profile'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-neutral-400">Passed</div><div className="font-bold">{data.summary.passed}/{data.summary.trials}</div></div>
              <div><div className="text-xs text-neutral-400">Required</div><div className="font-bold">{data.summary.required}</div></div>
              <div><div className="text-xs text-neutral-400">Interventions</div><div className="font-bold">{interventions}</div></div>
              <div><div className="text-xs text-neutral-400">Safety failures</div><div className={`font-bold ${safetyFailures ? 'text-red-700' : ''}`}>{safetyFailures}</div></div>
            </div>
          </div>
          {firstProfile && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
              <span className="rounded bg-neutral-100 px-2 py-1">
                Manager: {firstProfile.manager?.model ?? 'unknown'} · {firstProfile.manager?.reasoningEffort ?? 'unknown'}
              </span>
              <span className="rounded bg-neutral-100 px-2 py-1">
                Operator: {firstProfile.operator?.model ?? 'unknown'} · {firstProfile.operator?.reasoningEffort ?? 'unknown'}
              </span>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-sm font-bold text-neutral-800">Repeated trial comparison</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Each row is a fresh isolated runtime and Meadow Home.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Trial</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                  <th className="px-3 py-2 font-semibold">Assistance</th>
                  <th className="px-3 py-2 font-semibold">Duration</th>
                  <th className="px-3 py-2 font-semibold">Commands</th>
                  <th className="px-3 py-2 font-semibold">Failed</th>
                  <th className="px-3 py-2 font-semibold">Help</th>
                  <th className="px-3 py-2 font-semibold">Retries</th>
                  <th className="px-3 py-2 font-semibold">Oracles</th>
                  <th className="px-3 py-2 font-semibold">Safety</th>
                </tr>
              </thead>
              <tbody>
                {data.trials.map((trial) => (
                  <tr key={trial.trialId} className="border-t border-neutral-100 hover:bg-brand-50">
                    <td className="px-4 py-3">
                      <Link className="font-mono font-semibold text-brand-600 hover:text-brand-800" to={`/agents/${runId}/${trial.trialId}`}>
                        {trial.trialId}
                      </Link>
                    </td>
                    <td className="px-3 py-3"><ResultBadge passed={trial.passed} /></td>
                    <td className="px-3 py-3 text-neutral-700">{trial.assistanceClass}</td>
                    <td className="px-3 py-3 text-neutral-700">{formatDuration(trial.elapsedMs)}</td>
                    <td className="px-3 py-3 text-neutral-700">{trial.metrics?.commandsAttempted ?? '—'}</td>
                    <td className={`px-3 py-3 ${(trial.metrics?.failedCommands ?? 0) > 0 ? 'font-bold text-red-700' : 'text-neutral-700'}`}>
                      {trial.metrics?.failedCommands ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{trial.metrics?.helpInvocations ?? '—'}</td>
                    <td className="px-3 py-3 text-neutral-700">{trial.metrics?.retries ?? '—'}</td>
                    <td className={`px-3 py-3 ${trial.oracle.failed ? 'font-bold text-red-700' : 'text-neutral-700'}`}>
                      {trial.oracle.passed}/{trial.oracle.total}
                    </td>
                    <td className={`px-3 py-3 ${trial.manifest?.safetyViolation ? 'font-bold text-red-700' : 'text-neutral-700'}`}>
                      {trial.manifest?.safetyViolation ? 'violation' : 'clear'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
