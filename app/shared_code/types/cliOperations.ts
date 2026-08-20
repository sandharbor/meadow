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

import type { BundleNodeId, BundleNodeKey } from './bundleNodeConfig.js';
import type { GeneratedBundleVersionId } from './generatedBundleVersioning.js';

export const CLI_OPERATION_SCHEMA_VERSION = 1 as const;

export type CliSemanticOperation =
  | 'inspect-nodes'
  | 'track-safe-nodes'
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
