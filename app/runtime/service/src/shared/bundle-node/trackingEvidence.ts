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

import { createHash } from 'crypto';
import fs from 'fs';
import type { FileBundleNodeConfig, TrackingEvidence } from '../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import { sourceFilePathIn } from './sourceFileNames.js';

export function sourceContentDigest(contents: Buffer): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

export function sourceFilePathForConfig(
  sourceDirectory: string,
  config: FileBundleNodeConfig,
): string {
  const sourcePath = sourceFilePathIn(sourceDirectory, config);
  if (!fs.existsSync(sourcePath)) throw new Error(`Tracked source file no longer exists: ${sourcePath}`);
  return sourcePath;
}

export function currentSourceContentDigest(
  sourceDirectory: string,
  config: FileBundleNodeConfig,
): `sha256:${string}` {
  return sourceContentDigest(fs.readFileSync(sourceFilePathForConfig(sourceDirectory, config)));
}

export function trackingEvidenceMatches(
  evidence: TrackingEvidence | undefined,
  digest: string,
  effectivelySensitive: boolean,
): boolean {
  return evidence?.sourceContentDigest === digest
    && evidence.effectivelySensitive === effectivelySensitive;
}

export function applyTrackingEvidenceFromSnapshot(options: {
  bundleDirectory: string;
  configs: FileBundleNodeConfig[];
  effectivelySensitiveByNodeId: ReadonlyMap<string, boolean>;
  trackedAt: string;
}): void {
  const snapshotRoot = BundleConfigPaths.getTrackedPageContentDir(options.bundleDirectory);
  for (const config of options.configs) {
    const effectivelySensitive = options.effectivelySensitiveByNodeId.get(config.bundleNodeId);
    if (effectivelySensitive === undefined) continue;
    const snapshotPath = sourceFilePathIn(snapshotRoot, config);
    if (!fs.existsSync(snapshotPath) || !fs.statSync(snapshotPath).isFile()) {
      throw new Error(`Tracked snapshot file is unavailable for evidence: ${snapshotPath}`);
    }
    config.trackingEvidence = {
      trackedAt: options.trackedAt,
      sourceContentDigest: sourceContentDigest(fs.readFileSync(snapshotPath)),
      effectivelySensitive,
    };
  }
}
