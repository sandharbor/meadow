/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

interface SubAreaConcept {
  id: string
  name: string
  subAreas?: readonly { areaId: string; order: number }[]
}

/** Keep each parent's workflow order, including concepts shared by several areas. */
export function groupSubAreas<Area extends { id: string; name: string }, Concept extends SubAreaConcept>(
  areas: readonly Area[], concepts: readonly Concept[],
) {
  return areas.map(area => ({
    area,
    subAreas: concepts.filter(concept => concept.subAreas?.some(entry => entry.areaId === area.id))
      .sort((a, b) => {
        const order = (concept: Concept) => concept.subAreas!.find(entry => entry.areaId === area.id)!.order
        return order(a) - order(b) || a.name.localeCompare(b.name)
      }),
  })).filter(group => group.subAreas.length > 0)
}
