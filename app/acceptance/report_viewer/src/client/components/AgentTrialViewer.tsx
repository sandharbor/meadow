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

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface TrialEvent {
  id: string
  timestamp: string
  phase: string
  actor: string
  kind: string
  text: string
  scored: boolean
}

interface TrialCommand {
  id: string
  startedAt: string
  finishedAt: string
  args: string[]
  cwd: string
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
  phase: string
}

interface OracleAssertion {
  id: string
  passed: boolean
  summary: string
  expected?: unknown
  actual?: unknown
  safety: boolean
}

interface ArtifactFile {
  path: string
  category: string
  size: number
}

interface TrialDetail {
  manifest: {
    runId: string
    startedAt?: string
    finishedAt?: string
    terminationReason: string
    assistanceClass: string
    passed: boolean
    safetyViolation: boolean
    revisions?: Record<string, string>
    fixture?: { id?: string; sha256?: string }
    profiles?: {
      manager?: { adapter?: string; model?: string; reasoningEffort?: string }
      operator?: { adapter?: string; model?: string; reasoningEffort?: string }
    }
    adapterVersions?: Record<string, unknown>
  }
  trial: {
    events: TrialEvent[]
    commands: TrialCommand[]
  }
  oracle: OracleAssertion[]
  metrics: Record<string, unknown> | null
  assessment: { summary?: string; evidence?: { eventId: string; interpretation: string }[] } | null
  retrospective: string | null
  terminalTranscript: string | null
  managerTerminalTranscript: string | null
  artifactFiles: ArtifactFile[]
}

type TimelineItem =
  | { type: 'event'; timestamp: string; event: TrialEvent }
  | { type: 'command'; timestamp: string; command: TrialCommand }

function ResultBadge({ passed }: { passed: boolean }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
      passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      {passed ? 'PASS' : 'FAIL'}
    </span>
  )
}

