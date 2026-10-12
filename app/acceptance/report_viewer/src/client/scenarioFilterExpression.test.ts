/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest'
import {
  addScenarioFilterTerm,
  defaultScenarioFilterExpression,
  emptyScenarioFilterSelections,
  formatScenarioFilterExpression,
  isDefaultScenarioFilterExpression,
  parseScenarioFilterExpression,
  removeScenarioFilterTerms,
  scenarioFilterSelectionsOf,
  scenarioMatchesFilterExpression,
  type ScenarioFilterSection,
} from './scenarioFilterExpression.ts'
import type { FilterExpression } from '../../../../contracts/types/filterExpression.ts'

const parse = (text: string): FilterExpression => {
  const result = parseScenarioFilterExpression(text)
  if (result.error !== undefined) throw new Error(result.error)
  return result.expression
}

const scenario = (values: Partial<Record<ScenarioFilterSection, string[]>>) =>
  (section: ScenarioFilterSection, value: string) => values[section]?.includes(value) ?? false

const renamedSourcingReview = scenario({ area: ['bundle/sourcing', 'bundle/review'], sourcechange: ['rename'] })
const renamedSourcingOnly = scenario({ area: ['bundle/sourcing'], sourcechange: ['rename'] })
const reviewOnly = scenario({ area: ['bundle/review'] })

