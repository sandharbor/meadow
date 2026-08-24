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

import type { BundleNodeConfig, BundleNodeId, BundleNodeKey, BundleNodeKind } from './bundleNodeConfig.js';
import type { FileType } from './FileType.js';
import type { GeneratedBundleVersionId } from './generatedBundleVersioning.js';
import type { BundleBoundaryReviewRequest } from './bundleBoundaryReview.js';

export const CLI_OPERATION_SCHEMA_VERSION = 1 as const;

export type CliSemanticOperation =
  | 'inspect-nodes'
  | 'track-safe-nodes'
  | 'inspect-node'
  | 'track-node'
  | 'open-review'
  | 'generate-bundle'
  | 'save-generation'
  | 'publish-generation';

export interface CliNextAction {
  operation: CliSemanticOperation;
  args: string[];
  displayCommand: string;
}

export interface CliMutationBehavior {
  atomicity: 'atomic' | 'provider-defined';
  idempotency: 'idempotent' | 'conditional' | 'not-idempotent' | 'provider-defined';
  staleWrite: 'rejects-stale' | 'current-state-preflight' | 'latest-state-wins' | 'not-applicable' | 'provider-defined';
  details: readonly string[];
}

export const CLI_MUTATION_BEHAVIORS = {
  createBundle: {
    atomicity: 'atomic',
    idempotency: 'conditional',
    staleWrite: 'not-applicable',
    details: [
      'Implicit-slug retries with the same canonical source, entry page, and defaults return the existing bundle; an explicit duplicate slug is rejected.',
    ],
  },
  trackBundleNodes: {
    atomicity: 'atomic',
    idempotency: 'idempotent',
    staleWrite: 'rejects-stale',
    details: [
      'All requested node changes commit together; invalid or stale node keys reject a targeted request without a partial write.',
    ],
  },
  mutateBundleNode: {
    atomicity: 'atomic',
    idempotency: 'idempotent',
    staleWrite: 'rejects-stale',
    details: [
      'The selected node update and tracked snapshot evidence commit together; invalid or stale locators are rejected.',
    ],
  },
  generateBundle: {
    atomicity: 'atomic',
    idempotency: 'conditional',
    staleWrite: 'current-state-preflight',
    details: [
      'A retry regenerates the current unsaved version from current source state; after that version is saved, generation creates a new current version.',
      'Boundary review and sensitivity reaffirmation are evaluated before generation writes begin.',
    ],
  },
  saveGeneration: {
    atomicity: 'atomic',
    idempotency: 'idempotent',
    staleWrite: 'rejects-stale',
    details: [
      'The exact current version is saved atomically; retrying the saved version returns the same identities, while stale or non-current version IDs are rejected.',
    ],
  },
  publishGeneration: {
    atomicity: 'provider-defined',
    idempotency: 'provider-defined',
    staleWrite: 'provider-defined',
    details: [
      'Meadow passes the explicit saved version and a distinct operationId to the active provider; external commit, retry, and stale-write behavior are declared by that provider.',
    ],
  },
  archiveBundle: {
    atomicity: 'atomic',
    idempotency: 'not-idempotent',
    staleWrite: 'latest-state-wins',
    details: [
      'Each archive request records a fresh archivedAt timestamp against the latest bundle config.',
    ],
  },
  unarchiveBundle: {
    atomicity: 'atomic',
    idempotency: 'idempotent',
    staleWrite: 'latest-state-wins',
    details: [
      'Retries preserve the unarchived state; no caller-supplied version precondition is accepted.',
    ],
  },
} as const satisfies Record<string, CliMutationBehavior>;

interface CliOperationResultBase {
  schemaVersion: typeof CLI_OPERATION_SCHEMA_VERSION;
  operation: string;
  slug: string;
  changed: boolean;
  mutationBehavior: CliMutationBehavior;
  nextActions?: CliNextAction[];
}

export interface CreateBundleCliResult extends CliOperationResultBase {
  operation: 'bundles.create';
  created: boolean;
  sourceDirectory: string;
  entryPage: string;
  entryPageTracked: true;
  defaults: {
    outlinksDepth: number;
    inlinksDepth: number;
  };
}

