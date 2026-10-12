/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { Fragment, useEffect, useId, useState } from 'react'
import {
  appendFilterExpressionGroup,
  createFilterExpressionGroupId,
  filterExpressionNodeId,
  moveFilterExpressionNode,
  moveFilterExpressionNodeOnto,
  setFilterExpressionOperator,
  ungroupFilterExpression,
  type FilterExpression,
  type FilterExpressionGroup,
  type FilterExpressionOperator,
} from '../../../../../contracts/types/shared/curation/filterExpression.ts'
import {
  appendScenarioFilterNode,
  formatScenarioFilterExpression,
  hasEverythingNode,
  parseScenarioFilterExpression,
  removeScenarioFilterNodes,
  scenarioFilterSelectionsOf,
  scenarioFilterTermParts,
  type ScenarioFilterSection,
} from '../scenarioFilterExpression.ts'

const OPERATOR_OPTIONS: { value: FilterExpressionOperator; label: string; connector: string; title: string }[] = [
  { value: 'union', label: 'Any', connector: 'OR', title: 'Scenarios matching any of these' },
  { value: 'intersection', label: 'All', connector: 'AND', title: 'Scenarios matching all of these' },
  { value: 'difference', label: 'Without', connector: 'WITHOUT', title: 'Scenarios matching the first of these but none of the rest' },
]

const OPEN_STORAGE_KEY = 'e2e-report-viewer.filter-mix-open'

interface TreeProps {
  expression: FilterExpression
  rootId: string
  termLabel: (section: ScenarioFilterSection, value: string) => string
  groupNumbers: ReadonlyMap<string, number>
  draggedNodeId: string | null
  setDraggedNodeId: (nodeId: string | null) => void
  onChange: (expression: FilterExpression | null) => void
}

function nodeLabel(node: FilterExpression, termLabel: TreeProps['termLabel']): string {
  if (node.type === 'all') return 'Everything'
  if (node.type === 'group') return 'parentheses'
  const parts = scenarioFilterTermParts(node)
  return parts ? termLabel(parts.section, parts.value) : node.filterId
}

function numberGroups(expression: FilterExpression, numbers = new Map<string, number>()): Map<string, number> {
  if (expression.type !== 'group') return numbers
  numbers.set(expression.id, numbers.size)
  expression.children.forEach(child => numberGroups(child, numbers))
  return numbers
}

function DropLine({ groupId, index, draggedNodeId, onMove }: {
  groupId: string
  index: number
  draggedNodeId: string | null
  onMove: (nodeId: string, groupId: string, index: number) => void
}) {
  return (
    <div
      className={`h-2 rounded transition-colors ${draggedNodeId ? 'hover:bg-brand-200' : ''}`}
      onDragOver={event => event.preventDefault()}
      onPointerUp={event => {
        if (!draggedNodeId) return
        event.preventDefault()
        event.stopPropagation()
        onMove(draggedNodeId, groupId, index)
      }}
      onDrop={event => {
        event.preventDefault()
        event.stopPropagation()
        const nodeId = draggedNodeId || event.dataTransfer.getData('text/plain')
        if (nodeId) onMove(nodeId, groupId, index)
      }}
    />
  )
}

function LeafCard({ node, tree }: { node: Exclude<FilterExpression, FilterExpressionGroup>; tree: TreeProps }) {
  const nodeId = filterExpressionNodeId(node)
  const label = nodeLabel(node, tree.termLabel)
  return (
    <div
      onPointerDown={event => {
        if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
        event.preventDefault()
        tree.setDraggedNodeId(nodeId)
      }}
      className={`flex cursor-grab items-center gap-2 rounded-md border bg-white px-2 py-1.5 shadow-sm active:cursor-grabbing ${
        tree.draggedNodeId === nodeId ? 'border-brand-400 opacity-50' : 'border-neutral-200'
      } ${node.type === 'all' ? 'border-dashed' : ''}`}
      data-testid={nodeId}
    >
      <span className="select-none px-1 text-neutral-400" aria-hidden="true">⠿</span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700">{label}</span>
      <button
        type="button"
        className="rounded px-1 text-sm leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        aria-label={`Remove ${label}`}
        onClick={() => tree.onChange(removeScenarioFilterNodes(tree.expression, candidate => filterExpressionNodeId(candidate) === nodeId))}
      >
        ×
      </button>
    </div>
  )
}

