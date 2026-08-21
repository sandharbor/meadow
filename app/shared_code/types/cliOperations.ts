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

export const CLI_OPERATION_SCHEMA_VERSION = 1 as const;

export type CliSemanticOperation =
  | 'inspect-nodes'
  | 'track-safe-nodes'
  | 'inspect-node'
  | 'track-node'
  | 'generate-bundle'
  | 'save-generation'
  | 'publish-generation';

export interface CliNextAction {
  operation: CliSemanticOperation;
  args: string[];
  displayCommand: string;
}

interface CliOperationResultBase {
  schemaVersion: typeof CLI_OPERATION_SCHEMA_VERSION;
  operation: string;
  slug: string;
  changed: boolean;
  nextActions?: CliNextAction[];
}

export interface CreateBundleCliResult extends CliOperationResultBase {
  operation: 'bundles.create';
  created: boolean;
  sourceDirectory: string;
  entryPage: string;
  defaults: {
    outlinksDepth: number;
    inlinksDepth: number;
  };
}

export interface TrackedBundleNodeResult {
  bundleNodeKey: BundleNodeKey;
  bundleNodeId: BundleNodeId;
  bundleNodeName: string;
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