export interface TrackedBundleNodeResult {
  bundleNodeKey: BundleNodeKey;
  bundleNodeId: BundleNodeId;
  bundleNodeName: string;
  config: BundleNodeConfig;
}

export interface SkippedBundleNodeResult {
  bundleNodeKey: BundleNodeKey;
  bundleNodeName: string;
  reason: string;
}

export interface TrackBundleNodesCliResult extends CliOperationResultBase {
  operation: 'bundle.track';
  mode: 'targeted' | 'all-safe';
  newlyTracked: TrackedBundleNodeResult[];
  alreadyTracked: TrackedBundleNodeResult[];
  sensitiveSkipped: SkippedBundleNodeResult[];
  untrackableSkipped: SkippedBundleNodeResult[];
  rejected: SkippedBundleNodeResult[];
}

export type BundleNodeLocator =
  | { kind: 'id'; value: BundleNodeId }
  | { kind: 'path'; value: string };

export interface BundleNodeReference {
  bundleNodeKey: BundleNodeKey;
  bundleNodeId?: BundleNodeId;
  bundleNodeName: string;
  bundleNodeKind: BundleNodeKind;
  depth: number;
}

export interface BundleNodeDetails extends BundleNodeReference {
  sourceGraphSubdirectory?: string;
  fileType?: FileType;
  tracked: boolean;
  blacklisted: boolean;
  sensitive: boolean;
  isFrontierNode: boolean;
  remainingOutlinksDepth: number;
  remainingInlinksDepth: number;
  config?: BundleNodeConfig;
}

export interface DescribeBundleNodeCliResult {
  schemaVersion: typeof CLI_OPERATION_SCHEMA_VERSION;
  operation: 'bundle.node.describe';
  slug: string;
  locator: BundleNodeLocator;
  node: BundleNodeDetails;
  related: {
    pathToHere: BundleNodeReference[];
    children: BundleNodeReference[];
    allPathsFromHere: BundleNodeReference[];
    deeperPathsFromHere: BundleNodeReference[];
  };
}

export type BundleNodeMutationOperation =
  | 'track'
  | 'untrack'
  | 'blacklist'
  | 'unblacklist'
  | 'mark-sensitive'
  | 'mark-not-sensitive'
  | 'set-depths';

export interface MutateBundleNodeCliResult extends CliOperationResultBase {
  operation: `bundle.node.${BundleNodeMutationOperation}`;
  locator: BundleNodeLocator;
  node: BundleNodeDetails;
}

export interface FindBundleNodeCliResult {
  schemaVersion: typeof CLI_OPERATION_SCHEMA_VERSION;
  operation: 'bundle.node.find-in-bundles';
  slug: string;
  locator: BundleNodeLocator;
  node: BundleNodeReference;
  bundles: Array<{
    slug: string;
    archived: boolean;
    bundleNodeId: BundleNodeId;
    tracked: true;
    blacklisted: boolean;
  }>;
}

export interface GenerateBundleCliResult extends CliOperationResultBase {
  operation: 'bundle.generate';
  versionId: GeneratedBundleVersionId;
  saved: false;
  previewUrl: string;
  reviewRequest?: BundleBoundaryReviewRequest;
}

export interface GenerateBundleReviewPauseCliResult extends CliOperationResultBase {
  operation: 'bundle.generate';
  paused: true;
  resolution: {
    browserRequired: false;
    mode: 'command';
    guidance: string;
  };
  reviewRequest: BundleBoundaryReviewRequest;
}

export interface SaveGenerationCliResult extends CliOperationResultBase {
  operation: 'bundle.save-generation';
  versionId: GeneratedBundleVersionId;
  savedGenerationId: string;
  commitSha?: string;
  saved: true;
}

export interface PublishBundleCliResult extends CliOperationResultBase {
  operation: 'bundle.publish';
  versionId: GeneratedBundleVersionId;
  savedGenerationId: string;
  provider: {
    id: string;
    instanceId: string;
  };
  url: string;
  identityCreated: boolean;
  remainingAllowance: {
    kind: string;
    remaining: number;
  } | null;
}
