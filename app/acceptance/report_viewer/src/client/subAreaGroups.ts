/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

interface SubAreaConcept {
  id: string
  name: string
  parentId?: string
  kind?: string
  appAreaIds?: readonly string[]
  subAreas?: readonly { areaId: string; order: number }[]
}

/** Only sub-area parents establish workflow nesting; other concept parents do not. */
export function subAreaAncestors(id: string, concepts: readonly SubAreaConcept[]): string[] {
  const ancestors: string[] = []
  let concept = concepts.find(candidate => candidate.id === id)
  while (concept?.parentId && !ancestors.includes(concept.parentId) && concept.parentId !== id) {
    const parent = concepts.find(candidate => candidate.id === concept!.parentId)
    if (!parent?.subAreas?.some(entry => concept?.subAreas?.some(child => child.areaId === entry.areaId))) break
    ancestors.push(parent.id)
    concept = parent
  }
  return ancestors
}

export function subAreaContains(parentId: string, id: string, concepts: readonly SubAreaConcept[]): boolean {
  return parentId === id || subAreaAncestors(id, concepts).includes(parentId)
}

/** Keep each parent's workflow order and expose nested rows for both report surfaces. */
export function groupSubAreas<Area extends { id: string; name: string }, Concept extends SubAreaConcept>(
  areas: readonly Area[], concepts: readonly Concept[],
) {
  return areas.map(area => {
    const subAreas = concepts.filter(concept => concept.kind !== 'ui-sub-area' && concept.subAreas?.some(entry => entry.areaId === area.id))
      .sort((a, b) => {
        const order = (concept: Concept) => concept.subAreas!.find(entry => entry.areaId === area.id)!.order
        return order(a) - order(b) || a.name.localeCompare(b.name)
      })
    const rows: { parent?: Concept; ancestors: Concept[]; subAreas: Concept[] }[] = []
    const visit = (parent: Concept | undefined, ancestors: Concept[]) => {
      const children = subAreas.filter(concept => parent ? concept.parentId === parent.id
        : !subAreas.some(candidate => candidate.id === concept.parentId))
      if (!children.length) return
      rows.push({ parent, ancestors, subAreas: children })
      for (const child of children) if (!ancestors.some(ancestor => ancestor.id === child.id)) visit(child, [...ancestors, child])
    }
    visit(undefined, [])
    return { area, subAreas, rows }
  }).filter(group => group.subAreas.length > 0)
}

/** UI nesting follows only UI parents with the same single owner in the captured catalog. */
export function uiSubAreaAncestors(id: string, concepts: readonly SubAreaConcept[]): string[] {
  const ancestors: string[] = []
  let concept = concepts.find(candidate => candidate.id === id)
  while (concept?.kind === 'ui-sub-area' && concept.parentId && !ancestors.includes(concept.parentId) && concept.parentId !== id) {
    const parent = concepts.find(candidate => candidate.id === concept!.parentId)
    if (parent?.kind !== 'ui-sub-area' || parent.appAreaIds?.length !== 1
      || concept.appAreaIds?.length !== 1 || parent.appAreaIds[0] !== concept.appAreaIds[0]) break
    ancestors.push(parent.id)
    concept = parent
  }
  return ancestors
}

export function uiSubAreaContains(parentId: string, id: string, concepts: readonly SubAreaConcept[]): boolean {
  return parentId === id || uiSubAreaAncestors(id, concepts).includes(parentId)
}

/** UI ownership and nesting come from the run catalog. Historical flat catalogs stay flat. */
export function groupUiSubAreas<Area extends { id: string; name: string }, Concept extends SubAreaConcept>(
  areas: readonly Area[], concepts: readonly Concept[],
) {
  return areas.map(area => {
    const uiSubAreas = concepts.filter(concept => concept.kind === 'ui-sub-area'
      && concept.appAreaIds?.length === 1 && concept.appAreaIds[0] === area.id)
      .sort((a, b) => a.name.localeCompare(b.name))
    const rows: { parent?: Concept; ancestors: Concept[]; uiSubAreas: Concept[] }[] = []
    const visit = (parent: Concept | undefined, ancestors: Concept[]) => {
      const children = uiSubAreas.filter(concept => parent ? concept.parentId === parent.id
        : !uiSubAreas.some(candidate => candidate.id === concept.parentId))
      if (!children.length) return
      rows.push({ parent, ancestors, uiSubAreas: children })
      for (const child of children) if (!ancestors.some(ancestor => ancestor.id === child.id)) visit(child, [...ancestors, child])
    }
    visit(undefined, [])
    return { area, uiSubAreas, rows }
  }).filter(group => group.uiSubAreas.length > 0)
}
