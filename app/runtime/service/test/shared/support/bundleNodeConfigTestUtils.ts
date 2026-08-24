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

import crypto from 'crypto';
import type { FileType } from '../../../../../contracts/types/FileType.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../contracts/types/bundleNodeConfig.js';

export function makeBundleNodeConfig(
  bundleNodeName: string,
  listType: 'whitelist' | 'blacklist' = 'whitelist',
  options: {
    sourceGraphSubdirectory?: string;
    fileType?: FileType;
    outlinksDepth?: number;
    inlinksDepth?: number;
  } = {},
): BundleNodeConfig {
  const sourceGraphSubdirectory = options.sourceGraphSubdirectory ?? '';
  const fileType = options.fileType ?? 'md';
  const bundleNodeId = crypto.createHash('sha256')
    .update([bundleNodeName, sourceGraphSubdirectory, fileType].join('\0'))
    .digest('hex')
    .slice(0, 12) as BundleNodeId;
  return {
    bundleNodeName,
    ...(sourceGraphSubdirectory && { sourceGraphSubdirectory }),
    bundleNodeKind: 'file',
    fileType,
    bundleNodeId,
    listType,
    ...(options.outlinksDepth !== undefined && { outlinksDepth: options.outlinksDepth }),
    ...(options.inlinksDepth !== undefined && { inlinksDepth: options.inlinksDepth }),
  };
}
