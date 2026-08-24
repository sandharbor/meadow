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

export const BUNDLE_BOUNDARY_REVIEW_SCHEMA_VERSION = 1 as const;

export type BundleBoundaryFindingCode =
  | 'content-changed-since-tracking'
  | 'sensitivity-reaffirmation-required';

export interface BundleBoundaryFinding {
  code: BundleBoundaryFindingCode;
  policy: 'recommend-review' | 'review-required';
  bundleNodeId: BundleNodeId;
  bundleNodeKey: BundleNodeKey;
  bundleNodeName: string;
  sourceContentDigest: `sha256:${string}`;
  recordedSourceContentDigest: `sha256:${string}`;
  effectivelySensitive: boolean;
  recordedEffectivelySensitive: boolean;
  message: string;
}

export interface BundleBoundaryReviewRequest {
  schemaVersion: typeof BUNDLE_BOUNDARY_REVIEW_SCHEMA_VERSION;
  reviewRequestId: string;
  slug: string;
  status: 'open' | 'resolved';
  policy: 'recommend-review' | 'review-required';
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  deepLinkPath: string;
  findings: BundleBoundaryFinding[];
}