function PhaseBadge({ scored, phase }: { scored: boolean; phase: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
      scored
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-violet-200 bg-violet-50 text-violet-700'
    }`}>
      {scored ? 'Scored' : 'Post-freeze'} · {phase}
    </span>
  )
}

function formatClock(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString([], { hour12: false })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return 'Not recorded'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function commandLine(args: string[]): string {
  return ['meadow', ...args].map((arg) => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')
}

function EvidenceFileBrowser({
  runId,
  trialId,
  files,
}: {
  runId: string
  trialId: string
  files: ArtifactFile[]
}) {
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? '')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!files.some((file) => file.path === selectedPath)) {
      setSelectedPath(files[0]?.path ?? '')
    }
  }, [files, selectedPath])

  useEffect(() => {
    if (!selectedPath) {
      setContent('')
      return
    }
    let mounted = true
    setLoading(true)
    const encodedPath = selectedPath.split('/').map(encodeURIComponent).join('/')
    fetch(`/api/agent-runs/${runId}/${trialId}/file/${encodedPath}`)
      .then(async (response) => response.ok ? response.text() : `Unable to load artifact (HTTP ${response.status}).`)
      .then((text) => {
        if (mounted) setContent(text)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [runId, selectedPath, trialId])

  if (files.length === 0) {
    return <div className="p-4 text-sm text-neutral-500">No files captured in this evidence group.</div>
  }

  return (
    <div className="grid min-h-[280px] grid-cols-[minmax(180px,0.28fr)_1fr]">
      <div className="border-r border-neutral-200 bg-neutral-50 p-2">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => setSelectedPath(file.path)}
            className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs ${
              selectedPath === file.path
                ? 'bg-brand-100 font-semibold text-brand-800'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <span className="block break-all font-mono">{file.path}</span>
            <span className="text-[10px] text-neutral-400">{formatBytes(file.size)}</span>
          </button>
        ))}
      </div>
      <pre className="m-0 max-h-[560px] overflow-auto whitespace-pre-wrap break-words bg-neutral-950 p-4 text-[11px] leading-5 text-neutral-100">
        {loading ? 'Loading…' : content}
      </pre>
    </div>
  )
}

export default function AgentTrialViewer() {
  const { runId = '', trialId = '' } = useParams<{ runId: string; trialId: string }>()
  const [data, setData] = useState<TrialDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [artifactGroup, setArtifactGroup] = useState('frozen-state')

  useEffect(() => {
    let mounted = true
    fetch(`/api/agent-runs/${runId}/${trialId}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (mounted) setData(result)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [runId, trialId])

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return []
    return [
      ...data.trial.events.map((event): TimelineItem => ({ type: 'event', timestamp: event.timestamp, event })),
      ...data.trial.commands.map((command): TimelineItem => ({ type: 'command', timestamp: command.startedAt, command })),
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [data])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading trial evidence…</div>
  }
  if (!data) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Agent trial not found.</div>
  }

  const failedOracles = data.oracle.filter((assertion) => !assertion.passed)
  const groups = [...new Set(data.artifactFiles.map((file) => file.category))]
  const preferredGroups = ['frozen-state', 'pre-task-state', 'generated-evidence', 'published-evidence', 'commands', 'trial']
  const sortedGroups = [...groups].sort((a, b) => {
    const aIndex = preferredGroups.indexOf(a)
    const bIndex = preferredGroups.indexOf(b)
    return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex) || a.localeCompare(b)
  })
  const selectedGroup = groups.includes(artifactGroup) ? artifactGroup : sortedGroups[0]
  const selectedFiles = data.artifactFiles.filter((file) => file.category === selectedGroup)

  return (
    <main className="h-full overflow-auto bg-neutral-50 p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ResultBadge passed={data.manifest.passed} />
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
                  {data.manifest.assistanceClass}
                </span>
                {data.manifest.safetyViolation && (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">SAFETY VIOLATION</span>
                )}
              </div>
              <h2 className="font-mono text-lg font-bold text-neutral-800">{trialId}</h2>
              <p className="mt-1 text-xs text-neutral-500">
                {data.manifest.terminationReason} · {data.trial.commands.length} commands · {data.oracle.length - failedOracles.length}/{data.oracle.length} oracles passed
              </p>
            </div>
            <Link to={`/agents/${runId}`} className="rounded border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
              Compare all trials
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-sm font-bold text-neutral-800">Chronological conversation and terminal evidence</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Commands are interleaved at their start time. Failed commands open automatically.</p>
          </div>
          <div className="space-y-3 p-4">
            {timeline.map((item) => {
              if (item.type === 'event') {
                const { event } = item
                return (
                  <article key={`event-${event.id}`} className={`rounded-lg border p-3 ${
                    event.scored ? 'border-blue-200 bg-blue-50/40' : 'border-violet-200 bg-violet-50/40'
                  }`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold capitalize text-neutral-800">{event.actor}</span>
                      <span className="text-[10px] text-neutral-400">{formatClock(event.timestamp)}</span>
                      <PhaseBadge scored={event.scored} phase={event.phase} />
                      <span className="text-[10px] uppercase text-neutral-400">{event.kind}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">{event.text}</div>
                  </article>
                )
              }

              const { command } = item
              const failed = command.exitCode !== 0
              return (
                <details key={`command-${command.id}`} open={failed} className={`rounded-lg border ${
                  failed ? 'border-red-300 bg-red-50/50' : 'border-neutral-200 bg-white'
                }`}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2">
                    <span className="text-[10px] text-neutral-400">{formatClock(command.startedAt)}</span>
                    <PhaseBadge scored={command.phase === 'autonomous'} phase={command.phase} />
                    <code className="min-w-0 flex-1 break-all text-xs font-semibold text-neutral-800">{commandLine(command.args)}</code>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${failed ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      Exit {command.exitCode ?? '—'}
                    </span>
                    <span className="text-[10px] text-neutral-400">{command.durationMs}ms</span>
                  </summary>
                  <div className="grid border-t border-neutral-200 lg:grid-cols-2">
                    <div className="min-w-0 border-b border-neutral-200 lg:border-b-0 lg:border-r">
                      <div className="bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase text-neutral-500">stdout</div>
                      <pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words bg-neutral-950 p-3 text-[11px] leading-5 text-neutral-100">{command.stdout || '(empty)'}</pre>
                    </div>
                    <div className="min-w-0">
                      <div className="bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase text-neutral-500">stderr</div>
                      <pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words bg-neutral-950 p-3 text-[11px] leading-5 text-neutral-100">{command.stderr || '(empty)'}</pre>
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-800">Deterministic oracle assertions</h3>
              <p className="mt-0.5 text-xs text-neutral-500">Expected and actual values come from the frozen scored state.</p>
            </div>
            <span className={`text-xs font-bold ${failedOracles.length ? 'text-red-700' : 'text-green-700'}`}>
              {failedOracles.length ? `${failedOracles.length} failed` : 'All passed'}
            </span>
          </div>
          <div className="divide-y divide-neutral-100">
            {data.oracle.map((assertion) => (
              <details key={assertion.id} open={!assertion.passed} className={assertion.passed ? '' : 'bg-red-50'}>
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3">
                  <ResultBadge passed={assertion.passed} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-semibold text-neutral-800">{assertion.id}</code>
                      {assertion.safety && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">SAFETY</span>}
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">{assertion.summary}</p>
                  </div>
                </summary>
                <div className="grid border-t border-neutral-100 lg:grid-cols-2">
                  <div className="min-w-0 border-b border-neutral-100 p-3 lg:border-b-0 lg:border-r">
                    <div className="mb-1 text-[10px] font-bold uppercase text-neutral-400">Expected</div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] text-neutral-700">{formatValue(assertion.expected)}</pre>
                  </div>
                  <div className="min-w-0 p-3">
                    <div className="mb-1 text-[10px] font-bold uppercase text-neutral-400">Actual</div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] text-neutral-700">{formatValue(assertion.actual)}</pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-sm font-bold text-neutral-800">Frozen state and portable evidence</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Inspect the scored snapshot, pre-task baseline, command records, and captured output.</p>
          </div>
          <div className="flex flex-wrap gap-1 border-b border-neutral-200 bg-neutral-50 px-3 py-2" role="tablist" aria-label="Evidence group">
            {sortedGroups.map((group) => (
              <button
                key={group}
                role="tab"
                aria-selected={selectedGroup === group}
                type="button"
                onClick={() => setArtifactGroup(group)}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  selectedGroup === group ? 'bg-neutral-800 text-white' : 'text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {group} ({data.artifactFiles.filter((file) => file.category === group).length})
              </button>
            ))}
          </div>
          <EvidenceFileBrowser key={selectedGroup} runId={runId} trialId={trialId} files={selectedFiles} />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-bold text-neutral-800">Operator retrospective</h3>
            <div className="whitespace-pre-wrap text-xs leading-5 text-neutral-700">{data.retrospective || 'No retrospective recorded.'}</div>
          </section>
          <section className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-bold text-neutral-800">Manager assessment</h3>
            <p className="text-xs leading-5 text-neutral-700">{data.assessment?.summary || 'No assessment recorded.'}</p>
            {data.assessment?.evidence && data.assessment.evidence.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                {data.assessment.evidence.map((evidence) => (
                  <li key={`${evidence.eventId}-${evidence.interpretation}`} className="text-xs text-neutral-600">
                    <code className="font-semibold text-brand-700">{evidence.eventId}</code>: {evidence.interpretation}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-lg border border-neutral-200 bg-white">
          <details>
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-neutral-800">Raw terminal transcripts</summary>
            <div className="grid border-t border-neutral-200 lg:grid-cols-2">
              <div className="min-w-0 border-b border-neutral-200 lg:border-b-0 lg:border-r">
                <div className="bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase text-neutral-500">Operator PTY</div>
                <pre className="m-0 max-h-[520px] overflow-auto whitespace-pre-wrap break-words bg-neutral-950 p-3 text-[11px] leading-5 text-neutral-100">{data.terminalTranscript || '(empty)'}</pre>
              </div>
              <div className="min-w-0">
                <div className="bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase text-neutral-500">Manager session</div>
                <pre className="m-0 max-h-[520px] overflow-auto whitespace-pre-wrap break-words bg-neutral-950 p-3 text-[11px] leading-5 text-neutral-100">{data.managerTerminalTranscript || '(empty)'}</pre>
              </div>
            </div>
          </details>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-neutral-800">Reproducibility manifest</h3>
          <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-neutral-400">Fixture</div><div className="break-all font-mono text-neutral-700">{data.manifest.fixture?.id ?? '—'}</div></div>
            <div><div className="text-neutral-400">Fixture hash</div><div className="break-all font-mono text-neutral-700">{data.manifest.fixture?.sha256 ?? '—'}</div></div>
            <div><div className="text-neutral-400">Started</div><div className="font-mono text-neutral-700">{data.manifest.startedAt ?? '—'}</div></div>
            <div><div className="text-neutral-400">Finished</div><div className="font-mono text-neutral-700">{data.manifest.finishedAt ?? '—'}</div></div>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto rounded bg-neutral-50 p-3 text-[11px] text-neutral-700">{formatValue({
            revisions: data.manifest.revisions,
            profiles: data.manifest.profiles,
            adapters: data.manifest.adapterVersions,
            metrics: data.metrics,
          })}</pre>
        </section>
      </div>
    </main>
  )
}
