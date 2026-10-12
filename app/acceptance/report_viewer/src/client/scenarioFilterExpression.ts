/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/**
 * Scenario filter mixes for the run page. Each selected filter pill is a term
 * in a parenthesized set expression. The plain pill behavior (Any within a
 * row, All across rows) is one particular expression; a customized mix is
 * written to the URL in the text form produced by
 * `formatScenarioFilterExpression`, for example:
 *
 *   all(area:bundle/sourcing, area:bundle/review, any(sourcechange:rename))
 */

import {
  comparableFilterExpression,
  createFilterExpressionGroupId,
  filterExpressionTermId,
  type FilterExpression,
  type FilterExpressionGroup,
  type FilterExpressionOperator,
  type FilterExpressionTerm,
} from '../../../../contracts/types/shared/curation/filterExpression.ts'

/** Row keys, matching the plain URL parameter for each filter row. */
export const SCENARIO_FILTER_SECTIONS = ['surface', 'mode', 'area', 'subarea', 'sourcechange', 'doc', 'pressure', 'bundle'] as const
export type ScenarioFilterSection = typeof SCENARIO_FILTER_SECTIONS[number]
export type ScenarioFilterSelections = Record<ScenarioFilterSection, string[]>

export const SCENARIO_FILTER_SECTION_LABELS: Record<ScenarioFilterSection, string> = {
  surface: 'Interface',
  mode: 'Starts with',
  area: 'Area',
  subarea: 'Sub-area',
  sourcechange: 'Source change',
  doc: 'Concept',
  pressure: 'Design pressure',
  bundle: 'Bundle',
}

export const OPERATOR_KEYWORDS: Record<FilterExpressionOperator, string> = {
  union: 'any',
  intersection: 'all',
  difference: 'without',
}

/** Matches every scenario; useful as the first operand of a Without group. */
export const EVERYTHING_KEYWORD = 'everything'

const ROOT_GROUP_ID = 'scenario-filters'

export function emptyScenarioFilterSelections(): ScenarioFilterSelections {
  return { surface: [], mode: [], area: [], subarea: [], sourcechange: [], doc: [], pressure: [], bundle: [] }
}

const isSection = (value: string): value is ScenarioFilterSection => (SCENARIO_FILTER_SECTIONS as readonly string[]).includes(value)

export function scenarioFilterTerm(section: ScenarioFilterSection, value: string): FilterExpressionTerm {
  return { type: 'filter', filterId: `${section}:${value}`, mode: 'solo' }
}

export function scenarioFilterTermParts(term: FilterExpressionTerm): { section: ScenarioFilterSection; value: string } | null {
  const separator = term.filterId.indexOf(':')
  const section = term.filterId.slice(0, separator)
  return separator > 0 && isSection(section) ? { section, value: term.filterId.slice(separator + 1) } : null
}

function terms(expression: FilterExpression | null): FilterExpressionTerm[] {
  if (!expression || expression.type === 'all') return []
  if (expression.type === 'filter') return [expression]
  return expression.children.flatMap(terms)
}

/** The pills a mix uses, per row, in first-appearance order. */
export function scenarioFilterSelectionsOf(expression: FilterExpression | null): ScenarioFilterSelections {
  const selections = emptyScenarioFilterSelections()
  terms(expression).forEach(term => {
    const parts = scenarioFilterTermParts(term)
    if (parts && !selections[parts.section].includes(parts.value)) selections[parts.section].push(parts.value)
  })
  return selections
}

function sectionGroup(section: ScenarioFilterSection, values: string[], id: string): FilterExpressionGroup {
  return { type: 'group', id, operator: 'union', children: values.map(value => scenarioFilterTerm(section, value)) }
}

/** The plain pill behavior: every row with a selection must match one of its pills. */
export function defaultScenarioFilterExpression(selections: ScenarioFilterSelections): FilterExpression | null {
  const children = SCENARIO_FILTER_SECTIONS
    .filter(section => selections[section].length > 0)
    .map(section => sectionGroup(section, selections[section], `section-${section}`))
  return children.length > 0 ? { type: 'group', id: ROOT_GROUP_ID, operator: 'intersection', children } : null
}

function canonical(expression: FilterExpression | null): string | null {
  if (!expression) return null
  return comparableFilterExpression(expression, new Set(terms(expression).map(filterExpressionTermId)))
}

