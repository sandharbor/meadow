/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

interface SubAreaConcept {
  id: string
  name: string
  parentId?: string
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
    const subAreas = concepts.filter(concept => concept.subAreas?.some(entry => entry.areaId === area.id))
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
