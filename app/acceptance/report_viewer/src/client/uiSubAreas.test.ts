/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { expect, it } from 'vitest'
import { groupSubAreas, groupUiSubAreas, uiSubAreaAncestors, uiSubAreaContains } from './subAreaGroups.ts'
import { defaultScenarioFilterExpression, emptyScenarioFilterSelections, formatScenarioFilterExpression,
  migrateUiSubAreaFilters, parseScenarioFilterExpression, scenarioFilterSelectionsOf, scenarioMatchesFilterExpression } from './scenarioFilterExpression.ts'

const areas = [{ id: 'sourcing', name: 'Sourcing' }, { id: 'curation', name: 'Curation' }]
const concepts = [
  { id: 'workspace', name: 'Workspace', subAreas: [{ areaId: 'sourcing', order: 1 }] },
  { id: 'tracking', name: 'Tracking Changes Panel', kind: 'ui-sub-area', appAreaIds: ['sourcing'] },
  // A migrated capture can still contain legacy ordering metadata; never duplicate its pill.
  { id: 'details', name: 'Node Details', kind: 'ui-sub-area', appAreaIds: ['curation'], subAreas: [{ areaId: 'curation', order: 1 }] },
  { id: 'storage', name: 'Storage', kind: 'interface', appAreaIds: ['sourcing'] },
]
it('groups UI regions only by explicit classification and owner, independently of workflow metadata', () => {
  expect(groupUiSubAreas(areas, concepts).map(group => [group.area.id, group.uiSubAreas.map(doc => doc.id)]))
    .toEqual([['sourcing', ['tracking']], ['curation', ['details']]])
  expect(groupSubAreas(areas, concepts).map(group => group.subAreas.map(doc => doc.id))).toEqual([['workspace']])
  expect(groupUiSubAreas(areas, concepts.map(doc => ({ ...doc, kind: 'interface' })))).toEqual([])
  expect(groupUiSubAreas(areas.slice(1), concepts).map(group => group.area.id)).toEqual(['curation'])
})
it('combines UI alternatives by Any and workflow selections by All, with URL and custom-mix round trips', () => {
  const expression = defaultScenarioFilterExpression({ ...emptyScenarioFilterSelections(), subarea: ['workspace'], uisubarea: ['tracking', 'details'] })!
  const matches = (workflow: string[], ui: string[]) => scenarioMatchesFilterExpression(expression,
    (section, id) => (section === 'subarea' ? workflow : section === 'uisubarea' ? ui : []).includes(id))
  expect(matches(['workspace'], ['tracking'])).toBe(true)
  expect(matches(['workspace'], ['details'])).toBe(true)
  expect(matches([], ['tracking'])).toBe(false)
  expect(matches(['workspace'], [])).toBe(false)
  expect(formatScenarioFilterExpression(parseScenarioFilterExpression(formatScenarioFilterExpression(expression)).expression!)).toBe(formatScenarioFilterExpression(expression))
  const oldMix = parseScenarioFilterExpression('without(everything, subarea:details)').expression!
  expect(scenarioFilterSelectionsOf(migrateUiSubAreaFilters(oldMix, new Set(['details']))).uisubarea).toEqual(['details'])
  expect(formatScenarioFilterExpression(migrateUiSubAreaFilters(oldMix, new Set())!)).toContain('subarea:details')
})

it('nests only captured UI parents with the same owner and tolerates cycles', () => {
  const docs = [...concepts,
    { id: 'tray', name: 'Changes Tray', kind: 'ui-sub-area', appAreaIds: ['sourcing'], parentId: 'workspace' },
    { id: 'panel', name: 'Page Changes Panel', kind: 'ui-sub-area', appAreaIds: ['sourcing'], parentId: 'tray' },
    { id: 'foreign', name: 'Foreign', kind: 'ui-sub-area', appAreaIds: ['curation'], parentId: 'tray' },
  ]
  const group = groupUiSubAreas(areas, docs)[0]
  expect(group.rows.map(row => [row.parent?.id, row.uiSubAreas.map(doc => doc.id)]))
    .toEqual([[undefined, ['tray', 'tracking']], ['tray', ['panel']]])
  expect(uiSubAreaAncestors('panel', docs)).toEqual(['tray'])
  expect(uiSubAreaAncestors('foreign', docs)).toEqual([])
  expect(uiSubAreaContains('tray', 'panel', docs)).toBe(true)
  expect(uiSubAreaAncestors('panel', docs.map(doc => doc.id === 'tray' ? { ...doc, parentId: 'panel' } : doc))).toEqual(['tray'])
})
it('refines page-change filters within their UI branch while other UI selections remain alternatives', () => {
  const expression = defaultScenarioFilterExpression({ ...emptyScenarioFilterSelections(),
    uisubarea: ['tracking', 'page-changes-filters'], sourcechange: ['modify'], sourcechangesubtype: ['source-content-change'] })!
  const matches = (ui: string[], categories: string[], subtypes: string[]) => scenarioMatchesFilterExpression(expression,
    (section, id) => (section === 'uisubarea' ? ui : section === 'sourcechange' ? categories : section === 'sourcechangesubtype' ? subtypes : []).includes(id))
  expect(matches(['tracking'], [], [])).toBe(true)
  expect(matches(['page-changes-filters'], ['modify'], ['source-content-change'])).toBe(true)
  expect(matches(['page-changes-filters'], ['remove'], [])).toBe(false)
  expect(matches(['page-changes-filters'], ['modify'], [])).toBe(false)
  expect(matches([], ['modify'], ['source-content-change'])).toBe(false)
  expect(formatScenarioFilterExpression(parseScenarioFilterExpression(formatScenarioFilterExpression(expression)).expression!))
    .toBe(formatScenarioFilterExpression(expression))
})
