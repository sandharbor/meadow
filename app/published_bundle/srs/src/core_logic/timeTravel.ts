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

import type { SrsRuntimeCard, SrsWaypoint } from './types';

const ONE_MINUTE_MS = 60 * 1000;

function createWaypoint(atMs: number, label: string, cardId?: string): SrsWaypoint {
  return { atMs, label, cardId };
}

export function collectWaypoints(cards: SrsRuntimeCard[], now: Date): SrsWaypoint[] {
  const unique = new Map<number, SrsWaypoint>();

  unique.set(now.getTime(), createWaypoint(now.getTime(), 'Current time'));

  for (const card of cards) {
    const dueAtMs = new Date(card.state.dueAt).getTime();
    const labelBase = card.definition.searchText || card.definition.id;
    const waypoints = [
      createWaypoint(dueAtMs - ONE_MINUTE_MS, `1 minute before "${labelBase}" is due`, card.definition.id),
      createWaypoint(dueAtMs, `"${labelBase}" becomes due`, card.definition.id),
      createWaypoint(dueAtMs + ONE_MINUTE_MS, `1 minute after "${labelBase}" is due`, card.definition.id),
    ];

    for (const waypoint of waypoints) {
      unique.set(waypoint.atMs, waypoint);
    }
  }

  return [...unique.values()].sort((left, right) => left.atMs - right.atMs);
}