describe('scenario filter mixes', () => {
  it('builds the plain pill behavior as Any within a row and All across rows', () => {
    const expression = defaultScenarioFilterExpression({
      ...emptyScenarioFilterSelections(), area: ['bundle/sourcing', 'bundle/review'], sourcechange: ['rename'],
    })
    expect(formatScenarioFilterExpression(expression!)).toBe('all(any(area:bundle/sourcing, area:bundle/review), any(sourcechange:rename))')
    expect(scenarioMatchesFilterExpression(expression, reviewOnly)).toBe(false)
    expect(scenarioMatchesFilterExpression(expression, renamedSourcingOnly)).toBe(true)
    expect(defaultScenarioFilterExpression(emptyScenarioFilterSelections())).toBeNull()
  })

  it('can require every pill within a row', () => {
    const expression = parse('all(area:bundle/sourcing, area:bundle/review, sourcechange:rename)')
    expect(scenarioMatchesFilterExpression(expression, renamedSourcingReview)).toBe(true)
    expect(scenarioMatchesFilterExpression(expression, renamedSourcingOnly)).toBe(false)
    expect(isDefaultScenarioFilterExpression(expression)).toBe(false)
  })

  it('evaluates nested parentheses, Without, and everything', () => {
    const expression = parse('any(all(area:bundle/sourcing, sourcechange:rename), without(area:bundle/review, area:bundle/sourcing))')
    expect(scenarioMatchesFilterExpression(expression, renamedSourcingOnly)).toBe(true)
    expect(scenarioMatchesFilterExpression(expression, reviewOnly)).toBe(true)
    expect(scenarioMatchesFilterExpression(expression, renamedSourcingReview)).toBe(true)
    expect(scenarioMatchesFilterExpression(expression, scenario({ area: ['bundle/sourcing'] }))).toBe(false)

    const exceptReview = parse('without(everything, area:bundle/review)')
    expect(scenarioMatchesFilterExpression(exceptReview, reviewOnly)).toBe(false)
    expect(scenarioMatchesFilterExpression(exceptReview, renamedSourcingOnly)).toBe(true)
  })

  it('skips empty parentheses and matches everything without filters', () => {
    expect(scenarioMatchesFilterExpression(parse('all(area:bundle/review, any())'), reviewOnly)).toBe(true)
    expect(scenarioMatchesFilterExpression(null, reviewOnly)).toBe(true)
  })

  it('recognizes mixes that still mean the plain pills, regardless of order or single-pill parentheses', () => {
    expect(isDefaultScenarioFilterExpression(parse('all(sourcechange:rename, any(area:bundle/review, area:bundle/sourcing))'))).toBe(true)
    expect(isDefaultScenarioFilterExpression(parse('area:bundle/review'))).toBe(true)
    expect(isDefaultScenarioFilterExpression(parse('any(area:bundle/review, sourcechange:rename)'))).toBe(false)
    expect(isDefaultScenarioFilterExpression(parse('all(area:bundle/review, any())'))).toBe(false)
  })

  it('round-trips through text, quoting values that need it', () => {
    const text = 'without(any(doc:"two words", doc:"comma,paren()"), all(), everything)'
    const expression = parse(text)
    expect(formatScenarioFilterExpression(expression)).toBe(text)
    expect(scenarioFilterSelectionsOf(expression).doc).toEqual(['two words', 'comma,paren()'])
    expect(formatScenarioFilterExpression(parse(' ALL ( area:a ,any(area:b) ) '))).toBe('all(area:a, any(area:b))')
    expect(formatScenarioFilterExpression(parse('area:a'))).toBe('all(area:a)')
  })

  it('reports where text cannot be read', () => {
    expect(parseScenarioFilterExpression('all(area:a').error).toBe('Expected ")" at character 11.')
    expect(parseScenarioFilterExpression('both(area:a)').error).toMatch(/^"both" is not any, all, without, or everything/)
    expect(parseScenarioFilterExpression('all(tags:a)').error).toMatch(/^Unknown filter section "tags"; use one of surface, mode, area/)
    expect(parseScenarioFilterExpression('all(area:a) area:b').error).toBe('Unexpected text after the expression at character 13.')
    expect(parseScenarioFilterExpression('all(sourcechange:renamed)', { sourcechange: ['add', 'rename'] }).error)
      .toBe('Unknown sourcechange "renamed"; use one of add, rename at character 18.')
    expect(parseScenarioFilterExpression('').error).toMatch(/^Expected any/)
  })

  it('adds pills to their row group, or narrows the mix with a new row group', () => {
    let expression = addScenarioFilterTerm(null, 'area', 'bundle/sourcing')
    expression = addScenarioFilterTerm(expression, 'area', 'bundle/review')
    expect(formatScenarioFilterExpression(expression)).toBe('all(any(area:bundle/sourcing, area:bundle/review))')

    const custom = parse('all(area:bundle/sourcing, area:bundle/review)')
    expect(formatScenarioFilterExpression(addScenarioFilterTerm(custom, 'sourcechange', 'rename')))
      .toBe('all(area:bundle/sourcing, area:bundle/review, any(sourcechange:rename))')
    const withRow = addScenarioFilterTerm(addScenarioFilterTerm(custom, 'sourcechange', 'rename'), 'sourcechange', 'move')
    expect(formatScenarioFilterExpression(withRow)).toBe('all(area:bundle/sourcing, area:bundle/review, any(sourcechange:rename, sourcechange:move))')

    expect(formatScenarioFilterExpression(addScenarioFilterTerm(parse('any(area:a, doc:x)'), 'doc', 'y')))
      .toBe('all(any(area:a, doc:x), any(doc:y))')
    expect(formatScenarioFilterExpression(addScenarioFilterTerm(parse('any(area:a, area:b)'), 'area', 'c')))
      .toBe('any(area:a, area:b, area:c)')
    expect(addScenarioFilterTerm(custom, 'area', 'bundle/review')).toBe(custom)
  })

  it('removes pills and the parentheses they leave empty', () => {
    const expression = parse('all(any(area:a, area:b), any(sourcechange:rename), any())')
    expect(formatScenarioFilterExpression(removeScenarioFilterTerms(expression, (section) => section === 'sourcechange')!))
      .toBe('all(any(area:a, area:b), any())')
    expect(removeScenarioFilterTerms(expression, () => true)).toBeNull()
    expect(removeScenarioFilterTerms(parse('without(everything, area:a)'), () => true)).toBeNull()
  })
})
