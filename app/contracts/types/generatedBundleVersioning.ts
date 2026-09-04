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

export const GENERATED_BUNDLE_VERSION_SCHEMA_VERSION = 1 as const;
export const GENERATED_BUNDLE_VERSION_ID_PATTERN = /^v[A-Za-z0-9]{6}$/;

declare const generatedBundleVersionIdBrand: unique symbol;
export type GeneratedBundleVersionId = string & {
  readonly [generatedBundleVersionIdBrand]: true;
};

export type ReaderConnectionToPredecessor = 'connected' | 'disconnected';
export type LocalVersionFilesState = 'present' | 'deleted';

interface GeneratedBundleVersionEntryBase {
  versionId: GeneratedBundleVersionId;
  createdAt: string;
  notes: string;
  predecessorVersionId: GeneratedBundleVersionId | null;
  readerConnectionToPredecessor: ReaderConnectionToPredecessor;
  /** Present only when migrated current output must be regenerated before it can connect forward. */
  readerAwarenessState?: 'legacy-incomplete';
}

export interface PresentGeneratedBundleVersionEntry extends GeneratedBundleVersionEntryBase {
  localFilesState: 'present';
}

export interface DeletedGeneratedBundleVersionEntry extends GeneratedBundleVersionEntryBase {
  localFilesState: 'deleted';
  localFilesDeletedAt: string;
  lastSavedGenerationId: string;
}

export type GeneratedBundleVersionEntry =
  | PresentGeneratedBundleVersionEntry
  | DeletedGeneratedBundleVersionEntry;

export interface GeneratedBundleVersionManifest {
  schemaVersion: typeof GENERATED_BUNDLE_VERSION_SCHEMA_VERSION;
  versions: GeneratedBundleVersionEntry[];
}

export type GeneratedBundleVersionDerivedState =
  | 'current'
  | 'frozen'
  | 'locally-deleted';

export type ProviderInstanceId = string;

export const PUBLICATION_REVISION_ID_PATTERN = /^r[A-Za-z0-9]{12}$/;

declare const publicationRevisionIdBrand: unique symbol;
export type PublicationRevisionId = string & {
  readonly [publicationRevisionIdBrand]: true;
};

export type PublicationRevisionRemoteState = 'pending' | 'present' | 'deleted';
export type PredecessorCleanupPolicy = 'keep' | 'delete-after-success';
export type PublicationCleanupState = 'not-requested' | 'scheduled' | 'complete' | 'failed';

/**
 * One provider-specific publication of a saved generated version at one
 * provider address. Address and content changes both produce revisions;
 * repeated publication of the same pair updates the existing revision.
 */
export interface PublicationRevision {
  publicationRevisionId: PublicationRevisionId;
  generatedVersionId: GeneratedBundleVersionId;
  publishSlug: string;
  predecessorPublicationRevisionId: PublicationRevisionId | null;
  readerConnectionToPredecessor: ReaderConnectionToPredecessor;
  predecessorCleanupPolicy: PredecessorCleanupPolicy;
  cleanupState: PublicationCleanupState;
  remoteState: PublicationRevisionRemoteState;
  createdAt: string;
  latestSuccessfulSavedGenerationId: string | 'unknown' | null;
  publishedAt: string | null;
  deletedAt: string | null;
  remoteNamespace: string | null;
  publicUrl?: string;
  readerRouteIndex?: string;
  entryPath?: string;
  cleanupError?: string;
}

export interface ProviderPublicationRevisionState {
  schemaVersion: 2;
  providerInstanceId: ProviderInstanceId;
  currentRevisionId: PublicationRevisionId | null;
  pendingRevisionId: PublicationRevisionId | null;
  revisions: PublicationRevision[];
}

export type PublicationEventType =
  | 'imported-publication'
  | 'publication-success'
  | 'republish-success'
  | 'successor-manifest-sync-success'
  | 'verification-success'
  | 'remote-deletion-success';

export interface ProviderPublicationEvent {
  eventType: PublicationEventType;
  providerInstanceId: ProviderInstanceId;
  versionId: GeneratedBundleVersionId;
  savedGenerationId: string | 'unknown';
  timestamp: string;
  remoteNamespace: string;
  publicUrl?: string;
  readerRouteIndex?: string;
  entryPath?: string;
}

export interface ProviderDestinationRecord {
  schemaVersion: 1;
  providerInstanceId: ProviderInstanceId;
  events: ProviderPublicationEvent[];
}

export type SelectedVersionPublicationStatus =
  | { kind: 'not-published' }
  | { kind: 'published-current'; event: ProviderPublicationEvent }
  | { kind: 'update-available'; event: ProviderPublicationEvent }
  | { kind: 'imported-unknown'; event: ProviderPublicationEvent }
  | { kind: 'removed'; event: ProviderPublicationEvent };

export interface BundlePublicationSummary {
  providerInstanceId: ProviderInstanceId;
  mostRecentSuccessfulEventAt: string | null;
  remotelyPresentVersionIds: GeneratedBundleVersionId[];
}

export interface ProviderSuccessorManifestEntry {
  versionId: GeneratedBundleVersionId;
  versionRoot: string;
  routeIndex: string;
  entryPath: string;
}

export interface ProviderSuccessorManifest {
  schemaVersion: 1;
  successors: Record<string, ProviderSuccessorManifestEntry>;
}

export interface GeneratedBundleReaderRouteIndex {
  schemaVersion: 1;
  entryPath: string;
  routesByBundleNodeId: Record<string, string>;
  generatedPagePaths: string[];
}
