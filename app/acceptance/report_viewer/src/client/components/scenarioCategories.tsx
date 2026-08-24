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

export interface ScenarioSection<T> {
  key: string
  label: string
  color: string
  items: T[]
}

export const SECTION_DEFS = [
  { key: 'failing', label: 'Failing', color: 'text-red-700' },
  { key: 'passing-issues', label: 'Passing with Issues', color: 'text-yellow-700' },
  { key: 'passing', label: 'Passing', color: 'text-green-700' },
] as const

export const HIGHLIGHTED_SECTION_DEF = {
  key: 'highlighted',
  label: 'Highlighted',
  color: 'text-amber-700',
} as const

export function categorizeScenarios<T>(
  items: T[],
  isFailing: (item: T) => boolean,
  hasIssues: (item: T) => boolean,
  isHighlighted?: (item: T) => boolean,
): ScenarioSection<T>[] {
  const highlighted = isHighlighted ? items.filter((s) => isHighlighted(s)) : []
  const rest = isHighlighted ? items.filter((s) => !isHighlighted(s)) : items

  const failing = rest.filter((s) => isFailing(s))
  const passingWithIssues = rest.filter((s) => !isFailing(s) && hasIssues(s))
  const passing = rest.filter((s) => !isFailing(s) && !hasIssues(s))

  const standard: ScenarioSection<T>[] = SECTION_DEFS.map((def, i) => ({
    ...def,
    items: [failing, passingWithIssues, passing][i],
  }))

  if (highlighted.length > 0) {
    return [{ ...HIGHLIGHTED_SECTION_DEF, items: highlighted }, ...standard]
  }
  return standard
}

export function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`text-xs font-bold ${color}`}>{label}</span>
      <span className="text-xs text-neutral-400">({count})</span>
    </div>
  )
}

export function StatusBadge({ status, hasIssues }: { status: string; hasIssues?: boolean }) {
  if (status === 'passed') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800${hasIssues ? ' border-2 border-yellow-500' : ''}`}>
        PASS
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
        FAIL
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600">
      ???
    </span>
  )
}
