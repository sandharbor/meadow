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

import type {
  BundlePublicationSummary,
  GeneratedBundleVersionId,
  ProviderDestinationRecord,
  ProviderPublicationEvent,
  SelectedVersionPublicationStatus,
} from '../../../../../../../contracts/types/generatedBundleVersioning.js';

const PRESENT_EVENT_TYPES = new Set([
  'imported-publication',
  'publication-success',
  'republish-success',
  'verification-success',
]);

export function deriveSelectedVersionPublicationStatus(
  record: ProviderDestinationRecord,
  versionId: GeneratedBundleVersionId,
  currentSavedGenerationId: string | null,
): SelectedVersionPublicationStatus {
  const events = record.events.filter((event) => event.versionId === versionId);
  const latestPresenceEvent = [...events].reverse().find((event) =>
    PRESENT_EVENT_TYPES.has(event.eventType) || event.eventType === 'remote-deletion-success'
  );
  if (!latestPresenceEvent) return { kind: 'not-published' };
  if (latestPresenceEvent.eventType === 'remote-deletion-success') {
    return { kind: 'removed', event: latestPresenceEvent };
  }
  if (latestPresenceEvent.savedGenerationId === 'unknown') {
    return { kind: 'imported-unknown', event: latestPresenceEvent };
  }
  if (currentSavedGenerationId !== null && latestPresenceEvent.savedGenerationId === currentSavedGenerationId) {
    return { kind: 'published-current', event: latestPresenceEvent };
  }
  return { kind: 'update-available', event: latestPresenceEvent };
}

export function summarizeProviderDestination(record: ProviderDestinationRecord): BundlePublicationSummary {
  const remotelyPresent = new Map<GeneratedBundleVersionId, ProviderPublicationEvent>();
  for (const event of record.events) {
    if (event.eventType === 'remote-deletion-success') {
      remotelyPresent.delete(event.versionId);
    } else if (PRESENT_EVENT_TYPES.has(event.eventType)) {
      remotelyPresent.set(event.versionId, event);
    }
  }
  return {
    providerInstanceId: record.providerInstanceId,
    mostRecentSuccessfulEventAt: record.events.at(-1)?.timestamp ?? null,
    remotelyPresentVersionIds: [...remotelyPresent.keys()],
  };
}