/** Whether a mix still means exactly what the plain pills for its terms mean. */
export function isDefaultScenarioFilterExpression(expression: FilterExpression | null): boolean {
  return canonical(expression) === canonical(defaultScenarioFilterExpression(scenarioFilterSelectionsOf(expression)))
}

function asRootGroup(expression: FilterExpression): FilterExpressionGroup {
  return expression.type === 'group' ? expression : { type: 'group', id: ROOT_GROUP_ID, operator: 'intersection', children: [expression] }
}

const isSectionGroup = (node: FilterExpression, section: ScenarioFilterSection) => node.type === 'group'
  && node.operator === 'union'
  && node.children.length > 0
  && node.children.every(child => child.type === 'filter' && scenarioFilterTermParts(child)?.section === section)

/**
 * Adds a pill to a mix the way the plain pills would: it joins its row's Any
 * group at the top of the mix when there is one, and otherwise narrows the
 * whole mix with a new Any group for that row.
 */
export function addScenarioFilterTerm(expression: FilterExpression | null, section: ScenarioFilterSection, value: string): FilterExpression {
  const term = scenarioFilterTerm(section, value)
  if (!expression) return defaultScenarioFilterExpression({ ...emptyScenarioFilterSelections(), [section]: [value] }) as FilterExpression
  if (terms(expression).some(existing => existing.filterId === term.filterId)) return expression

  const root = asRootGroup(expression)
  if (isSectionGroup(root, section)) return { ...root, children: [...root.children, term] }
  const rowIndex = root.children.findIndex(child => isSectionGroup(child, section))
  if (rowIndex >= 0) {
    const row = root.children[rowIndex] as FilterExpressionGroup
    return { ...root, children: root.children.map((child, index) => index === rowIndex ? { ...row, children: [...row.children, term] } : child) }
  }
  const row = sectionGroup(section, [value], createFilterExpressionGroupId(root, `section-${section}`))
  if (root.operator === 'intersection') return { ...root, children: [...root.children, row] }
  return { type: 'group', id: createFilterExpressionGroupId(root, ROOT_GROUP_ID), operator: 'intersection', children: [root, row] }
}

/**
 * Removes matching nodes. Parentheses emptied by the removal go too, while
 * parentheses that were already empty stay where they were placed. A mix
 * left with no pills at all is no filter.
 */
export function removeScenarioFilterNodes(
  expression: FilterExpression | null,
  shouldRemove: (node: FilterExpressionTerm | { type: 'all' }) => boolean,
): FilterExpression | null {
  if (!expression) return null
  const prune = (node: FilterExpression): FilterExpression | null => {
    if (node.type !== 'group') return shouldRemove(node) ? null : node
    const children = node.children.map(prune).filter((child): child is FilterExpression => child !== null)
    return children.length === 0 && node.children.length > 0 ? null : { ...node, children }
  }
  const pruned = prune(expression)
  return pruned && terms(pruned).length > 0 ? asRootGroup(pruned) : null
}

export function removeScenarioFilterTerms(
  expression: FilterExpression | null,
  shouldRemove: (section: ScenarioFilterSection, value: string) => boolean,
): FilterExpression | null {
  return removeScenarioFilterNodes(expression, node => {
    const parts = node.type === 'filter' ? scenarioFilterTermParts(node) : null
    return !!parts && shouldRemove(parts.section, parts.value)
  })
}

export function appendScenarioFilterNode(expression: FilterExpression, groupId: string, child: FilterExpression): FilterExpression {
  if (expression.type !== 'group') return expression
  if (expression.id === groupId) return { ...expression, children: [...expression.children, child] }
  return { ...expression, children: expression.children.map(node => appendScenarioFilterNode(node, groupId, child)) }
}

export function hasEverythingNode(expression: FilterExpression | null): boolean {
  if (!expression || expression.type === 'filter') return false
  return expression.type === 'all' || expression.children.some(hasEverythingNode)
}

/**
 * Evaluates one scenario against a mix with the same semantics as the graph
 * filter mix: empty parentheses are skipped, Without keeps its first operand
 * minus the rest, and an expression with nothing to evaluate matches all.
 */