function GroupNode({ node, tree }: { node: FilterExpressionGroup; tree: TreeProps }) {
  const { expression, draggedNodeId, setDraggedNodeId, onChange } = tree
  const isRoot = node.id === tree.rootId
  const connector = OPERATOR_OPTIONS.find(option => option.value === node.operator)?.connector
  const label = isRoot ? 'Whole mix' : `Parentheses ${tree.groupNumbers.get(node.id)}`
  const move = (nodeId: string, groupId: string, index: number) => {
    onChange(moveFilterExpressionNode(expression, nodeId, groupId, index))
    setDraggedNodeId(null)
  }
  const moveOnto = (nodeId: string, targetNodeId: string) => {
    onChange(moveFilterExpressionNodeOnto(expression, nodeId, targetNodeId))
    setDraggedNodeId(null)
  }

  return (
    <div role="group" aria-label={label} data-testid={node.id}
      className={`rounded-lg border-2 border-neutral-200 p-2 ${isRoot ? 'bg-neutral-50' : 'bg-white/70 shadow-sm'}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {!isRoot && (
          <span
            draggable
            onDragStart={event => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', node.id)
              setDraggedNodeId(node.id)
            }}
            onDragEnd={event => {
              event.stopPropagation()
              setDraggedNodeId(null)
            }}
            className="cursor-grab select-none px-1 text-neutral-400 active:cursor-grabbing"
            title="Drag these parentheses"
            aria-hidden="true"
          >
            ⠿
          </span>
        )}
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-300 bg-white" role="group" aria-label={`How ${label.toLowerCase()} combines`}>
          {OPERATOR_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              title={option.title}
              onClick={() => onChange(setFilterExpressionOperator(expression, node.id, option.value))}
              className={`px-2 py-0.5 text-xs font-medium ${index > 0 ? 'border-l border-neutral-300' : ''} ${
                node.operator === option.value ? 'bg-brand-100 text-brand-700' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
              }`}
              aria-pressed={node.operator === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!isRoot && (
          <button type="button" className="ml-auto text-xs text-neutral-400 hover:text-neutral-700" title="Remove these parentheses, keeping what is inside"
            onClick={() => onChange(ungroupFilterExpression(expression, node.id))}>
            Ungroup
          </button>
        )}
      </div>

      <DropLine groupId={node.id} index={0} draggedNodeId={draggedNodeId} onMove={move} />
      {node.children.map((child, index) => {
        const childId = filterExpressionNodeId(child)
        return <Fragment key={childId}>
          {index > 0 && (
            <div className="my-0.5 flex items-center gap-2 text-[10px] font-bold tracking-widest text-neutral-400">
              <span className="h-px flex-1 bg-neutral-200" />
              {connector}
              <span className="h-px flex-1 bg-neutral-200" />
            </div>
          )}
          <div
            className={draggedNodeId && draggedNodeId !== childId ? 'rounded-md hover:ring-2 hover:ring-brand-200' : ''}
            onDragOver={event => event.preventDefault()}
            onPointerUp={event => {
              if (!draggedNodeId) return
              event.preventDefault()
              event.stopPropagation()
              moveOnto(draggedNodeId, childId)
            }}
            onDrop={event => {
              event.preventDefault()
              event.stopPropagation()
              const nodeId = draggedNodeId || event.dataTransfer.getData('text/plain')
              if (nodeId) moveOnto(nodeId, childId)
            }}
          >
            {child.type === 'group' ? <GroupNode node={child} tree={tree} /> : <LeafCard node={child} tree={tree} />}
          </div>
          <DropLine groupId={node.id} index={index + 1} draggedNodeId={draggedNodeId} onMove={move} />
        </Fragment>
      })}
      {node.children.length === 0 && (
        <div
          className="rounded-md border border-dashed border-neutral-300 px-3 py-3 text-center text-xs text-neutral-400"
          onDragOver={event => event.preventDefault()}
          onPointerUp={event => {
            if (!draggedNodeId) return
            event.preventDefault()
            event.stopPropagation()
            move(draggedNodeId, node.id, 0)
          }}
          onDrop={event => {
            event.preventDefault()
            event.stopPropagation()
            const nodeId = draggedNodeId || event.dataTransfer.getData('text/plain')
            if (nodeId) move(nodeId, node.id, 0)
          }}
        >
          Drop filters here
        </div>
      )}

      <div className="mt-1 flex gap-3">
        <button type="button" className="text-xs font-medium text-neutral-500 hover:text-brand-700"
          onClick={() => onChange(appendFilterExpressionGroup(expression, node.id, createFilterExpressionGroupId(expression)))}>
          + Add parentheses
        </button>
        {node.operator === 'difference' && !hasEverythingNode(expression) && (
          <button type="button" className="text-xs font-medium text-neutral-500 hover:text-brand-700" title="Start from every scenario, then take away the rest"
            onClick={() => onChange(moveFilterExpressionNode(appendScenarioFilterNode(expression, node.id, { type: 'all' }), filterExpressionNodeId({ type: 'all' }), node.id, 0))}>
            + Everything
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Shows the active filter pills as a parenthesized mix that can be
 * regrouped by dragging, recombined per group, or edited as text.
 */
export function FilterMixPanel({ expression, customized, urlText, urlError, termLabel, allowedValues, onChange, onReset }: {
  /** The mix in effect, customized or not; null when no filters are selected. */
  expression: FilterExpression | null
  customized: boolean
  /** Text from a link whose mix could not be read. */
  urlText: string | null
  urlError: string | null
  termLabel: (section: ScenarioFilterSection, value: string) => string
  allowedValues: Partial<Record<ScenarioFilterSection, readonly string[]>>
  onChange: (expression: FilterExpression | null) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(() => {
    try { return window.localStorage.getItem(OPEN_STORAGE_KEY) === 'true' }
    catch { return false }
  })
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const formatted = expression ? formatScenarioFilterExpression(expression) : ''
  const [draft, setDraft] = useState(urlText ?? formatted)
  const [draftError, setDraftError] = useState<string | null>(null)
  const panelId = useId()
  const textId = useId()

  useEffect(() => {
    setDraft(urlText ?? formatted)
    setDraftError(null)
  }, [formatted, urlText])

  useEffect(() => {
    const stopPointerDrag = () => setDraggedNodeId(null)
    window.addEventListener('pointerup', stopPointerDrag)
    window.addEventListener('pointercancel', stopPointerDrag)
    window.addEventListener('blur', stopPointerDrag)
    return () => {
      window.removeEventListener('pointerup', stopPointerDrag)
      window.removeEventListener('pointercancel', stopPointerDrag)
      window.removeEventListener('blur', stopPointerDrag)
    }
  }, [])

  const shown = open || !!urlError
  const toggle = () => {
    const next = !shown
    setOpen(next)
    try { window.localStorage.setItem(OPEN_STORAGE_KEY, String(next)) }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }
  const apply = () => {
    if (!draft.trim()) {
      onChange(null)
      return
    }
    const result = parseScenarioFilterExpression(draft, allowedValues)
    if (result.error !== undefined) setDraftError(result.error)
    else onChange(result.expression)
  }
  const pillCount = Object.values(scenarioFilterSelectionsOf(expression)).reduce((count, values) => count + values.length, 0)

  return (
    <section aria-label="Filter mix" className="mb-1 w-full rounded-md bg-neutral-50 px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${
            customized ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100'
          }`}
          aria-expanded={shown}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span aria-hidden="true">{shown ? '▾' : '▸'}</span>
          Mix filters
          {customized && <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-900">Customized</span>}
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">{pillCount}</span>
        </button>
        {!shown && expression && <code className="min-w-0 truncate text-xs text-neutral-500" title={formatted}>{formatted}</code>}
        {customized && <button type="button" className="text-xs text-neutral-500 hover:text-neutral-800"
          title="Go back to Any within each row and All across rows" onClick={onReset}>Reset mix</button>}
      </div>
      {urlError && <p role="alert" className="mt-1 text-xs text-red-700">This link&apos;s filter mix could not be read, so no filters are applied: {urlError}</p>}
      <div id={panelId} hidden={!shown} className="mt-2 space-y-2">
        <form className="flex flex-wrap items-start gap-2" onSubmit={event => { event.preventDefault(); apply() }}>
          <label htmlFor={textId} className="py-1 text-xs font-medium text-neutral-500">Expression</label>
          <input
            id={textId}
            value={draft}
            onChange={event => { setDraft(event.target.value); setDraftError(null) }}
            spellCheck={false}
            placeholder="all(area:bundle/sourcing, area:bundle/review, any(sourcechange:rename))"
            aria-invalid={!!draftError}
            aria-describedby={draftError ? `${textId}-error` : undefined}
            className="min-w-[20rem] flex-1 rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs text-neutral-700"
          />
          <button type="submit" disabled={draft === formatted && !urlText}
            className="rounded bg-neutral-800 px-3 py-1 text-xs font-medium text-white enabled:hover:bg-neutral-700 disabled:opacity-40">Apply</button>
          {draftError && <p id={`${textId}-error`} role="alert" className="basis-full text-xs text-red-700">{draftError}</p>}
        </form>
        {expression && expression.type === 'group'
          ? <GroupNode node={expression} tree={{
            expression, rootId: expression.id, termLabel, groupNumbers: numberGroups(expression), draggedNodeId, setDraggedNodeId, onChange,
          }} />
          : <p className="text-xs text-neutral-500">Select filter pills above, or type an expression, to build a mix.</p>}
        <p className="text-xs text-neutral-400">
          Each outline works like parentheses: drag pills between them and choose how each one combines.
          Pills clicked above join their row&apos;s Any group, or narrow the whole mix.
        </p>
      </div>
    </section>
  )
}