export function scenarioMatchesFilterExpression(
  expression: FilterExpression | null,
  matchesTerm: (section: ScenarioFilterSection, value: string) => boolean,
): boolean {
  const evaluate = (node: FilterExpression): boolean | null => {
    if (node.type === 'all') return true
    if (node.type === 'filter') {
      const parts = scenarioFilterTermParts(node)
      return parts ? matchesTerm(parts.section, parts.value) : false
    }
    const results = node.children.map(evaluate).filter((result): result is boolean => result !== null)
    if (results.length === 0) return null
    if (node.operator === 'union') return results.some(Boolean)
    if (node.operator === 'intersection') return results.every(Boolean)
    return results[0] && !results.slice(1).some(Boolean)
  }
  return expression ? evaluate(expression) ?? true : true
}

const BARE_VALUE = /^[^\s,()"]+$/

export function formatScenarioFilterExpression(expression: FilterExpression): string {
  if (expression.type === 'all') return EVERYTHING_KEYWORD
  if (expression.type === 'filter') {
    const parts = scenarioFilterTermParts(expression)
    if (!parts) return JSON.stringify(expression.filterId)
    return `${parts.section}:${BARE_VALUE.test(parts.value) ? parts.value : JSON.stringify(parts.value)}`
  }
  return `${OPERATOR_KEYWORDS[expression.operator]}(${expression.children.map(formatScenarioFilterExpression).join(', ')})`
}

export type ScenarioFilterParseResult = { expression: FilterExpression; error?: undefined } | { expression?: undefined; error: string }

/**
 * Reads the text form back into a mix. Enumerated rows can pass their
 * allowed values so a mistyped value is reported instead of matching nothing.
 */
export function parseScenarioFilterExpression(
  text: string,
  allowedValues: Partial<Record<ScenarioFilterSection, readonly string[]>> = {},
): ScenarioFilterParseResult {
  let position = 0
  let groupCount = 0
  const fail = (message: string): never => { throw new Error(`${message} at character ${position + 1}.`) }
  const skipSpace = () => { while (position < text.length && /\s/.test(text[position])) position += 1 }
  const expect = (char: string) => {
    skipSpace()
    if (text[position] !== char) fail(`Expected "${char}"`)
    position += 1
  }
  const readWord = () => {
    const match = /^[A-Za-z][A-Za-z-]*/.exec(text.slice(position))
    if (!match) fail('Expected any(…), all(…), without(…), everything, or section:value')
    position += match![0].length
    return match![0]
  }
  const readValue = (): string => {
    if (text[position] === '"') {
      const match = /^"(?:[^"\\]|\\.)*"/.exec(text.slice(position))
      if (!match) fail('Unterminated quoted value')
      position += match![0].length
      return JSON.parse(match![0]) as string
    }
    const match = /^[^\s,()"]+/.exec(text.slice(position))
    if (!match) fail('Expected a value after ":"')
    position += match![0].length
    return match![0]
  }

  const parseNode = (): FilterExpression => {
    skipSpace()
    const start = position
    const word = readWord()
    const operator = (Object.keys(OPERATOR_KEYWORDS) as FilterExpressionOperator[]).find(key => OPERATOR_KEYWORDS[key] === word.toLowerCase())
    if (operator) {
      expect('(')
      groupCount += 1
      const group: FilterExpressionGroup = { type: 'group', id: `group-${groupCount}`, operator, children: [] }
      skipSpace()
      if (text[position] === ')') { position += 1; return group }
      for (;;) {
        group.children.push(parseNode())
        skipSpace()
        if (text[position] === ',') { position += 1; continue }
        expect(')')
        return group
      }
    }
    if (word.toLowerCase() === EVERYTHING_KEYWORD) return { type: 'all' }
    if (text[position] !== ':') {
      position = start
      fail(`"${word}" is not any, all, without, or everything; filters are written section:value`)
    }
    if (!isSection(word)) {
      position = start
      fail(`Unknown filter section "${word}"; use one of ${SCENARIO_FILTER_SECTIONS.join(', ')}`)
    }
    const section = word as ScenarioFilterSection
    position += 1
    const valueStart = position
    const value = readValue()
    const allowed = allowedValues[section]
    if (allowed && !allowed.includes(value)) {
      position = valueStart
      fail(`Unknown ${section} "${value}"; use one of ${allowed.join(', ')}`)
    }
    return scenarioFilterTerm(section, value)
  }

  try {
    const expression = parseNode()
    skipSpace()
    if (position < text.length) fail('Unexpected text after the expression')
    return { expression: asRootGroup(expression) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
